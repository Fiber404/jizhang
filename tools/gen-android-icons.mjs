/* 鲸鱼查账 —— 生成 Android 应用图标 & 启动屏 PNG（纯 Node，无依赖）
   覆盖 android/app/src/main/res 下的 launcher/foreground/splash 图标 */
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RES = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');

// ---------- CRC32 / PNG 编码 ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
function encodePNG(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (stride + 1)] = 0; rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride); }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- 画布（超采样，绘图坐标为目标像素坐标，内部 × ss）----------
function makeCanvas(w, h, ss) {
  return { W: w * ss, H: h * ss, ss, data: Buffer.alloc(w * ss * h * ss * 4) };
}
function blend(ctx, x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= ctx.W || y >= ctx.H) return;
  const i = (y * ctx.W + x) * 4;
  const sa = a / 255, da = ctx.data[i + 3] / 255;
  const outA = sa + da * (1 - sa);
  if (outA <= 0) { ctx.data[i] = ctx.data[i + 1] = ctx.data[i + 2] = ctx.data[i + 3] = 0; return; }
  ctx.data[i]     = Math.round((r * sa + ctx.data[i] * da * (1 - sa)) / outA);
  ctx.data[i + 1] = Math.round((g * sa + ctx.data[i + 1] * da * (1 - sa)) / outA);
  ctx.data[i + 2] = Math.round((b * sa + ctx.data[i + 2] * da * (1 - sa)) / outA);
  ctx.data[i + 3] = Math.round(outA * 255);
}
function fillCircle(ctx, cx, cy, r, col) {
  cx *= ctx.ss; cy *= ctx.ss; r *= ctx.ss;
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(ctx.W - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(ctx.H - 1, Math.ceil(cy + r));
  const r2 = r * r;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    if (dx * dx + dy * dy <= r2) blend(ctx, x, y, col[0], col[1], col[2], col[3]);
  }
}
function fillEllipse(ctx, cx, cy, rx, ry, col) {
  cx *= ctx.ss; cy *= ctx.ss; rx *= ctx.ss; ry *= ctx.ss;
  const x0 = Math.max(0, Math.floor(cx - rx)), x1 = Math.min(ctx.W - 1, Math.ceil(cx + rx));
  const y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(ctx.H - 1, Math.ceil(cy + ry));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
    if (dx * dx + dy * dy <= 1) blend(ctx, x, y, col[0], col[1], col[2], col[3]);
  }
}
function fillTriangle(ctx, p1, p2, p3, col) {
  const pts = [p1, p2, p3].map((p) => [p[0] * ctx.ss, p[1] * ctx.ss]);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.max(0, Math.floor(Math.min(...xs))), x1 = Math.min(ctx.W - 1, Math.ceil(Math.max(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(ctx.H - 1, Math.ceil(Math.max(...ys)));
  const sign = (px, py, a, b) => (px - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (py - b[1]);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const d1 = sign(x + 0.5, y + 0.5, pts[0], pts[1]), d2 = sign(x + 0.5, y + 0.5, pts[1], pts[2]), d3 = sign(x + 0.5, y + 0.5, pts[2], pts[0]);
    const hasNeg = d1 < 0 || d2 < 0 || d3 < 0, hasPos = d1 > 0 || d2 > 0 || d3 > 0;
    if (!(hasNeg && hasPos)) blend(ctx, x, y, col[0], col[1], col[2], col[3]);
  }
}
function fillRoundedRect(ctx, x0, y0, x1, y1, rr, col) {
  x0 *= ctx.ss; y0 *= ctx.ss; x1 *= ctx.ss; y1 *= ctx.ss; rr *= ctx.ss;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, w = x1 - x0, h = y1 - y0;
  const px0 = Math.max(0, Math.floor(x0)), px1 = Math.min(ctx.W - 1, Math.ceil(x1));
  const py0 = Math.max(0, Math.floor(y0)), py1 = Math.min(ctx.H - 1, Math.ceil(y1));
  for (let y = py0; y <= py1; y++) for (let x = px0; x <= px1; x++) {
    const gx = x + 0.5, gy = y + 0.5;
    const qx = Math.abs(gx - cx) - (w / 2 - rr), qy = Math.abs(gy - cy) - (h / 2 - rr);
    const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
    if (Math.min(Math.max(qx, qy), 0) + Math.hypot(ox, oy) - rr <= 0) blend(ctx, x, y, col[0], col[1], col[2], col[3]);
  }
}
function strokeLine(ctx, x0, y0, x1, y1, thickness, col) {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * ctx.ss);
  const r = thickness / 2;
  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 0 : i / steps;
    fillCircle(ctx, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r, col);
  }
}

// ---------- 调色板（鲸鱼娘）----------
const BG = [42, 59, 107, 255];      // 深海蓝 #2A3B6B
const HAIR = [36, 50, 90, 255];     // 发色深蓝
const HAIR_L = [58, 91, 168, 255];  // 鳍耳浅蓝
const SKIN = [255, 232, 214, 255];  // 肤色
const EYE = [59, 130, 246, 255];    // 宝石蓝
const EYE_D = [30, 58, 138, 255];   // 深瞳孔
const WHITE = [255, 255, 255, 255];
const BLUSH = [255, 182, 193, 210]; // 樱花粉
const BOW = [82, 185, 232, 255];    // 浅蓝蝴蝶结
const MOUTH = [150, 96, 72, 255];   // 嘴色

// ---------- 鲸鱼娘头像（脸中心 cx,cy，脸宽基准 R，目标像素坐标）----------
function drawWhaleGirl(ctx, cx, cy, R) {
  // 两侧垂下的长发
  fillEllipse(ctx, cx - R * 1.32, cy + R * 0.10, R * 0.60, R * 1.10, HAIR);
  fillEllipse(ctx, cx + R * 1.32, cy + R * 0.10, R * 0.60, R * 1.10, HAIR);
  // 脸后长发
  fillEllipse(ctx, cx, cy + R * 1.22, R * 1.02, R * 0.82, HAIR);
  // 鲸鱼鳍耳
  fillEllipse(ctx, cx - R * 1.42, cy - R * 0.12, R * 0.34, R * 0.54, HAIR_L);
  fillEllipse(ctx, cx + R * 1.42, cy - R * 0.12, R * 0.34, R * 0.54, HAIR_L);
  // 脸
  fillEllipse(ctx, cx, cy + R * 0.06, R * 1.0, R * 1.10, SKIN);
  // 刘海（覆盖额头）
  fillEllipse(ctx, cx - R * 0.48, cy - R * 0.52, R * 0.54, R * 0.42, HAIR);
  fillEllipse(ctx, cx, cy - R * 0.60, R * 0.54, R * 0.40, HAIR);
  fillEllipse(ctx, cx + R * 0.48, cy - R * 0.52, R * 0.54, R * 0.42, HAIR);
  // 呆毛
  strokeLine(ctx, cx, cy - R * 0.92, cx + R * 0.28, cy - R * 1.32, R * 0.10, HAIR);
  // 白色发箍
  fillEllipse(ctx, cx, cy - R * 0.70, R * 1.0, R * 0.18, WHITE);
  // 浅蓝蝴蝶结（右侧）
  fillCircle(ctx, cx + R * 0.82, cy - R * 0.70, R * 0.20, BOW);
  fillCircle(ctx, cx + R * 0.52, cy - R * 0.60, R * 0.20, BOW);
  fillCircle(ctx, cx + R * 0.68, cy - R * 0.70, R * 0.13, HAIR);
  // 宝石蓝大眼
  fillEllipse(ctx, cx - R * 0.38, cy - R * 0.02, R * 0.24, R * 0.30, EYE);
  fillEllipse(ctx, cx + R * 0.38, cy - R * 0.02, R * 0.24, R * 0.30, EYE);
  fillEllipse(ctx, cx - R * 0.38, cy - R * 0.02, R * 0.12, R * 0.16, EYE_D);
  fillEllipse(ctx, cx + R * 0.38, cy - R * 0.02, R * 0.12, R * 0.16, EYE_D);
  fillCircle(ctx, cx - R * 0.44, cy - R * 0.08, R * 0.07, WHITE);
  fillCircle(ctx, cx + R * 0.32, cy - R * 0.08, R * 0.07, WHITE);
  // 腮红
  fillEllipse(ctx, cx - R * 0.66, cy + R * 0.20, R * 0.20, R * 0.12, BLUSH);
  fillEllipse(ctx, cx + R * 0.66, cy + R * 0.20, R * 0.20, R * 0.12, BLUSH);
  // 委屈嘴
  strokeLine(ctx, cx, cy + R * 0.28, cx - R * 0.12, cy + R * 0.38, R * 0.06, MOUTH);
  strokeLine(ctx, cx, cy + R * 0.28, cx + R * 0.12, cy + R * 0.38, R * 0.06, MOUTH);
}

function downsample(ctx) {
  const ss = ctx.ss, w = ctx.W / ss, h = ctx.H / ss;
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let dy = 0; dy < ss; dy++) for (let dx = 0; dx < ss; dx++) {
      const i = ((y * ss + dy) * ctx.W + (x * ss + dx)) * 4;
      r += ctx.data[i]; g += ctx.data[i + 1]; b += ctx.data[i + 2]; a += ctx.data[i + 3];
    }
    const n = ss * ss, o = (y * w + x) * 4;
    out[o] = Math.round(r / n); out[o + 1] = Math.round(g / n); out[o + 2] = Math.round(b / n); out[o + 3] = Math.round(a / n);
  }
  return { w, h, data: out };
}
function render(size, ss, draw) {
  const ctx = makeCanvas(size[0], size[1], ss);
  draw(ctx, size[0], size[1]);
  const { w, h, data } = downsample(ctx);
  return encodePNG(w, h, data);
}

// ---------- 各类绘制 ----------
function drawLauncher(ctx, s) {
  fillRoundedRect(ctx, 0, 0, s, s, s * 0.22, BG);
  drawWhaleGirl(ctx, s * 0.5, s * 0.47, s * 0.17);
}
function drawForeground(ctx, s) {
  drawWhaleGirl(ctx, s * 0.5, s * 0.48, s * 0.15);
}
function drawSplash(ctx, w, h) {
  fillRoundedRect(ctx, 0, 0, w, h, 0, BG);
  const R = Math.min(w, h) * 0.20;
  drawWhaleGirl(ctx, w / 2, h / 2 - R * 0.1, R);
}

// ---------- 执行 ----------
const launcherSizes = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const foregroundSizes = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };

for (const [dpi, size] of Object.entries(launcherSizes)) {
  const png = render([size, size], 3, drawLauncher);
  fs.writeFileSync(path.join(RES, `mipmap-${dpi}`, 'ic_launcher.png'), png);
  fs.writeFileSync(path.join(RES, `mipmap-${dpi}`, 'ic_launcher_round.png'), png);
  console.log('launcher', dpi, size);
}
for (const [dpi, size] of Object.entries(foregroundSizes)) {
  const png = render([size, size], 3, drawForeground);
  fs.writeFileSync(path.join(RES, `mipmap-${dpi}`, 'ic_launcher_foreground.png'), png);
  console.log('foreground', dpi, size);
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
const splashFiles = walk(RES).filter((f) => f.endsWith('splash.png'));
for (const f of splashFiles) {
  const [w, h] = pngSize(f);
  const png = render([w, h], 2, drawSplash);
  fs.writeFileSync(f, png);
  console.log('splash', path.relative(RES, f), w + 'x' + h);
}

console.log('完成：所有 Android 图标与启动屏已生成');
