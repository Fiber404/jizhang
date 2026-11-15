/* 金币记账本 —— 主应用逻辑 */
'use strict';

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function moneySigned(cents) {
  return (cents < 0 ? '-¥' : '¥') + U.fmtMoney(Math.abs(cents));
}

const App = {
  state: {
    tab: 'today',
    viewMonth: '',
    selectedDate: '',
    addType: 'expense',
    addStr: '',
    addCategory: null,
    addNote: '',
    addDate: '',
    editingId: null,
    chartType: 'expense',
    sheetId: null,
    confirmCb: null,
    toastTimer: null,
    catMgrType: 'expense',
    newCat: { type: 'expense', name: '', icon: '📦', color: '#2A3B6B' },
    lineMode: 'net',
    lineHighlight: null,
    lineData: []
  },

  init() {
    Store.load();
    this.state.viewMonth = U.currentMonth();
    this.state.selectedDate = U.today();
    this.state.addDate = U.today();
    // 支持 #add / #chart 等深链接，便于直接打开某个页签
    const h = (location.hash || '').replace('#', '').split('?')[0];
    if (['today', 'detail', 'add', 'chart', 'mine'].includes(h)) this.state.tab = h;
    this.bind();
    this.render();
    this.registerSW();
  },

  bind() {
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-action]');
      if (!el) return;
      const act = el.dataset.action;
      const fn = this.actions[act];
      if (fn) fn.call(this, el, e);
    });

    document.addEventListener('input', (e) => {
      const el = e.target;
      if (el.id === 'note-input') this.state.addNote = el.value;
      else if (el.id === 'date-input') this.state.addDate = el.value;
      else if (el.id === 'newcat-name') this.state.newCat.name = el.value;
    });

    document.addEventListener('change', (e) => {
      if (e.target.id === 'import-file') this.handleImport(e.target);
    });

    document.getElementById('overlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.closeOverlay();
    });
  },

  actions: {
    tab(el) {
      const t = el.dataset.tab;
      if (t === 'add') { this.state.editingId = null; this.resetAddForm(); }
      this.state.tab = t;
      this.render();
    },
    'month-prev'() { this.shiftMonth(-1); },
    'month-next'() { this.shiftMonth(1); },
    'cal-day'(el) { this.state.selectedDate = el.dataset.date; this.renderDetail(); },
    'add-for-date'(el) {
      this.state.editingId = null;
      this.resetAddForm();
      this.state.addDate = el.dataset.date;
      this.state.tab = 'add';
      this.render();
    },
    'add-type'(el) { this.state.addType = el.dataset.type; this.state.addCategory = null; this.renderAdd(); },
    'add-cat'(el) { this.state.addCategory = el.dataset.id; this.renderAdd(); },
    key(el) { this.pressKey(el.dataset.key); },
    save() { this.saveRecord(); },
    record(el) { this.openSheet(el.dataset.id); },
    'sheet-edit'() { this.editFromSheet(); },
    'sheet-delete'() { this.deleteFromSheet(); },
    'sheet-close'() { this.closeOverlay(); },
    'chart-type'(el) { this.state.chartType = el.dataset.type; this.renderChart(); },
    'line-mode'(el) {
      this.state.lineMode = el.dataset.mode;
      document.querySelectorAll('.line-tabs button').forEach((b) => {
        b.classList.toggle('active', b.dataset.mode === this.state.lineMode);
      });
      this.updateLineChart();
    },
    'go-budget'() { this.openBudget(); },
    'cat-mgr'() { this.openCatMgr(); },
    'cat-mgr-type'(el) { this.state.catMgrType = el.dataset.type; this.renderCatMgr(); },
    'cat-mgr-move'(el) { Store.moveCategory(this.state.catMgrType, el.dataset.id, parseInt(el.dataset.dir, 10)); this.renderCatMgr(); },
    'cat-mgr-del'(el) { this.delCustomCategory(el.dataset.id); },
    'cat-mgr-add'() { this.openNewCat(); },
    'cat-mgr-close'() { this.closeOverlay(); },
    'newcat-type'(el) { this.state.newCat.type = el.dataset.type; this.renderNewCat(); },
    'newcat-icon'(el) { this.state.newCat.icon = el.dataset.icon; this.renderNewCat(); },
    'newcat-color'(el) { this.state.newCat.color = el.dataset.color; this.renderNewCat(); },
    'newcat-save'() { this.saveNewCat(); },
    'newcat-cancel'() { this.renderCatMgr(); },
    export() { this.exportData(); },
    import() { const f = document.getElementById('import-file'); if (f) f.click(); },
    clear() { this.askClear(); },
    'confirm-ok'() {
      const cb = this.state.confirmCb;
      if (cb) { const res = cb(); if (res === false) return; }
      this.closeOverlay();
    },
    'confirm-cancel'() { this.closeOverlay(); }
  },

  // ---------- 渲染 ----------
  render() {
    document.querySelectorAll('.tab').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === this.state.tab);
    });
    // 记一笔页使用「顶部可滚动 + 底部固定」布局，视图本身不滚动
    document.getElementById('view').classList.toggle('view--add', this.state.tab === 'add');
    if (this.state.tab === 'today') this.renderToday();
    else if (this.state.tab === 'detail') this.renderDetail();
    else if (this.state.tab === 'add') this.renderAdd();
    else if (this.state.tab === 'chart') this.renderChart();
    else if (this.state.tab === 'mine') this.renderMine();
    document.getElementById('view').scrollTop = 0;
  },

  renderTopbar() {
    const top = document.getElementById('topbar');
    const t = this.state.tab;
    let html = '';
    if (t === 'today') {
      html = `<div class="topbar-row">
        <div class="topbar-title"><img class="mini-mascot" src="icons/mascot.png" alt="">金币记账本</div>
      </div>`;
    } else if (t === 'detail') {
      html = `<div class="topbar-row"><div class="topbar-title">明细</div>${this.monthNavHTML()}</div>`;
    } else if (t === 'chart') {
      html = `<div class="topbar-row"><div class="topbar-title">统计</div>${this.monthNavHTML()}</div>`;
    } else if (t === 'add') {
      html = `<div class="topbar-row"><div class="topbar-title">${this.state.editingId ? '编辑记账' : '记一笔'}</div></div>`;
    } else if (t === 'mine') {
      html = `<div class="topbar-row"><div class="topbar-title">我的</div></div>`;
    }
    top.innerHTML = html;
  },

  monthNavHTML() {
    return `<div class="month-nav">
      <button data-action="month-prev" aria-label="上个月">‹</button>
      <span class="month-text">${U.monthLabel(this.state.viewMonth)}</span>
      <button data-action="month-next" aria-label="下个月">›</button>
    </div>`;
  },

  shiftMonth(delta) {
    this.state.viewMonth = U.addMonths(this.state.viewMonth, delta);
    if (this.state.tab === 'chart') this.renderChart();
    else this.renderDetail();
  },

  // ---------- 今日 ----------
  renderToday() {
    this.renderTopbar();
    const view = document.getElementById('view');
    const today = U.today();
    const sum = Store.dailyTotal(today);
    const records = Store.recordsOnDate(today);

    let html = `<div class="today-date">${U.dayLabel(today)} ${U.weekdayCN(today)}<small>今天</small></div>`;
    html += this.summaryHTML({ expense: sum.expense, income: sum.income, balance: sum.income - sum.expense }, '今日支出');
    if (!records.length) {
      html += this.emptyHTML();
    } else {
      html += `<div class="day-group"><div class="record-list">${records.map((r) => this.recordHTML(r)).join('')}</div></div>`;
    }
    view.innerHTML = html;
  },

  // ---------- 明细（日历视图） ----------
  renderDetail() {
    this.renderTopbar();
    const view = document.getElementById('view');
    const ym = this.state.viewMonth;
    const daily = Store.dailyTotalsInMonth(ym);
    const today = U.today();

    let html = this.calendarHTML(ym, daily, today);

    const selDate = this.state.selectedDate && this.state.selectedDate.slice(0, 7) === ym ? this.state.selectedDate : today;
    const selRecords = Store.recordsOnDate(selDate);
    const selSum = Store.dailyTotal(selDate);
    html += `<div class="day-detail">
      <div class="dd-head">
        <div class="dd-title">${U.dayLabel(selDate)} ${U.weekdayCN(selDate)} · 支出 ¥${U.fmtMoney(selSum.expense)} · 收入 ¥${U.fmtMoney(selSum.income)}</div>
        <button class="dd-add" data-action="add-for-date" data-date="${selDate}">＋ 记一笔</button>
      </div>
      ${selRecords.length ? `<div class="record-list">${selRecords.map((r) => this.recordHTML(r)).join('')}</div>` : `<div class="card" style="text-align:center;color:var(--ink-3);padding:20px">当天没有记录</div>`}
    </div>`;
    view.innerHTML = html;
  },

  calendarHTML(ym, daily, today) {
    const [y, m] = ym.split('-').map(Number);
    const first = new Date(y, m - 1, 1);
    const startWeekday = (first.getDay() + 6) % 7;
    const days = new Date(y, m, 0).getDate();
    let cells = '';
    for (let i = 0; i < startWeekday; i++) cells += `<div class="cal-cell empty"></div>`;
    for (let d = 1; d <= days; d++) {
      const dateStr = `${ym}-${String(d).padStart(2, '0')}`;
      const t = daily[dateStr] || { expense: 0, income: 0 };
      const isToday = dateStr === today;
      const isSel = dateStr === this.state.selectedDate;
      cells += `<button class="cal-cell ${isToday ? 'today' : ''} ${isSel ? 'selected' : ''}" data-action="cal-day" data-date="${dateStr}">
        <span class="cal-day">${d}</span>
        ${t.expense > 0 ? `<span class="cal-exp">${this.compact(t.expense)}</span>` : ''}
        ${t.income > 0 ? `<span class="cal-inc">${this.compact(t.income)}</span>` : ''}
      </button>`;
    }
    return `<div class="calendar">
      <div class="cal-week"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div>
      <div class="cal-grid">${cells}</div>
      <div class="cal-legend"><span><i style="background:var(--primary)"></i>支出</span><span><i style="background:var(--income)"></i>收入</span></div>
    </div>`;
  },

  compact(cents) {
    const yuan = cents / 100;
    if (yuan >= 10000) return (yuan / 10000).toFixed(1) + 'w';
    if (yuan >= 1000) return (yuan / 1000).toFixed(1) + 'k';
    const r = Math.round(yuan * 10) / 10;
    return Number.isInteger(r) ? String(r) : r.toFixed(1);
  },

  summaryHTML(sum, label) {
    label = label || '本月支出';
    return `<div class="summary-card">
      <img class="deco" src="icons/mascot.png" alt="">
      <div class="summary-label">${label}</div>
      <div class="summary-big">¥${U.fmtMoney(sum.expense)}</div>
      <div class="summary-sub">
        <span>收入 <b>¥${U.fmtMoney(sum.income)}</b></span>
        <span>结余 <b>${moneySigned(sum.balance)}</b></span>
      </div>
    </div>`;
  },

  emptyHTML() {
    const tips = [
      '今天还没有记录，小账本在等你~',
      '记下一笔，离小目标更进一步 ✨',
      '小账本提醒你：好好记账哦~',
      '省下的钱，攒成小金库~'
    ];
    const tip = tips[Math.floor(Math.random() * tips.length)];
    return `<div class="empty-state">
      <span class="mascot">${Charts.mascot()}</span>
      <div class="tip">${tip}</div>
      <button class="btn-ghost" data-action="tab" data-tab="add">记第一笔</button>
    </div>`;
  },

  dayGroupHTML(g) {
    const sum = Store.dailyTotal(g.date);
    let sub = '';
    if (sum.expense > 0) sub += `支出 ¥${U.fmtMoney(sum.expense)}`;
    if (sum.income > 0) sub += (sub ? '　' : '') + `收入 ¥${U.fmtMoney(sum.income)}`;
    const items = g.items.map((r) => this.recordHTML(r)).join('');
    return `<div class="day-group">
      <div class="day-head">
        <span class="day-title">${U.dayLabel(g.date)} ${U.weekdayCN(g.date)}</span>
        <span class="day-sum">${sub}</span>
      </div>
      <div class="record-list">${items}</div>
    </div>`;
  },

  recordHTML(r) {
    const cat = Store.findCategory(r.categoryId) || { name: '其他', icon: '📦', color: '#78909C' };
    const bg = cat.color + '22';
    return `<div class="record-item" data-action="record" data-id="${r.id}">
      <span class="cat-badge" style="background:${bg}">${cat.icon}</span>
      <div class="record-main">
        <div class="record-name">${esc(cat.name)}</div>
        ${r.note ? `<div class="record-note">${esc(r.note)}</div>` : ''}
      </div>
      <div class="record-amount ${r.type}">${U.fmtSigned(r.amount, r.type)}</div>
    </div>`;
  },

  // ---------- 记一笔 ----------
  resetAddForm() {
    this.state.addType = 'expense';
    this.state.addStr = '';
    this.state.addCategory = null;
    this.state.addNote = '';
    this.state.addDate = U.today();
  },

  renderAdd() {
    this.renderTopbar();
    const view = document.getElementById('view');
    const t = this.state.addType;
    const cats = Store.getCategories(t);
    // 保留分类区滚动位置，避免选分类/切类型后列表跳回顶部
    const prevTop = view.querySelector('.add-top');
    const prevScroll = prevTop ? prevTop.scrollTop : 0;

    const catsHTML = cats.map((c) => `
      <button class="cat-item ${this.state.addCategory === c.id ? 'selected' : ''}" data-action="add-cat" data-id="${c.id}">
        <span class="cat-ico" style="background:${c.color}22">${c.icon}</span>
        <span class="cat-name">${esc(c.name)}</span>
      </button>`).join('');

    view.innerHTML = `
      <div class="add-layout">
        <div class="add-top">
          <div class="type-switch">
            <button class="${t === 'expense' ? 'active expense' : ''}" data-action="add-type" data-type="expense">支出</button>
            <button class="${t === 'income' ? 'active income' : ''}" data-action="add-type" data-type="income">收入</button>
          </div>
          <div class="cat-grid">${catsHTML}</div>
          <div class="cat-manage-entry" data-action="cat-mgr">🗂️ 分类管理 ›</div>
          <div class="field-row">
            <span class="field-label">备注</span>
            <input id="note-input" type="text" maxlength="30" placeholder="写点什么…" value="${esc(this.state.addNote)}">
          </div>
          <div class="field-row">
            <span class="field-label">日期</span>
            <input id="date-input" type="date" value="${this.state.addDate}">
          </div>
        </div>
        <div class="add-bottom">
          <div class="amount-panel">
            <div class="amount-display" id="amount-display">${this.amountDisplayHTML()}</div>
            <div class="keypad">
              ${['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'].map((k) => this.keyHTML(k)).join('')}
            </div>
          </div>
          <div class="save-bar">
            <button class="btn-save ${t}" data-action="save">保存</button>
          </div>
        </div>
      </div>
    `;
    const topEl = view.querySelector('.add-top');
    if (topEl && prevScroll) topEl.scrollTop = prevScroll;
  },

  keyHTML(k) {
    if (k === 'back') return `<button class="key key-bs" data-action="key" data-key="back">⌫</button>`;
    if (k === '.') return `<button class="key" data-action="key" data-key=".">.</button>`;
    return `<button class="key" data-action="key" data-key="${k}">${k}</button>`;
  },

  amountDisplayHTML() {
    const s = this.state.addStr;
    const val = s === '' ? '<span class="empty-hint">0.00</span>' : '<span class="val">' + esc(s) + '</span>';
    return '<span class="yen">¥</span>' + val;
  },

  updateAmountDisplay() {
    const el = document.getElementById('amount-display');
    if (el) el.innerHTML = this.amountDisplayHTML();
  },

  pressKey(key) {
    let s = this.state.addStr;
    if (key === 'back') {
      s = s.slice(0, -1);
    } else if (key === '.') {
      if (s.indexOf('.') === -1) s = s === '' ? '0.' : s + '.';
    } else {
      if (s === '0') s = key;
      else s += key;
      const dot = s.indexOf('.');
      if (dot !== -1 && s.length - dot - 1 > 2) s = s.slice(0, -1);
      if (s.replace('.', '').length > 10) s = s.slice(0, -1);
    }
    this.state.addStr = s;
    this.updateAmountDisplay();
  },

  centsToInput(cents) {
    if (!cents) return '';
    const yuan = Math.floor(cents / 100);
    const fen = cents % 100;
    if (fen === 0) return String(yuan);
    return `${yuan}.${String(fen).padStart(2, '0').replace(/0+$/, '')}`;
  },

  saveRecord() {
    const cents = U.strToCents(this.state.addStr);
    if (cents <= 0) { this.toast('请输入金额'); return; }
    if (!this.state.addCategory) { this.toast('请选择一个分类'); return; }
    const date = this.state.addDate || U.today();

    if (this.state.editingId) {
      Store.updateRecord(this.state.editingId, {
        type: this.state.addType, amount: cents,
        categoryId: this.state.addCategory, note: this.state.addNote.trim(), date
      });
      this.toast('已更新');
    } else {
      Store.addRecord({
        id: U.uid(), type: this.state.addType, amount: cents,
        categoryId: this.state.addCategory, note: this.state.addNote.trim(),
        date, createdAt: Date.now()
      });
      this.toast('已记一笔 🐳');
    }

    this.state.editingId = null;
    this.resetAddForm();
    this.state.viewMonth = date.slice(0, 7);
    this.state.selectedDate = date;
    this.state.tab = 'today';
    this.render();
  },

  // ---------- 图表 ----------
  categoryBreakdown(ym, type) {
    const map = {};
    Store.recordsInMonth(ym).forEach((r) => {
      if (r.type !== type) return;
      map[r.categoryId] = (map[r.categoryId] || 0) + r.amount;
    });
    return Object.keys(map).map((id) => {
      const cat = Store.findCategory(id) || { name: '其他', icon: '📦', color: '#78909C' };
      return { id, name: cat.name, icon: cat.icon, color: cat.color, value: map[id] };
    }).sort((a, b) => b.value - a.value);
  },

  monthLineData(ym) {
    const [y, m] = ym.split('-').map(Number);
    const days = new Date(y, m, 0).getDate();
    const daily = Store.dailyTotalsInMonth(ym);
    const data = [];
    for (let d = 1; d <= days; d++) {
      const dateStr = `${ym}-${String(d).padStart(2, '0')}`;
      const t = daily[dateStr] || { expense: 0, income: 0 };
      data.push({ label: String(d), date: dateStr, exp: t.expense, inc: t.income });
    }
    return data;
  },

  renderChart() {
    this.renderTopbar();
    const view = document.getElementById('view');
    const ym = this.state.viewMonth;
    const sum = Store.summary(ym);
    const settings = Store.getSettings();
    const type = this.state.chartType;

    let budgetHTML = '';
    if (settings.budget > 0) {
      const pct = Math.round(sum.expense / settings.budget * 100);
      const over = sum.expense > settings.budget;
      const remain = settings.budget - sum.expense;
      const tip = over
        ? `已超支 ¥${U.fmtMoney(sum.expense - settings.budget)}，小账本提醒你省着点花~`
        : (remain > 0 ? `还可花 ¥${U.fmtMoney(remain)}` : '预算刚刚好，继续保持~');
      budgetHTML = `<div class="card budget-card">
        <div class="budget-top"><span>本月预算</span><span><b>¥${U.fmtMoney(sum.expense)}</b> / ¥${U.fmtMoney(settings.budget)}</span></div>
        <div class="budget-bar"><div class="fill ${over ? 'over' : ''}" style="width:${Math.min(pct, 100)}%"></div></div>
        <div class="budget-tip">${tip}</div>
      </div>`;
    }

    // 折线图：本月每日收支走势（总收支/收入/支出）
    this.state.lineData = this.monthLineData(ym);
    const todayIdx = this.state.lineData.findIndex((d) => d.date === U.today());
    if (this.state.lineHighlight == null || this.state.lineHighlight >= this.state.lineData.length) {
      this.state.lineHighlight = todayIdx >= 0 ? todayIdx : (this.state.lineData.length > 0 ? this.state.lineData.length - 1 : 0);
    }
    const lineMode = this.state.lineMode;

    const items = this.categoryBreakdown(ym, type);
    const total = type === 'expense' ? sum.expense : sum.income;
    const donutSVG = Charts.donut(items.map((it) => ({ value: it.value, color: it.color })), total, 190);
    const centerLabel = type === 'expense' ? '本月支出' : '本月收入';

    const legendHTML = items.length
      ? items.map((it) => {
          const pct = total > 0 ? Math.round(it.value / total * 100) : 0;
          return `<div class="legend-row">
            <span class="lg-dot" style="background:${it.color}"></span>
            <span class="lg-name">${it.icon} ${esc(it.name)}</span>
            <span class="lg-pct">${pct}%</span>
            <span class="lg-val">¥${U.fmtMoney(it.value)}</span>
          </div>`;
        }).join('')
      : `<div class="legend-empty">本月还没有${type === 'expense' ? '支出' : '收入'}记录</div>`;

    const months = U.lastNMonths(6, ym);
    const trend = months.map((m) => Store.summary(m));
    const maxVal = Math.max(1, ...trend.map((t) => Math.max(t.expense, t.income)));
    const barsHTML = trend.map((t, i) => {
      const eh = Math.round(t.expense / maxVal * 100);
      const ih = Math.round(t.income / maxVal * 100);
      const label = `${parseInt(months[i].slice(5), 10)}月`;
      return `<div class="bar-col">
        <div class="bar-area"><div class="bar exp" style="height:${eh}%"></div><div class="bar inc" style="height:${ih}%"></div></div>
        <span class="bar-label">${label}</span>
      </div>`;
    }).join('');

    view.innerHTML = `
      ${budgetHTML}
      <div class="section-title">本月收支走势</div>
      <div class="card">
        <div class="line-tabs">
          <button class="${lineMode === 'net' ? 'active' : ''}" data-action="line-mode" data-mode="net">总收支</button>
          <button class="${lineMode === 'income' ? 'active' : ''}" data-action="line-mode" data-mode="income">收入</button>
          <button class="${lineMode === 'expense' ? 'active' : ''}" data-action="line-mode" data-mode="expense">支出</button>
        </div>
        <div class="line-chart-box" id="line-chart-box">${this.lineChartHTML()}</div>
        <div class="line-hint">滑动查看每日数据 · 点击跳转当日明细</div>
      </div>
      <div class="section-title">分类占比</div>
      <div class="card">
        <div class="chart-type-switch">
          <button class="${type === 'expense' ? 'active' : ''}" data-action="chart-type" data-type="expense">支出</button>
          <button class="${type === 'income' ? 'active' : ''}" data-action="chart-type" data-type="income">收入</button>
        </div>
        <div class="donut-wrap">
          ${donutSVG}
          <div class="donut-center"><span class="dc-label">${centerLabel}</span><span class="dc-val">¥${U.fmtMoney(total)}</span></div>
        </div>
        <div class="legend">${legendHTML}</div>
      </div>
      <div class="section-title">近6个月趋势</div>
      <div class="card">
        <div class="bars">${barsHTML}</div>
        <div class="bar-legend"><span><i style="background:var(--primary)"></i>支出</span><span><i style="background:var(--income)"></i>收入</span></div>
      </div>
    `;
    this.bindLineChart();
  },

  // ---------- 折线图交互 ----------
  lineChartHTML() {
    const data = this.state.lineData;
    const mode = this.state.lineMode;
    const svg = Charts.lineChart(data, { w: 320, h: 180, mode });
    const left = Charts.lineHighlightPct(data, this.state.lineHighlight);
    return `<div class="line-chart">
      ${svg}
      <div class="line-marker" style="left:${left.toFixed(1)}%"></div>
    </div>
    <div class="line-tooltip-bar">${this.lineTooltipHTML(this.state.lineData[this.state.lineHighlight])}</div>`;
  },

  lineTooltipHTML(d) {
    if (!d) return '';
    const net = d.inc - d.exp;
    const netCls = net >= 0 ? 'inc' : 'exp';
    return `<span class="lt-date">${U.dayLabel(d.date)} ${U.weekdayCN(d.date)}</span>
      <span class="lt-item">总收支 <b class="${netCls}">${moneySigned(net)}</b></span>
      <span class="lt-item">收入 <b class="inc">¥${U.fmtMoney(d.inc)}</b></span>
      <span class="lt-item">支出 <b class="exp">¥${U.fmtMoney(d.exp)}</b></span>`;
  },

  updateLineChart() {
    const box = document.getElementById('line-chart-box');
    if (!box) return;
    const hl = this.state.lineHighlight;
    const left = Charts.lineHighlightPct(this.state.lineData, hl);
    const marker = box.querySelector('.line-marker');
    if (marker) marker.style.left = left.toFixed(1) + '%';
    const bar = box.querySelector('.line-tooltip-bar');
    if (bar) bar.innerHTML = this.lineTooltipHTML(this.state.lineData[hl]);
  },

  bindLineChart() {
    const box = document.getElementById('line-chart-box');
    if (!box) return;
    let startX = 0, startY = 0, moved = false;

    const update = (clientX) => {
      const svg = box.querySelector('svg');
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      if (rect.width <= 0) return;
      const n = this.state.lineData.length;
      const vbX = 320 * (clientX - rect.left) / rect.width;
      const span = n <= 1 ? 1 : 300 / (n - 1);
      let i = Math.round((vbX - 10) / span);
      i = Math.max(0, Math.min(n - 1, i));
      if (i !== this.state.lineHighlight) {
        this.state.lineHighlight = i;
        this.updateLineChart();
      }
    };

    const jump = () => {
      const d = this.state.lineData[this.state.lineHighlight];
      if (d && d.date) {
        this.state.selectedDate = d.date;
        this.state.viewMonth = d.date.slice(0, 7);
        this.state.tab = 'detail';
        this.render();
      }
    };

    box.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX; startY = e.touches[0].clientY; moved = false;
      update(e.touches[0].clientX);
    }, { passive: true });
    box.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (Math.abs(e.touches[0].clientX - startX) > 6 || Math.abs(e.touches[0].clientY - startY) > 6) moved = true;
      update(e.touches[0].clientX);
    }, { passive: false });
    box.addEventListener('touchend', () => { if (!moved) jump(); });

    box.addEventListener('mousedown', (e) => { startX = e.clientX; startY = e.clientY; moved = false; update(e.clientX); });
    box.addEventListener('mousemove', (e) => {
      if (Math.abs(e.clientX - startX) > 6 || Math.abs(e.clientY - startY) > 6) moved = true;
      update(e.clientX);
    });
    box.addEventListener('mouseup', () => { if (!moved) jump(); });
    box.addEventListener('mouseleave', () => { moved = true; });
  },

  // ---------- 我的 ----------
  renderMine() {
    this.renderTopbar();
    const view = document.getElementById('view');
    const s = Store.getSettings();
    const budgetVal = s.budget > 0 ? '¥' + U.fmtMoney(s.budget) : '未设置';
    view.innerHTML = `
      <div class="mine-head">
        <span class="mascot">${Charts.mascot()}</span>
        <div><div class="mine-name">金币记账本</div><div class="mine-sub">小账本陪你一起记账~</div></div>
      </div>
      <div class="menu">
        <div class="menu-item" data-action="cat-mgr"><span class="mi-ico">🗂️</span>分类管理<span class="mi-arrow">›</span></div>
        <div class="menu-item" data-action="go-budget"><span class="mi-ico">🎯</span>每月预算<span class="mi-value">${budgetVal}</span><span class="mi-arrow">›</span></div>
        <div class="menu-item" data-action="export"><span class="mi-ico">📤</span>导出数据<span class="mi-arrow">›</span></div>
        <div class="menu-item" data-action="import"><span class="mi-ico">📥</span>导入数据<span class="mi-arrow">›</span></div>
        <div class="menu-item danger" data-action="clear"><span class="mi-ico">🗑️</span>清空全部数据<span class="mi-arrow">›</span></div>
      </div>
      <input id="import-file" type="file" accept="application/json,.json" hidden>
      <div class="about">金币记账本 · v2.9<br>数据仅保存在本机，请定期导出备份</div>
    `;
  },

  // ---------- 分类管理 ----------
  openCatMgr() {
    this.state.catMgrType = 'expense';
    this.renderCatMgr();
  },

  renderCatMgr() {
    const type = this.state.catMgrType;
    const cats = Store.getCategories(type);
    const overlay = document.getElementById('overlay');
    const items = cats.map((c) => {
      const custom = Store.isCustomCategory(c.id);
      return `<div class="cat-mgr-item">
        <span class="cm-ico" style="background:${c.color}22">${c.icon}</span>
        <span class="cm-name">${esc(c.name)}</span>
        ${custom ? '<span class="cm-tag">自定义</span>' : ''}
        <button class="cm-btn" data-action="cat-mgr-move" data-id="${c.id}" data-dir="-1">↑</button>
        <button class="cm-btn" data-action="cat-mgr-move" data-id="${c.id}" data-dir="1">↓</button>
        ${custom ? `<button class="cm-btn del" data-action="cat-mgr-del" data-id="${c.id}">×</button>` : ''}
      </div>`;
    }).join('');
    overlay.innerHTML = `<div class="sheet">
      <div class="sheet-handle"></div>
      <div class="sheet-title">分类管理</div>
      <div class="cat-mgr-type">
        <button class="${type === 'expense' ? 'active' : ''}" data-action="cat-mgr-type" data-type="expense">支出</button>
        <button class="${type === 'income' ? 'active' : ''}" data-action="cat-mgr-type" data-type="income">收入</button>
      </div>
      <div class="cat-mgr-list">${items}</div>
      <button class="cat-mgr-add" data-action="cat-mgr-add">＋ 新增分类</button>
      <button class="btn-secondary" style="width:100%;margin-top:12px" data-action="cat-mgr-close">完成</button>
    </div>`;
    overlay.hidden = false;
  },

  delCustomCategory(id) {
    this.confirmBox('删除该分类？', '删除后，已有账单会显示为「其他」，不受影响', '删除', () => {
      Store.deleteCustomCategory(id);
      this.renderCatMgr();
      this.toast('已删除');
    });
  },

  openNewCat() {
    this.state.newCat = { type: this.state.catMgrType, name: '', icon: '📦', color: '#4D6BFE' };
    this.renderNewCat();
  },

  renderNewCat() {
    const nc = this.state.newCat;
    const overlay = document.getElementById('overlay');
    const iconsHTML = PRESET_ICONS.map((ic) =>
      `<button class="${nc.icon === ic ? 'selected' : ''}" data-action="newcat-icon" data-icon="${ic}">${ic}</button>`).join('');
    const colorsHTML = PRESET_COLORS.map((c) =>
      `<button class="${nc.color === c ? 'selected' : ''}" data-action="newcat-color" data-color="${c}" style="background:${c}"></button>`).join('');
    overlay.innerHTML = `<div class="sheet">
      <div class="sheet-handle"></div>
      <div class="sheet-title">新增分类</div>
      <div class="type-switch">
        <button class="${nc.type === 'expense' ? 'active expense' : ''}" data-action="newcat-type" data-type="expense">支出</button>
        <button class="${nc.type === 'income' ? 'active income' : ''}" data-action="newcat-type" data-type="income">收入</button>
      </div>
      <div class="field-row">
        <span class="field-label">名称</span>
        <input id="newcat-name" type="text" maxlength="6" placeholder="分类名称" value="${esc(nc.name)}">
      </div>
      <div class="picker-label">选择图标</div>
      <div class="icon-picker">${iconsHTML}</div>
      <div class="picker-label">选择颜色</div>
      <div class="color-picker">${colorsHTML}</div>
      <div class="sheet-actions" style="margin-top:20px">
        <button class="btn-secondary" data-action="newcat-cancel">取消</button>
        <button class="btn-primary" data-action="newcat-save">保存</button>
      </div>
    </div>`;
    overlay.hidden = false;
  },

  saveNewCat() {
    const name = this.state.newCat.name.trim();
    if (!name) { this.toast('请输入分类名称'); return; }
    Store.addCustomCategory(this.state.newCat.type, name, this.state.newCat.icon, this.state.newCat.color);
    this.toast('分类已添加');
    this.state.catMgrType = this.state.newCat.type;
    this.renderCatMgr();
  },

  // ---------- 预算 ----------
  openBudget() {
    const s = Store.getSettings();
    const cur = s.budget > 0 ? String(s.budget / 100) : '';
    this.openPrompt('每月预算', '设置每月支出预算（元）。超支时，小账本会在图表页提醒你。', cur, '保存', (val) => {
      const yuan = parseFloat(val);
      if (isNaN(yuan) || yuan < 0) { this.toast('请输入有效金额'); return false; }
      Store.setSettings({ budget: Math.round(yuan * 100) });
      this.toast('预算已保存');
      this.renderMine();
    });
  },

  // ---------- 记录操作 ----------
  openSheet(id) {
    const r = Store.getRecord(id);
    if (!r) return;
    this.state.sheetId = id;
    const cat = Store.findCategory(r.categoryId) || { name: '其他', icon: '📦', color: '#78909C' };
    const overlay = document.getElementById('overlay');
    overlay.innerHTML = `<div class="sheet">
      <div class="sheet-handle"></div>
      <div class="sheet-record">
        <span class="cat-badge" style="background:${cat.color}22;font-size:26px">${cat.icon}</span>
        <div class="sr-amount ${r.type}">${U.fmtSigned(r.amount, r.type)}</div>
        <div class="sr-meta">${esc(cat.name)}${r.note ? ' · ' + esc(r.note) : ''}</div>
        <div class="sr-meta">${U.dayLabel(r.date)} ${U.weekdayCN(r.date)}</div>
      </div>
      <div class="sheet-actions">
        <button class="btn-secondary" data-action="sheet-close">关闭</button>
        <button class="btn-primary" data-action="sheet-edit">编辑</button>
        <button class="btn-danger" data-action="sheet-delete">删除</button>
      </div>
    </div>`;
    overlay.hidden = false;
  },

  editFromSheet() {
    const r = Store.getRecord(this.state.sheetId);
    if (!r) return;
    this.state.editingId = r.id;
    this.state.addType = r.type;
    this.state.addCategory = r.categoryId;
    this.state.addNote = r.note || '';
    this.state.addDate = r.date;
    this.state.addStr = this.centsToInput(r.amount);
    this.closeOverlay();
    this.state.tab = 'add';
    this.render();
  },

  deleteFromSheet() {
    const id = this.state.sheetId;
    this.closeOverlay();
    this.confirmBox('删除这条记录？', '删除后无法恢复', '删除', () => {
      Store.deleteRecord(id);
      this.toast('已删除');
      this.render();
    });
  },

  // ---------- 数据 ----------
  exportData() {
    const json = Store.exportJSON();
    const date = U.today().replace(/-/g, '');
    U.download(`金币记账本备份-${date}.json`, json, 'application/json');
    this.toast('已导出备份文件');
  },

  handleImport(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || !Array.isArray(data.records)) throw new Error('bad');
        this.confirmBox('导入数据？', `将导入 ${data.records.length} 条记录，并覆盖现有数据`, '导入', () => {
          Store.replaceAll(data);
          this.toast('导入成功');
          this.state.viewMonth = U.currentMonth();
          this.state.selectedDate = U.today();
          this.render();
        });
      } catch (e) {
        this.toast('文件格式不正确');
      }
    };
    reader.readAsText(file);
    input.value = '';
  },

  askClear() {
    this.confirmBox('清空全部数据？', '所有记账记录和设置将被删除，且无法恢复', '清空', () => {
      Store.clearAll();
      this.toast('已清空');
      this.state.viewMonth = U.currentMonth();
      this.state.selectedDate = U.today();
      this.render();
    });
  },

  // ---------- 弹层 ----------
  confirmBox(title, msg, okText, onOk) {
    const overlay = document.getElementById('overlay');
    overlay.innerHTML = `<div class="confirm-box">
      <div class="confirm-title">${esc(title)}</div>
      <div class="confirm-msg">${esc(msg)}</div>
      <div class="confirm-actions">
        <button class="confirm-cancel" data-action="confirm-cancel">取消</button>
        <button class="confirm-ok" data-action="confirm-ok">${esc(okText)}</button>
      </div>
    </div>`;
    overlay.hidden = false;
    this.state.confirmCb = onOk;
  },

  openPrompt(title, msg, value, okText, onOk) {
    const overlay = document.getElementById('overlay');
    overlay.innerHTML = `<div class="confirm-box">
      <div class="confirm-title">${esc(title)}</div>
      <div class="confirm-msg">${esc(msg)}</div>
      <div class="field-row" style="box-shadow:none;background:var(--line);border-radius:12px;margin-bottom:18px">
        <span class="field-label">金额</span>
        <input id="prompt-input" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0.00" value="${esc(value)}">
      </div>
      <div class="confirm-actions">
        <button class="confirm-cancel" data-action="confirm-cancel">取消</button>
        <button class="confirm-ok" data-action="confirm-ok" style="background:var(--primary)">${esc(okText)}</button>
      </div>
    </div>`;
    overlay.hidden = false;
    this.state.confirmCb = () => {
      const input = document.getElementById('prompt-input');
      if (onOk) onOk(input ? input.value : '');
    };
    const input = document.getElementById('prompt-input');
    if (input) setTimeout(() => { input.focus(); input.select(); }, 60);
  },

  closeOverlay() {
    const o = document.getElementById('overlay');
    o.hidden = true;
    o.innerHTML = '';
    this.state.confirmCb = null;
    this.state.sheetId = null;
  },

  toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(this.state.toastTimer);
    this.state.toastTimer = setTimeout(() => { t.hidden = true; }, 1600);
  },

  registerSW() {
    if (window.Capacitor) return; // 安卓 App 内无需 Service Worker
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }
};

App.init();
