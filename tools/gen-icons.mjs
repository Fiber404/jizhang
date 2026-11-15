/* 阿柴记账 —— 生成应用图标 PNG（纯 Node，无第三方依赖） */
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------- CRC32 ----------
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
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- 绘图上下文（设计坐标 0..128，超采样抗锯齿） ----------
function makeCanvas(size, ss) {
  const W = size * ss;
  return { W, H: W, ss, data: Buffer.alloc(W * W * 4) };
}

function blend(ctx, x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= ctx.W || y >= ctx.W) return;
  const i = (y * ctx.W + x) * 4;
  const sa = a / 255;
  const da = ctx.data[i + 3] / 255;
  const outA = sa + da * (1 - sa);
  if (outA <= 0) { ctx.data[i] = ctx.data[i + 1] = ctx.data[i + 2] = ctx.data[i + 3] = 0; return; }
  ctx.data[i]     = Math.round((r * sa + ctx.data[i] * da * (1 - sa)) / outA);
  ctx.data[i + 1] = Math.round((g * sa + ctx.data[i + 1] * da * (1 - sa)) / outA);
  ctx.data[i + 2] = Math.round((b * sa + ctx.data[i + 2] * da * (1 - sa)) / outA);
  ctx.data[i + 3] = Math.round(outA * 255);
}

function fillCircle(ctx, cx, cy, r, col) {
  const s = ctx.W / 128;
  const x0 = Math.max(0, Math.floor((cx - r) * s)), x1 = Math.min(ctx.W - 1, Math.ceil((cx + r) * s));
  const y0 = Math.max(0, Math.floor((cy - r) * s)), y1 = Math.min(ctx.W - 1, Math.ceil((cy + r) * s));
  const r2 = r * r;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = (x + 0.5) / s - cx, dy = (y + 0.5) / s - cy;
    if (dx * dx + dy * dy <= r2) blend(ctx, x, y, col[0], col[1], col[2], col[3]);
  }
}

function fillEllipse(ctx, cx, cy, rx, ry, col) {
  const s = ctx.W / 128;
  const x0 = Math.max(0, Math.floor((cx - rx) * s)), x1 = Math.min(ctx.W - 1, Math.ceil((cx + rx) * s));
  const y0 = Math.max(0, Math.floor((cy - ry) * s)), y1 = Math.min(ctx.W - 1, Math.ceil((cy + ry) * s));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = ((x + 0.5) / s - cx) / rx, dy = ((y + 0.5) / s - cy) / ry;
    if (dx * dx + dy * dy <= 1) blend(ctx, x, y, col[0], col[1], col[2], col[3]);
  }
}

function fillTriangle(ctx, p1, p2, p3, col) {
  const s = ctx.W / 128;
  const xs = [p1[0], p2[0], p3[0]], ys = [p1[1], p2[1], p3[1]];
  const x0 = Math.max(0, Math.floor(Math.min(...xs) * s)), x1 = Math.min(ctx.W - 1, Math.ceil(Math.max(...xs) * s));
  const y0 = Math.max(0, Math.floor(Math.min(...ys) * s)), y1 = Math.min(ctx.W - 1, Math.ceil(Math.max(...ys) * s));
  const sign = (px, py, a, b) => (px - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (py - b[1]);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const gx = (x + 0.5) / s, gy = (y + 0.5) / s;
    const d1 = sign(gx, gy, p1, p2), d2 = sign(gx, gy, p2, p3), d3 = sign(gx, gy, p3, p1);
    const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
    const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
    if (!(hasNeg && hasPos)) blend(ctx, x, y, col[0], col[1], col[2], col[3]);
  }
}

function fillRoundedRect(ctx, x0, y0, x1, y1, rr, col) {
  const s = ctx.W / 128;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, w = x1 - x0, h = y1 - y0;
  const px0 = Math.max(0, Math.floor(x0 * s)), px1 = Math.min(ctx.W - 1, Math.ceil(x1 * s));
  const py0 = Math.max(0, Math.floor(y0 * s)), py1 = Math.min(ctx.W - 1, Math.ceil(y1 * s));
  for (let y = py0; y <= py1; y++) for (let x = px0; x <= px1; x++) {
    const gx = (x + 0.5) / s, gy = (y + 0.5) / s;
    const qx = Math.abs(gx - cx) - (w / 2 - rr);
    const qy = Math.abs(gy - cy) - (h / 2 - rr);
    const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
    const dist = Math.min(Math.max(qx, qy), 0) + Math.hypot(ox, oy) - rr;
    if (dist <= 0) blend(ctx, x, y, col[0], col[1], col[2], col[3]);
  }
}

function strokeLine(ctx, x0, y0, x1, y1, thickness, col) {
  const s = ctx.W / 128;
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * s);
  const r = thickness / 2;
  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 0 : i / steps;
    fillCircle(ctx, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r, col);
  }
}

function drawIcon(ctx) {
  const BG = [42, 59, 107, 255];
  const HAIR = [36, 50, 90, 255];
  const HAIR_L = [58, 91, 168, 255];
  const SKIN = [255, 232, 214, 255];
  const EYE = [59, 130, 246, 255];
  const EYE_D = [30, 58, 138, 255];
  const WHITE = [255, 255, 255, 255];
  const BLUSH = [255, 182, 193, 210];
  const BOW = [82, 185, 232, 255];
  const MOUTH = [150, 96, 72, 255];

  fillRoundedRect(ctx, 0, 0, 128, 128, 28, BG);
  // 两侧长发
  fillEllipse(ctx, 35, 62, 13, 24, HAIR);
  fillEllipse(ctx, 93, 62, 13, 24, HAIR);
  // 脸后长发
  fillEllipse(ctx, 64, 87, 22, 18, HAIR);
  // 鳍耳
  fillEllipse(ctx, 23, 56, 7.5, 12, HAIR_L);
  fillEllipse(ctx, 105, 56, 7.5, 12, HAIR_L);
  // 脸
  fillEllipse(ctx, 64, 61, 22, 24, SKIN);
  // 刘海
  fillEllipse(ctx, 53, 49, 12, 9, HAIR);
  fillEllipse(ctx, 64, 47, 12, 9, HAIR);
  fillEllipse(ctx, 75, 49, 12, 9, HAIR);
  // 呆毛
  strokeLine(ctx, 64, 42, 76, 36, 2.2, HAIR);
  // 白色发箍
  fillEllipse(ctx, 64, 45, 22, 4, WHITE);
  // 蝴蝶结
  fillCircle(ctx, 82, 45, 4.5, BOW);
  fillCircle(ctx, 75, 47, 4.5, BOW);
  fillCircle(ctx, 79, 45, 3, HAIR);
  // 眼睛
  fillEllipse(ctx, 56, 60, 5.3, 6.6, EYE);
  fillEllipse(ctx, 72, 60, 5.3, 6.6, EYE);
  fillEllipse(ctx, 56, 60, 2.6, 3.5, EYE_D);
  fillEllipse(ctx, 72, 60, 2.6, 3.5, EYE_D);
  fillCircle(ctx, 54.5, 58.5, 1.5, WHITE);
  fillCircle(ctx, 70.5, 58.5, 1.5, WHITE);
  // 腮红
  fillEllipse(ctx, 49, 65, 4.4, 2.6, BLUSH);
  fillEllipse(ctx, 79, 65, 4.4, 2.6, BLUSH);
  // 委屈嘴
  strokeLine(ctx, 64, 66, 61, 68.5, 1.4, MOUTH);
  strokeLine(ctx, 64, 66, 67, 68.5, 1.4, MOUTH);
}

function downsample(ctx) {
  const ss = ctx.ss;
  const w = ctx.W / ss;
  const out = Buffer.alloc(w * w * 4);
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let dy = 0; dy < ss; dy++) for (let dx = 0; dx < ss; dx++) {
      const i = ((y * ss + dy) * ctx.W + (x * ss + dx)) * 4;
      r += ctx.data[i]; g += ctx.data[i + 1]; b += ctx.data[i + 2]; a += ctx.data[i + 3];
    }
    const n = ss * ss, o = (y * w + x) * 4;
    out[o] = Math.round(r / n); out[o + 1] = Math.round(g / n); out[o + 2] = Math.round(b / n); out[o + 3] = Math.round(a / n);
  }
  return { w, h: w, data: out };
}

function generate(size, file) {
  const ctx = makeCanvas(size, 3);
  drawIcon(ctx);
  const { w, h, data } = downsample(ctx);
  fs.writeFileSync(file, encodePNG(w, h, data));
  console.log('✓', file, `(${w}x${h})`);
}

generate(192, path.join(__dirname, '..', 'icons', 'icon-192.png'));
generate(512, path.join(__dirname, '..', 'icons', 'icon-512.png'));
