// ===== 家計簿 PWA - app.js =====

// --- Category Data ---
const CATEGORIES = {
    expense: [
        { name: '食費', icon: '🍽️' },
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
let addType = 'expense';
let selectedCategory = null;
let currentSwipedRow = null;

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
        <div class="tx-row" data-id="${t.id}">
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
            <div class="tx-row" data-id="${t.id}" ontouchstart="onSwipeStart(event)" ontouchmove="onSwipeMove(event)" ontouchend="onSwipeEnd(event)">
                <div class="tx-icon ${t.type}">${t.categoryIcon}</div>
                <div class="tx-info">
                    <div class="tx-category">${t.categoryName}</div>
                    ${t.note ? `<div class="tx-note">${escapeHTML(t.note)}</div>` : ''}
                </div>
                <div class="tx-right">
                    <div class="tx-amount ${t.type}">${t.type === 'income' ? '+' : '-'}${formatCurrency(t.amount)}</div>
                    <div class="tx-date">${formatShortDate(new Date(t.date))}</div>
                </div>
                <div class="tx-delete" onclick="deleteTx('${t.id}')">削除</div>
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
            <div class="breakdown-row">
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

// ===== ADD TRANSACTION =====
function showAddModal() {
    resetAddForm();
    document.getElementById('add-modal').classList.add('show');
}
function hideAddModal() {
    document.getElementById('add-modal').classList.remove('show');
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
    save();
    hideAddModal();
    renderAll();
}

// ===== SETTINGS =====
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

// ===== GAS SYNC =====
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
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || '同期に失敗しました');
        }

        // Import transactions (deduplicate)
        let imported = 0;
        const existingIds = new Set(transactions.map(t => t.id));
        // Also check by date+amount+note for manual duplicates
        const existingKeys = new Set(transactions.map(t => `${t.date}_${t.amount}_${t.note}`));

        for (const tx of data.transactions) {
            if (existingIds.has(tx.id)) continue;
            const key = `${tx.date}_${tx.amount}_${tx.note}`;
            if (existingKeys.has(key)) continue;

            transactions.push(tx);
            existingIds.add(tx.id);
            existingKeys.add(key);
            imported++;
        }

        save();
        renderAll();

        if (imported > 0) {
            statusEl.textContent = `✅ ${imported}件の取引を取り込みました！`;
            statusEl.className = 'sync-status success';
        } else {
            statusEl.textContent = '✅ 新しい取引はありませんでした';
            statusEl.className = 'sync-status success';
        }
    } catch (err) {
        console.error('Sync error:', err);
        statusEl.textContent = `❌ エラー: ${err.message}`;
        statusEl.className = 'sync-status error';
    } finally {
        btn.disabled = false;
    }
}
