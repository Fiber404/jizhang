/* 金币记账本 —— SVG 图表 & 鲸鱼娘吉祥物 */
'use strict';

const Charts = (function () {
  // 环形图：items = [{value, color}]，total 为总和
  function donut(items, total, size) {
    size = size || 190;
    const stroke = Math.round(size * 0.13);
    const r = (size - stroke) / 2;
    const c = size / 2;
    const circ = 2 * Math.PI * r;

    let parts = `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#EAEEF7" stroke-width="${stroke}"/>`;

    let offset = 0;
    (items || []).forEach((it) => {
      const frac = total > 0 ? it.value / total : 0;
      if (frac <= 0) return;
      const dash = Math.max(frac * circ - 1.6, 1);
      parts += `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${it.color}" stroke-width="${stroke}"
        stroke-dasharray="${dash} ${circ - dash}" stroke-dashoffset="${-offset}"
        transform="rotate(-90 ${c} ${c})" stroke-linecap="butt"/>`;
      offset += frac * circ;
    });

    return `<svg viewBox="0 0 ${size} ${size}" width="100%" height="100%">${parts}</svg>`;
  }

  // 折线图：data = [{label, date, exp, inc}]；mode: 'net' | 'income' | 'expense'
  function lineChart(data, opts) {
    opts = opts || {};
    const w = opts.w || 320, h = opts.h || 180;
    const padL = 10, padR = 10, padT = 18, padB = 26;
    const iw = w - padL - padR, ih = h - padT - padB;
    const n = data.length;
    const mode = opts.mode || 'net';

    const val = (d) => (mode === 'net' ? d.inc - d.exp : d[mode]);
    const color = mode === 'income' ? '#22A06B' : (mode === 'expense' ? '#2A3B6B' : '#52B9E8');

    let min = 0, max = 0;
    data.forEach((d) => {
      const v = val(d);
      if (v < min) min = v;
      if (v > max) max = v;
    });
    if (max === min) { max = min + 1; }
    const range = max - min;
    const yMin = min - range * 0.12;
    const yMax = max + range * 0.12;
    const span = (yMax - yMin) || 1;

    const x = (i) => (n <= 1 ? padL + iw / 2 : padL + (iw * i) / (n - 1));
    const y = (v) => padT + ih - ((ih * (v - yMin)) / span);

    let svg = `<svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" preserveAspectRatio="none">`;
    for (let g = 0; g <= 3; g++) {
      const gy = (padT + (ih * g) / 3).toFixed(1);
      svg += `<line x1="${padL}" y1="${gy}" x2="${w - padR}" y2="${gy}" stroke="#EAEEF7" stroke-width="1"/>`;
    }
    // 零线（净收支为负时显示）
    if (yMin < 0) {
      svg += `<line x1="${padL}" y1="${y(0).toFixed(1)}" x2="${w - padR}" y2="${y(0).toFixed(1)}" stroke="#C6CEE4" stroke-width="1" stroke-dasharray="3 3"/>`;
    }
    // 折线
    const path = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(val(d)).toFixed(1)}`).join(' ');
    svg += `<path d="${path}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`;
    // 数据点
    data.forEach((d, i) => {
      svg += `<circle cx="${x(i).toFixed(1)}" cy="${y(val(d)).toFixed(1)}" r="2.6" fill="${color}"/>`;
    });
    // X 轴标签
    const step = Math.max(1, Math.ceil(n / 8));
    data.forEach((d, i) => {
      if (i % step === 0 || i === n - 1) {
        svg += `<text x="${x(i).toFixed(1)}" y="${h - 6}" font-size="10" fill="#7A86A8" text-anchor="middle">${d.label}</text>`;
      }
    });
    svg += '</svg>';
    return svg;
  }

  // 高亮点在折线图中的横向百分比（用于定位提示框）
  function lineHighlightPct(data, hi) {
    const n = data.length;
    if (hi == null || n === 0) return 50;
    const w = 320, padL = 10, iw = 300;
    const x = n <= 1 ? padL + iw / 2 : padL + (iw * hi) / (n - 1);
    return (x / w) * 100;
  }

  // 吉祥物：小账本（temp/007.jpg 抠图）
  function mascot() {
    return `<img src="icons/mascot.png" alt="小账本" style="width:100%;height:100%;object-fit:contain;display:block">`;
  }

  return { donut, lineChart, lineHighlightPct, mascot };
})();
