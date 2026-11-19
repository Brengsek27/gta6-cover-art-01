export async function runShot(query, studio) {
  const cover = query.get('shot') === 'cover';
  if (cover) document.body.classList.add('shot-cover');
  const layout = query.get('layout');const grade = query.get('grade');
  if (['collage','grid','hero','duo','tilt'].includes(layout)) studio.state.layout = layout;
  if (['sunset','neon','golden','vivid'].includes(grade)) studio.state.grade = grade;
  if (query.has('caption')) studio.state.caption = query.get('caption').slice(0,40);
  if (query.has('sub')) studio.state.subtitle = query.get('sub').slice(0,45);
  if (query.has('ink')) studio.state.ink = query.get('ink') === '1';
  const names = [query.get('photo'),query.get('photo2')].filter(name => ['boulevard','pier'].includes(name));
  if (names.length) await studio.setPhotos(names);
  const size = query.get('size');
  const validSize = /^\d{3,4}x\d{3,4}$/.test(size || '') && size.split('x').every(value => Number(value) >= 256 && Number(value) <= 4096);
  studio.setSize(validSize ? size : cover ? `${innerWidth}x${innerHeight}` : '1080x1080');
  studio.paint();
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  window.__shotReady = true;
}
