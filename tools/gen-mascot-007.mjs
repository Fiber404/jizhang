/* 鲸鱼记账 —— 用 007.jpg（记账本吉祥物）生成 App 内吉祥物 + 全部图标
 * 1) 去掉奶油色背景（含地面阴影）→ 透明底 mascot.png
 * 2) 生成 PWA 图标 / 安卓 launcher、round、foreground / 启动屏（奶油底）
 */
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SRC = path.join(__dirname, '..', 'temp', '007.jpg');
const ICONS_DIR = path.join(__dirname, '..', 'icons');
const RES = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');

const CREAM = [252, 253, 239];          // 原图背景色
const BG = { r: 253, g: 246, b: 227, alpha: 1 }; // 图标底色（奶油白）
const BG_HEX = '#FDF6E3';

const dist = (r, g, b) => Math.hypot(r - CREAM[0], g - CREAM[1], b - CREAM[2]);

// 从四周 flood fill 奶油背景（阈值 45 可吃掉地面阴影，但不会吃掉薄荷绿/白纸）
function floodBackground(data, width, height) {
  const bg = new Uint8Array(width * height);
  const queue = new Int32Array(width * height * 2);
  let head = 0, tail = 0;
  const push = (idx) => {
    if (bg[idx]) return;
    const i = idx * 4;
    if (dist(data[i], data[i + 1], data[i + 2]) >= 45) return;
    bg[idx] = 1;
    queue[tail++] = idx;
  };
  for (let x = 0; x < width; x++) { push(x); push((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { push(y * width); push(y * width + width - 1); }
  while (head < tail) {
    const idx = queue[head++];
    const x = idx % width, y = (idx / width) | 0;
    if (x > 0) push(idx - 1);
    if (x < width - 1) push(idx + 1);
    if (y > 0) push(idx - width);
    if (y < height - 1) push(idx + width);
  }
  return bg;
}

// 边缘去奶油污染：紧贴背景的一圈像素按「与奶油的距离」估 alpha，并反预乘还原真色
function decontaminate(data, width, height, bg) {
  const ring = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (bg[idx]) continue;
      let near = false;
      for (let dy = -2; dy <= 2 && !near; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          if (bg[ny * width + nx]) { near = true; break; }
        }
      }
      if (near) ring.push(idx);
    }
  }
  for (const idx of ring) {
    const i = idx * 4;
    const d = dist(data[i], data[i + 1], data[i + 2]);
    if (d >= 120) continue;              // 已经是很实的角色色，不动
    const a = Math.min(1, Math.max(0.08, (d - 12) / 90));
    for (let c = 0; c < 3; c++) {
      const v = (data[i + c] - (1 - a) * CREAM[c]) / a;
      data[i + c] = Math.max(0, Math.min(255, Math.round(v)));
    }
    data[i + 3] = Math.round(a * 255);
  }
}

function applyAlpha(data, width, height, bg) {
  for (let idx = 0; idx < width * height; idx++) {
    const i = idx * 4;
    if (bg[idx]) { data[i] = CREAM[0]; data[i + 1] = CREAM[1]; data[i + 2] = CREAM[2]; data[i + 3] = 0; }
  }
}

// 只保留最大连通块：清掉残留的地面阴影碎片
function keepLargestComponent(data, width, height) {
  const visited = new Uint8Array(width * height);
  const compId = new Int32Array(width * height);
  let maxComp = 0, maxSize = 0, compCount = 0;
  const opaque = (idx) => data[idx * 4 + 3] > 8;
  for (let start = 0; start < width * height; start++) {
    if (visited[start] || !opaque(start)) continue;
    compCount++;
    let size = 0;
    const stack = [start];
    visited[start] = 1;
    while (stack.length) {
      const idx = stack.pop();
      compId[idx] = compCount;
      size++;
      const x = idx % width, y = (idx / width) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const ni = ny * width + nx;
        if (visited[ni] || !opaque(ni)) continue;
        visited[ni] = 1;
        stack.push(ni);
      }
    }
    if (size > maxSize) { maxSize = size; maxComp = compCount; }
  }
  for (let idx = 0; idx < width * height; idx++) {
    if (compId[idx] !== 0 && compId[idx] !== maxComp) {
      const i = idx * 4;
      data[i + 3] = 0;
    }
  }
  console.log(`可连通块=${compCount}，保留最大块=${maxSize}`);
}

// 裁到内容边界
async function trimmedRGBA() {
  const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const bg = floodBackground(data, width, height);
  decontaminate(data, width, height, bg);
  applyAlpha(data, width, height, bg);
  keepLargestComponent(data, width, height);

  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const w = maxX - minX + 1, h = maxY - minY + 1;
  console.log(`内容区域 ${w}x${h}（原图 ${width}x${height}）`);
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    data.copy(out, y * w * 4, ((y + minY) * width + minX) * 4, ((y + minY) * width + minX + w) * 4);
  }
  return { buf: out, width: w, height: h };
}

// 单个图标：底色 / 圆角 / 圆形 / 角色占比
async function makeIcon(size, ratio, opts = {}) {
  const { buf, width, height } = await trimmedRGBA();
  const long = Math.max(width, height);
  const target = Math.round(size * ratio);
  const scale = target / long;
  const rw = Math.max(1, Math.round(width * scale));
  const rh = Math.max(1, Math.round(height * scale));
  const charBuf = await sharp(buf, { raw: { width, height, channels: 4 } })
    .resize(rw, rh, { fit: 'fill', kernel: 'lanczos3' })
    .png()
    .toBuffer();
  const layer = { input: charBuf, left: Math.round((size - rw) / 2), top: Math.round((size - rh) / 2) };
  if (opts.circle) {
    const disc = Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${BG_HEX}"/></svg>`);
    const maskSvg = Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`);
    const flat = await sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: disc, left: 0, top: 0 }, layer])
      .png()
      .toBuffer();
    return sharp(flat).ensureAlpha()
      .composite([{ input: maskSvg, left: 0, top: 0, blend: 'dest-in' }])
      .png()
      .toBuffer();
  }
  if (opts.transparent) return sharp(charBuf).png().toBuffer();
  const base = sharp({ create: { width: size, height: size, channels: 4, background: BG } });
  return base.composite([layer]).png().toBuffer();
}

async function splash(w, h, ratio = 0.46) {
  const { buf, width, height } = await trimmedRGBA();
  const long = Math.max(width, height);
  const target = Math.round(Math.min(w, h) * ratio);
  const scale = target / long;
  const rw = Math.max(1, Math.round(width * scale));
  const rh = Math.max(1, Math.round(height * scale));
  const charBuf = await sharp(buf, { raw: { width, height, channels: 4 } })
    .resize(rw, rh, { fit: 'fill', kernel: 'lanczos3' })
    .png()
    .toBuffer();
  return sharp({ create: { width: w, height: h, channels: 4, background: BG } })
    .composite([{ input: charBuf, left: Math.round((w - rw) / 2), top: Math.round((h - rh) / 2) }])
    .png()
    .toBuffer();
}

function pngSize(f) {
  const b = fs.readFileSync(f);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? walk(p) : [p];
  });
}

(async () => {
  // 1. App 内吉祥物（透明底）
  const { buf, width, height } = await trimmedRGBA();
  const mascotW = 520;
  const mascotH = Math.round((height / width) * mascotW);
  await sharp(buf, { raw: { width, height, channels: 4 } })
    .resize(mascotW, mascotH, { kernel: 'lanczos3' })
    .png()
    .toFile(path.join(ICONS_DIR, 'mascot.png'));
  console.log(`mascot.png ${mascotW}x${mascotH}`);

  // 2. PWA 图标
  fs.writeFileSync(path.join(ICONS_DIR, 'icon-192.png'), await makeIcon(192, 0.86));
  fs.writeFileSync(path.join(ICONS_DIR, 'icon-512.png'), await makeIcon(512, 0.86));
  console.log('PWA 图标完成');

  // 3. 安卓 launcher / round / foreground
  const launcherSizes = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
  const foregroundSizes = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
  for (const [dpi, size] of Object.entries(launcherSizes)) {
    fs.writeFileSync(path.join(RES, `mipmap-${dpi}`, 'ic_launcher.png'), await makeIcon(size, 0.9));
    fs.writeFileSync(path.join(RES, `mipmap-${dpi}`, 'ic_launcher_round.png'), await makeIcon(size, 0.72, { circle: true }));
  }
  for (const [dpi, size] of Object.entries(foregroundSizes)) {
    // 自适应图标前景：安全区约 66%，透明底
    fs.writeFileSync(path.join(RES, `mipmap-${dpi}`, 'ic_launcher_foreground.png'), await makeIcon(size, 0.62, { transparent: true }));
  }
  console.log('安卓图标完成');

  // 4. 启动屏
  for (const f of walk(RES).filter((x) => x.endsWith('splash.png'))) {
    const [w, h] = pngSize(f);
    fs.writeFileSync(f, await splash(w, h));
  }
  console.log('启动屏完成');

  // 5. 自适应图标底色
  const bgXml = path.join(RES, 'values', 'ic_launcher_background.xml');
  if (fs.existsSync(bgXml)) {
    fs.writeFileSync(bgXml, `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${BG_HEX}</color>
</resources>
`);
    console.log('ic_launcher_background →', BG_HEX);
  }
  console.log('全部完成');
})();
