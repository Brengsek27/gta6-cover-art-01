import assert from 'node:assert/strict';
import {mkdir, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {startServer,browserSession,root,scratch} from './capture.mjs';

const pause = duration => new Promise(resolve => setTimeout(resolve,duration));
const {server,base} = await startServer();
let browser;
try {
  browser = await browserSession();
  await browser.navigate(`${base}/?shot=editor`);
  assert.equal(await browser.evaluate('document.querySelectorAll(".photo-tile").length'),2);
  await browser.evaluate(`window.__fingerprint = () => {
    const canvas = document.querySelector('canvas');
    const pixels = canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    let hash = 2166136261;
    for (let offset = 0;offset < pixels.length;offset += 1009) hash = Math.imul(hash ^ pixels[offset],16777619);
    return hash >>> 0;
  };`);
  const paint = () => browser.evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  let previous = await browser.evaluate('__fingerprint()');
  for (const layout of ['grid','hero','duo','tilt','collage']) {
    await browser.evaluate(`document.querySelector('[data-layout="${layout}"]').click()`);await paint();
    assert.equal(await browser.evaluate('document.querySelector(".layout.active").dataset.layout'),layout);
    const current = await browser.evaluate('__fingerprint()');assert.notEqual(current,previous,`${layout} must change the cover`);previous = current;
  }
  for (const grade of ['neon','golden','vivid','sunset']) {
    await browser.evaluate(`document.querySelector('[data-grade="${grade}"]').click()`);await paint();
    const current = await browser.evaluate('__fingerprint()');assert.notEqual(current,previous,`${grade} must change the cover`);previous = current;
  }
  for (const toggle of ['ink','stars','grain']) {
    await browser.evaluate(`document.getElementById('${toggle}').click()`);await paint();
    const current = await browser.evaluate('__fingerprint()');assert.notEqual(current,previous,`${toggle} must change the cover`);
    await browser.evaluate(`document.getElementById('${toggle}').click()`);await paint();previous = await browser.evaluate('__fingerprint()');
  }
  for (const [id,value] of [['caption','MIDNIGHT RUN'],['subtitle','nothing to lose'],['sticker','AFTER HOURS']]) {
    await browser.evaluate(`{const input = document.getElementById('${id}');input.value = ${JSON.stringify(value)};input.dispatchEvent(new Event('input',{bubbles:true}));}`);await paint();
    const current = await browser.evaluate('__fingerprint()');assert.notEqual(current,previous,`${id} must update live`);previous = current;
  }
  await browser.evaluate(`{const slider = document.getElementById('zoom');slider.value = '1.8';slider.dispatchEvent(new Event('input',{bubbles:true}));}`);await paint();
  assert.equal(await browser.evaluate('document.getElementById("zoom-value").textContent'),'180%');
  previous = await browser.evaluate('__fingerprint()');
  const bounds = await browser.evaluate('document.querySelector("canvas").getBoundingClientRect().toJSON()');
  const originX = bounds.x + bounds.width * .25;const originY = bounds.y + bounds.height * .25;
  await browser.send('Input.dispatchMouseEvent',{type:'mousePressed',x:originX,y:originY,button:'left',clickCount:1});
  await browser.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:originX + 50,y:originY + 35,button:'left',buttons:1});
  await browser.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:originX + 50,y:originY + 35,button:'left',clickCount:1});await paint();
  assert.notEqual(await browser.evaluate('__fingerprint()'),previous,'Drag must pan the selected photo');
  await browser.evaluate('document.getElementById("reset-frame").click()');await paint();
  assert.equal(await browser.evaluate('document.getElementById("zoom-value").textContent'),'100%');
  const documentNode = await browser.send('DOM.getDocument');
  const photoInput = await browser.send('DOM.querySelector',{nodeId:documentNode.root.nodeId,selector:'#photo'});
  await browser.send('DOM.setFileInputFiles',{nodeId:photoInput.nodeId,files:[join(root,'app/samples/pier.jpg'),join(root,'app/samples/boulevard.jpg')]});
  for (let attempt = 0;attempt < 60;attempt++) {if ((await browser.evaluate('document.getElementById("status").textContent')).includes('2 scenes added')) break;await pause(50);}
  assert.equal(await browser.evaluate('document.querySelectorAll(".photo-tile").length'),2,'First upload must replace the samples');
  assert.match(await browser.evaluate('document.querySelector(".photo-tile").title'),/pier\.jpg/);
  await browser.evaluate('document.querySelector("[data-sample=boulevard]").click()');await pause(80);await paint();
  assert.match(await browser.evaluate('document.querySelector(".photo-tile").title'),/boulevard/);
  const exportDirectory = join(scratch,'exports');await rm(exportDirectory,{recursive:true,force:true});await mkdir(exportDirectory,{recursive:true});
  await browser.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:exportDirectory});
  for (const size of ['1080x1080','1080x1350','1920x1080']) {
    await browser.evaluate(`{const select = document.getElementById('size');select.value = '${size}';select.dispatchEvent(new Event('change',{bubbles:true}));}`);await paint();
    await browser.evaluate('document.getElementById("export").click()');
    let filename;
    for (let attempt = 0;attempt < 100;attempt++) {filename = (await readdir(exportDirectory)).find(name => name.endsWith(`-${size}.png`));if (filename) break;await pause(60);}
    assert.ok(filename,`PNG export missing: ${size}`);
    const png = await readFile(join(exportDirectory,filename));const [width,height] = size.split('x').map(Number);
    assert.equal(png.subarray(1,4).toString(),'PNG');assert.equal(png.readUInt32BE(16),width);assert.equal(png.readUInt32BE(20),height);assert.ok(png.length > 100000);
    console.log(`Export passed: ${size} · ${png.length} bytes`);
  }
  const emptyResult = await browser.evaluate(`(async () => {
    const {drawCover,getPanels,hitPanel} = await import('./src/cover.js');
    const results = [];
    for (const layout of ['collage','grid','hero','duo','tilt']) {
      const canvas = document.createElement('canvas');canvas.width = 540;canvas.height = 540;
      const panels = drawCover(canvas,[],{layout,grade:'sunset',ink:true,grain:true,stars:true,caption:'NO PHOTOS NEEDED',subtitle:'the coast is calling',sticker:'VICE HEAT'});
      const pixels = canvas.getContext('2d').getImageData(0,0,540,540).data;
      const colors = new Set();for (let offset = 0;offset < pixels.length;offset += 148) colors.add(pixels[offset] + ',' + pixels[offset + 1] + ',' + pixels[offset + 2]);
      results.push({layout,panels:panels.length,colors:colors.size,hit:hitPanel(panels,panels[0].x + panels[0].w / 2,panels[0].y + panels[0].h / 2)});
    }
    return results;
  })()`);
  for (const result of emptyResult) {assert.ok(result.colors > 100,`${result.layout} placeholder must be designed`);assert.ok(result.hit >= 0);}
  assert.deepEqual(emptyResult.map(result => result.panels),[4,9,1,2,3]);
  for (const layout of ['hero','duo']) {
    await browser.navigate(`${base}/?shot=cover&layout=${layout}&size=1920x1080`,1920,1080);
    const image = await browser.send('Page.captureScreenshot',{format:'png'});await writeFile(join(scratch,`${layout}-check.png`),Buffer.from(image.data,'base64'));
  }
  const custom = await browser.navigate(`${base}/?shot=cover&layout=collage&size=1080x1350&ink=0`,1080,1350);
  assert.deepEqual([custom.width,custom.height,custom.bounds.width,custom.bounds.height],[1080,1350,1080,1350]);
  await browser.navigate(`${base}/?shot=editor`,390,844);
  assert.ok(await browser.evaluate('document.documentElement.scrollWidth <= innerWidth'),'Mobile layout must not overflow');
  assert.equal(browser.errors.length,0);
  console.log('Passed: five layouts, four grades, all toggles, live lettering, pan, zoom, reset, multi-photo upload, sample replacement, three real PNG downloads, five designed placeholders, custom shot sizing, mobile fit, local assets only, no console errors.');
} finally {browser?.close();server.kill();}
