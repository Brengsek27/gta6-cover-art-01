import {drawCover, hitPanel, loadFonts} from './cover.js';
import {runShot} from './shots.js';

const element = id => document.getElementById(id);
const canvas = element('cover');
const status = element('status');
const state = {layout:'collage',grade:'sunset',caption:'NEON COAST',subtitle:'vice heat rising',sticker:'VICE HEAT',ink:true,stars:true,grain:true};
let photos = [];
let panels = [];
let selected = 0;
let pending = false;
let drag = null;
let ready = false;
let usingSamples = true;
const sampleImages = new Map();

export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('This image could not be opened. Try a JPG, PNG, or WebP.'));
    image.src = url;
  });
}

async function sample(name) {
  if (!sampleImages.has(name)) sampleImages.set(name, await loadImage(`./samples/${name}.jpg`));
  return {image:sampleImages.get(name),name,zoom:1,x:0,y:0};
}

function fitPreview() {
  if (document.body.classList.contains('shot-cover')) {
    document.querySelector('.cover-wrap').removeAttribute('style');
    canvas.removeAttribute('style');
    return;
  }
  const stage = document.querySelector('.canvas-stage');
  const style = getComputedStyle(stage);
  const availableWidth = stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const availableHeight = stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
  const factor = Math.min(availableWidth / canvas.width, availableHeight / canvas.height);
  const wrap = document.querySelector('.cover-wrap');
  wrap.style.width = `${canvas.width * factor}px`;
  wrap.style.height = `${canvas.height * factor}px`;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
}

function redraw() {
  pending = false;
  if (!ready) return;
  panels = drawCover(canvas,photos,state);
  fitPreview();
}

function queueDraw() {
  if (!pending) {pending = true;requestAnimationFrame(redraw);}
}

function syncSelection() {
  const photo = photos.length ? photos[selected % photos.length] : null;
  element('zoom').value = photo?.zoom || 1;
  element('zoom-value').textContent = `${Math.round((photo?.zoom || 1) * 100)}%`;
  element('panel-label').replaceChildren(document.createTextNode(`PANEL ${String(selected + 1).padStart(2,'0')} SELECTED `));
  const icon = document.createElement('span');icon.className = 'drag-icon';icon.textContent = '✥';element('panel-label').append(icon);
  document.querySelectorAll('.photo-tile').forEach((tile,index) => tile.classList.toggle('active',photo && index === selected % photos.length));
}

function syncControls() {
  ['caption','sticker','ink','stars','grain'].forEach(key => {
    if (typeof state[key] === 'boolean') element(key).checked = state[key];
    else element(key).value = state[key];
  });
  element('subtitle').value = state.subtitle;
  element('caption-count').textContent = `${state.caption.length} / 40`;
  element('grade-name').textContent = state.grade[0].toUpperCase() + state.grade.slice(1);
  element('layout-label').textContent = state.layout.toUpperCase();
  document.querySelectorAll('[data-layout],[data-grade]').forEach(button => {
    const active = button.dataset.layout ? state.layout === button.dataset.layout : state.grade === button.dataset.grade;
    button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));
  });
  syncSelection();
}

function photoStrip() {
  element('photo-count').textContent = `${photos.length} PHOTO${photos.length === 1 ? '' : 'S'}`;
  element('photo-strip').classList.toggle('compact',photos.length <= 2);
  element('photo-strip').replaceChildren(...photos.map((photo,index) => {
    const button = document.createElement('button');button.className = 'photo-tile';button.title = `${photo.name} · select photo`;
    button.setAttribute('aria-label',`Select photo ${index + 1}: ${photo.name}`);
    const image = document.createElement('img');image.src = photo.image.src;image.alt = '';
    const number = document.createElement('span');number.textContent = String(index + 1).padStart(2,'0');
    button.append(image,number);
    button.addEventListener('click',() => {
      const match = panels.findIndex((panel,panelIndex) => !panel.title && panelIndex % photos.length === index);
      if (match >= 0) {selected = match;syncSelection();status.textContent = `Photo ${index + 1} selected. Drag a panel to reframe.`;}
      else status.textContent = 'Choose Grid to use more photos in your cover.';
    });
    return button;
  }));
  syncSelection();
}

function setSize(value) {
  const [width,height] = value.split('x').map(Number);
  canvas.width = width;canvas.height = height;
  const select = element('size');
  if (![...select.options].some(option => option.value === value)) select.add(new Option(`Custom · ${width} × ${height}`,value));
  select.value = value;element('preview-size').textContent = `${width} × ${height}`;
}

document.querySelectorAll('[data-layout]').forEach(button => button.addEventListener('click',() => {
  state.layout = button.dataset.layout;selected = 0;syncControls();queueDraw();
}));
document.querySelectorAll('[data-grade]').forEach(button => button.addEventListener('click',() => {
  state.grade = button.dataset.grade;syncControls();queueDraw();
}));
['caption','subtitle','sticker'].forEach(key => element(key).addEventListener('input',event => {
  state[key] = event.target.value;element('caption-count').textContent = `${state.caption.length} / 40`;queueDraw();
}));
['ink','stars','grain'].forEach(key => element(key).addEventListener('change',event => {state[key] = event.target.checked;queueDraw();}));
element('size').addEventListener('change',event => {setSize(event.target.value);queueDraw();});
element('zoom').addEventListener('input',event => {
  if (!photos.length) return;
  photos[selected % photos.length].zoom = Number(event.target.value);syncSelection();queueDraw();
});
element('reset-frame').addEventListener('click',() => {
  if (photos.length) Object.assign(photos[selected % photos.length],{zoom:1,x:0,y:0});
  syncSelection();queueDraw();status.textContent = 'Framing reset. Make it yours.';
});
document.querySelectorAll('[data-sample]').forEach(button => button.addEventListener('click',async () => {
  try {
    const photo = await sample(button.dataset.sample);
    if (photos.length) photos[selected % photos.length] = photo;else photos.push(photo);
    photoStrip();queueDraw();status.textContent = `${photo.name[0].toUpperCase() + photo.name.slice(1)} loaded into the selected photo slot.`;
  } catch (error) {status.textContent = error.message;}
}));
element('photo').addEventListener('change',async event => {
  const files = [...event.target.files];
  if (!files.length) return;
  status.textContent = 'Developing your scenes…';
  let rejected = 0;
  const loaded = [];
  for (const file of files) {
    const url = URL.createObjectURL(file);
    try {loaded.push({image:await loadImage(url),name:file.name,zoom:1,x:0,y:0,objectURL:url});}
    catch {URL.revokeObjectURL(url);rejected++;}
  }
  if (loaded.length) {
    if (usingSamples) {photos = [];usingSamples = false;}
    photos.push(...loaded);selected = 0;photoStrip();queueDraw();
  }
  status.textContent = loaded.length ? `${loaded.length} scene${loaded.length === 1 ? '' : 's'} added.${rejected ? ` ${rejected} could not be opened.` : ' Your story starts here.'}` : 'Could not open those files. Try JPG, PNG, or WebP.';
  event.target.value = '';
});

function canvasPoint(event) {
  const bounds = canvas.getBoundingClientRect();
  return {x:(event.clientX - bounds.left) * canvas.width / bounds.width,y:(event.clientY - bounds.top) * canvas.height / bounds.height};
}
canvas.addEventListener('pointerdown',event => {
  if (event.button !== 0 || document.body.classList.contains('shot-cover')) return;
  const point = canvasPoint(event);const index = hitPanel(panels,point.x,point.y);
  if (index < 0 || !photos.length) return;
  selected = index;syncSelection();
  const photo = photos[selected % photos.length];
  drag = {start:point,x:photo.x,y:photo.y,photo};canvas.setPointerCapture(event.pointerId);canvas.classList.add('dragging');
});
canvas.addEventListener('pointermove',event => {
  if (!drag) return;
  const point = canvasPoint(event);const panel = panels[selected];const angle = -(panel.angle || 0) * Math.PI / 180;
  const dx = point.x - drag.start.x;const dy = point.y - drag.start.y;
  drag.photo.x = Math.max(-3,Math.min(3,drag.x + (dx * Math.cos(angle) - dy * Math.sin(angle)) / panel.w));
  drag.photo.y = Math.max(-3,Math.min(3,drag.y + (dx * Math.sin(angle) + dy * Math.cos(angle)) / panel.h));
  queueDraw();
});
function releaseDrag() {drag = null;canvas.classList.remove('dragging');}
canvas.addEventListener('pointerup',releaseDrag);canvas.addEventListener('pointercancel',releaseDrag);canvas.addEventListener('lostpointercapture',releaseDrag);
canvas.addEventListener('keydown',event => {
  if (!photos.length || !['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)) return;
  event.preventDefault();const photo = photos[selected % photos.length];
  const step = event.shiftKey ? .06 : .015;
  if (event.key === 'ArrowLeft') photo.x -= step;
  if (event.key === 'ArrowRight') photo.x += step;
  if (event.key === 'ArrowUp') photo.y -= step;
  if (event.key === 'ArrowDown') photo.y += step;
  queueDraw();
});

element('export').addEventListener('click',async () => {
  if (!ready) return;
  redraw();const button = element('export');button.disabled = true;status.textContent = 'Pressing your cover…';
  try {
    const blob = await new Promise(resolve => canvas.toBlob(resolve,'image/png'));
    if (!blob) throw new Error('Export failed. Please try again.');
    const url = URL.createObjectURL(blob);const link = document.createElement('a');link.href = url;
    link.download = `${state.caption.trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'neon-coast'}-${canvas.width}x${canvas.height}.png`;
    document.body.append(link);link.click();link.remove();setTimeout(() => URL.revokeObjectURL(url),3000);
    status.textContent = `Exported ${canvas.width} × ${canvas.height}. Go make some heat.`;
  } catch (error) {status.textContent = error.message;}
  finally {button.disabled = false;}
});

new ResizeObserver(fitPreview).observe(document.querySelector('.canvas-stage'));

async function init() {
  await loadFonts();
  photos = await Promise.all([sample('boulevard'),sample('pier')]);
  const query = new URLSearchParams(location.search);
  if (query.has('shot')) {
    await runShot(query,{
      state,
      setPhotos:async names => {photos = await Promise.all(names.map(sample));},
      setSize,
      paint:() => {ready = true;syncControls();photoStrip();redraw();},
    });
  } else {ready = true;syncControls();photoStrip();redraw();}
}
init().catch(error => {status.textContent = `Studio could not start: ${error.message}`;console.error(error);});
