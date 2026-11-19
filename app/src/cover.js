const TAU = Math.PI * 2;
const processed = new WeakMap();
let grainPattern;

export async function loadFonts() {
  await Promise.all(['Anton', 'Pacifico'].map(async family => {
    const face = new FontFace(family, `url(./fonts/${family}-Regular.ttf)`);
    await face.load();
    document.fonts.add(face);
  }));
  await document.fonts.ready;
}

function surface(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function polygon(ctx, points) {
  ctx.beginPath();
  points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.closePath();
}

function palm(ctx, x, y, height, lean = .2, color = '#101d30') {
  ctx.save(); ctx.translate(x, y); ctx.fillStyle = color; ctx.strokeStyle = color;
  ctx.beginPath();ctx.moveTo(-height * .025, 0);
  ctx.quadraticCurveTo(height * lean * .4, -height * .6, height * lean, -height);
  ctx.quadraticCurveTo(height * lean * .3 + height * .06, -height * .57, height * .035, 0);ctx.fill();
  ctx.translate(height * lean, -height);
  for (const direction of [-1,1]) for (let frond = 0;frond < 4;frond++) {
    const endX = direction * height * (.36 - frond * .065);
    const endY = height * (.15 - frond * .105);
    ctx.beginPath();ctx.moveTo(0,0);
    ctx.quadraticCurveTo(endX * .6,-height * .17,endX,endY);
    ctx.quadraticCurveTo(endX * .45,-height * .075,0,0);ctx.fill();
    for (let leaf = 2;leaf < 10;leaf++) {
      const position = leaf / 10;
      const leafX = 2 * (1 - position) * position * endX * .6 + position * position * endX;
      const leafY = 2 * (1 - position) * position * -height * .17 + position * position * endY;
      ctx.beginPath();ctx.moveTo(leafX,leafY);
      ctx.lineTo(leafX + endX * .06,leafY + height * .065 * (1 - position * .6));
      ctx.lineTo(leafX - endX * .035,leafY + height * .008);ctx.fill();
    }
  }
  ctx.restore();
}

function sunset(ctx, width, height, index = 0, horizon = .65) {
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, '#4c286a');sky.addColorStop(.38, '#e36d82');sky.addColorStop(horizon - .01, '#ffc476');sky.addColorStop(horizon, '#397b87');sky.addColorStop(1, '#122a4c');
  ctx.fillStyle = sky;ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#ffe5a0';ctx.beginPath();ctx.arc(width * (.56 + (index % 3) * .08), height * .46, Math.min(width, height) * .22, 0, TAU);ctx.fill();
  ctx.fillStyle = '#dd7182';
  for (let stripe = 0; stripe < 5; stripe++) ctx.fillRect(0, height * (.49 + stripe * .033), width, height * (.003 + stripe * .003));
  for (let stripe = 0; stripe < 15; stripe++) {ctx.fillStyle = stripe % 2 ? '#71b4a826' : '#e6b5ad29';ctx.fillRect(width * .1, height * (horizon + (1 - horizon) * (stripe * .025 + .02) / .35), width * .8, 2);}
  palm(ctx, width * .15, height * 1.03, height * .86, .19);
  palm(ctx, width * .94, height * 1.02, height * .64, -.2);
}

function gradeImage(image, grade, ink) {
  let versions = processed.get(image);
  if (!versions) {versions = new Map();processed.set(image, versions);}
  const key = `${grade}-${ink}`;
  if (versions.has(key)) return versions.get(key);
  const scale = Math.min(1, 1500 / Math.max(image.naturalWidth, image.naturalHeight));
  const buffer = surface(image.naturalWidth * scale, image.naturalHeight * scale);
  const ctx = buffer.getContext('2d', { willReadFrequently: true });
  const width = buffer.width;const height = buffer.height;
  ctx.filter = {sunset:'saturate(1.65) contrast(1.16)',neon:'saturate(1.75) contrast(1.2) hue-rotate(-25deg)',golden:'saturate(1.3) contrast(1.03) sepia(.12)',vivid:'saturate(1.7) contrast(1.14)'}[grade] || 'none';
  ctx.drawImage(image, 0, 0, width, height);ctx.filter = 'none';
  const tint = ctx.createLinearGradient(0, 0, width * .25, height);
  const colors = {sunset:['#ffb15b','#ea4c76','#351749'],neon:['#fa65ba','#277d93','#083f56'],golden:['#ffe3a2','#fbb455','#6a3440'],vivid:['#56c4ea','#e99369','#294a82']}[grade] || ['#ffb15b','#ea4c76','#351749'];
  tint.addColorStop(0, colors[0]);tint.addColorStop(.55, colors[1]);tint.addColorStop(1, colors[2]);
  ctx.globalCompositeOperation = 'soft-light';ctx.globalAlpha = grade === 'neon' ? .65 : .5;
  ctx.fillStyle = tint;ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = 'color';ctx.globalAlpha = .09;ctx.fillStyle = colors[1];ctx.fillRect(0, 0, width, height);
  if (grade === 'neon') {ctx.globalCompositeOperation = 'screen';ctx.globalAlpha = .16;ctx.filter = 'blur(10px)';ctx.drawImage(buffer, 0, 0);ctx.filter = 'none';}
  ctx.globalCompositeOperation = 'source-over';ctx.globalAlpha = 1;
  if (ink || grade === 'sunset' || grade === 'neon') {
    const pixels = ctx.getImageData(0, 0, width, height);
    const original = new Uint8ClampedArray(pixels.data);const data = pixels.data;
    const palette = grade === 'sunset' ? [[44,24,72],[236,91,112],[255,205,134]] : grade === 'neon' ? [[9,60,78],[66,168,173],[255,155,210]] : null;
    const strength = grade === 'neon' ? .27 : .16;
    for (let offset = 0; offset < data.length; offset += 4) {
      const luminance = original[offset] * .299 + original[offset + 1] * .587 + original[offset + 2] * .114;
      const right = Math.min(offset + 4, data.length - 4);const down = Math.min(offset + width * 4, data.length - 4);
      const edge = ink ? Math.min(.4, (Math.abs(original[offset] - original[right]) + Math.abs(original[offset + 1] - original[down + 1])) / 220) : 0;
      const segment = luminance < 128 ? 0 : 1;
      const mix = segment === 0 ? luminance / 128 : (luminance - 128) / 127;
      for (let channel = 0; channel < 3; channel++) {
        const mapped = palette ? palette[segment][channel] * (1 - mix) + palette[segment + 1][channel] * mix : original[offset + channel];
        const colored = original[offset + channel] * (1 - strength) + mapped * strength;
        const saturated = luminance + (colored - luminance) * (ink ? 1.16 : 1);
        const quantized = Math.round(saturated / 38) * 38;
        data[offset + channel] = (ink ? saturated * .32 + quantized * .68 : saturated) * (1 - edge);
      }
    }
    ctx.putImageData(pixels, 0, 0);
  }
  versions.set(key, buffer);return buffer;
}

function gutter(width) {
  return width / 128;
}

export function getPanels(layout, width, height) {
  const edge = Math.min(width, height) * .01;const gap = gutter(width);
  const innerWidth = width - edge * 2;const innerHeight = height - edge * 2;
  const box = (x, y, w, h, extras = {}) => ({x:edge + x * innerWidth,y:edge + y * innerHeight,w:w * innerWidth - gap,h:h * innerHeight - gap,angle:0,...extras});
  if (layout === 'grid') {
    const crops = [
      {cropX:.28,cropY:.08},{cropX:.32,cropY:.12,zoom:1.1},{cropX:1,cropY:.46,zoom:2.05},
      {cropX:.02,cropY:.83,zoom:2.35},{cropX:.39,cropY:.03,zoom:1.95},{cropX:.57,cropY:.1,zoom:1.75},
      {cropX:0,cropY:.32,zoom:4.3},{title:true},{cropX:.78,cropY:.98,zoom:3},
    ];
    return crops.map((crop,index) => box(index % 3 / 3,Math.floor(index / 3) / 3,1 / 3,1 / 3,crop));
  }
  if (layout === 'hero') return [box(0, 0, 1 + gap / innerWidth, 1 + gap / innerHeight, {cropY:.27})];
  if (layout === 'duo') return [box(0, 0, .5, 1 + gap / innerHeight, {cropY:.22}),box(.5, 0, .5 + gap / innerWidth, 1 + gap / innerHeight, {cropY:.28})];
  if (layout === 'tilt') return [
    {x:width * .027,y:height * .16,w:width * .37,h:height * .58,angle:-6,cropY:.2},
    {x:width * .32,y:height * .10,w:width * .37,h:height * .59,angle:0,cropY:.34,zoom:1.15},
    {x:width * .62,y:height * .18,w:width * .37,h:height * .57,angle:5,cropY:.93,cropX:.1,zoom:1.6},
  ];
  return [box(0,0,.615,.755,{cropY:.18}),box(.615,0,.385 + gap / innerWidth,.365,{cropY:.08}),box(.615,.365,.385 + gap / innerWidth,.39,{cropY:.72,cropX:.65,zoom:1.25}),box(0,.755,1 + gap / innerWidth,.245 + gap / innerHeight,{cropY:.315,cropX:.5,zoom:1.02})];
}

function drawPanel(ctx, panel, photo, options, index) {
  const {x,y,w,h,angle = 0} = panel;
  ctx.save();ctx.translate(x + w / 2, y + h / 2);ctx.rotate(angle * Math.PI / 180);
  if (options.layout === 'tilt') {
    const border = gutter(ctx.canvas.width);
    ctx.shadowColor = '#080b1bcc';ctx.shadowBlur = border * 2;ctx.shadowOffsetY = border;
    ctx.fillStyle = '#050507';ctx.fillRect(-w / 2 - border, -h / 2 - border, w + border * 2, h + border * 2);
    ctx.shadowBlur = 0;ctx.shadowOffsetY = 0;
  }
  ctx.beginPath();ctx.rect(-w / 2, -h / 2, w, h);ctx.clip();
  if (photo?.image) {
    const image = gradeImage(photo.image, options.grade, options.ink);
    const factor = Math.max(w / image.width, h / image.height) * (photo.zoom || 1) * (panel.zoom || 1);
    const drawWidth = image.width * factor;const drawHeight = image.height * factor;
    const left = Math.max(w - drawWidth, Math.min(0, (w - drawWidth) * (panel.cropX ?? .5) + (photo.x || 0) * w));
    const top = Math.max(h - drawHeight, Math.min(0, (h - drawHeight) * (panel.cropY ?? .4) + (photo.y || 0) * h));
    ctx.drawImage(image, -w / 2 + left, -h / 2 + top, drawWidth, drawHeight);
  } else {ctx.translate(-w / 2, -h / 2);sunset(ctx, w, h, index);ctx.translate(w / 2, h / 2);}
  const shade = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  shade.addColorStop(0, '#0b122800');shade.addColorStop(.65, '#120f2000');shade.addColorStop(1, '#110e3044');
  ctx.fillStyle = shade;ctx.fillRect(-w / 2, -h / 2, w, h);
  const edge = gutter(ctx.canvas.width) * .1;
  ctx.strokeStyle = '#fff0d47a';ctx.lineWidth = edge;
  ctx.strokeRect((-w + edge) / 2, (-h + edge) / 2, w - edge, h - edge);
  ctx.restore();
}

function micro(ctx, text, x, y, size, color = '#fff2d5', align = 'left') {
  ctx.save();ctx.fillStyle = color;ctx.font = `600 ${size}px Arial`;ctx.textAlign = align;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${size * .16}px`;
  ctx.fillText(text, x, y);ctx.restore();
}

function titleLines(text, split) {
  const words = text.trim().toUpperCase().split(/\s+/);
  if (!split || words.length < 2) return [words.join(' ')];
  let best = 1;
  for (let index = 1; index < words.length; index++) if (Math.abs(words.slice(0,index).join(' ').length - words.slice(index).join(' ').length) < Math.abs(words.slice(0,best).join(' ').length - words.slice(best).join(' ').length)) best = index;
  return [words.slice(0,best).join(' '),words.slice(best).join(' ')];
}

function title(ctx, options, width, height, panels) {
  const short = Math.min(width,height);const landscape = width / height > 1.3;
  const grid = options.layout === 'grid';const tilted = options.layout === 'tilt';
  let centerX = width * .5;
  let centerY = height * (tilted ? .8 : options.layout === 'hero' ? .74 : options.layout === 'duo' ? .71 : .685);
  let measure = width * (landscape ? .78 : .89);let maxSize = short * (landscape ? .28 : .218);
  if (options.layout === 'duo' && !landscape) {centerY = height * .73;maxSize = short * .20;}
  let lines = titleLines(options.caption || '', !landscape && !tilted);
  if (grid) {
    centerX = width * .5;centerY = height * .835;measure = width * .31;maxSize = short * .106;
    lines = titleLines(options.caption || '', true);
    const {x:left,y:top,w:bandWidth,h:bandHeight} = panels.find(panel => panel.title);
    const band = ctx.createLinearGradient(left,top,left,height);
    band.addColorStop(0,'#f7af68');band.addColorStop(.55,'#e2528e');band.addColorStop(1,'#5c348a');
    ctx.fillStyle = band;ctx.fillRect(left,top,bandWidth,bandHeight);
    ctx.save();ctx.beginPath();ctx.rect(left,top,bandWidth,bandHeight);ctx.clip();ctx.fillStyle = '#32223b50';
    for (let dotY = top;dotY < top + bandHeight;dotY += short * .01) for (let dotX = left;dotX < left + bandWidth;dotX += short * .01) {ctx.beginPath();ctx.arc(dotX,dotY,short * .0018,0,TAU);ctx.fill();}
    ctx.restore();micro(ctx,'THE COAST IS CALLING',centerX,height * .712,short * .008,'#3a1838','center');
  } else {
    const wash = ctx.createRadialGradient(centerX,centerY,short * .03,centerX,centerY,width * .53);
    wash.addColorStop(0,'#1313299c');wash.addColorStop(.55,'#13132959');wash.addColorStop(1,'#13132900');
    ctx.fillStyle = wash;ctx.fillRect(0,0,width,height);
    if (options.layout === 'duo') {
      ctx.save();ctx.beginPath();
      for (const panel of panels) ctx.rect(panel.x,panel.y,panel.w,panel.h);
      ctx.clip();
      const bandTop = height * .545;
      const band = ctx.createLinearGradient(0,bandTop,0,height * .91);
      band.addColorStop(0,'#19172fd9');band.addColorStop(.55,'#261a37e6');band.addColorStop(1,'#17172cce');
      ctx.fillStyle = band;ctx.fillRect(0,bandTop,width,height * .365);
      ctx.fillStyle = '#ff8eb966';ctx.fillRect(0,bandTop,width,short * .002);ctx.fillRect(0,height * .91,width,short * .002);
      ctx.restore();
    }
  }
  if (tilted) {measure = width * .88;maxSize = short * .16;lines = titleLines(options.caption || '',true);centerY = height * .80;}
  if (!grid && !tilted) micro(ctx,'HIGH TIDES. HIGH STAKES.',centerX,centerY - maxSize * (lines.length > 1 ? 1.04 : .61),short * .01,'#ffe7c0','center');
  let size = maxSize;ctx.font = `${size}px Anton`;
  while (lines.some(line => ctx.measureText(line).width > measure) && size > 9) {size -= 1;ctx.font = `${size}px Anton`;}
  ctx.save();ctx.textAlign = 'center';ctx.textBaseline = 'middle';ctx.lineJoin = 'round';
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${size * -.015}px`;
  const lineHeight = size;
  lines.forEach((line,index) => {
    const baseline = centerY + (index - (lines.length - 1) / 2) * lineHeight;
    ctx.strokeStyle = '#121322';ctx.lineWidth = size * .14;ctx.strokeText(line,centerX + size * .047,baseline + size * .065);
    ctx.fillStyle = '#601d50';ctx.fillText(line,centerX + size * .047,baseline + size * .065);
    ctx.strokeStyle = '#121322';ctx.lineWidth = size * .105;ctx.strokeText(line,centerX,baseline);
    const fill = ctx.createLinearGradient(0,baseline - size * .48,0,baseline + size * .49);
    fill.addColorStop(0,grid ? '#fff2b5' : '#fffef0');fill.addColorStop(.5,grid ? '#ffb277' : '#fff8de');fill.addColorStop(1,grid ? '#fa69a7' : '#e8cda8');
    ctx.fillStyle = fill;ctx.fillText(line,centerX,baseline);
  });ctx.restore();
  if (options.subtitle) {
    const scriptY = centerY + lines.length * lineHeight * .46;
    ctx.save();ctx.translate(centerX + measure * .04,scriptY);ctx.rotate(-2 * Math.PI / 180);
    let scriptSize = grid ? short * .034 : short * .066;ctx.font = `${scriptSize}px Pacifico`;
    while (ctx.measureText(options.subtitle).width > measure * 1.02 && scriptSize > 8) {scriptSize -= 1;ctx.font = `${scriptSize}px Pacifico`;}
    ctx.textAlign = 'center';ctx.textBaseline = 'middle';ctx.lineJoin = 'round';ctx.strokeStyle = '#371734';ctx.lineWidth = scriptSize * .13;ctx.strokeText(options.subtitle,0,0);
    ctx.shadowColor = '#ff277d';ctx.shadowBlur = short * .012;ctx.fillStyle = '#ff71ae';ctx.fillText(options.subtitle,0,0);ctx.shadowBlur = 0;ctx.restore();
  }
}

function star(ctx, x, y, radius, points = 5, inner = .43) {
  polygon(ctx,Array.from({length:points * 2},(_,index) => {const angle = -Math.PI / 2 + index * Math.PI / points;const distance = radius * (index % 2 ? inner : 1);return [x + Math.cos(angle) * distance,y + Math.sin(angle) * distance];}));
}

function furniture(ctx, options, width, height) {
  const short = Math.min(width,height);const unit = short / 1080;const landscape = width / height > 1.3;
  micro(ctx,'A NEON COAST ORIGINAL',width * .035,height * .05,short * .012);
  ctx.fillStyle = '#fff1cb';ctx.fillRect(width * .035,height * .062,short * .06,2 * unit);
  micro(ctx,'VOL. 06 / AFTER HOURS',width * .035,height * .085,short * .0085);
  if (options.stars) {
    const badgeWidth = short * .257;const badgeHeight = short * .061;
    const badgeX = width - width * .035 - badgeWidth;const badgeY = height * .028;
    ctx.fillStyle = '#111622eb';ctx.beginPath();ctx.roundRect(badgeX,badgeY,badgeWidth,badgeHeight,badgeHeight / 2);ctx.fill();
    ctx.strokeStyle = '#edd3ab7a';ctx.lineWidth = unit;ctx.stroke();ctx.fillStyle = '#ffcf70';
    for (let index = 0;index < 5;index++) {star(ctx,badgeX + badgeWidth * (.13 + index * .184),badgeY + badgeHeight * .49,badgeHeight * .23);ctx.fill();}
    micro(ctx,'MAXIMUM HEAT',badgeX + badgeWidth / 2,badgeY + badgeHeight + short * .016,short * .007,'#ffe5b6','center');
  }
  if (options.sticker) {
    const radius = short * .085;
    const centerX = width * (options.layout === 'grid' ? .825 : landscape ? .86 : .85);
    const centerY = height * (options.layout === 'tilt' ? .39 : options.layout === 'grid' ? .625 : .57);
    ctx.save();ctx.translate(centerX,centerY);ctx.rotate(-12 * Math.PI / 180);
    ctx.shadowColor = '#0b1329aa';ctx.shadowBlur = unit * 4;ctx.shadowOffsetY = unit * 6;
    star(ctx,0,0,radius,16,.88);ctx.fillStyle = '#ffcf78';ctx.fill();ctx.shadowBlur = 0;ctx.shadowOffsetY = 0;
    ctx.strokeStyle = '#202039';ctx.lineWidth = unit * 2;ctx.stroke();
    ctx.beginPath();ctx.arc(0,0,radius * .75,0,TAU);ctx.strokeStyle = '#9d603e';ctx.lineWidth = unit;ctx.setLineDash([unit * 3,unit * 3]);ctx.stroke();ctx.setLineDash([]);
    micro(ctx,'LIMITED EDITION',0,-radius * .55,radius * .095,'#533237','center');
    const words = titleLines(options.sticker,true);
    let stickerSize = radius * .38;ctx.font = `${stickerSize}px Anton`;
    while (words.some(word => ctx.measureText(word).width > radius * 1.35) && stickerSize > 5) {stickerSize--;ctx.font = `${stickerSize}px Anton`;}
    ctx.textAlign = 'center';ctx.textBaseline = 'middle';ctx.fillStyle = '#292235';
    words.forEach((word,index) => ctx.fillText(word,0,(index - (words.length - 1) / 2) * stickerSize * 1.05));
    micro(ctx,'NO. 001 / NC',0,radius * .59,radius * .095,'#533237','center');ctx.restore();
  }
  const baseY = height - short * .094;const badgeX = width * .035;
  ctx.fillStyle = '#111724ed';ctx.fillRect(badgeX,baseY,short * .068,short * .061);
  ctx.strokeStyle = '#ffe8bd';ctx.lineWidth = unit * 1.5;ctx.strokeRect(badgeX,baseY,short * .068,short * .061);
  ctx.font = `${short * .041}px Anton`;ctx.fillStyle = '#ffe8bd';ctx.textAlign = 'center';ctx.fillText('NC',badgeX + short * .034,baseY + short * .047);
  micro(ctx,'NEON COAST EDITION',badgeX + short * .079,baseY + short * .025,short * .01);
  micro(ctx,'MAKE YOUR OWN LEGEND / VOL. 06',badgeX + short * .079,baseY + short * .045,short * .0065);
  const barcodeX = width - width * .035 - short * .155;const barcodeY = height - short * .078;
  ctx.fillStyle = '#fff1d6';ctx.fillRect(barcodeX - 5 * unit,barcodeY - 4 * unit,short * .16,short * .052);ctx.fillStyle = '#151b29';
  let cursor = 0;let counter = 0;
  while (cursor < short * .147) {const thickness = (1 + ((counter * 7 + 3) % 4)) * unit;ctx.fillRect(barcodeX + cursor,barcodeY,thickness,short * .028);cursor += thickness + (counter % 3 + 1) * unit;counter++;}
  micro(ctx,'0  6  2  0  2  6   N C 0 0 1',barcodeX,barcodeY + short * .041,short * .0055,'#151b29');
  ctx.fillStyle = '#101423';ctx.fillRect(0,height - short * .022,width,short * .022);
  micro(ctx,'NEON COAST STUDIO  /  AN INDEPENDENT PICTURE  /  YOUR CITY. YOUR STORY. YOUR RULES.',width * .035,height - short * .008,short * .0067,'#d9c6b3');
  micro(ctx,'EST. MMXXVI',width * .965,height - short * .008,short * .0067,'#d9c6b3','right');
  ctx.save();ctx.translate(width * .977,height * .51);ctx.rotate(-Math.PI / 2);micro(ctx,'SUN • SALT • SOMETHING TO LOSE',0,0,short * .007,'#fff0d9','center');ctx.restore();
}

function finish(ctx, width, height, grain) {
  if (grain) {
    if (!grainPattern) {
      grainPattern = surface(160,160);const noiseContext = grainPattern.getContext('2d');const pixels = noiseContext.createImageData(160,160);let seed = 9301;
      for (let offset = 0;offset < pixels.data.length;offset += 4) {seed = (seed * 1664525 + 1013904223) >>> 0;const shade = seed % 256;pixels.data[offset] = shade;pixels.data[offset + 1] = shade;pixels.data[offset + 2] = shade;pixels.data[offset + 3] = 255;}
      noiseContext.putImageData(pixels,0,0);
    }
    ctx.save();ctx.globalAlpha = .065;ctx.globalCompositeOperation = 'soft-light';ctx.fillStyle = ctx.createPattern(grainPattern,'repeat');ctx.fillRect(0,0,width,height);ctx.restore();
  }
  const vignette = ctx.createRadialGradient(width / 2,height * .46,Math.min(width,height) * .29,width / 2,height / 2,Math.max(width,height) * .7);
  vignette.addColorStop(0,'#10132600');vignette.addColorStop(1,'#0b102c80');ctx.fillStyle = vignette;ctx.fillRect(0,0,width,height);
}

export function drawCover(canvas, photos, options) {
  const ctx = canvas.getContext('2d');const width = canvas.width;const height = canvas.height;
  ctx.clearRect(0,0,width,height);ctx.fillStyle = '#050507';ctx.fillRect(0,0,width,height);
  if (options.layout === 'tilt') {
    const horizon = .84;
    sunset(ctx,width,height,0,horizon);
    ctx.fillStyle = '#ffd19a';ctx.beginPath();ctx.arc(width * .73,height * .12,Math.min(width,height) * .12,0,TAU);ctx.fill();
    ctx.fillStyle = '#202039';
    const rooftops = [.036,.054,.043,.071,.048,.039,.058,.043,.067,.036,.052,.042,.065,.047,.073,.049,.037,.056,.04,.028];
    ctx.fillRect(0,height * (horizon - .013),width,height * .016);
    rooftops.forEach((roof,index) => ctx.fillRect(width * (index * .05 + .004),height * (horizon - roof),width * .041,height * roof));
    palm(ctx,width * .035,height,height * .76,.11,'#151a31');palm(ctx,width * .98,height,height * .68,-.1,'#151a31');
    palm(ctx,width * .13,height * .96,height * .18,-.16,'#151a31');
    palm(ctx,width * .87,height * .98,height * .21,.12,'#151a31');
    micro(ctx,'POSTCARDS FROM THE OTHER SIDE',width / 2,height * .072,Math.min(width,height) * .01,'#ffe5b9','center');
  }
  const panels = getPanels(options.layout,width,height);
  panels.forEach((panel,index) => {if (!panel.title) drawPanel(ctx,panel,photos.length ? photos[index % photos.length] : null,options,index);});
  finish(ctx,width,height,options.grain);title(ctx,options,width,height,panels);furniture(ctx,options,width,height);
  const frame = Math.min(width,height) * .016;
  ctx.lineWidth = Math.min(width,height) * .0015;ctx.strokeStyle = '#fff0d5bb';ctx.strokeRect(frame,frame,width - frame * 2,height - frame * 2);
  ctx.strokeStyle = '#101320';ctx.lineWidth = Math.min(width,height) * .008;ctx.strokeRect(0,0,width,height);
  return panels;
}

export function hitPanel(panels, x, y) {
  for (let index = panels.length - 1;index >= 0;index--) {
    const panel = panels[index];if (panel.title) continue;
    const angle = -(panel.angle || 0) * Math.PI / 180;const dx = x - panel.x - panel.w / 2;const dy = y - panel.y - panel.h / 2;
    const localX = dx * Math.cos(angle) - dy * Math.sin(angle);const localY = dx * Math.sin(angle) + dy * Math.cos(angle);
    if (Math.abs(localX) <= panel.w / 2 && Math.abs(localY) <= panel.h / 2) return index;
  }
  return -1;
}
