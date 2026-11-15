/* 金币记账本 —— 数据层：分类 + 本地持久化 */
'use strict';

// 预设图标库（供自定义分类选择）
const PRESET_ICONS = [
  '🍜', '🍚', '🍔', '🍕', '🍣', '🍰', '☕', '🧋', '🍺', '🥤',
  '🍎', '🥦', '🥩', '🐟', '🦐', '🍞', '🥐', '🍇',
  '🚌', '🚕', '🚗', '🚇', '✈️', '🚲', '🛵', '🚄',
  '🛍️', '👕', '👟', '💄', '🎁', '👜',
  '🏠', '🔌', '💡', '🚿', '🧻', '🛏️',
  '💊', '🏥', '💉', '🦷',
  '📚', '🎓', '✏️', '🎹',
  '📱', '💻', '🎮', '🎵', '🎬', '🎤', '📷',
  '🐕', '🐈', '🐰', '🐹',
  '🏋️', '⚽', '🏀', '🎾', '🏊',
  '💰', '💵', '💳', '📈', '🏦', '🧧', '💎', '🪙',
  '💼', '🛠️', '📦', '🌟', '❤️', '🌱', '🎉', '🍼'
];

// 预设颜色
const PRESET_COLORS = [
  '#4D6BFE', '#29B6F6', '#26A69A', '#43A047', '#66BB6A',
  '#FFB300', '#F4511E', '#EF5350', '#EC407A', '#9C6ADE',
  '#5C6BC0', '#8D6E63', '#78909C', '#00ACC1'
];

const DEFAULT_CATEGORIES = {
  expense: [
    { id: 'food', name: '餐饮', icon: '🍜', color: '#4D6BFE' },
    { id: 'coffee', name: '咖啡', icon: '☕', color: '#8D6E63' },
    { id: 'fruit', name: '水果', icon: '🍎', color: '#EF5350' },
    { id: 'transport', name: '交通', icon: '🚌', color: '#29B6F6' },
    { id: 'shopping', name: '购物', icon: '🛍️', color: '#EC407A' },
    { id: 'clothes', name: '服饰', icon: '👕', color: '#F06292' },
    { id: 'entertain', name: '娱乐', icon: '🎮', color: '#9C6ADE' },
    { id: 'housing', name: '居住', icon: '🏠', color: '#26A69A' },
    { id: 'utility', name: '水电', icon: '💡', color: '#FFB300' },
    { id: 'medical', name: '医疗', icon: '💊', color: '#EF5350' },
    { id: 'education', name: '教育', icon: '📚', color: '#5C6BC0' },
    { id: 'comm', name: '通讯', icon: '📱', color: '#4D6BFE' },
    { id: 'daily', name: '日用', icon: '🧴', color: '#8D6E63' },
    { id: 'pet', name: '宠物', icon: '🐕', color: '#FFA726' },
    { id: 'travel', name: '旅行', icon: '✈️', color: '#42A5F5' },
    { id: 'fitness', name: '健身', icon: '🏋️', color: '#66BB6A' },
    { id: 'gift', name: '人情', icon: '🧧', color: '#F4511E' },
    { id: 'other_e', name: '其他', icon: '📦', color: '#78909C' }
  ],
  income: [
    { id: 'salary', name: '工资', icon: '💰', color: '#43A047' },
    { id: 'bonus', name: '奖金', icon: '💎', color: '#F4511E' },
    { id: 'invest', name: '理财', icon: '📈', color: '#00897B' },
    { id: 'parttime', name: '兼职', icon: '💼', color: '#3949AB' },
    { id: 'redpacket', name: '红包', icon: '🧧', color: '#D81B60' },
    { id: 'rent', name: '房租', icon: '🏠', color: '#26A69A' },
    { id: 'interest', name: '利息', icon: '🏦', color: '#00ACC1' },
    { id: 'other_i', name: '其他', icon: '💵', color: '#78909C' }
  ]
};

const Store = (function () {
  const KEY = 'jingyu-chazhang-v1';

  const emptyData = () => ({
    records: [],
    settings: { budget: 0, customCategories: [], categoryOrder: { expense: [], income: [] } }
  });

  let data = emptyData();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      data = raw ? JSON.parse(raw) : emptyData();
    } catch (e) {
      data = emptyData();
    }
    data.records = data.records || [];
    data.settings = Object.assign({ budget: 0, customCategories: [], categoryOrder: {} }, data.settings || {});
    data.settings.categoryOrder = Object.assign({ expense: [], income: [] }, data.settings.categoryOrder || {});
    return data;
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { console.error('保存失败', e); }
  }

  function getRecords() { return data.records; }

  function recordsInMonth(ym) {
    return data.records
      .filter((r) => r.date.slice(0, 7) === ym)
      .sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : (a.date < b.date ? 1 : -1)));
  }

  function recordsOnDate(dateStr) {
    return data.records
      .filter((r) => r.date === dateStr)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  function summary(ym) {
    let expense = 0, income = 0;
    data.records.forEach((r) => {
      if (r.date.slice(0, 7) !== ym) return;
      if (r.type === 'expense') expense += r.amount;
      else income += r.amount;
    });
    return { expense, income, balance: income - expense };
  }

  function dailyTotal(dateStr) {
    let expense = 0, income = 0;
    data.records.forEach((r) => {
      if (r.date !== dateStr) return;
      if (r.type === 'expense') expense += r.amount;
      else income += r.amount;
    });
    return { expense, income };
  }

  // 每日收支汇总（用于日历 / 折线图）
  function dailyTotalsInMonth(ym) {
    const map = {};
    data.records.forEach((r) => {
      if (r.date.slice(0, 7) !== ym) return;
      const d = map[r.date] || (map[r.date] = { expense: 0, income: 0 });
      if (r.type === 'expense') d.expense += r.amount;
      else d.income += r.amount;
    });
    return map;
  }

  // ---------- 分类 ----------
  function getCategories(type) {
    const base = (DEFAULT_CATEGORIES[type] || []).slice();
    const custom = data.settings.customCategories.filter((c) => c.type === type);
    const all = base.concat(custom);
    const order = data.settings.categoryOrder[type] || [];
    if (!order.length) return all;
    const byId = {};
    all.forEach((c) => { byId[c.id] = c; });
    const sorted = [];
    order.forEach((id) => { if (byId[id]) sorted.push(byId[id]); });
    all.forEach((c) => { if (sorted.indexOf(c) === -1) sorted.push(c); });
    return sorted;
  }

  function findCategory(id) {
    for (const t of ['expense', 'income']) {
      const hit = getCategories(t).find((c) => c.id === id);
      if (hit) return hit;
    }
    return null;
  }

  function isCustomCategory(id) {
    return data.settings.customCategories.some((c) => c.id === id);
  }

  function addCustomCategory(type, name, icon, color) {
    const id = 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    data.settings.customCategories.push({ id, type, name, icon, color });
    data.settings.categoryOrder[type].push(id);
    save();
    return id;
  }

  function deleteCustomCategory(id) {
    data.settings.customCategories = data.settings.customCategories.filter((c) => c.id !== id);
    for (const t of ['expense', 'income']) {
      data.settings.categoryOrder[t] = (data.settings.categoryOrder[t] || []).filter((x) => x !== id);
    }
    save();
  }

  // 移动分类顺序（direction: -1 上移, 1 下移）
  function moveCategory(type, id, direction) {
    const order = data.settings.categoryOrder[type] || [];
    getCategories(type).forEach((c) => { if (order.indexOf(c.id) === -1) order.push(c.id); });
    const i = order.indexOf(id);
    const j = i + direction;
    if (i === -1 || j < 0 || j >= order.length) return;
    const tmp = order[i]; order[i] = order[j]; order[j] = tmp;
    data.settings.categoryOrder[type] = order;
    save();
  }

  // ---------- 记录 CRUD ----------
  function addRecord(rec) { data.records.push(rec); save(); }
  function updateRecord(id, patch) {
    const r = data.records.find((x) => x.id === id);
    if (r) Object.assign(r, patch);
    save();
  }
  function deleteRecord(id) {
    data.records = data.records.filter((x) => x.id !== id);
    save();
  }
  function getRecord(id) { return data.records.find((x) => x.id === id); }

  // ---------- 设置 ----------
  function getSettings() { return data.settings; }
  function setSettings(patch) { Object.assign(data.settings, patch); save(); }

  function replaceAll(next) {
    data = Object.assign(emptyData(), next);
    data.settings = Object.assign({ budget: 0, customCategories: [], categoryOrder: {} }, data.settings || {});
    data.settings.categoryOrder = Object.assign({ expense: [], income: [] }, data.settings.categoryOrder || {});
    data.records = data.records || [];
    save();
  }

  function clearAll() { data = emptyData(); save(); }
  function exportJSON() { return JSON.stringify(data, null, 2); }

  return {
    load, save, getRecords, recordsInMonth, recordsOnDate, summary, dailyTotal, dailyTotalsInMonth,
    getCategories, findCategory, isCustomCategory, addCustomCategory, deleteCustomCategory, moveCategory,
    addRecord, updateRecord, deleteRecord, getRecord,
    getSettings, setSettings, replaceAll, clearAll, exportJSON
  };
})();
