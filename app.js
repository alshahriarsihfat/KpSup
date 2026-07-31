'use strict';

// ============================================================
// GLOBAL STATE
// ============================================================
const AppState = {
    currentPage:        'dashboard',
    selectedWeekDay:    DAYS_OF_WEEK[new Date().getDay()],
    orderFilters:       { dateFrom: '', dateTo: '', supplierId: '', status: '' },
    editingSupplierId:  null,
    editingOrderId:     null,
    confirmCallback:    null,
    pinBuffer:          [],
};

// ============================================================
// INIT — DOM Ready
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    DB.init();

    // Set topbar date
    document.getElementById('topbar-date').textContent = new Date().toLocaleDateString('en-GB', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    // Wire up realtime UI auto-refresh
    DB.onDataChangeCallback = () => {
        updateCloudStatusBadge();
        refreshCurrentPage();
    };

    // Wire everything up
    setupPINKeypad();
    setupNavigation();
    setupDayToggles();
    setupModalButtons();

    // Auth gate
    if (DB.isAuthenticated()) {
        showApp();
    } else {
        showPINScreen();
    }
});

// ============================================================
// PIN AUTHENTICATION
// ============================================================
function showPINScreen() {
    document.getElementById('pin-overlay').classList.remove('hidden');
    document.getElementById('app-wrapper').classList.add('hidden');
    AppState.pinBuffer = [];
    updatePINDots();
}

function showApp() {
    document.getElementById('pin-overlay').classList.add('hidden');
    document.getElementById('app-wrapper').classList.remove('hidden');
    updateCloudStatusBadge();
    navigate('dashboard');
}

function setupPINKeypad() {
    // Click / Touch input
    document.querySelectorAll('.pin-key').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            handlePINInput(btn.dataset.val);
        });
    });

    // Physical Keyboard input (0-9, Backspace, Enter)
    document.addEventListener('keydown', e => {
        const pinOverlay = document.getElementById('pin-overlay');
        if (pinOverlay && !pinOverlay.classList.contains('hidden')) {
            if (e.key >= '0' && e.key <= '9') {
                handlePINInput(e.key);
            } else if (e.key === 'Backspace') {
                handlePINInput('del');
            } else if (e.key === 'Enter') {
                handlePINInput('enter');
            }
        }
    });

    // Reset PIN link
    const resetBtn = document.getElementById('btn-reset-pin');
    if (resetBtn) {
        resetBtn.addEventListener('click', e => {
            e.preventDefault();
            try {
                DB.setPIN('1234');
                document.getElementById('pin-error').style.color = 'var(--green)';
                document.getElementById('pin-error').textContent = '✓ PIN reset to 1234. Please enter 1234.';
                AppState.pinBuffer = [];
                updatePINDots();
            } catch (err) {
                showToast('Failed to reset PIN.', 'error');
                console.error('PIN reset error:', err);
            }
        });
    }
}

function handlePINInput(val) {
    document.getElementById('pin-error').style.color = 'var(--red)';
    if (val === 'del') {
        AppState.pinBuffer.pop();
        updatePINDots();
    } else if (val === 'enter') {
        submitPIN();
    } else {
        if (AppState.pinBuffer.length < 4) {
            AppState.pinBuffer.push(val);
            updatePINDots();
            if (AppState.pinBuffer.length === 4) {
                setTimeout(submitPIN, 300);
            }
        }
    }
}

function updatePINDots() {
    document.querySelectorAll('.pin-dot').forEach((dot, i) => {
        dot.classList.toggle('filled', i < AppState.pinBuffer.length);
    });
}

function submitPIN() {
    const entered = AppState.pinBuffer.join('');
    if (entered === DB.getPIN()) {
        DB.authenticate();
        document.getElementById('pin-error').textContent = '';
        showApp();
    } else {
        document.getElementById('pin-error').textContent = '✗ Incorrect PIN. Please try again.';
        AppState.pinBuffer = [];
        updatePINDots();
        const card = document.querySelector('.pin-card');
        card.classList.remove('shake');
        void card.offsetWidth;
        card.classList.add('shake');
        setTimeout(() => card.classList.remove('shake'), 600);
    }
}

// ============================================================
// NAVIGATION
// ============================================================
function setupNavigation() {
    document.querySelectorAll('[data-nav]').forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            navigate(link.dataset.nav);
        });
    });

    const menuBtn = document.getElementById('menu-btn');
    const sidebar = document.querySelector('.sidebar');
    if (menuBtn && sidebar) {
        menuBtn.addEventListener('click', () => {
            const expanded = sidebar.classList.toggle('show');
            menuBtn.setAttribute('aria-expanded', expanded.toString());
        });

        document.addEventListener('click', e => {
            if (window.innerWidth <= 768 && !sidebar.contains(e.target) && !menuBtn.contains(e.target)) {
                sidebar.classList.remove('show');
                menuBtn.setAttribute('aria-expanded', 'false');
            }
        });
    }

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            try {
                DB.logout();
                showPINScreen();
            } catch (err) {
                console.error('Logout error:', err);
                showPINScreen();
            }
        });
    }

    const settingsBtn = document.getElementById('btn-open-settings');
    const badge = document.getElementById('cloud-status-badge');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', openSettingsModal);
    }
    if (badge) {
        badge.addEventListener('click', openSettingsModal);
    }
}

function navigate(page) {
    AppState.currentPage = page;

    document.querySelectorAll('[data-nav]').forEach(link => {
        link.classList.toggle('active', link.dataset.nav === page);
    });

    document.querySelectorAll('.page-section').forEach(sec => {
        sec.classList.toggle('hidden', sec.id !== `page-${page}`);
    });

    const titles = {
        dashboard: 'Dashboard',
        suppliers: 'Suppliers',
        orders:    'Orders',
        reports:   'Reports & Export',
    };
    document.getElementById('topbar-title').textContent = titles[page] || page;

    if (window.innerWidth <= 768) {
        document.querySelector('.sidebar').classList.remove('show');
        document.getElementById('menu-btn').setAttribute('aria-expanded', 'false');
    }

    refreshCurrentPage();
}

function refreshCurrentPage() {
    switch (AppState.currentPage) {
        case 'dashboard': renderDashboard(); break;
        case 'suppliers': renderSuppliers(); break;
        case 'orders':    renderOrders();    break;
        case 'reports':   renderReports();   break;
    }
    safeIcons();
}

// ============================================================
// CLOUD STATUS BADGE
// ============================================================
function updateCloudStatusBadge() {
    const badge = document.getElementById('cloud-status-badge');
    if (!badge) return;

    if (DB.isCloudConnected()) {
        badge.className = 'cloud-status-badge cloud-status-active';
        badge.innerHTML = `<i data-lucide="cloud"></i><span>Backup Active</span>`;
    } else {
        badge.className = 'cloud-status-badge cloud-status-local';
        badge.innerHTML = `<i data-lucide="hard-drive"></i><span>Local Only</span>`;
    }
    safeIcons();
}

// ============================================================
// TOAST
// ============================================================
let _toastTimer = null;
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast toast-${type} show`;
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
}
window.showToast = showToast;

// ============================================================
// DASHBOARD
// ============================================================
function renderDashboard() {
    const todayOrdersCount = DB.getTodayOrdersCount();
    const todayOrdersBill  = DB.getTodayOrdersBillTotal();
    const todayVisitors    = DB.getTodayVisitors();
    const upcomingDeliveries = DB.getUpcomingDeliveries(7);

    document.getElementById('kpi-today-orders').textContent = todayOrdersCount;
    document.getElementById('kpi-today-bill').textContent   = '৳' + todayOrdersBill.toLocaleString();
    document.getElementById('kpi-visitors').textContent   = todayVisitors.length;
    document.getElementById('kpi-deliveries').textContent = upcomingDeliveries.length;

    renderWeekCalendar();
    renderTodayVisitorsList(AppState.selectedWeekDay);
    renderUpcomingDeliveriesList();
}

function renderWeekCalendar() {
    const todayName = DAYS_OF_WEEK[new Date().getDay()];
    const strip = document.getElementById('week-strip');

    strip.innerHTML = DAYS_OF_WEEK.map(day => {
        const count      = DB.getVisitorsForDay(day).length;
        const isToday    = day === todayName;
        const isSelected = day === AppState.selectedWeekDay;
        return `
            <div class="day-card ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}"
                 role="tab"
                 aria-selected="${isSelected}"
                 aria-label="${day}: ${count} visit${count !== 1 ? 's' : ''}"
                 tabindex="${isSelected ? '0' : '-1'}"
                 data-day="${day}">
                <span class="day-name">${day.slice(0, 3).toUpperCase()}</span>
                <span class="day-count ${count > 0 ? 'has-visitors' : 'no-visitors'}">${count}</span>
                <span class="day-label-sm">${count === 1 ? 'visit' : 'visits'}</span>
            </div>`;
    }).join('');

    const dayLabelEl = document.getElementById('selected-day-label');
    if (dayLabelEl) {
        dayLabelEl.textContent = AppState.selectedWeekDay === todayName
            ? `Today — ${AppState.selectedWeekDay}`
            : AppState.selectedWeekDay;
    }

    strip.querySelectorAll('.day-card').forEach(card => {
        card.addEventListener('click', () => selectWeekDay(card.dataset.day));
    });
}

function selectWeekDay(dayName) {
    AppState.selectedWeekDay = dayName;
    renderWeekCalendar();
    renderTodayVisitorsList(dayName);
    safeIcons();
}

function renderTodayVisitorsList(dayName) {
    const visitors  = DB.getVisitorsForDay(dayName);
    const container = document.getElementById('today-visitors-list');

    if (visitors.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📅</div>
                <p>No supplier visits scheduled for <strong>${dayName}</strong></p>
            </div>`;
        return;
    }

    container.innerHTML = visitors.map(sup => {
        const initial  = (sup.company || '?').charAt(0).toUpperCase();
        const dayPills = (sup.visit_days || []).map(d =>
            `<span class="day-pill ${d === dayName ? 'active-pill' : ''}">${d.slice(0, 3)}</span>`
        ).join('');
        return `
            <div class="visit-card" role="listitem">
                <div class="visit-avatar" aria-hidden="true">${initial}</div>
                <div class="visit-info">
                    <div class="visit-company">${esc(sup.company)}</div>
                    <div class="visit-rep">${esc(sup.name)}</div>
                    ${sup.phone ? `<div class="visit-phone">${esc(sup.phone)}</div>` : ''}
                </div>
                <div class="visit-days-pills" aria-label="Visit days">${dayPills}</div>
            </div>`;
    }).join('');
}

function renderUpcomingDeliveriesList() {
    const deliveries = DB.getUpcomingDeliveries(7);
    const container  = document.getElementById('upcoming-deliveries-list');
    const todayMs    = new Date().setHours(0, 0, 0, 0);

    if (deliveries.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📦</div>
                <p>No deliveries expected in the next 7 days</p>
            </div>`;
        return;
    }

    container.innerHTML = deliveries.map(order => {
        const delivMs  = new Date(order.delivery_date + 'T00:00:00').getTime();
        const diffDays = Math.round((delivMs - todayMs) / 86400000);
        const dueText  = diffDays === 0 ? 'Today!' : diffDays === 1 ? 'Tomorrow' : `In ${diffDays} days`;
        const urgency  = diffDays === 0 ? 'urgent' : diffDays <= 2 ? 'soon' : 'normal';

        const shortRemark = order.remarks
            ? esc(order.remarks.slice(0, 55)) + (order.remarks.length > 55 ? '…' : '')
            : '';

        return `
            <div class="delivery-card" role="listitem">
                <div class="delivery-urgency ${urgency}" aria-hidden="true"></div>
                <div class="delivery-info">
                    <div class="delivery-supplier">${esc(order.supplier_name)}</div>
                    <div class="delivery-date">${formatDate(order.delivery_date)}</div>
                    ${shortRemark ? `<div class="delivery-remarks">${shortRemark}</div>` : ''}
                </div>
                <div class="delivery-right">
                    <span class="delivery-due due-${urgency}">${dueText}</span>
                    <span class="delivery-amount">৳${Number(order.amount || 0).toLocaleString()}</span>
                </div>
            </div>`;
    }).join('');
}

// ============================================================
// DAY TOGGLE BUTTONS (Supplier Modal)
// ============================================================
function setupDayToggles() {
    document.querySelectorAll('.day-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.classList.toggle('active');
            btn.setAttribute('aria-pressed', btn.classList.contains('active').toString());
        });
    });
}

// ============================================================
// SUPPLIERS
// ============================================================
function renderSuppliers() {
    populateSupplierDropdowns();

    const searchVal = (document.getElementById('supplier-search')?.value || '').toLowerCase().trim();
    const suppliers = DB.getSuppliers();

    const filtered = suppliers.filter(s =>
        (s.company || '').toLowerCase().includes(searchVal) ||
        (s.name    || '').toLowerCase().includes(searchVal) ||
        (s.phone   || '').includes(searchVal)
    );

    const tbody = document.getElementById('suppliers-tbody');

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr><td colspan="6" class="empty-cell">
                <div class="empty-state">
                    <div class="empty-icon">🔍</div>
                    <p>${searchVal ? 'No suppliers match your search.' : 'No suppliers added yet.'}</p>
                </div>
            </td></tr>`;
        safeIcons();
        return;
    }

    tbody.innerHTML = filtered.map((sup, i) => {
        const dayChips = (sup.visit_days || []).length > 0
            ? (sup.visit_days || []).map(d => `<span class="day-chip">${d.slice(0, 3)}</span>`).join('')
            : '<span class="no-days">Not set</span>';

        return `
            <tr>
                <td><span class="row-num">${i + 1}</span></td>
                <td>
                    <div class="cell-primary">${esc(sup.company)}</div>
                    <div class="cell-secondary">${esc(sup.name)}</div>
                </td>
                <td>
                    <div class="cell-primary">${esc(sup.phone || '—')}</div>
                    <div class="cell-secondary">${esc(sup.email || '—')}</div>
                </td>
                <td><div class="days-chips">${dayChips}</div></td>
                <td>${badgeHTML(sup.status, 'supplier')}</td>
                <td>
                    <div class="action-btns">
                        <button class="icon-btn icon-btn-edit"
                            data-action="edit-supplier" data-id="${sup.id}"
                            title="Edit ${esc(sup.company)}" aria-label="Edit ${esc(sup.company)}">
                            <i data-lucide="pencil"></i>
                        </button>
                        <button class="icon-btn icon-btn-del"
                            data-action="delete-supplier" data-id="${sup.id}"
                            title="Delete ${esc(sup.company)}" aria-label="Delete ${esc(sup.company)}">
                            <i data-lucide="trash-2"></i>
                        </button>
                    </div>
                </td>
            </tr>`;
    }).join('');

    const existingTbody = document.getElementById('suppliers-tbody');
    existingTbody.onclick = e => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const { action, id } = btn.dataset;
        if (action === 'edit-supplier')   openSupplierModal(id);
        if (action === 'delete-supplier') confirmDelete('supplier', id);
    };

    safeIcons();
}

function populateSupplierDropdowns() {
    const suppliers = DB.getSuppliers();
    const opts = `<option value="">All Suppliers</option>` +
        suppliers.map(s => `<option value="${s.id}">${esc(s.company)}</option>`).join('');

    const ordEl = document.getElementById('ord-filter-supplier');
    const rptEl = document.getElementById('rpt-filter-supplier');
    if (ordEl) { const v = ordEl.value; ordEl.innerHTML = opts; ordEl.value = v; }
    if (rptEl) { const v = rptEl.value; rptEl.innerHTML = opts; rptEl.value = v; }
}

function openSupplierModal(id = null) {
    AppState.editingSupplierId = id;

    document.getElementById('supplier-form').reset();
    document.querySelectorAll('.day-toggle').forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-pressed', 'false');
    });

    if (id) {
        const sup = DB.getSupplier(id);
        if (!sup) return;
        document.getElementById('supplier-modal-title').textContent = 'Edit Supplier';
        document.getElementById('sup-name').value    = sup.name    || '';
        document.getElementById('sup-company').value = sup.company || '';
        document.getElementById('sup-phone').value   = sup.phone   || '';
        document.getElementById('sup-email').value   = sup.email   || '';
        document.getElementById('sup-address').value = sup.address  || '';
        document.getElementById('sup-status').value  = sup.status  || 'active';
        document.getElementById('sup-notes').value   = sup.notes   || '';
        (sup.visit_days || []).forEach(day => {
            const btn = document.querySelector(`.day-toggle[data-day="${day}"]`);
            if (btn) { btn.classList.add('active'); btn.setAttribute('aria-pressed', 'true'); }
        });
    } else {
        document.getElementById('supplier-modal-title').textContent = 'Add New Supplier';
        document.getElementById('sup-status').value = 'active';
    }

    document.getElementById('supplier-modal').classList.remove('hidden');
    document.getElementById('sup-name').focus();
    safeIcons();
}

function closeSupplierModal() {
    document.getElementById('supplier-modal').classList.add('hidden');
    AppState.editingSupplierId = null;
}

async function saveSupplier() {
    const name    = document.getElementById('sup-name').value.trim();
    const company = document.getElementById('sup-company').value.trim();

    if (!name || !company) {
        showToast('Representative Name and Company are required.', 'error');
        if (!name) document.getElementById('sup-name').focus();
        else       document.getElementById('sup-company').focus();
        return;
    }

    const visitDays = [...document.querySelectorAll('.day-toggle.active')].map(b => b.dataset.day);

    const data = {
        name, company,
        phone:      document.getElementById('sup-phone').value.trim(),
        email:      document.getElementById('sup-email').value.trim(),
        address:    document.getElementById('sup-address').value.trim(),
        visit_days: visitDays,
        status:     document.getElementById('sup-status').value,
        notes:      document.getElementById('sup-notes').value.trim(),
    };

    try {
        if (AppState.editingSupplierId) {
            await DB.updateSupplier(AppState.editingSupplierId, data);
            showToast(`✓ ${company} updated successfully!`);
        } else {
            await DB.addSupplier(data);
            showToast(`✓ ${company} added successfully!`);
        }
    } catch (err) {
        showToast('Failed to save supplier. Please try again.', 'error');
        console.error('Save supplier error:', err);
        return;
    }

    closeSupplierModal();
    renderSuppliers();
}

// ============================================================
// ORDERS
// ============================================================
function renderOrders() {
    populateSupplierDropdowns();

    const f = AppState.orderFilters;
    setValue('ord-filter-from',     f.dateFrom);
    setValue('ord-filter-to',       f.dateTo);
    setValue('ord-filter-supplier', f.supplierId);
    setValue('ord-filter-status',   f.status);

    const orders = DB.getOrdersByFilters(f);
    orders.sort((a, b) => new Date(b.order_date) - new Date(a.order_date));

    const tbody = document.getElementById('orders-tbody');

    if (orders.length === 0) {
        tbody.innerHTML = `
            <tr><td colspan="7" class="empty-cell">
                <div class="empty-state">
                    <div class="empty-icon">📋</div>
                    <p>${hasActiveFilters(f) ? 'No orders match your filters.' : 'No orders added yet.'}</p>
                </div>
            </td></tr>`;
        safeIcons();
        return;
    }

    tbody.innerHTML = orders.map(order => `
        <tr>
            <td><code class="order-id">${order.id}</code></td>
            <td><div class="cell-primary">${esc(order.supplier_name)}</div></td>
            <td>${formatDate(order.order_date)}</td>
            <td>${order.delivery_date ? formatDate(order.delivery_date) : '<span class="text-dim">—</span>'}</td>
            <td class="amount-cell">৳${Number(order.amount || 0).toLocaleString()}</td>
            <td>${badgeHTML(order.status, 'order')}</td>
            <td>
                <div class="action-btns">
                    <button class="icon-btn icon-btn-edit"
                        data-action="edit-order" data-id="${order.id}"
                        title="Edit order ${order.id}" aria-label="Edit order ${order.id}">
                        <i data-lucide="pencil"></i>
                    </button>
                    <button class="icon-btn icon-btn-del"
                        data-action="delete-order" data-id="${order.id}"
                        title="Delete order ${order.id}" aria-label="Delete order ${order.id}">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
            </td>
        </tr>`).join('');

    tbody.onclick = e => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const { action, id } = btn.dataset;
        if (action === 'edit-order')   openOrderModal(id);
        if (action === 'delete-order') confirmDelete('order', id);
    };

    safeIcons();
}

function applyOrderFilters() {
    AppState.orderFilters = {
        dateFrom:   document.getElementById('ord-filter-from').value,
        dateTo:     document.getElementById('ord-filter-to').value,
        supplierId: document.getElementById('ord-filter-supplier').value,
        status:     document.getElementById('ord-filter-status').value,
    };
    renderOrders();
}

function clearOrderFilters() {
    AppState.orderFilters = { dateFrom: '', dateTo: '', supplierId: '', status: '' };
    renderOrders();
}

function openOrderModal(id = null) {
    AppState.editingOrderId = id;

    const suppliers = DB.getSuppliers();
    document.getElementById('ord-supplier').innerHTML =
        `<option value="">— Select a Supplier —</option>` +
        suppliers.map(s => `<option value="${s.id}">${esc(s.company)} (${esc(s.name)})</option>`).join('');

    document.getElementById('order-form').reset();
    document.getElementById('ord-order-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('ord-status').value = 'pending';

    if (id) {
        const order = DB.getOrder(id);
        if (!order) return;
        document.getElementById('order-modal-title').textContent = 'Edit Order';
        document.getElementById('ord-supplier').value       = order.supplier_id;
        document.getElementById('ord-order-date').value     = order.order_date;
        document.getElementById('ord-delivery-date').value  = order.delivery_date || '';
        document.getElementById('ord-amount').value         = order.amount || '';
        document.getElementById('ord-status').value         = order.status;
        document.getElementById('ord-remarks').value        = order.remarks || '';
    } else {
        document.getElementById('order-modal-title').textContent = 'New Order Entry';
    }

    document.getElementById('order-modal').classList.remove('hidden');
    document.getElementById('ord-supplier').focus();
    safeIcons();
}

function closeOrderModal() {
    document.getElementById('order-modal').classList.add('hidden');
    AppState.editingOrderId = null;
}

async function saveOrder() {
    const supplierId = document.getElementById('ord-supplier').value;
    const orderDate  = document.getElementById('ord-order-date').value;

    if (!supplierId) { showToast('Please select a supplier.', 'error'); return; }
    if (!orderDate)  { showToast('Order date is required.', 'error'); return; }

    const supplier = DB.getSupplier(supplierId);
    const data = {
        supplier_id:   supplierId,
        supplier_name: supplier ? supplier.company : '',
        order_date:    orderDate,
        delivery_date: document.getElementById('ord-delivery-date').value,
        amount:        parseFloat(document.getElementById('ord-amount').value) || 0,
        status:        document.getElementById('ord-status').value,
        remarks:       document.getElementById('ord-remarks').value.trim(),
    };

    try {
        if (AppState.editingOrderId) {
            await DB.updateOrder(AppState.editingOrderId, data);
            showToast(`✓ Order updated successfully!`);
        } else {
            await DB.addOrder(data);
            showToast(`✓ Order created successfully!`);
        }
    } catch (err) {
        showToast('Failed to save order. Please try again.', 'error');
        console.error('Save order error:', err);
        return;
    }

    closeOrderModal();
    renderOrders();
}

// ============================================================
// CONFIRM DELETE
// ============================================================
function confirmDelete(type, id) {
    let label, entity;
    if (type === 'supplier') {
        entity = DB.getSupplier(id);
        label  = entity ? entity.company : id;
    } else {
        label  = `Order ${id}`;
    }

    AppState.confirmCallback = async () => {
        try {
            if (type === 'supplier') {
                await DB.deleteSupplier(id);
                showToast(`${label} has been deleted.`, 'error');
                renderSuppliers();
            } else {
                await DB.deleteOrder(id);
                showToast(`${label} has been deleted.`, 'error');
                renderOrders();
            }
        } catch (err) {
            showToast('Failed to delete. Please try again.', 'error');
            console.error('Delete error:', err);
        }
        closeConfirmModal();
    };

    document.getElementById('confirm-message').textContent =
        `Are you sure you want to delete "${label}"? This cannot be undone.`;
    document.getElementById('confirm-modal').classList.remove('hidden');
    safeIcons();
    setTimeout(() => document.getElementById('btn-confirm-delete').focus(), 50);
}

function closeConfirmModal() {
    document.getElementById('confirm-modal').classList.add('hidden');
    AppState.confirmCallback = null;
}

// ============================================================
// CLOUD DB SETTINGS MODAL
// ============================================================
function openSettingsModal() {
    const cfg = DB.getSupabaseConfig();
    document.getElementById('cfg-sb-url').value = cfg.url || '';
    document.getElementById('cfg-sb-key').value = cfg.key || '';
    document.getElementById('settings-modal').classList.remove('hidden');
    document.getElementById('cfg-sb-url').focus();
    safeIcons();
}

function closeSettingsModal() {
    document.getElementById('settings-modal').classList.add('hidden');
}

async function saveSettings() {
    const url = document.getElementById('cfg-sb-url').value.trim();
    const key = document.getElementById('cfg-sb-key').value.trim();

    if (!url || !key) {
        showToast('Please enter both Supabase Project URL and Anon Key.', 'error');
        return;
    }

    DB.setSupabaseConfig(url, key);

    try {
        const result = await DB.testCloudConnection();
        updateCloudStatusBadge();

        if (result.ok) {
            closeSettingsModal();
            showToast('☁️ Cloud backup connected successfully.');
        } else {
            showToast(result.message || 'Cloud backup needs one SQL setup in Supabase.', 'error');
        }
    } catch (err) {
        showToast('Failed to connect to cloud. Check your credentials.', 'error');
        console.error('Cloud connection error:', err);
    }
}

function disconnectCloud() {
    try {
        DB.setSupabaseConfig('', '');
        closeSettingsModal();
        updateCloudStatusBadge();
        showToast('Cloud backup disconnected. Data will stay local only.', 'info');
    } catch (err) {
        showToast('Failed to disconnect cloud.', 'error');
        console.error('Disconnect error:', err);
    }
}

// ============================================================
// REPORTS
// ============================================================
function renderReports() {
    populateSupplierDropdowns();
    renderReportsPreview();
}

function applyReportFilters() {
    renderReportsPreview();
}

function renderReportsPreview() {
    const filters = {
        dateFrom:   document.getElementById('rpt-filter-from').value,
        dateTo:     document.getElementById('rpt-filter-to').value,
        supplierId: document.getElementById('rpt-filter-supplier').value,
        status:     document.getElementById('rpt-filter-status').value,
    };

    const orders = DB.getOrdersByFilters(filters);
    orders.sort((a, b) => new Date(b.order_date) - new Date(a.order_date));
    const total = orders.reduce((s, o) => s + (parseFloat(o.amount) || 0), 0);

    document.getElementById('rpt-total').innerHTML =
        `<span>${orders.length} order${orders.length !== 1 ? 's' : ''} found</span>` +
        `<span class="rpt-total-amount">Total: <strong>৳${total.toLocaleString()}</strong></span>`;

    const tbody = document.getElementById('reports-tbody');
    if (orders.length === 0) {
        tbody.innerHTML = `
            <tr><td colspan="7" class="empty-cell">
                <div class="empty-state">
                    <div class="empty-icon">📊</div>
                    <p>No orders match the selected filters.</p>
                </div>
            </td></tr>`;
        safeIcons();
        return;
    }

    tbody.innerHTML = orders.map((order, i) => `
        <tr>
            <td>${i + 1}</td>
            <td><code class="order-id">${order.id}</code></td>
            <td>${esc(order.supplier_name)}</td>
            <td>${formatDate(order.order_date)}</td>
            <td>${order.delivery_date ? formatDate(order.delivery_date) : '—'}</td>
            <td class="amount-cell">৳${Number(order.amount || 0).toLocaleString()}</td>
            <td>${badgeHTML(order.status, 'order')}</td>
        </tr>`).join('');

    safeIcons();
}

// ============================================================
// EXPORT — PDF
// ============================================================
function exportPDF() {
    try {
        const filters = getReportFilters();
        const orders  = DB.getOrdersByFilters(filters);
        orders.sort((a, b) => new Date(b.order_date) - new Date(a.order_date));

        if (orders.length === 0) { showToast('No orders to export.', 'error'); return; }
        if (!window.jspdf || !window.jspdf.jsPDF) {
            showToast('PDF export is unavailable right now. Please refresh and try again.', 'error');
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 166, 178);
        doc.text('Khan Supplier Order Tracking', 14, 16);
        doc.setFontSize(13);
        doc.setTextColor(40, 40, 40);
        doc.text('Supplier Order & Delivery Report', 14, 24);

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(110);
        doc.text(`Generated: ${new Date().toLocaleString('en-GB')}`, 14, 31);
        if (filters.dateFrom || filters.dateTo) {
            doc.text(`Period: ${filters.dateFrom || 'All time'} — ${filters.dateTo || 'Present'}`, 14, 36);
        }
        if (filters.status) {
            doc.text(`Status: ${filters.status.charAt(0).toUpperCase() + filters.status.slice(1)}`, 14, 41);
        }

        const total = orders.reduce((s, o) => s + (parseFloat(o.amount) || 0), 0);
        doc.setTextColor(0);

        const startY = (filters.dateFrom || filters.status) ? 46 : 38;

        doc.autoTable({
            startY,
            head: [['#', 'Order ID', 'Supplier', 'Order Date', 'Delivery Date', 'Amount (BDT)', 'Status', 'Remarks']],
            body: orders.map((o, i) => [
                i + 1,
                o.id,
                o.supplier_name,
                o.order_date,
                o.delivery_date || '—',
                Number(o.amount || 0).toLocaleString(),
                o.status.charAt(0).toUpperCase() + o.status.slice(1),
                (o.remarks || '').slice(0, 45),
            ]),
            foot: [['', '', '', '', 'GRAND TOTAL', total.toLocaleString(), '', '']],
            styles:              { fontSize: 8.5, cellPadding: 3.5, valign: 'middle' },
            headStyles:          { fillColor: [0, 166, 178], textColor: 255, fontStyle: 'bold', fontSize: 9 },
            footStyles:          { fillColor: [230, 235, 240], fontStyle: 'bold', textColor: 20 },
            alternateRowStyles:  { fillColor: [248, 250, 252] },
            columnStyles:        {
                0: { cellWidth: 10, halign: 'center' },
                5: { halign: 'right' },
                3: { halign: 'center' },
                4: { halign: 'center' },
            },
            margin:    { left: 14, right: 14 },
            tableWidth:'auto',
        });

        const pageCount = doc.internal.getNumberOfPages();
        for (let p = 1; p <= pageCount; p++) {
            doc.setPage(p);
            doc.setFontSize(8);
            doc.setTextColor(160);
            doc.text(`Page ${p} of ${pageCount}`, doc.internal.pageSize.getWidth() - 14, doc.internal.pageSize.getHeight() - 8, { align: 'right' });
        }

        doc.save(`Khan_Supplier_Order_Tracking_Report_${new Date().toISOString().split('T')[0]}.pdf`);
        showToast('✓ PDF exported successfully!');
    } catch (err) {
        showToast('PDF export failed. Please try again.', 'error');
        console.error('PDF export error:', err);
    }
}

// ============================================================
// EXPORT — EXCEL
// ============================================================
function exportExcel() {
    try {
        const filters = getReportFilters();
        const orders  = DB.getOrdersByFilters(filters);
        orders.sort((a, b) => new Date(b.order_date) - new Date(a.order_date));

        if (orders.length === 0) { showToast('No orders to export.', 'error'); return; }
        if (!window.XLSX || !window.XLSX.utils || !window.XLSX.writeFile) {
            showToast('Excel export is unavailable right now. Please refresh and try again.', 'error');
            return;
        }

        const total  = orders.reduce((s, o) => s + (parseFloat(o.amount) || 0), 0);
        const period = `${filters.dateFrom || 'All time'} — ${filters.dateTo || 'Present'}`;

        const wsData = [
            ['Khan — Supplier Order & Delivery Report'],
            [`Generated: ${new Date().toLocaleString('en-GB')}`],
            [`Period: ${period}`],
            [],
            ['#', 'Order ID', 'Supplier', 'Order Date', 'Delivery Date', 'Amount (BDT)', 'Status', 'Remarks'],
            ...orders.map((o, i) => [
                i + 1,
                o.id,
                o.supplier_name,
                o.order_date,
                o.delivery_date || '',
                parseFloat(o.amount) || 0,
                o.status,
                o.remarks || '',
            ]),
            [],
            ['', '', '', '', 'GRAND TOTAL', total, '', ''],
        ];

        const ws = XLSX.utils.aoa_to_sheet(wsData);

        ws['!cols'] = [
            { wch: 4  },
            { wch: 9  },
            { wch: 26 },
            { wch: 13 },
            { wch: 15 },
            { wch: 16 },
            { wch: 12 },
            { wch: 50 },
        ];

        ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Orders Report');
        XLSX.writeFile(wb, `KP_Supplier_Order_Tracking_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
        showToast('✓ Excel file exported successfully!');
    } catch (err) {
        showToast('Excel export failed. Please try again.', 'error');
        console.error('Excel export error:', err);
    }
}

function getReportFilters() {
    return {
        dateFrom:   document.getElementById('rpt-filter-from').value,
        dateTo:     document.getElementById('rpt-filter-to').value,
        supplierId: document.getElementById('rpt-filter-supplier').value,
        status:     document.getElementById('rpt-filter-status').value,
    };
}

// ============================================================
// MODAL BUTTON WIRING
// ============================================================
function setupModalButtons() {
    // Settings modal
    document.getElementById('btn-close-settings-modal').addEventListener('click', closeSettingsModal);
    document.getElementById('btn-save-settings').addEventListener('click', saveSettings);
    document.getElementById('btn-disconnect-cloud').addEventListener('click', disconnectCloud);

    // Supplier modal
    document.getElementById('btn-add-supplier').addEventListener('click', () => openSupplierModal());
    document.getElementById('btn-close-supplier-modal').addEventListener('click', closeSupplierModal);
    document.getElementById('btn-cancel-supplier').addEventListener('click', closeSupplierModal);
    document.getElementById('btn-save-supplier').addEventListener('click', saveSupplier);
    document.getElementById('supplier-search').addEventListener('input', renderSuppliers);

    // Order modal
    document.getElementById('btn-add-order').addEventListener('click', () => openOrderModal());
    document.getElementById('btn-close-order-modal').addEventListener('click', closeOrderModal);
    document.getElementById('btn-cancel-order').addEventListener('click', closeOrderModal);
    document.getElementById('btn-save-order').addEventListener('click', saveOrder);

    // Order filters
    document.getElementById('btn-apply-order-filter').addEventListener('click', applyOrderFilters);
    document.getElementById('btn-clear-order-filter').addEventListener('click', clearOrderFilters);

    // Confirm delete
    document.getElementById('btn-cancel-confirm').addEventListener('click', closeConfirmModal);
    document.getElementById('btn-confirm-delete').addEventListener('click', () => {
        if (AppState.confirmCallback) AppState.confirmCallback();
    });

    // Report filters
    document.getElementById('btn-apply-report-filter').addEventListener('click', applyReportFilters);

    // Export buttons
    document.getElementById('btn-export-pdf').addEventListener('click', exportPDF);
    document.getElementById('btn-export-excel').addEventListener('click', exportExcel);

    // Close modals on backdrop click
    ['supplier-modal', 'order-modal', 'confirm-modal', 'settings-modal'].forEach(id => {
        document.getElementById(id).addEventListener('click', e => {
            if (e.target.id === id) {
                if (id === 'supplier-modal') closeSupplierModal();
                else if (id === 'order-modal') closeOrderModal();
                else if (id === 'settings-modal') closeSettingsModal();
                else closeConfirmModal();
            }
        });
    });

    // Close modals with Escape key
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            if (!document.getElementById('supplier-modal').classList.contains('hidden')) closeSupplierModal();
            else if (!document.getElementById('order-modal').classList.contains('hidden')) closeOrderModal();
            else if (!document.getElementById('settings-modal').classList.contains('hidden')) closeSettingsModal();
            else if (!document.getElementById('confirm-modal').classList.contains('hidden')) closeConfirmModal();
        }
    });

    // Enter key in forms
    document.getElementById('supplier-form').addEventListener('keydown', e => {
        if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); saveSupplier(); }
    });
    document.getElementById('order-form').addEventListener('keydown', e => {
        if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); saveOrder(); }
    });
    document.getElementById('settings-form').addEventListener('keydown', e => {
        if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); saveSettings(); }
    });
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================
function formatDate(dateStr) {
    if (!dateStr) return '—';
    try {
        return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', {
            day: '2-digit', month: 'short', year: 'numeric'
        });
    } catch { return dateStr; }
}

function badgeHTML(status, _type) {
    const MAP = {
        pending:    ['badge-pending',    'Pending'],
        delivered:  ['badge-delivered',  'Delivered'],
        cancelled:  ['badge-cancelled',  'Cancelled'],
        processing: ['badge-processing', 'Processing'],
        active:     ['badge-active',     'Active'],
        inactive:   ['badge-inactive',   'Inactive'],
    };
    const [cls, label] = MAP[status] || ['badge-pending', status];
    return `<span class="badge ${cls}">${label}</span>`;
}

function esc(str) {
    return String(str || '')
        .replace(/&/g,  '&amp;')
        .replace(/</g,  '&lt;')
        .replace(/>/g,  '&gt;')
        .replace(/"/g,  '&quot;')
        .replace(/'/g,  '&#39;');
}

function setValue(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val || '';
}

function hasActiveFilters(f) {
    return f.dateFrom || f.dateTo || f.supplierId || f.status;
}

function safeIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        try { window.lucide.createIcons(); } catch (e) { console.warn(e); }
    }
}
