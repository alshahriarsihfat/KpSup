// =============================================
// db.js — Data & Realtime Sync Layer
// KP Supplier Order Tracking System
// =============================================

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ---- SAMPLE DATA ----
const SAMPLE_SUPPLIERS = [
    {
        id: 'sup1',
        name: 'Rafiqul Islam (MPO)',
        company: 'Beximco Pharma',
        phone: '01711-234567',
        email: 'info@beximco.com',
        address: 'Dhanmondi, Dhaka',
        visit_days: ['Sunday', 'Wednesday'],
        status: 'active',
        notes: 'Reliable pharmaceutical MPO.',
        created_at: new Date(Date.now() - 30 * 86400000).toISOString()
    },
    {
        id: 'sup2',
        name: 'Abdul Karim (MPO)',
        company: 'Square Pharmaceuticals',
        phone: '01812-345678',
        email: 'contact@squarepharma.com',
        address: 'Mohakhali, Dhaka',
        visit_days: ['Monday', 'Thursday'],
        status: 'active',
        notes: 'High-quality medicine MPO.',
        created_at: new Date(Date.now() - 20 * 86400000).toISOString()
    },
    {
        id: 'sup3',
        name: 'Mahmud Hasan (MPO)',
        company: 'Incepta Pharmaceuticals',
        phone: '01611-456789',
        email: 'sales@inceptapharma.com',
        address: 'Tejgaon, Dhaka',
        visit_days: ['Tuesday', 'Friday'],
        status: 'active',
        notes: 'Vaccine and generic medicine MPO.',
        created_at: new Date(Date.now() - 10 * 86400000).toISOString()
    },
    {
        id: 'sup4',
        name: 'Kamal Uddin (MPO)',
        company: 'ACI Limited',
        phone: '01911-567890',
        email: 'sales@aci.com',
        address: 'Tejgaon, Dhaka',
        visit_days: ['Wednesday', 'Saturday'],
        status: 'active',
        notes: 'Consumer healthcare and OTC MPO.',
        created_at: new Date(Date.now() - 5 * 86400000).toISOString()
    }
];

function generateSampleOrders() {
    const today = new Date();
    const fmt = (d) => d.toISOString().split('T')[0];
    const off = (n) => new Date(today.getTime() + n * 86400000);

    return [
        {
            id: 'O001',
            supplier_id: 'sup1',
            supplier_name: 'Beximco Pharma',
            order_date: fmt(today),
            delivery_date: fmt(off(1)),
            amount: 45000,
            paid_cash: 10000,
            paid_bank: 25000,
            due_amount: 10000,
            payment_status: 'partial',
            verified: true,
            status: 'pending',
            remarks: 'Napa 500mg - 10,000 pcs, Amoxicillin 500mg - 5,000 pcs',
            created_at: today.toISOString()
        },
        {
            id: 'O002',
            supplier_id: 'sup2',
            supplier_name: 'Square Pharmaceuticals',
            order_date: fmt(today),
            delivery_date: fmt(off(2)),
            amount: 32000,
            paid_cash: 32000,
            paid_bank: 0,
            due_amount: 0,
            payment_status: 'paid',
            verified: true,
            status: 'pending',
            remarks: 'Seclo 20mg - 2,000 pcs, Pantoprazole 40mg - 1,000 pcs',
            created_at: today.toISOString()
        },
        {
            id: 'O003',
            supplier_id: 'sup3',
            supplier_name: 'Incepta Pharmaceuticals',
            order_date: fmt(off(-3)),
            delivery_date: fmt(off(3)),
            amount: 28500,
            paid_cash: 5000,
            paid_bank: 10000,
            due_amount: 13500,
            payment_status: 'partial',
            verified: false,
            status: 'pending',
            remarks: 'Vitamin C 500mg - 3,000 pcs, Zinc tablet - 2,000 pcs',
            created_at: off(-3).toISOString()
        },
        {
            id: 'O004',
            supplier_id: 'sup4',
            supplier_name: 'ACI Limited',
            order_date: fmt(off(-7)),
            delivery_date: fmt(off(-1)),
            amount: 18000,
            paid_cash: 18000,
            paid_bank: 0,
            due_amount: 0,
            payment_status: 'paid',
            verified: true,
            status: 'delivered',
            remarks: 'ORS Saline - 50 pcs, Antiseptic cream - 200 tubes',
            created_at: off(-7).toISOString()
        }
    ];
}

// =============================================
// DB Object — Hybrid LocalStorage & Supabase Realtime
// =============================================
const DB = {
    supabaseClient: null,
    realtimeSubscription: null,
    realtimeConnected: false,
    backupConfigured: false,
    cloudReady: false,
    onDataChangeCallback: null,

    _get(key) {
        try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
    },

    _set(key, data) {
        localStorage.setItem(key, JSON.stringify(data));
        this._notifyChange();
    },

    _generateId(prefix) {
        return (prefix || '') + Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
    },

    _notifyChange() {
        if (typeof this.onDataChangeCallback === 'function') {
            this.onDataChangeCallback();
        }
    },

    // ---- SUPABASE CLOUD SETUP ----
    getSupabaseConfig() {
        return {
            url: localStorage.getItem('pharma_sb_url') || '',
            key: localStorage.getItem('pharma_sb_key') || ''
        };
    },

    setSupabaseConfig(url, key) {
        if (url && key) {
            localStorage.setItem('pharma_sb_url', url.trim());
            localStorage.setItem('pharma_sb_key', key.trim());
            this.backupConfigured = true;
            this.cloudReady = false;
            localStorage.setItem('pharma_backup_ready', 'false');
            this.initSupabase();
        } else {
            localStorage.removeItem('pharma_sb_url');
            localStorage.removeItem('pharma_sb_key');
            localStorage.setItem('pharma_backup_ready', 'false');
            this.supabaseClient = null;
            this.backupConfigured = false;
            this.cloudReady = false;
        }
        this._notifyChange();
    },

    isCloudConnected() {
        return this.backupConfigured && this.cloudReady && !!this.supabaseClient;
    },

    getSupabaseBaseUrl() {
        const { url } = this.getSupabaseConfig();
        return url ? url.replace(/\/$/, '') : '';
    },

    getSupabaseHeaders() {
        const { key } = this.getSupabaseConfig();
        return {
            apikey: key,
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json'
        };
    },

    getSafeSupabaseColumns(table) {
        switch (table) {
            case 'suppliers':
                return ['id', 'name', 'company', 'phone', 'email', 'address', 'visit_days', 'status', 'notes', 'created_at', 'updated_at'];
            case 'orders':
                return ['id', 'supplier_id', 'supplier_name', 'order_date', 'delivery_date', 'amount', 'paid_cash', 'paid_bank', 'due_amount', 'payment_status', 'verified', 'status', 'remarks', 'created_at', 'updated_at'];
            default:
                return [];
        }
    },

    sanitizeSupabasePayload(table, payload) {
        const allowed = this.getSafeSupabaseColumns(table);
        if (!allowed.length) return payload;

        const normalizeDate = (value) => {
            if (!value) return null;
            if (typeof value === 'string') {
                const trimmed = value.trim();
                if (!trimmed) return null;
                const parsed = new Date(trimmed);
                if (!Number.isNaN(parsed.getTime())) {
                    return parsed.toISOString().split('T')[0];
                }
                return trimmed;
            }
            if (value instanceof Date) {
                return value.toISOString().split('T')[0];
            }
            return value;
        };

        const normalizeTimestamp = (value) => {
            if (!value) return null;
            if (typeof value === 'string') {
                const trimmed = value.trim();
                if (!trimmed) return null;
                const parsed = new Date(trimmed);
                if (!Number.isNaN(parsed.getTime())) {
                    return parsed.toISOString();
                }
                return trimmed;
            }
            if (value instanceof Date) {
                return value.toISOString();
            }
            return value;
        };

        const normalizeNumber = (value) => {
            if (value === null || value === undefined || value === '') return 0;
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : 0;
        };

        const normalizeBoolean = (value) => {
            if (typeof value === 'boolean') return value;
            if (value === 'true' || value === 1 || value === '1') return true;
            if (value === 'false' || value === 0 || value === '0') return false;
            return false;
        };

        const sanitizeItem = (item) => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
            const sanitized = {};
            Object.keys(item).forEach((key) => {
                if (!allowed.includes(key)) return;

                let value = item[key];
                if (key === 'order_date' || key === 'delivery_date') {
                    value = normalizeDate(value);
                } else if (key === 'created_at' || key === 'updated_at') {
                    value = normalizeTimestamp(value);
                } else if (key === 'amount' || key === 'paid_cash' || key === 'paid_bank' || key === 'due_amount') {
                    value = normalizeNumber(value);
                } else if (key === 'verified') {
                    value = normalizeBoolean(value);
                }

                if (value === undefined || value === null || value === '') {
                    if (key === 'amount' || key === 'paid_cash' || key === 'paid_bank' || key === 'due_amount') {
                        value = 0;
                    } else if (key === 'verified') {
                        value = false;
                    } else {
                        value = null;
                    }
                }
                sanitized[key] = value;
            });
            return sanitized;
        };

        if (Array.isArray(payload)) {
            return payload.map(sanitizeItem).filter(item => item && typeof item === 'object' && Object.keys(item).length > 0);
        }

        return sanitizeItem(payload);
    },

    async supabaseRequest(table, method = 'GET', body = null, query = '') {
        const baseUrl = this.getSupabaseBaseUrl();
        const headers = this.getSupabaseHeaders();
        if (!baseUrl || !headers.apikey) {
            return { data: null, error: new Error('Supabase credentials are not configured.') };
        }

        const url = `${baseUrl}/rest/v1/${table}${query}`;
        const options = { method, headers };
        const payload = body !== null ? this.sanitizeSupabasePayload(table, body) : body;

        if (payload !== null) {
            options.body = JSON.stringify(payload);
        }

        if (method !== 'GET' && method !== 'DELETE') {
            headers.Prefer = 'return=representation,resolution=merge-duplicates';
        }

        try {
            const response = await fetch(url, options);
            const text = await response.text();
            let data = null;
            if (text) {
                try { data = JSON.parse(text); } catch { data = text; }
            }

            if (!response.ok) {
                let detail = '';
                if (data && typeof data === 'object') {
                    detail = data.message || data.error || data.hint || '';
                } else if (typeof data === 'string') {
                    detail = data;
                }
                const suffix = detail ? ` - ${detail}` : '';
                return { data: null, error: new Error(`Supabase ${method} ${table} failed: ${response.status} ${response.statusText}${suffix}`) };
            }

            return { data, error: null };
        } catch (err) {
            return { data: null, error: err };
        }
    },

    initSupabase() {
        const { url, key } = this.getSupabaseConfig();
        this.realtimeConnected = false;

        if (url && key && window.supabase && window.supabase.createClient) {
            try {
                this.supabaseClient = window.supabase.createClient(url, key, {
                    auth: { persistSession: false, autoRefreshToken: false }
                });
                this.backupConfigured = true;
                this.cloudReady = localStorage.getItem('pharma_backup_ready') === 'true';
                if (this.cloudReady) {
                    this.syncFromCloud();
                }
                this.setupRealtime();
                console.log('⚡ Supabase backup ready.');
            } catch (err) {
                console.error('Supabase init error:', err);
                this.supabaseClient = null;
                this.backupConfigured = false;
                this.cloudReady = false;
            }
        } else {
            this.supabaseClient = null;
            this.backupConfigured = false;
            this.cloudReady = false;
        }
    },

    setupRealtime() {
        if (!this.supabaseClient || !this.cloudReady) return;
        try {
            if (this.realtimeSubscription) {
                this.supabaseClient.removeChannel(this.realtimeSubscription);
            }
            this.realtimeSubscription = this.supabaseClient
                .channel('supabase-realtime')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'suppliers' }, () => {
                    this.syncFromCloud();
                })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
                    this.syncFromCloud();
                })
                .subscribe((status) => {
                    if (status === 'SUBSCRIBED') {
                        this.realtimeConnected = true;
                        console.log('⚡ Realtime sync connected.');
                    } else {
                        this.realtimeConnected = false;
                    }
                });
        } catch (err) {
            console.warn('Realtime setup error:', err);
            this.realtimeConnected = false;
        }
    },

    async testCloudConnection() {
        const baseUrl = this.getSupabaseBaseUrl();
        const headers = this.getSupabaseHeaders();
        if (!baseUrl || !headers.apikey) {
            return { ok: false, message: 'Please enter your Supabase URL and Anon Key.' };
        }

        const probeId = `__cloud_probe_${Date.now()}`;
        const payload = {
            id: probeId,
            supplier_id: 'probe',
            supplier_name: 'probe',
            order_date: '2026-01-01',
            delivery_date: '2026-01-02',
            amount: 0,
            status: 'pending',
            remarks: 'probe'
        };

        try {
            const response = await fetch(`${baseUrl}/rest/v1/orders`, {
                method: 'POST',
                headers: {
                    ...headers,
                    Prefer: 'return=representation,resolution=merge-duplicates'
                },
                body: JSON.stringify(payload)
            });

            const text = await response.text();
            let detail = '';
            if (text) {
                try { detail = JSON.parse(text).message || JSON.parse(text).hint || ''; } catch { detail = text; }
            }

            if (!response.ok) {
                this.cloudReady = false;
                localStorage.setItem('pharma_backup_ready', 'false');
                return { ok: false, message: detail || 'Supabase is not accepting writes yet. Please run the setup SQL in the Supabase SQL Editor.' };
            }

            await fetch(`${baseUrl}/rest/v1/orders?id=eq.${encodeURIComponent(probeId)}`, {
                method: 'DELETE',
                headers
            });

            this.cloudReady = true;
            localStorage.setItem('pharma_backup_ready', 'true');
            return { ok: true, message: 'Cloud backup connected successfully.' };
        } catch (err) {
            this.cloudReady = false;
            localStorage.setItem('pharma_backup_ready', 'false');
            return { ok: false, message: err.message || 'Unable to reach Supabase.' };
        }
    },

    async pushLocalDataToCloud(retryCount = 0) {
        if (!this.supabaseClient || !this.cloudReady) return;
        try {
            const localSuppliers = this.getSuppliers();
            const localOrders = this.getOrders();

            for (const supplier of localSuppliers) {
                const { error: supError } = await this.supabaseRequest('suppliers', 'POST', supplier, '?on_conflict=id');
                if (supError) {
                    console.warn('Cloud backup skipped supplier:', supplier.id, supError.message);
                }
            }

            for (const order of localOrders) {
                const cloudItem = {
                    id: order.id,
                    supplier_id: order.supplier_id || null,
                    supplier_name: order.supplier_name || null,
                    order_date: order.order_date || null,
                    delivery_date: order.delivery_date || null,
                    amount: order.amount || 0,
                    paid_cash: order.paid_cash || 0,
                    paid_bank: order.paid_bank || 0,
                    due_amount: order.due_amount || 0,
                    payment_status: order.payment_status || 'unpaid',
                    verified: !!order.verified,
                    status: order.status || 'pending',
                    remarks: order.remarks || null,
                    created_at: order.created_at,
                    updated_at: order.updated_at || order.created_at
                };
                const { error: ordError } = await this.supabaseRequest('orders', 'POST', cloudItem, '?on_conflict=id');
                if (ordError) {
                    console.warn('Cloud backup skipped order:', order.id, ordError.message);
                }
            }
        } catch (err) {
            if (retryCount < 2) {
                console.warn('Cloud backup retrying...', err);
                await new Promise(resolve => setTimeout(resolve, 1000));
                return this.pushLocalDataToCloud(retryCount + 1);
            }
            console.warn('Cloud backup warning:', err);
        }
    },

    async syncFromCloud() {
        if (!this.supabaseClient || !this.cloudReady) return;
        try {
            const [{ data: suppliers, error: supErr }, { data: orders, error: ordErr }] = await Promise.all([
                this.supabaseRequest('suppliers', 'GET', null, '?select=*'),
                this.supabaseRequest('orders', 'GET', null, '?select=*')
            ]);

            if (supErr) {
                console.warn('Supabase fetch suppliers error:', supErr);
            } else if (suppliers && suppliers.length > 0) {
                localStorage.setItem('pharma_suppliers', JSON.stringify(suppliers));
            }

            if (ordErr) {
                console.warn('Supabase fetch orders error:', ordErr);
            } else if (orders && orders.length > 0) {
                localStorage.setItem('pharma_orders', JSON.stringify(orders));
            }

            await this.pushLocalDataToCloud();

            this._notifyChange();
        } catch (err) {
            console.warn('Sync from cloud error:', err);
        }
    },

    // ---- INIT ----
    init() {
        if (!localStorage.getItem('pharma_v3_initialized')) {
            this._set('pharma_suppliers', SAMPLE_SUPPLIERS);
            this._set('pharma_orders', generateSampleOrders());
            localStorage.setItem('pharma_v3_initialized', 'true');
        }
        this.initSupabase();
    },

    reset() {
        ['pharma_v3_initialized', 'pharma_suppliers', 'pharma_orders'].forEach(k => localStorage.removeItem(k));
        this.init();
    },

    // ---- SUPPLIERS ----
    getSuppliers() { return this._get('pharma_suppliers'); },
    getSupplier(id) { return this.getSuppliers().find(s => s.id === id) || null; },

    async addSupplier(data) {
        const list = this.getSuppliers();
        const item = { ...data, id: this._generateId('s'), created_at: new Date().toISOString() };
        list.push(item);
        this._set('pharma_suppliers', list);

        if (this.supabaseClient && this.cloudReady) {
            try {
                await this.supabaseRequest('suppliers', 'POST', item, '?on_conflict=id');
                this.realtimeConnected = true;
            } catch (e) { console.error(e); }
        }
        return item;
    },

    async updateSupplier(id, data) {
        const list = this.getSuppliers();
        const idx = list.findIndex(s => s.id === id);
        if (idx === -1) return null;
        list[idx] = { ...list[idx], ...data, updated_at: new Date().toISOString() };
        this._set('pharma_suppliers', list);

        if (this.supabaseClient && this.cloudReady) {
            try {
                await this.supabaseRequest('suppliers', 'POST', { ...list[idx], ...data, updated_at: new Date().toISOString() }, '?on_conflict=id');
            } catch (e) { console.error(e); }
        }
        return list[idx];
    },

    async deleteSupplier(id) {
        this._set('pharma_suppliers', this.getSuppliers().filter(s => s.id !== id));
        if (this.supabaseClient) {
            try { await this.supabaseRequest('suppliers', 'DELETE', null, `?id=eq.${encodeURIComponent(id)}`); } catch (e) { console.error(e); }
        }
        return true;
    },

    // ---- ORDERS ----
    getOrders() { return this._get('pharma_orders'); },
    getOrder(id) { return this.getOrders().find(o => o.id === id) || null; },

    _normalizeOrderPayment(data) {
        const total = parseFloat(data.amount) || 0;
        const cash  = parseFloat(data.paid_cash) || 0;
        const bank  = parseFloat(data.paid_bank) || 0;
        const due   = Math.max(0, total - (cash + bank));
        const payment_status = due === 0 ? 'paid' : (cash + bank) > 0 ? 'partial' : 'unpaid';

        return {
            ...data,
            amount: total,
            paid_cash: cash,
            paid_bank: bank,
            due_amount: due,
            payment_status,
            verified: !!data.verified
        };
    },

    async addOrder(data) {
        const list = this.getOrders();
        const num = String(list.length + 1).padStart(3, '0');
        const normalized = this._normalizeOrderPayment(data);
        const item = { ...normalized, id: 'O' + num, created_at: new Date().toISOString() };
        list.push(item);
        this._set('pharma_orders', list);

        if (this.supabaseClient && this.cloudReady) {
            try {
                const cloudItem = {
                    id: item.id,
                    supplier_id: item.supplier_id || null,
                    supplier_name: item.supplier_name || null,
                    order_date: item.order_date || null,
                    delivery_date: item.delivery_date || null,
                    amount: item.amount || 0,
                    status: item.status || 'pending',
                    remarks: item.remarks || null,
                    created_at: item.created_at,
                    updated_at: item.updated_at || item.created_at
                };
                await this.supabaseRequest('orders', 'POST', cloudItem, '?on_conflict=id');
                this.realtimeConnected = true;
            } catch (e) { console.error(e); }
        }
        return item;
    },

    async updateOrder(id, data) {
        const list = this.getOrders();
        const idx = list.findIndex(o => o.id === id);
        if (idx === -1) return null;

        const normalized = this._normalizeOrderPayment({ ...list[idx], ...data });
        list[idx] = normalized;
        this._set('pharma_orders', list);

        if (this.supabaseClient && this.cloudReady) {
            try {
                const cloudItem = {
                    id: normalized.id,
                    supplier_id: normalized.supplier_id || null,
                    supplier_name: normalized.supplier_name || null,
                    order_date: normalized.order_date || null,
                    delivery_date: normalized.delivery_date || null,
                    amount: normalized.amount || 0,
                    status: normalized.status || 'pending',
                    remarks: normalized.remarks || null,
                    created_at: normalized.created_at,
                    updated_at: normalized.updated_at || new Date().toISOString()
                };
                await this.supabaseRequest('orders', 'POST', cloudItem, '?on_conflict=id');
            } catch (e) { console.error(e); }
        }
        return list[idx];
    },

    async toggleVerification(id) {
        const order = this.getOrder(id);
        if (!order) return null;
        return await this.updateOrder(id, { verified: !order.verified });
    },

    async clearOrderDue(id, additionalCash = 0, additionalBank = 0) {
        const order = this.getOrder(id);
        if (!order) return null;
        const newCash = (parseFloat(order.paid_cash) || 0) + (parseFloat(additionalCash) || 0);
        const newBank = (parseFloat(order.paid_bank) || 0) + (parseFloat(additionalBank) || 0);
        return await this.updateOrder(id, { paid_cash: newCash, paid_bank: newBank });
    },

    async deleteOrder(id) {
        this._set('pharma_orders', this.getOrders().filter(o => o.id !== id));
        if (this.supabaseClient) {
            try { await this.supabaseRequest('orders', 'DELETE', null, `?id=eq.${encodeURIComponent(id)}`); } catch (e) { console.error(e); }
        }
        return true;
    },

    // ---- DASHBOARD & DUE HELPERS ----
    getTodayOrdersCount() {
        const todayStr = new Date().toISOString().split('T')[0];
        return this.getOrders().filter(o => o.order_date === todayStr && o.status !== 'cancelled').length;
    },

    getTodayOrdersBillTotal() {
        const todayStr = new Date().toISOString().split('T')[0];
        return this.getOrders()
            .filter(o => o.order_date === todayStr && o.status !== 'cancelled')
            .reduce((sum, o) => sum + (parseFloat(o.amount) || 0), 0);
    },

    getTodayVisitors() {
        const today = DAYS_OF_WEEK[new Date().getDay()];
        return this.getSuppliers().filter(s => s.status === 'active' && (s.visit_days || []).includes(today));
    },

    getVisitorsForDay(dayName) {
        return this.getSuppliers().filter(s => s.status === 'active' && (s.visit_days || []).includes(dayName));
    },

    getUpcomingDeliveries(days = 7) {
        const todayMs = new Date().setHours(0, 0, 0, 0);
        const endMs = todayMs + days * 86400000;
        return this.getOrders()
            .filter(o => {
                if (o.status === 'delivered' || o.status === 'cancelled') return false;
                if (!o.delivery_date) return false;
                const dMs = new Date(o.delivery_date + 'T00:00:00').getTime();
                return dMs >= todayMs && dMs <= endMs;
            })
            .sort((a, b) => new Date(a.delivery_date) - new Date(b.delivery_date));
    },

    getDueOrders() {
        return this.getOrders()
            .filter(o => o.status !== 'cancelled' && (parseFloat(o.due_amount) || 0) > 0)
            .sort((a, b) => (parseFloat(b.due_amount) || 0) - (parseFloat(a.due_amount) || 0));
    },

    getTotalDueAmount() {
        return this.getOrders()
            .filter(o => o.status !== 'cancelled')
            .reduce((sum, o) => sum + (parseFloat(o.due_amount) || 0), 0);
    },

    getTotalCashPaid() {
        return this.getOrders()
            .filter(o => o.status !== 'cancelled')
            .reduce((sum, o) => sum + (parseFloat(o.paid_cash) || 0), 0);
    },

    getTotalBankPaid() {
        return this.getOrders()
            .filter(o => o.status !== 'cancelled')
            .reduce((sum, o) => sum + (parseFloat(o.paid_bank) || 0), 0);
    },

    getOrdersByFilters({ dateFrom, dateTo, supplierId, status } = {}) {
        return this.getOrders().filter(o => {
            if (dateFrom && o.order_date < dateFrom) return false;
            if (dateTo   && o.order_date > dateTo)   return false;
            if (supplierId && o.supplier_id !== supplierId) return false;
            if (status && o.status !== status) return false;
            return true;
        });
    },

    // ---- PIN AUTH ----
    getPIN()          { return localStorage.getItem('pharma_pin') || '1234'; },
    setPIN(pin)       { localStorage.setItem('pharma_pin', pin); },
    isAuthenticated() { return sessionStorage.getItem('pharma_auth') === 'true'; },
    authenticate()    { sessionStorage.setItem('pharma_auth', 'true'); },
    logout()          { sessionStorage.removeItem('pharma_auth'); },
};
