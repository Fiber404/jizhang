// 把根目录的前端源码同步到 www/（Capacitor 的 webDir）
// 用法：node tools/sync-www.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const www = path.join(root, 'www');

// 根目录下的单文件
const FILES = ['index.html', 'manifest.json', 'sw.js'];
// 需要整目录镜像的文件夹
const DIRS = ['css', 'js', 'icons'];

function copyFile(rel) {
  const src = path.join(root, rel);
  const dst = path.join(www, rel);
  if (!fs.existsSync(src)) return 0;
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  return 1;
}

// 镜像目录：复制所有文件，并删除 www 里源码中已不存在的残留文件
function mirrorDir(relDir) {
  const srcDir = path.join(root, relDir);
  const dstDir = path.join(www, relDir);
  if (!fs.existsSync(srcDir)) return { copied: 0, removed: [] };

  const removed = [];
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const srcPath = path.join(dir, ent.name);
      const relPath = path.relative(root, srcPath);
      const dstPath = path.join(www, relPath);
      if (ent.isDirectory()) {
        walk(srcPath);
        continue;
      }
      copyFile(relPath);
    }
  };

  // 先清理 target 中多余文件
  const sweep = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const dstPath = path.join(dir, ent.name);
      const relPath = path.relative(www, dstPath);
      if (ent.isDirectory()) {
        sweep(dstPath);
        if (fs.readdirSync(dstPath).length === 0) fs.rmdirSync(dstPath);
        continue;
      }
      if (!fs.existsSync(path.join(root, relPath))) {
        fs.rmSync(dstPath);
        removed.push(relPath);
      }
    }
  };

  sweep(dstDir);
  walk(srcDir);
  return { removed };
}

fs.mkdirSync(www, { recursive: true });

let copied = 0;
for (const f of FILES) copied += copyFile(f);
const removed = [];
for (const d of DIRS) {
  const r = mirrorDir(d);
  removed.push(...r.removed);
}

console.log(`已同步到 www/：${FILES.join(', ')} + ${DIRS.join('/ ')}`);
if (removed.length) console.log(`已删除 www/ 中的残留文件：${removed.join(', ')}`);
