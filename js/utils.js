/* 阿柴记账 —— 工具函数 */
'use strict';

const U = (function () {
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function currentMonth() {
    return today().slice(0, 7);
  }

  function monthLabel(ym) {
    // ym: 'YYYY-MM' -> '2026年3月'
    const [y, m] = ym.split('-');
    return `${y}年${parseInt(m, 10)}月`;
  }

  function addMonths(ym, delta) {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  }

  // 金额以「分」为整数存储，避免浮点误差
  function fmtMoney(cents) {
    const neg = cents < 0;
    let c = Math.abs(Math.round(cents));
    const yuan = Math.floor(c / 100);
    const fen = c % 100;
    const s = yuan.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + pad2(fen);
    return (neg ? '-' : '') + s;
  }

  function fmtSigned(cents, type) {
    // 支出 '-' 收入 '+'
    const sign = type === 'income' ? '+' : '-';
    return sign + '¥' + fmtMoney(cents);
  }

  // 键盘输入字符串 -> 分
  function strToCents(s) {
    if (!s) return 0;
    const parts = s.split('.');
    const int = parseInt(parts[0] || '0', 10);
    const frac = (parts[1] || '').padEnd(2, '0').slice(0, 2);
    return int * 100 + (parseInt(frac || '0', 10) || 0);
  }

  const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
  function weekdayCN(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return '周' + WEEK[d.getDay()];
  }

  function dayLabel(dateStr) {
    // '2026-03-12' -> '3月12日'
    const [, m, d] = dateStr.split('-');
    return `${parseInt(m, 10)}月${parseInt(d, 10)}日`;
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function lastNMonths(n, endYm) {
    const arr = [];
    for (let i = n - 1; i >= 0; i--) arr.push(addMonths(endYm, -i));
    return arr;
  }

  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return { today, currentMonth, monthLabel, addMonths, fmtMoney, fmtSigned, strToCents, weekdayCN, dayLabel, uid, lastNMonths, download };
})();
