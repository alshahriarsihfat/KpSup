const STORAGE = {
  initialized: 'kp_initialized',
  pin: 'kp_pin',
  suppliers: 'kp_suppliers',
  orders: 'kp_orders',
  supabaseUrl: 'kp_supabase_url',
  supabaseKey: 'kp_supabase_key'
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DEFAULT_PIN = '1234';
let currentView = 'dashboard';
let editingSupplierId = null;
let editingOrderId = null;
let currentPin = '';
let supabaseClient = null;
let realtimeChannel = null;
let cloudEnabled = false;
let cloudBusy = false;
let isApplyingRemoteChange = false;

function init() {
  if (!localStorage.getItem(STORAGE.initialized)) {
    seedData();
  }

  localStorage.setItem(STORAGE.pin, localStorage.getItem(STORAGE.pin) || DEFAULT_PIN);
  bindEvents();
  render();
  updateDate();
  showView('dashboard');
  initializeCloudSync();
}

function seedData() {
  const suppliers = [
    { id: 'sup-1', name: 'Rafiqul Islam', company: 'Beximco Pharma', phone: '01711-234567', email: 'rafiqul@beximco.com', address: 'Dhanmondi, Dhaka', visit_days: ['Monday', 'Wednesday', 'Friday'], status: 'active', notes: 'Reliable MPO with fast delivery.' },
    { id: 'sup-2', name: 'Abdul Karim', company: 'Square Pharmaceuticals', phone: '01812-345678', email: 'karim@squarepharma.com', address: 'Mohakhali, Dhaka', visit_days: ['Tuesday', 'Thursday'], status: 'active', notes: 'Great medical stock availability.' }
  ];

  const orders = [
    { id: 'ORD-1001', supplier_id: 'sup-1', supplier_name: 'Beximco Pharma', order_date: todayString(), delivery_date: nextDate(2), amount: 45000, paid_cash: 20000, paid_bank: 15000, due_amount: 10000, status: 'pending', verified: true, remarks: 'Vitamin stock and anti-fever medicines.' },
    { id: 'ORD-1002', supplier_id: 'sup-2', supplier_name: 'Square Pharmaceuticals', order_date: todayString(), delivery_date: nextDate(4), amount: 32000, paid_cash: 32000, paid_bank: 0, due_amount: 0, status: 'delivered', verified: true, remarks: 'Seclo and pantoprazole shipment.' }
  ];

  localStorage.setItem(STORAGE.suppliers, JSON.stringify(suppliers));
  localStorage.setItem(STORAGE.orders, JSON.stringify(orders));
  localStorage.setItem(STORAGE.initialized, 'true');
}

function bindEvents() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => showView(btn.dataset.view));
  });

  document.getElementById('lock-btn').addEventListener('click', lockApp);
  document.getElementById('add-btn').addEventListener('click', () => openQuickAdd());
  document.getElementById('add-supplier-btn').addEventListener('click', () => openSupplierModal());
  document.getElementById('add-order-btn').addEventListener('click', () => openOrderModal());
  document.getElementById('export-csv-btn').addEventListener('click', exportCsv);
  document.getElementById('close-modal-btn').addEventListener('click', closeModal);
  document.getElementById('modal').addEventListener('click', (e) => {
    if (e.target.id === 'modal') closeModal();
  });
  document.getElementById('reset-pin-btn').addEventListener('click', resetPin);
  document.getElementById('cloud-settings-btn').addEventListener('click', openCloudModal);
  document.getElementById('close-cloud-modal-btn').addEventListener('click', closeCloudModal);
  document.getElementById('save-cloud-btn').addEventListener('click', saveCloudConfig);
  document.getElementById('disconnect-cloud-btn').addEventListener('click', disconnectCloud);
  document.getElementById('cloud-settings-modal').addEventListener('click', (e) => {
    if (e.target.id === 'cloud-settings-modal') closeCloudModal();
  });

  document.getElementById('report-from').addEventListener('change', renderReports);
  document.getElementById('report-to').addEventListener('change', renderReports);
  document.getElementById('report-supplier').addEventListener('change', renderReports);
  document.getElementById('report-status').addEventListener('change', renderReports);

  buildPinPad();
}

function render() {
  renderDashboard();
  renderSuppliers();
  renderOrders();
  renderReports();
}

function showView(view) {
  currentView = view;
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.view === view));
  document.querySelectorAll('.view-panel').forEach(panel => panel.classList.toggle('active', panel.id === `${view}-view`));
  document.getElementById('page-title').textContent = view.charAt(0).toUpperCase() + view.slice(1);
  document.getElementById('add-btn').textContent = view === 'orders' ? '＋ Add Order' : view === 'suppliers' ? '＋ Add Supplier' : '＋ New';
}

function updateDate() {
  const today = new Date();
  document.getElementById('current-date').textContent = today.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'short', day: 'numeric'
  });
}

function renderDashboard() {
  const orders = getOrders();
  const suppliers = getSuppliers();
  const today = todayString();
  const todayOrders = orders.filter(o => o.order_date === today);
  const todayBill = todayOrders.reduce((sum, o) => sum + Number(o.amount || 0), 0);
  const todayVisitors = suppliers.filter(s => s.status === 'active' && (s.visit_days || []).includes(DAY_NAMES[new Date().getDay()]));
  const upcoming = getUpcomingDeliveries();

  document.getElementById('stat-orders').textContent = todayOrders.length;
  document.getElementById('stat-bill').textContent = `৳${todayBill.toLocaleString()}`;
  document.getElementById('stat-visitors').textContent = todayVisitors.length;
  document.getElementById('stat-deliveries').textContent = upcoming.length;

  document.getElementById('dashboard-deliveries').innerHTML = upcoming.length ? upcoming.map(item => `
    <div class="list-item">
      <div>
        <strong>${item.supplier_name}</strong>
        <small>${item.delivery_date} • ${item.status}</small>
      </div>
      <span>৳${Number(item.amount || 0).toLocaleString()}</span>
    </div>
  `).join('') : '<div class="list-item">No upcoming deliveries.</div>';

  document.getElementById('dashboard-visitors').innerHTML = todayVisitors.length ? todayVisitors.map(s => `
    <div class="list-item">
      <div>
        <strong>${s.name}</strong>
        <small>${s.company} • ${s.phone}</small>
      </div>
      <span>${s.visit_days.join(', ')}</span>
    </div>
  `).join('') : '<div class="list-item">No visitors scheduled today.</div>';
}

function renderSuppliers() {
  const suppliers = getSuppliers().sort((a, b) => a.name.localeCompare(b.name));
  const list = document.getElementById('suppliers-list');
  if (!suppliers.length) {
    list.innerHTML = '<div class="card">No suppliers yet.</div>';
    return;
  }

  list.innerHTML = suppliers.map(s => `
    <article class="card">
      <div class="panel-head">
        <h5>${s.name}</h5>
        <span class="badge">${s.status}</span>
      </div>
      <p><strong>${s.company}</strong></p>
      <p>${s.phone}</p>
      <p>${s.email}</p>
      <p>${s.address}</p>
      <p>Visit days: ${s.visit_days.join(', ') || '—'}</p>
      <p>${s.notes || ''}</p>
      <div class="actions" style="margin-top:10px;">
        <button class="secondary-btn" onclick="openSupplierModal('${s.id}')">Edit</button>
        <button class="ghost-btn" onclick="deleteSupplier('${s.id}')">Delete</button>
      </div>
    </article>
  `).join('');
}

function renderOrders() {
  const orders = getOrders().sort((a, b) => b.order_date.localeCompare(a.order_date));
  const container = document.getElementById('orders-list');
  if (!orders.length) {
    container.innerHTML = '<div class="card">No orders yet.</div>';
    return;
  }

  container.innerHTML = `
    <table>
      <thead><tr><th>ID</th><th>Supplier</th><th>Date</th><th>Delivery</th><th>Amount</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>
        ${orders.map(order => `
          <tr>
            <td>${order.id}</td>
            <td>${order.supplier_name}</td>
            <td>${order.order_date}</td>
            <td>${order.delivery_date}</td>
            <td>৳${Number(order.amount || 0).toLocaleString()}</td>
            <td>${order.status}</td>
            <td class="actions">
              <button class="secondary-btn" onclick="openOrderModal('${order.id}')">Edit</button>
              <button class="ghost-btn" onclick="deleteOrder('${order.id}')">Delete</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderReports() {
  const orders = getOrders();
  const suppliers = getSuppliers();
  const from = document.getElementById('report-from').value;
  const to = document.getElementById('report-to').value;
  const supplierId = document.getElementById('report-supplier').value;
  const status = document.getElementById('report-status').value;

  const filtered = orders.filter(order => {
    if (from && order.order_date < from) return false;
    if (to && order.order_date > to) return false;
    if (supplierId && order.supplier_id !== supplierId) return false;
    if (status && order.status !== status) return false;
    return true;
  });

  const total = filtered.reduce((sum, order) => sum + Number(order.amount || 0), 0);
  document.getElementById('report-summary').innerHTML = `
    <div><strong>${filtered.length}</strong> orders found</div>
    <div><strong>৳${total.toLocaleString()}</strong> total value</div>
  `;

  const reportSupplierSelect = document.getElementById('report-supplier');
  if (!reportSupplierSelect.dataset.ready) {
    reportSupplierSelect.innerHTML = '<option value="">All suppliers</option>' + suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    reportSupplierSelect.dataset.ready = 'true';
  }

  document.getElementById('reports-table').innerHTML = `
    <table>
      <thead><tr><th>Order</th><th>Supplier</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead>
      <tbody>
        ${filtered.length ? filtered.map(order => `
          <tr>
            <td>${order.id}</td>
            <td>${order.supplier_name}</td>
            <td>${order.order_date}</td>
            <td>৳${Number(order.amount || 0).toLocaleString()}</td>
            <td>${order.status}</td>
          </tr>
        `).join('') : '<tr><td colspan="5">No data yet.</td></tr>'}
      </tbody>
    </table>
  `;
}

function openQuickAdd() {
  if (currentView === 'orders') openOrderModal();
  else if (currentView === 'suppliers') openSupplierModal();
  else showToast('Choose Suppliers or Orders to add data.');
}

function openSupplierModal(id = null) {
  editingSupplierId = id;
  const supplier = getSuppliers().find(item => item.id === id) || null;
  const fields = [
    { label: 'Name', name: 'name', type: 'text', value: supplier?.name || '' },
    { label: 'Company', name: 'company', type: 'text', value: supplier?.company || '' },
    { label: 'Phone', name: 'phone', type: 'text', value: supplier?.phone || '' },
    { label: 'Email', name: 'email', type: 'email', value: supplier?.email || '' },
    { label: 'Address', name: 'address', type: 'text', value: supplier?.address || '' },
    { label: 'Status', name: 'status', type: 'select', value: supplier?.status || 'active', options: ['active', 'inactive'] },
    { label: 'Visit Days', name: 'visit_days', type: 'checkboxes', value: supplier?.visit_days || [] },
    { label: 'Notes', name: 'notes', type: 'textarea', value: supplier?.notes || '' }
  ];
  renderModalForm(fields, 'Supplier');
}

function openOrderModal(id = null) {
  editingOrderId = id;
  const order = getOrders().find(item => item.id === id) || null;
  const suppliers = getSuppliers();
  const fields = [
    { label: 'Supplier', name: 'supplier_id', type: 'select', value: order?.supplier_id || '', options: suppliers.map(s => ({ value: s.id, label: s.name })) },
    { label: 'Order Date', name: 'order_date', type: 'date', value: order?.order_date || todayString() },
    { label: 'Delivery Date', name: 'delivery_date', type: 'date', value: order?.delivery_date || nextDate(2) },
    { label: 'Amount', name: 'amount', type: 'number', value: order?.amount || 0 },
    { label: 'Paid Cash', name: 'paid_cash', type: 'number', value: order?.paid_cash || 0 },
    { label: 'Paid Bank', name: 'paid_bank', type: 'number', value: order?.paid_bank || 0 },
    { label: 'Status', name: 'status', type: 'select', value: order?.status || 'pending', options: ['pending', 'delivered', 'cancelled'] },
    { label: 'Verified', name: 'verified', type: 'checkbox', value: !!order?.verified },
    { label: 'Remarks', name: 'remarks', type: 'textarea', value: order?.remarks || '' }
  ];
  renderModalForm(fields, 'Order');
}

function renderModalForm(fields, title) {
  document.getElementById('modal-title').textContent = editingSupplierId ? `Edit ${title}` : editingOrderId ? `Edit ${title}` : `Add ${title}`;
  const form = document.getElementById('modal-form');
  form.innerHTML = `
    <div class="form-grid">
      ${fields.map(field => renderField(field)).join('')}
    </div>
    <div class="form-actions">
      <button type="button" class="ghost-btn" id="cancel-modal-btn">Cancel</button>
      <button type="submit" class="primary-btn">Save</button>
    </div>
  `;
  form.addEventListener('submit', handleFormSubmit);
  document.getElementById('cancel-modal-btn').addEventListener('click', closeModal);
  openModal();
}

function renderField(field) {
  const base = `<div class="field${field.type === 'textarea' || field.type === 'checkboxes' ? ' full' : ''}">`;
  if (field.type === 'textarea') {
    return `${base}<label>${field.label}</label><textarea name="${field.name}" rows="3">${escapeHtml(field.value || '')}</textarea></div>`;
  }
  if (field.type === 'checkbox') {
    return `${base}<label><input type="checkbox" name="${field.name}" ${field.value ? 'checked' : ''} /> ${field.label}</label></div>`;
  }
  if (field.type === 'checkboxes') {
    const options = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
    return `${base}<label>${field.label}</label><div class="checkbox-group">${options.map(day => `<label><input type="checkbox" name="visit_days" value="${day}" ${field.value.includes(day) ? 'checked' : ''} /> ${day}</label>`).join('')}</div></div>`;
  }
  if (field.type === 'select') {
    const options = Array.isArray(field.options) ? field.options : [];
    const selectOptions = options.length ? options.map(option => typeof option === 'string' ? `<option value="${option}" ${option === field.value ? 'selected' : ''}>${option}</option>` : `<option value="${option.value}" ${option.value === field.value ? 'selected' : ''}>${option.label}</option>`).join('') : '';
    return `${base}<label>${field.label}</label><select name="${field.name}">${selectOptions}</select></div>`;
  }
  return `${base}<label>${field.label}</label><input type="${field.type}" name="${field.name}" value="${escapeHtml(field.value || '')}" /></div>`;
}

function handleFormSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.target);
  const data = Object.fromEntries(formData.entries());
  const visitDays = formData.getAll('visit_days');

  if (editingSupplierId) {
    updateSupplier(editingSupplierId, { ...data, visit_days: visitDays });
    showToast('Supplier updated.');
  } else if (editingOrderId) {
    updateOrder(editingOrderId, { ...data, verified: formData.get('verified') === 'on' });
    showToast('Order updated.');
  } else if (event.target.querySelector('select[name="supplier_id"]')) {
    addOrder({ ...data, verified: formData.get('verified') === 'on', visit_days: visitDays, supplier_name: getSupplier(data.supplier_id)?.name || '' });
    showToast('Order added.');
  } else {
    addSupplier({ ...data, visit_days: visitDays });
    showToast('Supplier added.');
  }

  closeModal();
  render();
}

function addSupplier(data) {
  const suppliers = getSuppliers();
  const supplier = { id: `sup-${Date.now()}`, ...data, created_at: new Date().toISOString() };
  suppliers.push(supplier);
  localStorage.setItem(STORAGE.suppliers, JSON.stringify(suppliers));
  syncLocalCopyToCloud();
}

function updateSupplier(id, data) {
  const suppliers = getSuppliers();
  const index = suppliers.findIndex(item => item.id === id);
  if (index >= 0) {
    suppliers[index] = { ...suppliers[index], ...data, visit_days: data.visit_days || suppliers[index].visit_days };
    localStorage.setItem(STORAGE.suppliers, JSON.stringify(suppliers));
    syncLocalCopyToCloud();
  }
}

function deleteSupplier(id) {
  if (!confirm('Delete this supplier?')) return;
  const suppliers = getSuppliers().filter(item => item.id !== id);
  const orders = getOrders().filter(order => order.supplier_id !== id);
  localStorage.setItem(STORAGE.suppliers, JSON.stringify(suppliers));
  localStorage.setItem(STORAGE.orders, JSON.stringify(orders));
  render();
  syncLocalCopyToCloud();
  showToast('Supplier removed.');
}

function addOrder(data) {
  const orders = getOrders();
  const order = {
    id: `ORD-${String(orders.length + 1001).padStart(4, '0')}`,
    ...data,
    amount: Number(data.amount || 0),
    paid_cash: Number(data.paid_cash || 0),
    paid_bank: Number(data.paid_bank || 0),
    due_amount: Math.max(0, Number(data.amount || 0) - (Number(data.paid_cash || 0) + Number(data.paid_bank || 0))),
    status: data.status || 'pending',
    verified: !!data.verified,
    created_at: new Date().toISOString()
  };
  order.supplier_name = getSupplier(order.supplier_id)?.name || '';
  orders.push(order);
  localStorage.setItem(STORAGE.orders, JSON.stringify(orders));
  syncLocalCopyToCloud();
}

function updateOrder(id, data) {
  const orders = getOrders();
  const index = orders.findIndex(item => item.id === id);
  if (index >= 0) {
    orders[index] = {
      ...orders[index],
      ...data,
      amount: Number(data.amount || orders[index].amount || 0),
      paid_cash: Number(data.paid_cash || orders[index].paid_cash || 0),
      paid_bank: Number(data.paid_bank || orders[index].paid_bank || 0),
      due_amount: Math.max(0, Number(data.amount || orders[index].amount || 0) - (Number(data.paid_cash || orders[index].paid_cash || 0) + Number(data.paid_bank || orders[index].paid_bank || 0))),
      status: data.status || orders[index].status,
      verified: data.verified !== undefined ? !!data.verified : orders[index].verified,
      supplier_name: getSupplier(data.supplier_id || orders[index].supplier_id)?.name || orders[index].supplier_name
    };
    localStorage.setItem(STORAGE.orders, JSON.stringify(orders));
    syncLocalCopyToCloud();
  }
}

function deleteOrder(id) {
  if (!confirm('Delete this order?')) return;
  const orders = getOrders().filter(item => item.id !== id);
  localStorage.setItem(STORAGE.orders, JSON.stringify(orders));
  render();
  syncLocalCopyToCloud();
  showToast('Order removed.');
}

function exportCsv() {
  const orders = getOrders();
  const rows = [['Order ID', 'Supplier', 'Date', 'Delivery', 'Amount', 'Status']];
  orders.forEach(order => rows.push([order.id, order.supplier_name, order.order_date, order.delivery_date, order.amount, order.status]));
  const csv = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'orders.csv';
  a.click();
  URL.revokeObjectURL(url);
  showToast('CSV exported.');
}

function openModal() {
  document.getElementById('modal').classList.remove('hidden');
}

function closeModal() {
  editingSupplierId = null;
  editingOrderId = null;
  document.getElementById('modal').classList.add('hidden');
  document.getElementById('modal-form').innerHTML = '';
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => toast.classList.remove('show'), 2200);
}

function resetPin() {
  localStorage.setItem(STORAGE.pin, DEFAULT_PIN);
  currentPin = '';
  updatePinDots();
  showToast('PIN reset to 1234.');
}

function buildPinPad() {
  const pad = document.getElementById('pin-pad');
  const digits = ['1','2','3','4','5','6','7','8','9','⌫','0','✓'];
  digits.forEach(digit => {
    const button = document.createElement('button');
    button.className = 'pin-key';
    button.textContent = digit;
    button.addEventListener('click', () => handlePinInput(digit));
    pad.appendChild(button);
  });
}

function handlePinInput(value) {
  const error = document.getElementById('pin-error');
  if (value === '⌫') {
    currentPin = currentPin.slice(0, -1);
  } else if (value === '✓') {
    if (currentPin === localStorage.getItem(STORAGE.pin)) {
      document.getElementById('pin-overlay').classList.add('hidden');
      document.getElementById('app-shell').classList.remove('hidden');
      currentPin = '';
      error.textContent = '';
      return;
    }
    error.textContent = 'Incorrect PIN';
    currentPin = '';
  } else {
    currentPin += value;
    if (currentPin.length >= 4) {
      if (currentPin === localStorage.getItem(STORAGE.pin)) {
        document.getElementById('pin-overlay').classList.add('hidden');
        document.getElementById('app-shell').classList.remove('hidden');
        currentPin = '';
        error.textContent = '';
        return;
      }
      error.textContent = 'Incorrect PIN';
      currentPin = '';
    }
  }
  updatePinDots();
}

function updatePinDots() {
  const dots = Array.from({ length: 4 }, (_, i) => `<span class="pin-dot ${currentPin.length > i ? 'active' : ''}"></span>`).join('');
  document.getElementById('pin-dots').innerHTML = dots;
}

function lockApp() {
  currentPin = '';
  updatePinDots();
  document.getElementById('pin-overlay').classList.remove('hidden');
  document.getElementById('app-shell').classList.add('hidden');
  document.getElementById('pin-error').textContent = '';
}

function openCloudModal() {
  document.getElementById('cloud-url').value = localStorage.getItem(STORAGE.supabaseUrl) || '';
  document.getElementById('cloud-key').value = localStorage.getItem(STORAGE.supabaseKey) || '';
  document.getElementById('cloud-settings-modal').classList.remove('hidden');
}

function closeCloudModal() {
  document.getElementById('cloud-settings-modal').classList.add('hidden');
}

function saveCloudConfig() {
  const url = document.getElementById('cloud-url').value.trim();
  const key = document.getElementById('cloud-key').value.trim();
  if (!url || !key) {
    showToast('Please enter both URL and anon key.');
    return;
  }
  localStorage.setItem(STORAGE.supabaseUrl, url);
  localStorage.setItem(STORAGE.supabaseKey, key);
  closeCloudModal();
  initializeCloudSync();
  showToast('Cloud sync enabled.');
}

function disconnectCloud() {
  localStorage.removeItem(STORAGE.supabaseUrl);
  localStorage.removeItem(STORAGE.supabaseKey);
  cloudEnabled = false;
  updateCloudStatus('Local only');
  if (realtimeChannel) {
    supabaseClient?.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
  supabaseClient = null;
  closeCloudModal();
  showToast('Cloud sync disconnected.');
}

function initializeCloudSync() {
  const url = localStorage.getItem(STORAGE.supabaseUrl) || '';
  const key = localStorage.getItem(STORAGE.supabaseKey) || '';
  if (!url || !key || !window.supabase) {
    cloudEnabled = false;
    updateCloudStatus('Local only');
    return;
  }

  cloudEnabled = true;
  supabaseClient = window.supabase.createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  updateCloudStatus('Connecting...');

  loadFromCloud();
  subscribeToRealtime();
}

async function loadFromCloud() {
  if (!supabaseClient || !cloudEnabled) return;
  try {
    const [{ data: suppliers }, { data: orders }] = await Promise.all([
      supabaseClient.from('suppliers').select('*').order('created_at', { ascending: true }),
      supabaseClient.from('orders').select('*').order('created_at', { ascending: true })
    ]);

    if (Array.isArray(suppliers) && suppliers.length) {
      localStorage.setItem(STORAGE.suppliers, JSON.stringify(suppliers));
    }
    if (Array.isArray(orders) && orders.length) {
      localStorage.setItem(STORAGE.orders, JSON.stringify(orders));
    }
    render();
    updateCloudStatus('Realtime ready');
  } catch (error) {
    updateCloudStatus(`Cloud error: ${error.message}`);
  }
}

function subscribeToRealtime() {
  if (!supabaseClient || !cloudEnabled) return;
  if (realtimeChannel) {
    supabaseClient.removeChannel(realtimeChannel);
  }

  realtimeChannel = supabaseClient.channel('kp-sync');
  realtimeChannel.on('postgres_changes', { event: '*', schema: 'public', table: 'suppliers' }, payload => applyRemoteChange('suppliers', payload));
  realtimeChannel.on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, payload => applyRemoteChange('orders', payload));
  realtimeChannel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      updateCloudStatus('Realtime ready');
    } else if (status === 'CHANNEL_ERROR') {
      updateCloudStatus('Realtime error');
    }
  });
}

function applyRemoteChange(table, payload) {
  if (isApplyingRemoteChange) return;
  isApplyingRemoteChange = true;
  try {
    const data = payload.new || payload.old;
    const list = table === 'suppliers' ? getSuppliers() : getOrders();

    if (payload.eventType === 'DELETE' && data?.id) {
      const next = list.filter(item => item.id !== data.id);
      if (table === 'suppliers') localStorage.setItem(STORAGE.suppliers, JSON.stringify(next));
      else localStorage.setItem(STORAGE.orders, JSON.stringify(next));
    } else if (data?.id) {
      const next = list.filter(item => item.id !== data.id);
      next.push(data);
      if (table === 'suppliers') localStorage.setItem(STORAGE.suppliers, JSON.stringify(next));
      else localStorage.setItem(STORAGE.orders, JSON.stringify(next));
    }

    render();
  } finally {
    setTimeout(() => { isApplyingRemoteChange = false; }, 120);
  }
}

async function syncLocalCopyToCloud() {
  if (!supabaseClient || !cloudEnabled || cloudBusy) return;
  cloudBusy = true;
  try {
    const suppliers = getSuppliers();
    const orders = getOrders();
    await Promise.all([
      Promise.all(suppliers.map(item => supabaseClient.from('suppliers').upsert({ ...item, updated_at: new Date().toISOString() }).select())),
      Promise.all(orders.map(item => supabaseClient.from('orders').upsert({ ...item, updated_at: new Date().toISOString() }).select()))
    ]);
    updateCloudStatus('Synced');
  } catch (error) {
    updateCloudStatus(`Sync failed: ${error.message}`);
  } finally {
    cloudBusy = false;
  }
}

function updateCloudStatus(message) {
  const status = document.getElementById('cloud-status');
  if (status) status.textContent = message;
}

function getSuppliers() { return JSON.parse(localStorage.getItem(STORAGE.suppliers) || '[]'); }
function getSupplier(id) { return getSuppliers().find(item => item.id === id) || null; }
function getOrders() { return JSON.parse(localStorage.getItem(STORAGE.orders) || '[]'); }
function getUpcomingDeliveries() {
  const today = new Date();
  const end = new Date(today); end.setDate(today.getDate() + 7);
  return getOrders()
    .filter(order => order.status !== 'cancelled' && order.delivery_date)
    .filter(order => {
      const date = new Date(order.delivery_date);
      return date >= today && date <= end;
    })
    .sort((a, b) => new Date(a.delivery_date) - new Date(b.delivery_date));
}
function todayString() { return new Date().toISOString().split('T')[0]; }
function nextDate(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

window.addEventListener('DOMContentLoaded', init);
