// ===== 家計簿 PWA - app.js =====

// --- Category Data ---
const CATEGORIES = {
    expense: [
        { name: '食費', icon: '🛒' },
        { name: '外食', icon: '🍽️' },
        { name: '交通費', icon: '🚗' },
        { name: '住居費', icon: '🏠' },
        { name: '光熱費', icon: '⚡' },
        { name: '通信費', icon: '📱' },
        { name: '医療費', icon: '🏥' },
        { name: '衣服', icon: '👕' },
        { name: '教育費', icon: '📚' },
        { name: '娯楽', icon: '🎮' },
        { name: '日用品', icon: '🛒' },
        { name: '美容', icon: '✂️' },
        { name: 'その他', icon: '⋯' },
    ],
    income: [
        { name: '給与', icon: '💰' },
        { name: '副業', icon: '💼' },
        { name: '投資', icon: '📈' },
        { name: 'ボーナス', icon: '🎁' },
        { name: 'その他', icon: '⋯' },
    ],
};

const CHART_COLORS = [
    '#4F46E5', '#E11D48', '#F97316', '#0D9488', '#7C3AED',
    '#0891B2', '#34D399', '#92400E', '#EAB308', '#059669',
    '#EF4444', '#3B82F6',
];

// --- State ---
let transactions = JSON.parse(localStorage.getItem('kakeibo_transactions') || '[]');
let historyMonth = new Date();
let summaryMonth = new Date();
let summaryType = 'expense';
let summaryView = 'chart';
let addType = 'expense';
let selectedCategory = null;
let currentSwipedRow = null;
let editingTxId = null;

let fixedExpenses = JSON.parse(localStorage.getItem('kakeibo_fixed_expenses') || '[]');
let editingFixedId = null;
let fixedType = 'expense';
let selectedFixedCategory = null;

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('date-input').value = formatDateInput(new Date());
    renderAll();
    registerSwipeHandlers();
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(() => { });
    }
});

// --- Data Persistence ---
function save() {
    localStorage.setItem('kakeibo_transactions', JSON.stringify(transactions));
}

// --- Formatting ---
function formatCurrency(n) {
    return '¥' + Math.round(n).toLocaleString('ja-JP');
}
function formatMonthYear(d) {
    return `${d.getFullYear()}年${d.getMonth() + 1}月`;
}
function formatShortDate(d) {
    return `${d.getMonth() + 1}/${d.getDate()}`;
}
function formatSectionDate(d) {
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    return `${d.getMonth() + 1}月${d.getDate()}日(${days[d.getDay()]})`;
}
function formatDateInput(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
}
function isSameMonth(d1, d2) {
    return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth();
}
function isSameDay(d1, d2) {
    return isSameMonth(d1, d2) && d1.getDate() === d2.getDate();
}

// --- Tab Navigation ---
function switchTab(name) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(`tab-${name}`).classList.add('active');
    document.querySelectorAll('.tab-btn')[['dashboard', 'history', 'summary'].indexOf(name)].classList.add('active');
    if (name === 'dashboard') renderDashboard();
    if (name === 'history') renderHistory();
    if (name === 'summary') renderSummary();
}

// --- Render All ---
function renderAll() {
    renderDashboard();
    renderHistory();
    renderSummary();
}

// ===== DASHBOARD =====
function renderDashboard() {
    const now = new Date();
    const monthTx = transactions.filter(t => isSameMonth(new Date(t.date), now));
    const income = monthTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = monthTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

    document.getElementById('dashboard-month').textContent = formatMonthYear(now);
    document.getElementById('dashboard-balance').textContent = formatCurrency(income - expense);
    document.getElementById('dashboard-income').textContent = formatCurrency(income);
    document.getElementById('dashboard-expense').textContent = formatCurrency(expense);

    const recent = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);

    if (recent.length === 0) {
        document.getElementById('recent-section').style.display = 'none';
        document.getElementById('dashboard-empty').style.display = '';
    } else {
        document.getElementById('recent-section').style.display = '';
        document.getElementById('dashboard-empty').style.display = 'none';
        document.getElementById('recent-list').innerHTML = recent.map(t => txRowHTML(t)).join('');
    }
}

function txRowHTML(t) {
    const sign = t.type === 'income' ? '+' : '-';
    const d = new Date(t.date);
    return `
        <div class="tx-row" data-id="${t.id}" onclick="showEditModal('${t.id}')">
            <div class="tx-icon ${t.type}">${t.categoryIcon}</div>
            <div class="tx-info">
                <div class="tx-category">${t.categoryName}</div>
                ${t.note ? `<div class="tx-note">${escapeHTML(t.note)}</div>` : ''}
            </div>
            <div class="tx-right">
                <div class="tx-amount ${t.type}">${sign}${formatCurrency(t.amount)}</div>
                <div class="tx-date">${formatShortDate(d)}</div>
            </div>
        </div>`;
}

function escapeHTML(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ===== HISTORY =====
function changeHistoryMonth(delta) {
    historyMonth = new Date(historyMonth.getFullYear(), historyMonth.getMonth() + delta, 1);
    renderHistory();
}

function renderHistory() {
    document.getElementById('history-month-label').textContent = formatMonthYear(historyMonth);
    const monthTx = transactions
        .filter(t => isSameMonth(new Date(t.date), historyMonth))
        .sort((a, b) => new Date(b.date) - new Date(a.date));

    if (monthTx.length === 0) {
        document.getElementById('history-list').innerHTML = '';
        document.getElementById('history-empty').style.display = '';
        return;
    }
    document.getElementById('history-empty').style.display = 'none';

    // Group by date
    const groups = {};
    monthTx.forEach(t => {
        const key = formatSectionDate(new Date(t.date));
        if (!groups[key]) groups[key] = [];
        groups[key].push(t);
    });

    let html = '';
    for (const [dateStr, txs] of Object.entries(groups)) {
        html += `<p class="date-section-title">${dateStr}</p><div class="card">`;
        html += txs.map(t => `
            <div class="tx-row" data-id="${t.id}" onclick="showEditModal('${t.id}')" ontouchstart="onSwipeStart(event)" ontouchmove="onSwipeMove(event)" ontouchend="onSwipeEnd(event)">
                <div class="tx-icon ${t.type}">${t.categoryIcon}</div>
                <div class="tx-info">
                    <div class="tx-category">${t.categoryName}</div>
                    ${t.note ? `<div class="tx-note">${escapeHTML(t.note)}</div>` : ''}
                </div>
                <div class="tx-right">
                    <div class="tx-amount ${t.type}">${t.type === 'income' ? '+' : '-'}${formatCurrency(t.amount)}</div>
                    <div class="tx-date">${formatShortDate(new Date(t.date))}</div>
                </div>
                <div class="tx-delete" onclick="event.stopPropagation(); deleteTx('${t.id}')">削除</div>
            </div>`).join('');
        html += '</div>';
    }
    document.getElementById('history-list').innerHTML = html;
}

// --- Swipe to Delete ---
let swipeStartX = 0;
function onSwipeStart(e) { swipeStartX = e.touches[0].clientX; }
function onSwipeMove(e) {
    const dx = swipeStartX - e.touches[0].clientX;
    const row = e.currentTarget;
    if (dx > 50) {
        if (currentSwipedRow && currentSwipedRow !== row) currentSwipedRow.classList.remove('swiped');
        row.classList.add('swiped');
        currentSwipedRow = row;
    } else if (dx < -20) {
        row.classList.remove('swiped');
    }
}
function onSwipeEnd() { }
function registerSwipeHandlers() {
    document.addEventListener('click', (e) => {
        if (currentSwipedRow && !e.target.closest('.tx-delete')) {
            currentSwipedRow.classList.remove('swiped');
            currentSwipedRow = null;
        }
    });
}

function deleteTx(id) {
    transactions = transactions.filter(t => t.id !== id);
    save();
    renderAll();
}

// ===== SUMMARY =====
function changeSummaryMonth(delta) {
    summaryMonth = new Date(summaryMonth.getFullYear(), summaryMonth.getMonth() + delta, 1);
    renderSummary();
}
function switchSummaryType(type) {
    summaryType = type;
    document.querySelectorAll('#summary-type-toggle .segment').forEach(el => {
        el.classList.toggle('active', el.dataset.value === type);
    });
    renderSummary();
}

function switchSummaryView(view) {
    summaryView = view;
    document.querySelectorAll('#summary-view-toggle .segment').forEach(el => {
        el.classList.toggle('active', el.dataset.value === view);
    });

    if (view === 'chart') {
        document.getElementById('summary-chart-view').style.display = 'block';
        document.getElementById('summary-calendar-view').style.display = 'none';
    } else {
        document.getElementById('summary-chart-view').style.display = 'none';
        document.getElementById('summary-calendar-view').style.display = 'block';
    }
    renderSummary();
}

function renderSummary() {
    document.getElementById('summary-month-label').textContent = formatMonthYear(summaryMonth);
    const monthTx = transactions.filter(t =>
        isSameMonth(new Date(t.date), summaryMonth) && t.type === summaryType
    );
    const total = monthTx.reduce((s, t) => s + t.amount, 0);

    if (monthTx.length === 0) {
        document.getElementById('summary-content').style.display = 'none';
        document.getElementById('summary-empty').style.display = '';
        return;
    }
    document.getElementById('summary-content').style.display = '';
    document.getElementById('summary-empty').style.display = 'none';

    if (summaryView === 'calendar') {
        renderCalendar(monthTx);
        return;
    }

    // Group by category
    const catMap = {};
    monthTx.forEach(t => {
        if (!catMap[t.categoryName]) catMap[t.categoryName] = { icon: t.categoryIcon, amount: 0 };
        catMap[t.categoryName].amount += t.amount;
    });
    const catList = Object.entries(catMap)
        .map(([name, v]) => ({ name, icon: v.icon, amount: v.amount, pct: total > 0 ? (v.amount / total) * 100 : 0 }))
        .sort((a, b) => b.amount - a.amount);

    // Draw chart
    document.getElementById('chart-total').textContent = formatCurrency(total);
    drawDonutChart(catList);

    // Breakdown
    let html = '<p class="breakdown-title">カテゴリ別内訳</p><div class="card">';
    catList.forEach((c, i) => {
        html += `
            <div class="breakdown-row" onclick="showCategoryDetail('${c.name}')" style="cursor: pointer;">
                <div class="breakdown-dot" style="background:${CHART_COLORS[i % CHART_COLORS.length]}"></div>
                <div class="breakdown-icon">${c.icon}</div>
                <div class="breakdown-name">${c.name}</div>
                <div class="breakdown-pct">${c.pct.toFixed(1)}%</div>
                <div class="breakdown-amount">${formatCurrency(c.amount)}</div>
            </div>`;
    });
    html += '</div>';
    document.getElementById('category-breakdown').innerHTML = html;
}

function drawDonutChart(data) {
    const canvas = document.getElementById('pie-chart');
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const size = 240;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size, size);

    const cx = size / 2, cy = size / 2, r = 100, innerR = 60;
    let startAngle = -Math.PI / 2;
    const total = data.reduce((s, d) => s + d.amount, 0);

    data.forEach((d, i) => {
        const sweep = (d.amount / total) * Math.PI * 2;
        const gap = 0.03;
        ctx.beginPath();
        ctx.arc(cx, cy, r, startAngle + gap, startAngle + sweep - gap);
        ctx.arc(cx, cy, innerR, startAngle + sweep - gap, startAngle + gap, true);
        ctx.closePath();
        ctx.fillStyle = CHART_COLORS[i % CHART_COLORS.length];
        ctx.fill();
        startAngle += sweep;
    });
}

function renderCalendar(monthTx) {
    const year = summaryMonth.getFullYear();
    const month = summaryMonth.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay(); // 0(Sun) - 6(Sat)
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const dayMap = {};
    monthTx.forEach(t => {
        const d = new Date(t.date).getDate();
        dayMap[d] = (dayMap[d] || 0) + t.amount;
    });

    let html = `
        <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; text-align: center; font-size: 12px; margin-bottom: 8px; font-weight: 600; color: var(--text-secondary);">
            <div style="color: #ef4444;">日</div><div>月</div><div>火</div><div>水</div><div>木</div><div>金</div><div style="color: #3b82f6;">土</div>
        </div>
        <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; text-align: center;">
    `;

    for (let i = 0; i < firstDayIndex; i++) {
        html += `<div style="padding: 8px; background: transparent;"></div>`;
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const isToday = isSameDay(new Date(year, month, day), new Date());
        const hasTx = dayMap[day] > 0;
        const colorStr = summaryType === 'expense' ? '#E11D48' : '#059669';

        html += `
            <div onclick="showDayDetail(${year}, ${month}, ${day})" style="padding: 8px 2px; border-radius: 8px; background: var(--bg-secondary); display: flex; flex-direction: column; align-items: center; justify-content: flex-start; min-height: 54px; cursor: pointer; border: ${isToday ? '2px solid var(--primary-color)' : '1px solid transparent'}; box-sizing: border-box;">
                <span style="font-size: 14px; font-weight: ${isToday ? '700' : '500'}; color: var(--text-primary);">${day}</span>
                ${hasTx ? `<span style="color: ${colorStr}; font-size: 10px; margin-top: 4px; font-weight: 600; word-break: break-all;">${dayMap[day] >= 1000 ? Math.round(dayMap[day] / 1000) + 'k' : dayMap[day]}</span>` : ''}
            </div>
        `;
    }

    html += `</div>`;
    document.getElementById('calendar-container').innerHTML = html;
}

// ===== CATEGORY / DAY DETAIL =====
function showDayDetail(year, month, day) {
    const targetDate = new Date(year, month, day);
    const dayTx = transactions.filter(t =>
        isSameDay(new Date(t.date), targetDate) && t.type === summaryType
    ).sort((a, b) => new Date(b.date) - new Date(a.date));

    if (dayTx.length === 0) return;

    const total = dayTx.reduce((s, t) => s + t.amount, 0);
    const title = `${month + 1}月${day}日 (${summaryType === 'expense' ? '支出' : '収入'})`;

    document.getElementById('category-detail-title').textContent = title;
    document.getElementById('category-detail-total').textContent = formatCurrency(total);
    document.getElementById('category-detail-list').innerHTML = dayTx.map(t => txRowHTML(t)).join('');

    document.getElementById('category-detail-modal').classList.add('show');
}
function showCategoryDetail(categoryName) {
    const monthTx = transactions.filter(t =>
        isSameMonth(new Date(t.date), summaryMonth) &&
        t.type === summaryType &&
        t.categoryName === categoryName
    ).sort((a, b) => new Date(b.date) - new Date(a.date));

    const total = monthTx.reduce((s, t) => s + t.amount, 0);

    document.getElementById('category-detail-title').textContent = `${categoryName} (${formatMonthYear(summaryMonth)})`;
    document.getElementById('category-detail-total').textContent = formatCurrency(total);
    document.getElementById('category-detail-list').innerHTML = monthTx.map(t => txRowHTML(t)).join('');

    document.getElementById('category-detail-modal').classList.add('show');
}

function hideCategoryDetailModal() {
    document.getElementById('category-detail-modal').classList.remove('show');
}

// ===== ADD / EDIT TRANSACTION =====
function showAddModal() {
    editingTxId = null;
    document.getElementById('add-modal-title').textContent = '取引を追加';
    resetAddForm();
    document.getElementById('add-modal').classList.add('show');
}
function hideAddModal() {
    document.getElementById('add-modal').classList.remove('show');
    editingTxId = null;
}

function showEditModal(id) {
    const tx = transactions.find(t => t.id === id);
    if (!tx) return;
    editingTxId = id;

    // Set type
    switchAddType(tx.type);

    // Set values
    document.getElementById('amount-input').value = tx.amount;
    document.getElementById('amount-input').className = 'amount-field ' + tx.type;
    document.getElementById('note-input').value = tx.note || '';
    document.getElementById('date-input').value = tx.date;

    // Find and select category
    const catIndex = CATEGORIES[tx.type].findIndex(c => c.name === tx.categoryName);
    if (catIndex !== -1) {
        selectCategory(catIndex);
    }

    document.getElementById('add-modal-title').textContent = '記録の編集';
    document.getElementById('add-modal').classList.add('show');
}

function switchAddType(type) {
    addType = type;
    selectedCategory = null;
    document.querySelectorAll('.modal-body .segment').forEach(el => {
        el.classList.toggle('active', el.dataset.value === type);
    });
    const input = document.getElementById('amount-input');
    input.className = 'amount-field ' + type;
    renderCategoryGrid();
    validateForm();
}

function renderCategoryGrid() {
    const grid = document.getElementById('category-grid');
    grid.innerHTML = CATEGORIES[addType].map((cat, i) => `
        <button class="cat-btn ${addType}" data-index="${i}" onclick="selectCategory(${i})">
            <div class="cat-icon">${cat.icon}</div>
            <span class="cat-name">${cat.name}</span>
        </button>
    `).join('');
}

function selectCategory(index) {
    selectedCategory = CATEGORIES[addType][index];
    document.querySelectorAll('.cat-btn').forEach((el, i) => {
        el.classList.toggle('selected', i === index);
    });
    validateForm();
}

function validateForm() {
    const amount = parseFloat(document.getElementById('amount-input').value);
    const valid = amount > 0 && selectedCategory !== null;
    document.getElementById('save-btn').disabled = !valid;
}

function resetAddForm() {
    addType = 'expense';
    selectedCategory = null;
    document.getElementById('amount-input').value = '';
    document.getElementById('amount-input').className = 'amount-field expense';
    document.getElementById('note-input').value = '';
    document.getElementById('date-input').value = formatDateInput(new Date());
    document.querySelectorAll('.modal-body .segment').forEach(el => {
        el.classList.toggle('active', el.dataset.value === 'expense');
    });
    renderCategoryGrid();
    validateForm();
}

function saveTransaction() {
    const amount = parseFloat(document.getElementById('amount-input').value);
    if (!amount || amount <= 0 || !selectedCategory) return;

    if (editingTxId) {
        // Edit existing
        const txIndex = transactions.findIndex(t => t.id === editingTxId);
        if (txIndex !== -1) {
            transactions[txIndex] = {
                ...transactions[txIndex],
                amount,
                type: addType,
                categoryName: selectedCategory.name,
                categoryIcon: selectedCategory.icon,
                note: document.getElementById('note-input').value.trim(),
                date: document.getElementById('date-input').value || formatDateInput(new Date()),
            };
        }
    } else {
        // Add new
        const tx = {
            id: crypto.randomUUID(),
            amount,
            type: addType,
            categoryName: selectedCategory.name,
            categoryIcon: selectedCategory.icon,
            note: document.getElementById('note-input').value.trim(),
            date: document.getElementById('date-input').value || formatDateInput(new Date()),
        };
        transactions.push(tx);
    }

    save();
    hideAddModal();
    renderAll();
}

// ===== SETTINGS & FIXED EXPENSES =====
function showSettingsModal() {
    const savedUrl = localStorage.getItem('kakeibo_gas_url') || '';
    document.getElementById('gas-url-input').value = savedUrl;
    document.getElementById('sync-status').textContent = '';
    document.getElementById('sync-status').className = 'sync-status';
    document.getElementById('settings-modal').classList.add('show');
}
function hideSettingsModal() {
    // Save URL when closing
    const url = document.getElementById('gas-url-input').value.trim();
    localStorage.setItem('kakeibo_gas_url', url);
    document.getElementById('settings-modal').classList.remove('show');
}

// --- FIXED EXPENSES ---
function saveFixed() {
    localStorage.setItem('kakeibo_fixed_expenses', JSON.stringify(fixedExpenses));
}

function showFixedExpensesModal() {
    renderFixedExpensesList();
    document.getElementById('fixed-expenses-modal').classList.add('show');
}
function hideFixedExpensesModal() {
    document.getElementById('fixed-expenses-modal').classList.remove('show');
}

function renderFixedExpensesList() {
    const listEl = document.getElementById('fixed-expenses-list');
    const emptyEl = document.getElementById('fixed-expenses-empty');
    if (fixedExpenses.length === 0) {
        listEl.innerHTML = '';
        emptyEl.style.display = 'block';
        return;
    }
    emptyEl.style.display = 'none';

    listEl.innerHTML = fixedExpenses.map(f => `
        <div class="tx-row" onclick="showEditFixedExpenseModal('${f.id}')" style="cursor: pointer; margin-bottom: 8px;">
            <div class="tx-icon ${f.type}">${f.categoryIcon}</div>
            <div class="tx-info">
                <div class="tx-category">${f.categoryName}</div>
                <div class="tx-note">${escapeHTML(f.name)} (毎月${f.dayOfMonth}日)</div>
            </div>
            <div class="tx-right" style="display: flex; align-items: center;">
                <div class="tx-amount ${f.type}" style="margin-right: 8px; font-size: 14px;">${f.type === 'income' ? '+' : '-'}${formatCurrency(f.amount)}</div>
                <button onclick="event.stopPropagation(); deleteFixedExpense('${f.id}')" style="background:#EF4444; color:white; border:none; padding:6px; border-radius:6px; font-size: 12px; cursor: pointer; height: auto;">削除</button>
            </div>
        </div>
    `).join('');
}

function showAddFixedExpenseModal() {
    editingFixedId = null;
    document.getElementById('fixed-expense-modal-title').textContent = '固定費を追加';
    resetFixedForm();
    document.getElementById('add-fixed-expense-modal').classList.add('show');
}

function hideAddFixedExpenseModal() {
    document.getElementById('add-fixed-expense-modal').classList.remove('show');
    editingFixedId = null;
}

function showEditFixedExpenseModal(id) {
    const f = fixedExpenses.find(x => x.id === id);
    if (!f) return;
    editingFixedId = id;

    switchFixedType(f.type);
    document.getElementById('fixed-amount-input').value = f.amount;
    document.getElementById('fixed-name-input').value = f.name;
    document.getElementById('fixed-day-input').value = f.dayOfMonth;

    const catIndex = CATEGORIES[f.type].findIndex(c => c.name === f.categoryName);
    if (catIndex !== -1) selectFixedCategory(catIndex);

    document.getElementById('fixed-expense-modal-title').textContent = '固定費の編集';
    document.getElementById('add-fixed-expense-modal').classList.add('show');
}

function switchFixedType(type) {
    fixedType = type;
    selectedFixedCategory = null;
    document.querySelectorAll('#add-fixed-expense-modal .modal-body .segment').forEach(el => {
        el.classList.toggle('active', el.dataset.value === type);
    });
    document.getElementById('fixed-amount-input').className = 'amount-field ' + type;
    renderFixedCategoryGrid();
    validateFixedForm();
}

function renderFixedCategoryGrid() {
    const grid = document.getElementById('fixed-category-grid');
    grid.innerHTML = CATEGORIES[fixedType].map((cat, i) => `
        <button class="cat-btn ${fixedType}" data-index="${i}" onclick="selectFixedCategory(${i})">
            <div class="cat-icon">${cat.icon}</div>
            <span class="cat-name">${cat.name}</span>
        </button>
    `).join('');
}

function selectFixedCategory(index) {
    selectedFixedCategory = CATEGORIES[fixedType][index];
    document.querySelectorAll('#fixed-category-grid .cat-btn').forEach((el, i) => {
        el.classList.toggle('selected', i === index);
    });
    validateFixedForm();
}

function validateFixedForm() {
    const amount = parseFloat(document.getElementById('fixed-amount-input').value);
    const name = document.getElementById('fixed-name-input').value.trim();
    const dayObj = parseInt(document.getElementById('fixed-day-input').value, 10);
    const valid = amount > 0 && name && dayObj >= 1 && dayObj <= 31 && selectedFixedCategory !== null;
    document.getElementById('save-fixed-btn').disabled = !valid;
}

function resetFixedForm() {
    switchFixedType('expense');
    document.getElementById('fixed-amount-input').value = '';
    document.getElementById('fixed-name-input').value = '';
    document.getElementById('fixed-day-input').value = '1';
    renderFixedCategoryGrid();
    validateFixedForm();
}

function saveFixedExpense() {
    const amount = parseFloat(document.getElementById('fixed-amount-input').value);
    const name = document.getElementById('fixed-name-input').value.trim();
    const dayOfMonth = parseInt(document.getElementById('fixed-day-input').value, 10);
    if (!amount || amount <= 0 || !name || !selectedFixedCategory || isNaN(dayOfMonth)) return;

    if (editingFixedId) {
        const idx = fixedExpenses.findIndex(f => f.id === editingFixedId);
        if (idx !== -1) {
            fixedExpenses[idx] = {
                ...fixedExpenses[idx],
                amount,
                name,
                dayOfMonth,
                type: fixedType,
                categoryName: selectedFixedCategory.name,
                categoryIcon: selectedFixedCategory.icon
            };
        }
    } else {
        fixedExpenses.push({
            id: crypto.randomUUID(),
            amount,
            name,
            dayOfMonth,
            type: fixedType,
            categoryName: selectedFixedCategory.name,
            categoryIcon: selectedFixedCategory.icon
        });
    }

    saveFixed();
    hideAddFixedExpenseModal();
    renderFixedExpensesList();
    processFixedExpenses(); // Apply immediately if applicable
}

function deleteFixedExpense(id) {
    fixedExpenses = fixedExpenses.filter(f => f.id !== id);
    saveFixed();
    renderFixedExpensesList();
}

function processFixedExpenses() {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const currentDay = now.getDate();
    let added = false;

    fixedExpenses.forEach(f => {
        if (currentDay >= f.dayOfMonth) {
            const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(f.dayOfMonth).padStart(2, '0')}`;
            const generatedId = `fixed_${f.id}_${currentYear}-${currentMonth + 1}`;

            if (!transactions.some(t => t.id === generatedId)) {
                transactions.push({
                    id: generatedId,
                    amount: f.amount,
                    type: f.type,
                    categoryName: f.categoryName,
                    categoryIcon: f.categoryIcon,
                    note: f.name,
                    date: dateStr
                });
                added = true;
            }
        }
    });

    if (added) {
        save();
        renderAll();
    }
}

// ===== GAS SYNC & CATEGORY ESTIMATION =====
const CATEGORY_RULES = [
    { keywords: ['スーパー', 'イオン', 'AEON', 'マルエツ', 'ライフ', 'LIFE', '西友', 'SEIYU', 'コープ', 'COOP', 'まいばすけっと'], category: '食費', icon: '🛒' },
    { keywords: ['レストラン', 'RESTAURANT', '食', 'FOOD', 'マクドナルド', 'MCDONALD', 'スターバックス', 'STARBUCKS', 'コンビニ', 'SEVEN', 'セブン', 'ローソン', 'LAWSON', 'ファミリーマート', 'FAMILYMART', 'すき家', '吉野家', 'CoCo', 'ココ', 'カフェ', 'CAFE', 'ベーカリー', 'BAKERY', 'スシ', 'SUSHI', 'ラーメン', '居酒屋', 'デニーズ', 'ガスト', 'サイゼリヤ', 'モスバーガー', 'ケンタッキー', 'KFC', 'ピザ', 'PIZZA', 'UBER EATS'], category: '外食', icon: '🍽️' },
    { keywords: ['交通', 'JR', '鉄道', 'RAIL', 'タクシー', 'TAXI', 'UBER', 'バス', 'BUS', 'ETC', '高速', '駐車', 'PARKING', 'ガソリン', 'ENEOS', 'エネオス', '出光', 'SHELL', 'コスモ', 'ANA', 'JAL', '航空'], category: '交通費', icon: '🚗' },
    { keywords: ['通信', 'DOCOMO', 'ドコモ', 'AU', 'KDDI', 'SOFTBANK', 'ソフトバンク', 'APPLE', 'GOOGLE', 'AMAZON PRIME', 'NETFLIX', 'SPOTIFY', 'YOUTUBE', 'DISNEY'], category: '通信費', icon: '📱' },
    { keywords: ['病院', '医院', 'クリニック', 'CLINIC', '薬局', '薬', 'PHARMACY', '歯科', 'DENTAL', '動物病院', 'DOUBUTU', 'ANIMAL'], category: '医療費', icon: '🏥' },
    { keywords: ['衣', 'ユニクロ', 'UNIQLO', 'GU', 'ZARA', 'H&M', 'MUJI', '無印', 'ABC-MART', 'アパレル'], category: '衣服', icon: '👕' },
    { keywords: ['日用', 'ドラッグ', 'DRUG', 'マツモトキヨシ', 'MATSUKIYO', 'ウエルシア', 'WELCIA', 'ツルハ', 'TSURUHA', 'ダイソー', 'DAISO', 'SERIA', 'セリア', '100円', 'ニトリ', 'NITORI', 'ホームセンター', 'CAINZ', 'カインズ'], category: '日用品', icon: '🛒' },
    { keywords: ['映画', 'CINEMA', 'ゲーム', 'GAME', 'カラオケ', 'KARAOKE', 'アミューズ', 'AMUSE', 'レジャー', 'LEISURE', '遊園', '水族館', '動物園', '旅行', 'TRAVEL', 'ホテル', 'HOTEL', '温泉'], category: '娯楽', icon: '🎮' },
    { keywords: ['美容', '理容', 'サロン', 'SALON', '美髪', 'HAIR', 'エステ'], category: '美容', icon: '✂️' },
    { keywords: ['教育', '書店', '書籍', 'BOOK', 'AMAZON', '本屋', '紀伊國屋', 'KINOKUNIYA', '学校', 'SCHOOL'], category: '教育費', icon: '📚' },
    { keywords: ['住居', '家賃', '不動産', 'RENT', '管理費'], category: '住居費', icon: '🏠' },
    { keywords: ['電気', '電力', 'ガス', '水道', '光熱'], category: '光熱費', icon: '⚡' },
];

function guessCategory(storeName) {
    if (!storeName) return { categoryName: 'その他', categoryIcon: '⋯' };
    const upper = storeName.toUpperCase();
    for (const rule of CATEGORY_RULES) {
        for (const kw of rule.keywords) {
            if (upper.includes(kw.toUpperCase())) {
                return { categoryName: rule.category, categoryIcon: rule.icon };
            }
        }
    }
    return { categoryName: 'その他', categoryIcon: '⋯' };
}

async function syncFromGAS() {
    const urlInput = document.getElementById('gas-url-input');
    const gasUrl = urlInput.value.trim();
    const statusEl = document.getElementById('sync-status');
    const btn = document.getElementById('sync-btn');

    if (!gasUrl) {
        statusEl.textContent = '⚠️ GAS Web App URL を入力してください';
        statusEl.className = 'sync-status error';
        return;
    }

    // Save URL
    localStorage.setItem('kakeibo_gas_url', gasUrl);

    // Show loading
    btn.disabled = true;
    statusEl.innerHTML = '<span class="sync-spinner">🔄</span> 同期中...';
    statusEl.className = 'sync-status loading';

    try {
        const response = await fetch(gasUrl, {
            redirect: 'follow',
        });
        if (!response.ok) throw new Error(`HTTP ${response.status} `);

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || '同期に失敗しました');
        }

        // Import transactions (deduplicate)
        let imported = 0;
        const existingIds = new Set(transactions.map(t => t.id));
        // Also check by date+amount+note for manual duplicates
        const existingKeys = new Set(transactions.map(t => `${t.date}_${t.amount}_${t.note} `));

        for (const tx of data.transactions) {
            if (existingIds.has(tx.id)) continue;
            const key = `${tx.date}_${tx.amount}_${tx.note} `;
            if (existingKeys.has(key)) continue;

            // カテゴリを PWA 側で推定する
            const guessed = guessCategory(tx.note);
            tx.categoryName = guessed.categoryName;
            tx.categoryIcon = guessed.categoryIcon;

            transactions.push(tx);
            existingIds.add(tx.id);
            existingKeys.add(key);
            imported++;
        }

        save();
        renderAll();

        if (imported > 0) {
            statusEl.textContent = `✅ ${imported} 件の取引を取り込みました！`;
            statusEl.className = 'sync-status success';
        } else {
            statusEl.textContent = '✅ 新しい取引はありませんでした';
            statusEl.className = 'sync-status success';
        }
    } catch (err) {
        console.error('Sync error:', err);
        statusEl.textContent = `❌ エラー: ${err.message} `;
        statusEl.className = 'sync-status error';
    } finally {
        btn.disabled = false;
    }
}
