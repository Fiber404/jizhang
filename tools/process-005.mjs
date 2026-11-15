/* 鲸鱼查账 —— 处理 005.png：白底→深海蓝 + 角色缩小留边距 */
import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SRC = path.join(__dirname, '..', 'temp', '005.png');
const PREVIEW = path.join(__dirname, '..', 'temp', '005-preview.png');
const BG = { r: 42, g: 59, b: 107, alpha: 1 };

function isWhite(data, i) {
  return data[i] > 235 && data[i + 1] > 235 && data[i + 2] > 235;
}
function floodFill(data, width, height) {
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height * 2);
  let head = 0, tail = 0;
  const push = (idx) => {
    if (visited[idx]) return;
    const i = idx * 4;
    if (!isWhite(data, i)) return;
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

async function makeIcon(size, innerRatio, outFile) {
  const { data, info } = await sharp(SRC).raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  floodFill(data, width, height);
  const inner = Math.round(size * innerRatio); // 角色内容区域
  const pad = Math.round((size - inner) / 2);
  await sharp(data, { raw: { width, height, channels: 4 } })
    .resize(inner, inner, { fit: 'contain', background: BG })
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: BG })
    .png()
    .toFile(outFile);
  console.log('generated', outFile, size + 'x' + size);
}

(async () => {
  await makeIcon(512, 0.84, PREVIEW);
})();
