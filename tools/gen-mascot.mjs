/* 鲸鱼查账 —— 从 005.png 生成透明底鲸鱼娘（连通域：只保留角色主体，去掉问号/黑边/符号） */
import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SRC = path.join(__dirname, '..', 'temp', '005.png');
const OUT = path.join(__dirname, '..', 'icons', 'mascot.png');

function isWhite(data, i) {
  return data[i] > 230 && data[i + 1] > 230 && data[i + 2] > 230;
}
function isDark(data, i) {
  return data[i] < 80 && data[i + 1] < 80 && data[i + 2] < 80;
}
// 从边缘 flood fill 指定颜色 → 透明
function floodFill(data, width, height, test) {
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height * 2);
  let head = 0, tail = 0;
  const push = (idx) => {
    if (visited[idx]) return;
    if (!test(data, idx * 4)) return;
    visited[idx] = 1;
    queue[tail++] = idx;
  };
  for (let x = 0; x < width; x++) { push(x); push((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { push(y * width); push(y * width + width - 1); }
  while (head < tail) {
    const idx = queue[head++];
    const i = idx * 4;
    data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 0;
    const x = idx % width, y = (idx / width) | 0;
    if (x > 0) push(idx - 1);
    if (x < width - 1) push(idx + 1);
    if (y > 0) push(idx - width);
    if (y < height - 1) push(idx + width);
  }
}
// 连通域分析：只保留最大连通块（角色主体），其余（问号/黑边/汗滴/符号）→ 透明
function keepLargestComponent(data, width, height) {
  const visited = new Uint8Array(width * height);
  const compId = new Int32Array(width * height);
  let compCount = 0, maxComp = 0, maxSize = 0;
  const opaque = (i) => data[i * 4 + 3] > 0;
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
        if (dx === 0 && dy === 0) continue;
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
  for (let i = 0; i < width * height; i++) {
    if (compId[i] !== 0 && compId[i] !== maxComp) {
      const pi = i * 4;
      data[pi] = 0; data[pi + 1] = 0; data[pi + 2] = 0; data[pi + 3] = 0;
    }
  }
  console.log('components:', compCount, 'kept largest:', maxSize);
}

// ---------- 呆毛绘制 ----------
function fillCircle(data, width, height, cx, cy, r, col) {
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(width - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(height - 1, Math.ceil(cy + r));
  const r2 = r * r;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    if (dx * dx + dy * dy <= r2) {
      const i = (y * width + x) * 4;
      data[i] = col[0]; data[i + 1] = col[1]; data[i + 2] = col[2]; data[i + 3] = col[3];
    }
  }
}
function strokeLine(data, width, height, x0, y0, x1, y1, thickness, col) {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
  const r = thickness / 2;
  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 0 : i / steps;
    fillCircle(data, width, height, Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), r, col);
  }
}
// 在角色头顶加一根逗号形呆毛（参照 006 参考图：正中央、先右上再向左上回勾、根部粗末端细）
function drawAhoge(data, width, height) {
  const HAIR = [36, 50, 90, 255];
  // 找角色顶部（最小 y 的非透明像素行）
  let topY = -1, minX = width, maxX = -1;
  for (let y = 0; y < height && topY < 0; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 0) {
        topY = y;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
  }
  if (topY < 0) return;
  // 呆毛发根：头顶正中央（发箍顶部弧线中央）
  const cx = (minX + maxX) / 2;
  const cy = topY;
  // 三次贝塞尔：先向右上延伸，末端向左上回勾（逗号/钩子形）
  const P0 = [cx, cy];
  const P1 = [cx + 24, cy - 24];
  const P2 = [cx + 14, cy - 48];
  const P3 = [cx - 4, cy - 38];
  // 采样 + 粗细渐变（根部粗 → 末端收尖）
  const steps = 70;
  const r0 = 4.6, r1 = 1.0;
  let px = P0[0], py = P0[1];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    const qx = u * u * u * P0[0] + 3 * u * u * t * P1[0] + 3 * u * t * t * P2[0] + t * t * t * P3[0];
    const qy = u * u * u * P0[1] + 3 * u * u * t * P1[1] + 3 * u * t * t * P2[1] + t * t * t * P3[1];
    const r = r0 + (r1 - r0) * t;
    strokeLine(data, width, height, px, py, qx, qy, r * 2, HAIR);
    px = qx; py = qy;
  }
}

(async () => {
  const { data, info } = await sharp(SRC).raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  floodFill(data, width, height, isWhite);
  floodFill(data, width, height, isDark);
  keepLargestComponent(data, width, height);
  drawAhoge(data, width, height);
  await sharp(data, { raw: { width, height, channels: 4 } })
    .resize({ width: 400 })
    .png()
    .toFile(OUT);
  console.log('mascot:', OUT);
})();
