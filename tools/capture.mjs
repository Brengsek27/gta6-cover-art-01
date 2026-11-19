import {spawn} from 'node:child_process';
import {mkdir, readFile, stat} from 'node:fs/promises';
import {createServer} from 'node:net';
import {resolve, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';

export const root = resolve(fileURLToPath(new URL('..',import.meta.url)));
export const scratch = join(root,'tools/.capture');
const temporary = join(root,'.t');
const chrome = '/home/hatch/.cache/puppeteer/chrome/linux-157.0.8103.50/chrome-linux64/chrome';
const pause = duration => new Promise(resolvePause => setTimeout(resolvePause,duration));

export async function sparePort() {
  const server = createServer();server.listen(0,'127.0.0.1');await once(server,'listening');
  const port = server.address().port;await new Promise(resolveClose => server.close(resolveClose));return port;
}

export async function startServer() {
  await mkdir(temporary,{recursive:true});
  const port = await sparePort();const base = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath,['serve.ts','--port',String(port)],{cwd:root,stdio:['ignore','pipe','pipe']});
  let output = '';server.stderr.on('data',data => {output += data;});
  for (let attempt = 0;attempt < 100;attempt++) {
    if (server.exitCode !== null) throw new Error(`Server failed: ${output}`);
    try {if ((await fetch(base)).ok) return {server,base};} catch {}
    await pause(40);
  }
  server.kill();throw new Error('Server did not start.');
}

function chromeArgs(profile) {
  return ['--headless=new','--no-sandbox','--disable-gpu','--hide-scrollbars','--disable-dev-shm-usage','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--disable-breakpad',`--user-data-dir=${join(scratch,profile)}`,`--disk-cache-dir=${join(scratch,profile,'cache')}`];
}

function run(command,args,options = {}) {
  return new Promise((resolveRun,reject) => {
    const child = spawn(command,args,{cwd:root,env:{...process.env,TMPDIR:temporary},...options});
    let stderr = '';let stdout = '';
    child.stdout?.on('data',data => {stdout += data;});child.stderr?.on('data',data => {stderr += data;});
    const timer = setTimeout(() => {child.kill('SIGKILL');reject(new Error(`${command} timed out`));},45000);
    child.on('error',error => {clearTimeout(timer);reject(error);});
    child.on('close',code => {clearTimeout(timer);code === 0 ? resolveRun({stdout,stderr}) : reject(new Error(`${command} exited ${code}: ${stderr.slice(-3000)}`));});
  });
}

export async function browserSession() {
  await mkdir(temporary,{recursive:true});
  const browser = spawn(chrome,[...chromeArgs('audit-profile'),'--remote-debugging-port=0','about:blank'],{cwd:root,env:{...process.env,TMPDIR:temporary},stdio:['ignore','ignore','pipe']});
  let stderr = '';browser.stderr.on('data',data => {stderr += data;});
  let endpoint;
  for (let attempt = 0;attempt < 150;attempt++) {
    const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
    if (match) {endpoint = match[1];break;}
    if (browser.exitCode !== null) throw new Error(stderr);
    await pause(40);
  }
  if (!endpoint) {browser.kill();throw new Error(`Chrome debugging endpoint not available: ${stderr}`);}
  const port = new URL(endpoint).port;
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = targets.find(target => target.type === 'page');
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolveOpen,reject) => {socket.onopen = resolveOpen;socket.onerror = reject;});
  let sequence = 0;const pending = new Map();const errors = [];const requests = [];
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id) {const entry = pending.get(message.id);if (entry) {pending.delete(message.id);clearTimeout(entry.timer);message.error ? entry.reject(new Error(JSON.stringify(message.error))) : entry.resolve(message.result);}}
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params.args.map(argument => argument.value || argument.description).join(' '));
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') errors.push(message.params.entry.text);
    if (message.method === 'Network.requestWillBeSent') requests.push(message.params.request.url);
  };
  const send = (method,params = {}) => new Promise((resolveSend,reject) => {
    const id = ++sequence;const timer = setTimeout(() => {pending.delete(id);reject(new Error(`CDP timed out: ${method}`));},20000);
    pending.set(id,{resolve:resolveSend,reject,timer});socket.send(JSON.stringify({id,method,params}));
  });
  await send('Runtime.enable');await send('Page.enable');await send('Log.enable');await send('Network.enable');
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const navigate = async (url,width = 1280,height = 720) => {
    errors.length = 0;requests.length = 0;
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    await send('Page.navigate',{url});
    let loaded = false;
    for (let attempt = 0;attempt < 150;attempt++) {
      await pause(60);
      if (await evaluate('window.__shotReady === true')) {loaded = true;break;}
    }
    if (!loaded) throw new Error(`Scene never became ready: ${url}\n${errors.join('\n')}`);
    if (errors.length) throw new Error(`Console errors: ${errors.join('\n')}`);
    const external = requests.filter(request => /^https?:/.test(request) && new URL(request).origin !== new URL(url).origin);
    if (external.length) throw new Error(`External network requests: ${external.join(', ')}`);
    return evaluate('({ready:window.__shotReady,width:document.querySelector("canvas").width,height:document.querySelector("canvas").height,bounds:document.querySelector("canvas").getBoundingClientRect().toJSON(),fonts:document.fonts.check("20px Anton") && document.fonts.check("20px Pacifico")})');
  };
  return {send,evaluate,navigate,errors,requests,close:() => {socket.close();browser.kill();}};
}

async function main() {
  await mkdir(join(root,'screenshots'),{recursive:true});
  const scenes = JSON.parse(await readFile(join(root,'shots.json'),'utf8'));
  const {server,base} = await startServer();let audit;
  try {
    audit = await browserSession();
    for (const scene of scenes) {
      const url = base + '/' + scene.query;
      const check = await audit.navigate(url,scene.w,scene.h);
      if (!check.fonts) throw new Error('Fonts not ready');
      if (scene.query.includes('shot=cover') && (check.width !== scene.w || check.height !== scene.h)) throw new Error('Cover size does not match the scene');
      if (scene.query.includes('shot=cover') && (check.bounds.x !== 0 || check.bounds.y !== 0 || check.bounds.width !== scene.w || check.bounds.height !== scene.h)) throw new Error('Cover does not fill the viewport');
      const png = join(scratch,scene.name.replace('.jpg','.png'));const jpg = join(root,'screenshots',scene.name);
      await run(chrome,[...chromeArgs(`capture-${scene.name}`),`--window-size=${scene.w},${scene.h}`,'--force-device-scale-factor=1','--virtual-time-budget=9000',`--screenshot=${png}`,url]);
      const input = await readFile(png);
      if (input.length < 30000) throw new Error(`Suspiciously small PNG: ${scene.name}`);
      if (input.readUInt32BE(16) !== scene.w || input.readUInt32BE(20) !== scene.h) throw new Error(`Screenshot dimensions incorrect: ${scene.name}`);
      let quality = 3;let bytes;
      do {
        await run('ffmpeg',['-y','-i',png,'-q:v',String(quality),jpg]);
        bytes = (await stat(jpg)).size;
        quality += 2;
      } while (bytes > 262144 && quality <= 31);
      if (bytes > 262144) throw new Error(`${scene.name} exceeds 262144 bytes`);
      const probe = await run('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','json',jpg]);
      const dimensions = JSON.parse(probe.stdout).streams[0];
      console.log(`${scene.name}: ${bytes} bytes · ${dimensions.width} × ${dimensions.height} · source PNG ${input.length} bytes · fonts ready · no console errors`);
    }
  } finally {audit?.close();server.kill();}
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => {console.error(error);process.exitCode = 1;});
