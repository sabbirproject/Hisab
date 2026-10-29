/* GD Expense Tracker — preferences, local data store, calculations.
   Personal mode  -> IndexedDB "gdet-personal"           (never leaves the device)
   Shared mode    -> IndexedDB "gdet-shared-<workspace>"  (cache + outbox, synced via Apps Script) */
(function () {
  'use strict';
  var GD = (window.GD = window.GD || {});
  var U = GD.U, DB = GD.DB;
  var ENT = ['transactions', 'accounts', 'categories', 'transfers', 'budgets', 'recurring'];

  /* ---------------- preferences (localStorage, light settings only) ---------------- */
  var DEF = {
    mode: '', appName: 'GD Expense Tracker', currency: 'INR', dateFmt: 'dd/mm/yyyy', theme: 'light', compact: false,
    thresholds: [75, 90, 100], syncSec: 60, view: 'list', serverUrl: '', wsId: '', wsName: '', role: '', keyLabel: '',
    remember: true, installDismissed: false, sharedSeen: false
  };
  var memPrefs = null;
  function readLS(k, store) { try { return (store || localStorage).getItem(k); } catch (e) { return null; } }
  function writeLS(k, v, store) { try { (store || localStorage).setItem(k, v); } catch (e) {} }
  function delLS(k, store) { try { (store || localStorage).removeItem(k); } catch (e) {} }
  var Prefs = {
    all: function () {
      if (memPrefs) return memPrefs;
      var o = {}; try { o = JSON.parse(readLS('gdet.prefs') || '{}') || {}; } catch (e) {}
      memPrefs = Object.assign({}, DEF, o); return memPrefs;
    },
    get: function (k) { return Prefs.all()[k]; },
    set: function (k, v) {
      var p = Prefs.all();
      if (typeof k === 'object') Object.assign(p, k); else p[k] = v;
      writeLS('gdet.prefs', JSON.stringify(p));
    },
    reset: function () { memPrefs = null; delLS('gdet.prefs'); },
    getKey: function () { return readLS('gdet.key') || readLS('gdet.key', sessionStorage) || ''; },
    setKey: function (key, remember) {
      delLS('gdet.key'); delLS('gdet.key', sessionStorage);
      if (!key) return;
      if (remember) writeLS('gdet.key', key); else writeLS('gdet.key', key, sessionStorage);
    }
  };

  /* ---------------- defaults ---------------- */
  var slug = function (s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); };
  var INC = [['Salary', '💼'], ['Business Income', '🏪'], ['Freelance', '💻'], ['Interest', '🏦'], ['Gift Received', '🎁'], ['Refund', '↩️'], ['Other Income', '➕']];
  var EXP = [['Food', '🍽️'], ['Grocery', '🛒'], ['Transport', '🚌'], ['Bills & Utilities', '💡'], ['Rent', '🏠'], ['Education', '🎓'], ['Health', '🏥'], ['Shopping', '🛍️'], ['Entertainment', '🎬'], ['Travel', '✈️'], ['Business Expense', '🧾'], ['EMI & Loan Payment', '💳'], ['Family', '👨‍👩‍👧'], ['Other Expense', '📦']];
  function defaultCategories() {
    var out = [];
    INC.forEach(function (c, i) { out.push({ id: 'cat_inc_' + slug(c[0]), type: 'income', name: c[0], icon: c[1], order: i, active: true }); });
    EXP.forEach(function (c, i) { out.push({ id: 'cat_exp_' + slug(c[0]), type: 'expense', name: c[0], icon: c[1], order: i, active: true }); });
    return out;
  }
  function defaultAccounts() {
    return [
      { id: 'acc_cash', name: 'Cash', type: 'cash', opening: 0, active: true },
      { id: 'acc_bank', name: 'Bank Account', type: 'bank', opening: 0, active: true },
      { id: 'acc_upi', name: 'UPI', type: 'upi', opening: 0, active: true }
    ];
  }
  var METHODS = ['Cash', 'UPI', 'Debit Card', 'Credit Card', 'Net Banking', 'Bank Transfer', 'Cheque', 'Wallet', 'Other'];
  var ACC_TYPES = [['cash', 'Cash'], ['bank', 'Bank Account'], ['upi', 'UPI'], ['credit', 'Credit Card'], ['savings', 'Savings Account'], ['wallet', 'Digital Wallet']];

  /* ---------------- store ---------------- */
  var st = { mode: '', ws: null, db: null, d: {}, outbox: [], cursor: 0, listeners: [], memoryOnly: false, opN: 0 };
  ENT.forEach(function (e) { st.d[e] = []; });
  var Store = { ENT: ENT, METHODS: METHODS, ACC_TYPES: ACC_TYPES, defaults: { categories: defaultCategories, accounts: defaultAccounts } };

  Store.on = function (fn) { st.listeners.push(fn); };
  function emit(kind) { st.listeners.forEach(function (fn) { try { fn(kind || 'data'); } catch (e) { console.error(e); } }); }
  Store.emit = emit;
  Object.defineProperty(Store, 'mode', { get: function () { return st.mode; } });
  Object.defineProperty(Store, 'ws', { get: function () { return st.ws; } });
  Object.defineProperty(Store, 'cursor', { get: function () { return st.cursor; } });
  Object.defineProperty(Store, 'memoryOnly', { get: function () { return st.memoryOnly; } });
  Object.defineProperty(Store, 'outbox', { get: function () { return st.outbox; } });
  Object.defineProperty(Store, 'db', { get: function () { return st.db; } });
  Store.readOnly = function () { return st.mode === 'shared' && st.ws && st.ws.role === 'viewer'; };

  Store.open = function (mode, ws) {
    if (st.db) st.db.close();
    var name = mode === 'shared' ? 'gdet-shared-' + ws.id : 'gdet-personal';
    return DB.open(name).then(function (db) {
      st.db = db; st.mode = mode; st.ws = mode === 'shared' ? ws : null; st.memoryOnly = !!db.memory;
      return Promise.all(ENT.map(function (e) { return db.all(e); }).concat([db.all('outbox'), db.get('meta', 'cursor'), db.get('meta', 'seeded')]));
    }).then(function (r) {
      ENT.forEach(function (e, i) { st.d[e] = r[i]; });
      st.outbox = r[ENT.length].sort(U.byKey('n'));
      st.opN = st.outbox.reduce(function (m, o) { return Math.max(m, o.n || 0); }, 0);
      st.cursor = (r[ENT.length + 1] && r[ENT.length + 1].v) || 0;
      var seeded = r[ENT.length + 2] && r[ENT.length + 2].v;
      if (mode === 'personal' && !seeded && !st.d.categories.length) return Store.seed();
    }).then(function () { emit('open'); });
  };
  Store.seed = function () {
    var cats = defaultCategories(), accs = defaultAccounts(), now = Date.now();
    cats.concat(accs).forEach(function (r) { r.createdAt = now; r.updatedAt = now; });
    return Store.saveMany('categories', cats).then(function () { return Store.saveMany('accounts', accs); })
      .then(function () { return st.db.put('meta', { k: 'seeded', v: 1 }); });
  };
  Store.needsSeed = function () { return st.mode === 'shared' && !st.d.categories.length && !st.d.accounts.length; };

  Store.live = function (e) { return st.d[e].filter(function (r) { return !r.deleted; }); };
  Store.get = function (e, id) { for (var i = 0; i < st.d[e].length; i++) if (st.d[e][i].id === id) return st.d[e][i]; return null; };
  Store.all = function (e) { return st.d[e]; };

  function putMem(e, rec) {
    var a = st.d[e], i = a.findIndex(function (r) { return r.id === rec.id; });
    if (i >= 0) a[i] = rec; else a.push(rec);
  }
  function delMem(e, id) { st.d[e] = st.d[e].filter(function (r) { return r.id !== id; }); }

  function enqueue(e, rec) {
    var op = st.outbox.find(function (o) { return o.recId === rec.id && o.entity === e; });
    if (op) { if (op.status === 'failed') { op.status = 'pending'; op.error = ''; } return st.db.put('outbox', op); }
    op = { id: U.uid('op'), n: ++st.opN, entity: e, recId: rec.id, baseV: rec.v || 0, status: 'pending', error: '' };
    st.outbox.push(op); return st.db.put('outbox', op);
  }
  Store.opFor = function (recId) { return st.outbox.find(function (o) { return o.recId === recId; }) || null; };

  Store.save = function (e, rec) {
    if (Store.readOnly()) return Promise.reject(new Error('This access key is read-only (viewer).'));
    var now = Date.now(); rec.updatedAt = now; if (!rec.createdAt) rec.createdAt = now;
    putMem(e, rec);
    var p = st.db.put(e, rec);
    if (st.mode === 'shared') p = p.then(function () { return enqueue(e, rec); });
    return p.then(function () { emit('data'); return rec; });
  };
  Store.saveMany = function (e, recs) {
    var now = Date.now();
    recs.forEach(function (r) { r.updatedAt = now; if (!r.createdAt) r.createdAt = now; putMem(e, r); });
    var p = st.db.putMany(e, recs);
    if (st.mode === 'shared') p = p.then(function () { return recs.reduce(function (pp, r) { return pp.then(function () { return enqueue(e, r); }); }, Promise.resolve()); });
    return p.then(function () { emit('data'); });
  };
  Store.remove = function (e, rec) {
    if (Store.readOnly()) return Promise.reject(new Error('This access key is read-only (viewer).'));
    if (st.mode === 'personal' || !rec.v) { // never synced -> just forget it
      delMem(e, rec.id);
      var op = Store.opFor(rec.id);
      var p = st.db.del(e, rec.id);
      if (op) { st.outbox = st.outbox.filter(function (o) { return o.id !== op.id; }); p = p.then(function () { return st.db.del('outbox', op.id); }); }
      return p.then(function () { return st.db.del('blobs', 'rcpt_' + rec.id); }).then(function () { emit('data'); });
    }
    rec.deleted = true; rec.deletedAt = Date.now(); return Store.save(e, rec);
  };

  /* ---- sync hooks (used by api.js) ---- */
  Store.setCursor = function (c) { st.cursor = c; return st.db.put('meta', { k: 'cursor', v: c }); };
  Store.markSeeded = function () { return st.db.put('meta', { k: 'seeded', v: 1 }); };
  Store.sendable = function (n) { return st.outbox.filter(function (o) { return o.status === 'pending'; }).slice(0, n || 50); };
  Store.pendingCount = function () { return st.outbox.filter(function (o) { return o.status === 'pending'; }).length; };
  Store.failedOps = function () { return st.outbox.filter(function (o) { return o.status !== 'pending'; }); };
  Store.saveOp = function (op) { return st.db.put('outbox', op); };
  Store.delOp = function (id) { st.outbox = st.outbox.filter(function (o) { return o.id !== id; }); return st.db.del('outbox', id); };
  Store.putLocal = function (e, rec) { putMem(e, rec); return st.db.put(e, rec); };
  Store.dropLocal = function (e, id) { delMem(e, id); return st.db.del(e, id); };
  Store.blob = function (id) { return st.db.get('blobs', id); };
  Store.putBlob = function (id, data) { return st.db.put('blobs', { id: id, data: data }); };
  Store.delBlob = function (id) { return st.db.del('blobs', id); };

  /* replace everything (import "replace", clear data) */
  Store.clearAll = function () {
    return Promise.all(DB.STORES.filter(function (s) { return s !== 'meta'; }).map(function (s) { return st.db.clear(s); })).then(function () {
      ENT.forEach(function (e) { st.d[e] = []; }); st.outbox = [];
      return Store.setCursor(0);
    }).then(function () { emit('data'); });
  };

  /* ---------------- selectors & calculations ---------------- */
  var C = (Store.calc = {});
  C.cat = function (id) { return Store.get('categories', id); };
  C.acc = function (id) { return Store.get('accounts', id); };
  C.cats = function (type, activeOnly) {
    return Store.live('categories').filter(function (c) { return (!type || c.type === type) && (!activeOnly || c.active !== false); }).sort(function (a, b) { return (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name); });
  };
  C.accs = function (activeOnly) {
    return Store.live('accounts').filter(function (a) { return !activeOnly || a.active !== false; }).sort(function (a, b) { return a.name.localeCompare(b.name); });
  };
  C.txs = function () { return Store.live('transactions'); };
  C.paid = function () { return C.txs().filter(function (t) { return t.status !== 'pending'; }); };
  C.inRange = function (list, from, to) { return list.filter(function (t) { return (!from || t.date >= from) && (!to || t.date <= to); }); };
  C.total = function (list, type) { return U.sum(list.filter(function (t) { return t.type === type; }), function (t) { return t.amount; }); };
  C.opening = function () { return U.sum(C.accs(), function (a) { return a.opening || 0; }); };
  C.balance = function () { return (U.minor(C.opening()) + U.minor(C.total(C.paid(), 'income')) - U.minor(C.total(C.paid(), 'expense'))) / 100; };
  C.accBalance = function (accId) {
    var a = C.acc(accId), t = U.minor(a ? a.opening || 0 : 0);
    C.paid().forEach(function (x) { if (x.accountId === accId) t += (x.type === 'income' ? 1 : -1) * U.minor(x.amount); });
    Store.live('transfers').forEach(function (x) { if (x.toAccountId === accId) t += U.minor(x.amount); if (x.fromAccountId === accId) t -= U.minor(x.amount); });
    return t / 100;
  };
  C.groupBy = function (list, keyFn) {
    var m = {}; list.forEach(function (t) { var k = keyFn(t); m[k] = (m[k] || 0) + U.minor(t.amount); });
    return Object.keys(m).map(function (k) { return { key: k, v: m[k] / 100 }; }).sort(function (a, b) { return b.v - a.v; });
  };
  C.budget = function (ym) {
    var recs = Store.live('budgets');
    var exact = recs.find(function (b) { return b.month === ym; });
    if (exact) return { rec: exact, from: ym };
    var def = recs.find(function (b) { return b.month === 'default'; });
    if (def) return { rec: def, from: 'default' };
    var prev = recs.filter(function (b) { return b.month !== 'default' && b.month < ym; }).sort(U.byKey('month', -1))[0];
    return prev ? { rec: prev, from: prev.month } : { rec: null, from: null };
  };
  C.monthSummary = function (ym) {
    var l = C.inRange(C.paid(), U.monthStart(ym), U.monthEnd(ym));
    var inc = C.total(l, 'income'), exp = C.total(l, 'expense');
    return { inc: inc, exp: exp, net: (U.minor(inc) - U.minor(exp)) / 100, count: l.length };
  };
  C.nextDate = function (iso, freq) {
    return freq === 'daily' ? U.addDays(iso, 1) : freq === 'weekly' ? U.addDays(iso, 7) : freq === 'yearly' ? U.addMonths(iso, 12) : U.addMonths(iso, 1);
  };
  C.isUsedCat = function (id) { return C.txs().some(function (t) { return t.categoryId === id; }) || Store.live('recurring').some(function (r) { return r.categoryId === id; }); };
  C.isUsedAcc = function (id) { return C.txs().some(function (t) { return t.accountId === id; }) || Store.live('transfers').some(function (t) { return t.fromAccountId === id || t.toAccountId === id; }) || Store.live('recurring').some(function (r) { return r.accountId === id; }); };

  /* generate due recurring transactions. Deterministic ids => several devices never create duplicates. */
  Store.runRecurring = function () {
    if (Store.readOnly()) return Promise.resolve(0);
    var today = U.today(), made = 0, jobs = [];
    Store.live('recurring').forEach(function (r) {
      if (!r.active) return;
      var n = 0, cur = r.next, changed = false;
      while (cur && cur <= today && n < 36) {
        var id = 'rtx_' + r.id + '_' + cur;
        if (!Store.get('transactions', id)) {
          jobs.push(['transactions', { id: id, type: r.type, amount: r.amount, currency: Prefs.get('currency'), categoryId: r.categoryId, accountId: r.accountId, date: cur, time: '', description: r.description || '', paymentMethod: r.paymentMethod || '', status: 'paid', recId: r.id, tags: '' }]);
          made++;
        }
        cur = C.nextDate(cur, r.freq); n++; changed = true;
      }
      if (changed) { r.next = cur; jobs.push(['recurring', r]); }
    });
    return jobs.reduce(function (p, j) { return p.then(function () { return Store.save(j[0], j[1]); }); }, Promise.resolve()).then(function () { return made; });
  };

  GD.Prefs = Prefs; GD.Store = Store;
})();
