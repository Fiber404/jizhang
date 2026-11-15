/* 鲸鱼查账 —— 从 005.png 生成全部图标（白底→深海蓝 + 角色主题） */
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SRC = path.join(__dirname, '..', 'temp', '005.png');
const ICONS_DIR = path.join(__dirname, '..', 'icons');
const RES = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');
const BG = { r: 42, g: 59, b: 107, alpha: 1 };

function isBackground(data, i) {
  const r = data[i], g = data[i + 1], b = data[i + 2];
  return (r > 230 && g > 230 && b > 230) || (r < 60 && g < 60 && b < 60);
}
function floodFill(data, width, height) {
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height * 2);
  let head = 0, tail = 0;
  const push = (idx) => {
    if (visited[idx]) return;
    const i = idx * 4;
    if (!isBackground(data, i)) return;
    visited[idx] = 1;
    queue[tail++] = idx;
  };
  for (let x = 0; x < width; x++) { push(x); push((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { push(y * width); push(y * width + width - 1); }
  while (head < tail) {
    const idx = queue[head++];
    const i = idx * 4;
    data[i] = BG.r; data[i + 1] = BG.g; data[i + 2] = BG.b; data[i + 3] = 255;
    const x = idx % width, y = (idx / width) | 0;
    if (x > 0) push(idx - 1);
    if (x < width - 1) push(idx + 1);
    if (y > 0) push(idx - width);
    if (y < height - 1) push(idx + width);
  }
}

async function processedRaw() {
  const { data, info } = await sharp(SRC).raw().toBuffer({ resolveWithObject: true });
  floodFill(data, info.width, info.height);
  return { data, width: info.width, height: info.height };
}

// 正方形图标：角色 cover 填满 inner，四周留 2% 深蓝边距
async function iconSquare(size) {
  const { data, width, height } = await processedRaw();
  const inner = Math.round(size * 0.96);
  const pad = Math.round((size - inner) / 2);
  return sharp(data, { raw: { width, height, channels: 4 } })
    .resize(inner, inner, { fit: 'cover' })
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: BG })
    .png()
    .toBuffer();
}

// 启动屏：深蓝底 + 角色 contain 居中（占高度 55%）
async function splash(w, h) {
  const { data, width, height } = await processedRaw();
  const target = Math.round(Math.min(w, h) * 0.55);
  return sharp(data, { raw: { width, height, channels: 4 } })
    .resize(target, target, { fit: 'contain', background: BG })
    .extend({
      top: Math.round((h - target) / 2), bottom: Math.round((h - target) / 2),
      left: Math.round((w - target) / 2), right: Math.round((w - target) / 2),
      background: BG
    })
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
  // PWA 图标
  fs.writeFileSync(path.join(ICONS_DIR, 'icon-192.png'), await iconSquare(192));
  fs.writeFileSync(path.join(ICONS_DIR, 'icon-512.png'), await iconSquare(512));
  console.log('PWA icons done');

  // 安卓 launcher / round / foreground
  const launcherSizes = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
  const foregroundSizes = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
  for (const [dpi, size] of Object.entries(launcherSizes)) {
    const png = await iconSquare(size);
    fs.writeFileSync(path.join(RES, `mipmap-${dpi}`, 'ic_launcher.png'), png);
    fs.writeFileSync(path.join(RES, `mipmap-${dpi}`, 'ic_launcher_round.png'), png);
  }
  for (const [dpi, size] of Object.entries(foregroundSizes)) {
    fs.writeFileSync(path.join(RES, `mipmap-${dpi}`, 'ic_launcher_foreground.png'), await iconSquare(size));
  }
  console.log('Android launcher/foreground done');

  // 启动屏
  const splashFiles = walk(RES).filter((f) => f.endsWith('splash.png'));
  for (const f of splashFiles) {
    const [w, h] = pngSize(f);
    fs.writeFileSync(f, await splash(w, h));
  }
  console.log('Android splash done');
  console.log('全部图标生成完成');
})();
