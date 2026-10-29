/* GD Expense Tracker — app shell, welcome, dashboard, transactions, add/edit form */
(function () {
  'use strict';
  var GD = (window.GD = window.GD || {});
  var U = GD.U, Store = GD.Store, Sync = GD.Sync, P = GD.Prefs, C = Store.calc, esc = U.esc;
  var App = (GD.App = { month: U.ym(U.today()), txf: null, txShown: 30, ownerSecret: '', assets: {}, deferredInstall: null, view: '', booted: false });
  function resetFilters() { App.txf = { q: '', type: 'all', from: '', to: '', cat: '', method: '', acc: '', sort: 'new', status: 'all' }; App.txShown = 30; }
  resetFilters();
  App.resetFilters = resetFilters;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  App.$ = $; App.$$ = $$;

  /* ---------------- icons ---------------- */
  var IC = {
    home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    chart: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
    settings: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
    down: '<line x1="17" y1="7" x2="7" y2="17"/><polyline points="17 17 7 17 7 7"/>',
    up: '<line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/>',
    wallet: '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    pie: '<path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>',
    cal: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    refresh: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15"/>',
    search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    filter: '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
    grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    right: '<polyline points="9 18 15 12 9 6"/>',
    left: '<polyline points="15 18 9 12 15 6"/>',
    cloud: '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>',
    cloudoff: '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/><line x1="1" y1="1" x2="23" y2="23"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    key: '<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>',
    dl: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    ul: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
    repeat: '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    print: '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
    swap: '<polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/>',
    clip: '<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
    alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    tag: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
    folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
    pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    arrowup: '<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>',
    arrowdown: '<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>'
  };
  function ic(n, cls) { return '<svg class="i ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + (IC[n] || '') + '</svg>'; }
  App.ic = ic;

  /* ---------------- formatting helpers ---------------- */
  App.money = function (n, o) { return U.money(n, P.get('currency'), o); };
  App.dt = function (iso) { return U.fmtDate(iso, P.get('dateFmt')); };
  var money = App.money, dt = App.dt;
  App.catIcon = function (c) { if (!c) return '❓'; return c.iconImg ? '<img src="' + esc(c.iconImg) + '" alt="" width="26" height="26" style="border-radius:7px;object-fit:cover">' : esc(c.icon || '🏷️'); };
  var catName = function (id) { var c = C.cat(id); return c ? c.name : 'Uncategorised'; };
  var accName = function (id) { var a = C.acc(id); return a ? a.name : '—'; };

  /* ---------------- toast / dialog ---------------- */
  App.toast = function (msg, type, ms) {
    var box = $('#toasts'); if (!box) return;
    var el = document.createElement('div'); el.className = 'toast ' + (type || 'good'); el.textContent = msg; box.appendChild(el);
    setTimeout(function () { el.remove(); }, ms || 3800);
  };
  App.dialog = function (html, mount) {
    var d = document.createElement('dialog'); d.innerHTML = '<div class="dlg">' + html + '</div>';
    document.body.appendChild(d);
    var api = { el: d, close: function () { try { d.close(); } catch (e) {} d.remove(); } };
    d.addEventListener('cancel', function () { setTimeout(function () { d.remove(); }, 0); });
    d.addEventListener('click', function (e) { var b = e.target.closest('[data-dclose]'); if (b) api.close(); });
    if (d.showModal) d.showModal(); else d.setAttribute('open', '');
    if (mount) mount(d, api);
    return api;
  };
  App.confirm = function (title, text, okLabel, danger) {
    return new Promise(function (res) {
      var done = false;
      var api = App.dialog('<h3>' + esc(title) + '</h3><div>' + text + '</div><div class="btnrow"><button class="btn sec" data-r="0">Cancel</button><button class="btn ' + (danger ? 'danger' : '') + '" data-r="1">' + esc(okLabel || 'OK') + '</button></div>', function (d) {
        d.addEventListener('click', function (e) { var b = e.target.closest('[data-r]'); if (b) { done = true; api.close(); res(b.dataset.r === '1'); } });
        d.addEventListener('close', function () { if (!done) res(false); });
      });
    });
  };
  App.nav = function (hash) { if (location.hash === hash) render(); else location.hash = hash; };

  /* ---------------- theme & assets ---------------- */
  function applyTheme() {
    var t = P.get('theme'); if (t === 'auto') t = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.dataset.theme = t; document.documentElement.dataset.compact = P.get('compact') ? '1' : '0';
    var m = $('meta[name="theme-color"]'); if (m) m.content = t === 'dark' ? '#050c1d' : '#04122e';
  }
  App.applyTheme = applyTheme;
  var appDb = null;
  function loadAssets() {
    return GD.DB.open('gdet-app').then(function (db) { appDb = db; return db.all('blobs'); }).then(function (list) {
      App.assets = {}; list.forEach(function (b) { App.assets[b.id] = b.data; }); applyAssets();
    });
  }
  App.saveAsset = function (k, data) { App.assets[k] = data; applyAssets(); return appDb.put('blobs', { id: k, data: data }); };
  App.delAsset = function (k) { delete App.assets[k]; applyAssets(); return appDb.del('blobs', k); };
  var LOGO = 'icons/logo-mark.png';
  if (window.GD_CONFIG && window.GD_CONFIG.LOGO_MARK) LOGO = window.GD_CONFIG.LOGO_MARK;
  App.logoSrc = function () { return App.assets.logo || LOGO; };
  App.fullLogoSrc = function () { return App.assets.welcome || (window.GD_CONFIG && window.GD_CONFIG.LOGO_FULL) || 'icons/logo-full.png'; };
  function applyAssets() {
    var f = $('#favicon'); if (f && App.assets.favicon) f.href = App.assets.favicon;
    var a = $('#appleicon'); if (a && App.assets.icon) a.href = App.assets.icon;
    $$('img[data-logo]').forEach(function (i) { i.src = App.logoSrc(); });
  }

  /* ---------------- shell ---------------- */
  var NAV = [['home', 'Home', 'home'], ['tx', 'Transactions', 'list'], ['add', 'Add', 'plus'], ['reports', 'Reports', 'chart'], ['settings', 'Settings', 'settings']];
  function shell() {
    var name = esc(P.get('appName'));
    var side = NAV.map(function (n) { return '<a class="nl" href="#/' + n[0] + '" data-nav="' + n[0] + '">' + ic(n[2]) + n[1] + '</a>'; }).join('');
    var nav = NAV.map(function (n) {
      return n[0] === 'add' ? '<a class="add" href="#/add" data-nav="add" aria-label="Add transaction"><span class="fab">' + ic('plus') + '</span></a>'
        : '<a href="#/' + n[0] + '" data-nav="' + n[0] + '">' + ic(n[2]) + n[1] + '</a>';
    }).join('');
    $('#root').innerHTML = '<div class="app"><aside class="side"><a class="logo" href="#/home"><img data-logo src="' + esc(App.logoSrc()) + '" alt=""><div><b>' + name + '</b><span>GD Tech Academy</span></div></a>' + side + '<div class="foot">v' + esc((window.GD_CONFIG && window.GD_CONFIG.VERSION) || '1.0.0') + '</div></aside>' +
      '<div class="main"><div id="banners"></div><header class="top"><a class="brand" href="#/home"><img data-logo src="' + esc(App.logoSrc()) + '" alt=""><div><b>' + name + '</b><span>GD Tech Academy</span></div></a><span class="spacer"></span><span id="modechip"></span><button class="chip" id="syncbtn" data-act="sync" aria-label="Sync status"></button><a class="iconbtn" href="#/settings" aria-label="Settings">' + ic('settings') + '</a></header>' +
      '<main class="content" id="view" tabindex="-1"></main></div><nav class="nav" aria-label="Main navigation">' + nav + '</nav><div id="toasts" role="status" aria-live="polite"></div></div>';
  }
  function chrome() {
    var shared = Store.mode === 'shared';
    var mc = $('#modechip'); if (mc) mc.innerHTML = shared ? '<span class="chip shared" title="Shared workspace">' + ic('cloud') + ' SHARED · ' + esc((Store.ws && Store.ws.name) || '') + '</span>' : '<span class="chip local" title="Data stays on this device">' + ic('lock') + ' LOCAL MODE</span>';
    var sb = $('#syncbtn'); if (sb) {
      sb.classList.toggle('hide', !shared);
      var s = Sync.status, pend = Store.pendingCount(), bad = Store.failedOps().length, label;
      if (s.state === 'syncing') label = ic('refresh', 'spin') + ' Syncing…';
      else if (s.state === 'offline') label = ic('cloudoff') + ' Offline' + (pend ? ' · ' + pend + ' pending' : '');
      else if (s.state === 'error' || s.state === 'auth') label = ic('alert') + ' Sync error';
      else label = ic('check') + ' ' + (s.last ? 'Synced ' + new Date(s.last).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Not synced') + (pend ? ' · ' + pend + ' pending' : '') + (bad ? ' · ' + bad + ' failed' : '');
      sb.innerHTML = label; sb.classList.toggle('err', s.state === 'error' || bad > 0);
    }
    var cur = (location.hash.replace(/^#\//, '').split('/')[0]) || 'home'; if (cur === 'edit' || cur === 'xfer') cur = 'add';
    $$('[data-nav]').forEach(function (a) { if (a.dataset.nav === cur) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    var b = '';
    if (Store.memoryOnly) b += '<div class="banner" role="alert"><span>' + ic('alert') + ' Browser storage is unavailable (private mode?). Data will be lost when you close this tab. Use Backup in Settings.</span></div>';
    if (shared && Sync.status.state === 'error') b += '<div class="banner" role="alert"><span>' + ic('alert') + ' ' + esc(Sync.status.msg) + '</span><button data-act="sync">Retry</button></div>';
    if (shared && Sync.status.state === 'offline' && Sync.status.msg) b += '<div class="banner" style="background:#7a5a00"><span>' + ic('cloudoff') + ' ' + esc(Sync.status.msg) + '</span></div>';
    if (App.deferredInstall && !P.get('installDismissed')) b += '<div class="banner install"><span>' + ic('dl') + ' Install ' + esc(P.get('appName')) + ' on this device</span><span><button data-act="install">Install</button> <button data-act="install-hide" aria-label="Dismiss">' + ic('x') + '</button></span></div>';
    var bn = $('#banners'); if (bn) bn.innerHTML = b;
  }
  App.chrome = chrome;

  /* ---------------- router ---------------- */
  var V = (App.views = {});
  function render() {
    if (!App.booted) return;
    var parts = location.hash.replace(/^#\/?/, '').split('/'); var name = parts[0] || 'home';
    var map = { home: 'home', tx: 'tx', add: 'form', edit: 'form', xfer: 'form', reports: 'reports', settings: 'settings' };
    var key = map[name] || 'home'; App.view = key;
    var view = $('#view'); if (!view) return;
    chrome();
    if (key === 'form') V.form(view, parts); else V[key](view, parts.slice(1));
    window.scrollTo(0, 0);
  }
  App.render = render;
  function refresh(kind) {
    if (!App.booted || !$('#view')) return;
    chrome();
    if (kind === 'sync') return;
    if (App.view === 'form' || document.querySelector('dialog[open]')) return; // never clobber a form being edited
    var view = $('#view'); var y = window.scrollY;
    var parts = location.hash.replace(/^#\/?/, '').split('/');
    var key = App.view; if (V[key]) { V[key](view, key === 'tx' ? [] : parts.slice(1)); window.scrollTo(0, y); }
  }
  Store.on(refresh); Sync.on(function () { if (App.booted) { chrome(); if (Sync.status.state === 'auth') lockScreen(Sync.status.msg); } });

  /* ---------------- click delegation ---------------- */
  var ACT = (App.act = {});
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]'); if (!el) return;
    var fn = ACT[el.dataset.act]; if (fn) { e.preventDefault(); fn(el, e); }
  });
  ACT.sync = function () { if (Store.mode === 'shared') { Sync.now().then(function () { if (Sync.status.state === 'idle') App.toast('Synced', 'good', 1800); else if (Sync.status.msg) App.toast(Sync.status.msg, 'warn'); }); } };
  ACT.install = function () { var d = App.deferredInstall; if (!d) return; d.prompt(); d.userChoice.finally(function () { App.deferredInstall = null; chrome(); }); };
  ACT['install-hide'] = function () { P.set('installDismissed', true); chrome(); };
  ACT.back = function () { if (history.length > 1) history.back(); else App.nav('#/home'); };
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); App.deferredInstall = e; chrome(); });
  window.addEventListener('appinstalled', function () { App.deferredInstall = null; chrome(); });

  /* ======================================================================
     WELCOME (first launch) and LOCK screen
  ====================================================================== */
  function pageShell(inner) { return '<div class="welcome"><img class="logo" data-welcome src="' + esc(App.fullLogoSrc()) + '" alt="' + esc(P.get('appName')) + ' logo">' + inner + '</div><div id="toasts" role="status" aria-live="polite"></div>'; }
  function welcome() {
    App.booted = false; var cfgUrl = GD.API.url();
    $('#root').innerHTML = pageShell(
      '<h1>' + esc(P.get('appName')) + '</h1><p class="sub">Income • Expenses • Budget • Reports. Choose how you want to keep your records.</p><div class="wopts">' +
      '<section class="wcard" aria-labelledby="pm"><h2 id="pm">' + ic('lock') + ' Personal Mode</h2><b>Private device data</b><ul><li>No key, no sign-in</li><li>Records stay in this browser (IndexedDB) — nothing is sent to Google</li><li>Works fully offline</li><li>Not synced between devices — use Backup to move data</li><li>Clearing browser data deletes it, so back up regularly</li></ul><button class="btn alt" data-act="w-personal" style="width:100%">Start in Personal Mode</button></section>' +
      '<section class="wcard" aria-labelledby="sm"><h2 id="sm">' + ic('cloud') + ' Shared Mode</h2><b>Synchronized records</b><form id="joinform" novalidate><label class="f" for="jkey">Secret Key (from the owner)</label><input class="in" id="jkey" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="GDX-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX">' +
      (cfgUrl ? '<p class="small" style="opacity:.8;margin:8px 0 0">Server: connected to the configured Apps Script backend.</p><input type="hidden" id="jurl" value="' + esc(cfgUrl) + '">' : '<label class="f" for="jurl">Apps Script Web App URL</label><input class="in" id="jurl" inputmode="url" autocomplete="off" placeholder="https://script.google.com/macros/s/…/exec">') +
      '<label class="switch" style="color:#dce8ff"><span>Remember key on this device</span><input type="checkbox" id="jrem" checked></label><div class="err" id="jerr" role="alert" style="color:#ffb4b9"></div><button class="btn alt" id="jgo" style="width:100%;margin-top:8px" type="submit">Join shared workspace</button></form><p class="small" style="opacity:.8;margin:10px 0 0">Records sync through Google Sheets. Anyone with a valid key can access that workspace — share keys carefully.</p></section></div>');
    $('#joinform').addEventListener('submit', joinShared);
  }
  ACT['w-personal'] = function () {
    P.set({ mode: 'personal' }); Store.open('personal').then(startApp);
  };
  function joinShared(ev) {
    ev.preventDefault();
    var key = $('#jkey').value.trim(), url = $('#jurl').value.trim(), er = $('#jerr'), btn = $('#jgo'); er.textContent = '';
    if (!key) { er.textContent = 'Enter the Secret Key you received.'; return; }
    if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(url) && !/^https?:\/\/(localhost|127\.0\.0\.1)/.test(url)) { er.textContent = 'Enter a valid Apps Script Web App URL (https://script.google.com/…/exec).'; return; }
    btn.disabled = true; btn.textContent = 'Checking key…';
    var prev = P.get('serverUrl'); P.set('serverUrl', url);
    GD.API.call('auth.verify', { key: key }).then(function (r) {
      var ws = { id: r.workspace.id, name: r.workspace.name, role: r.role };
      P.set({ mode: 'shared', wsId: ws.id, wsName: ws.name, role: r.role, keyLabel: r.label || '', remember: $('#jrem').checked, serverUrl: url });
      P.setKey(key, $('#jrem').checked);
      Sync.reset(); return Store.open('shared', ws);
    }).then(function () { startApp(); }).catch(function (e) {
      P.set('serverUrl', prev || ''); btn.disabled = false; btn.textContent = 'Join shared workspace';
      er.textContent = e.code === 'auth' ? 'That key is not valid, has expired, or was revoked.' : e.message;
    });
  }
  function lockScreen(msg) {
    App.booted = false; Sync.stop();
    var wsn = P.get('wsName') || 'shared workspace';
    $('#root').innerHTML = pageShell('<div class="wopts" style="grid-template-columns:1fr;max-width:520px"><section class="wcard"><h2>' + ic('lock') + ' Shared data locked</h2><p>' + esc(msg || 'This device needs a valid access key for “' + wsn + '”.') + '</p><p class="small" style="opacity:.85">Your data was <b>not</b> moved to Personal Mode. Nothing from this workspace is shown until a valid key is entered.</p><form id="lockform"><label class="f" for="lkey">Enter a valid Secret Key</label><input class="in" id="lkey" autocomplete="off" spellcheck="false"><div class="err" id="lerr" role="alert" style="color:#ffb4b9"></div><button class="btn alt" style="width:100%;margin-top:10px" type="submit">Unlock</button></form><div class="btnrow"><button class="btn ghost" style="color:#fff;border-color:rgba(255,255,255,.35)" data-act="lock-personal">Switch to Personal Mode…</button><button class="btn ghost" style="color:#fff;border-color:rgba(255,255,255,.35)" data-act="lock-forget">Remove shared data from this device…</button></div></section></div>');
    $('#lockform').addEventListener('submit', function (ev) {
      ev.preventDefault(); var key = $('#lkey').value.trim(); if (!key) return;
      GD.API.call('auth.verify', { key: key }).then(function (r) {
        P.setKey(key, P.get('remember')); P.set({ wsId: r.workspace.id, wsName: r.workspace.name, role: r.role, mode: 'shared' });
        Sync.reset(); return Store.open('shared', { id: r.workspace.id, name: r.workspace.name, role: r.role });
      }).then(startApp).catch(function (e) { $('#lerr').textContent = e.code === 'auth' ? 'That key is not valid, has expired, or was revoked.' : e.message; });
    });
  }
  ACT['lock-personal'] = function () {
    App.confirm('Switch to Personal Mode?', '<p>You will see your <b>private on-device</b> records. Shared workspace data stays on this device (locked) and nothing is merged.</p>', 'Switch to Personal', false).then(function (ok) {
      if (!ok) return; Sync.stop(); P.set({ mode: 'personal' }); P.setKey('', false); Store.open('personal').then(startApp);
    });
  };
  ACT['lock-forget'] = function () {
    App.confirm('Remove shared data from this device?', '<p>This deletes the locally cached copy of “' + esc(P.get('wsName')) + '” and any <b>unsynced changes</b> made offline. Data already on the server is not affected.</p>', 'Remove', true).then(function (ok) {
      if (!ok) return; Sync.stop(); var id = P.get('wsId'); P.set({ mode: '', wsId: '', wsName: '', role: '' }); P.setKey('', false);
      GD.DB.drop('gdet-shared-' + id).then(function () { Sync.reset(); welcome(); });
    });
  };

  /* ======================================================================
     HOME / DASHBOARD
  ====================================================================== */
  function trend(cur, prev, goodUp, label) {
    if (!(prev > 0) && !(prev < 0)) return '';
    var pct = Math.round(((cur - prev) / Math.abs(prev)) * 100); if (!isFinite(pct)) return '';
    var up = pct >= 0, good = goodUp ? up : !up;
    return '<div class="trend ' + (good ? 'up' : 'down') + '">' + (up ? '▲ ' : '▼ ') + Math.abs(pct) + '% vs ' + label + '</div>';
  }
  function tile(cls, icon, label, value, sub, extra) {
    return '<div class="tile ' + cls + '"><div class="ti">' + ic(icon) + '</div><div class="tl">' + label + '</div><div class="tv">' + value + '</div><div class="ts">' + (sub || '') + '</div>' + (extra || '') + '</div>';
  }
  function monthBar(ym, id) {
    return '<div class="monthsel" role="group" aria-label="Month"><button data-act="' + (id || 'mprev') + '" aria-label="Previous month">' + ic('left') + '</button><input type="month" id="monthinp" value="' + esc(ym) + '" aria-label="Select month"><button data-act="' + (id ? id.replace('prev', 'next') : 'mnext') + '" aria-label="Next month">' + ic('right') + '</button></div>';
  }
  ACT.mprev = function () { App.month = U.addMonthsYM(App.month, -1); render(); };
  ACT.mnext = function () { App.month = U.addMonthsYM(App.month, 1); render(); };
  document.addEventListener('change', function (e) { if (e.target.id === 'monthinp' && /^\d{4}-\d{2}$/.test(e.target.value)) { App.month = e.target.value; render(); } });

  function entryList(limit) {
    var list = C.txs().map(function (t) { return { k: 'tx', r: t }; }).concat(Store.live('transfers').map(function (t) { return { k: 'xfer', r: t }; }));
    list.sort(function (a, b) { var x = (a.r.date + (a.r.time || '')), y = (b.r.date + (b.r.time || '')); return x < y ? 1 : x > y ? -1 : (b.r.createdAt || 0) - (a.r.createdAt || 0); });
    return limit ? list.slice(0, limit) : list;
  }
  function syncTag(id) {
    var op = Store.opFor(id); if (!op || Store.mode !== 'shared') return '';
    return op.status === 'pending' ? ' <span class="tag sync">⏳ pending sync</span>' : ' <span class="tag fail">⚠ sync issue</span>';
  }
  function rowHtml(en, mode) {
    var r = en.r, ro = Store.readOnly();
    if (en.k === 'xfer') {
      var title = 'Transfer: ' + esc(accName(r.fromAccountId)) + ' → ' + esc(accName(r.toAccountId));
      var sub = esc(dt(r.date)) + (r.note ? ' · ' + esc(r.note) : '');
      var acts = ro ? '' : '<div class="actions"><button class="sbtn" data-act="edit" data-kind="xfer" data-id="' + esc(r.id) + '" aria-label="Edit transfer">' + ic('edit') + '</button><button class="sbtn danger" data-act="del" data-kind="xfer" data-id="' + esc(r.id) + '" aria-label="Delete transfer">' + ic('trash') + '</button></div>';
      if (mode === 'tile') return '<div class="tcard xfer"><div class="top2"><span class="ico" style="font-size:1.1rem">🔁</span><div class="t">' + title + '</div></div><div class="small muted">' + sub + syncTag(r.id) + '</div><div class="amt xfer">⇄ ' + money(r.amount) + '</div>' + acts + '</div>';
      return '<li class="item"><div class="ico">🔁</div><div class="body"><div class="t">' + title + '</div><div class="s">' + sub + syncTag(r.id) + '</div></div><div class="amt xfer"><span class="sr">Transfer </span>' + money(r.amount) + '</div>' + acts + '</li>';
    }
    var c = C.cat(r.categoryId), inc = r.type === 'income';
    var t = r.description || (c ? c.name : 'Transaction');
    var meta = esc(c ? c.name : 'Uncategorised') + (r.paymentMethod ? ' · ' + esc(r.paymentMethod) : '') + ' · ' + esc(dt(r.date)) + (r.time ? ' ' + esc(r.time) : '');
    var tags = (r.status === 'pending' ? ' <span class="tag pend">⏳ Pending</span>' : '') + (r.attachment ? ' <span class="tag">' + ic('clip') + '</span>' : '') + syncTag(r.id);
    var amt = '<span class="sr">' + (inc ? 'Income ' : 'Expense ') + '</span>' + (inc ? '+' : '−') + money(r.amount);
    var a = ro ? '' : '<div class="actions">' + (r.status === 'pending' ? '<button class="sbtn" data-act="paid" data-id="' + esc(r.id) + '" aria-label="Mark as paid" title="Mark as paid">' + ic('check') + '</button>' : '') + '<button class="sbtn" data-act="edit" data-kind="tx" data-id="' + esc(r.id) + '" aria-label="Edit">' + ic('edit') + '</button><button class="sbtn danger" data-act="del" data-kind="tx" data-id="' + esc(r.id) + '" aria-label="Delete">' + ic('trash') + '</button></div>';
    if (mode === 'tile') return '<div class="tcard ' + (inc ? 'inc' : 'exp') + '"><div class="top2"><span class="ico" style="width:34px;height:34px;font-size:1rem">' + App.catIcon(c) + '</span><div class="t">' + esc(t) + '</div></div><div class="small muted">' + esc(dt(r.date)) + ' · ' + esc(c ? c.name : '') + tags + '</div><div class="amt ' + (inc ? 'inc' : 'exp') + '">' + amt + '</div>' + a + '</div>';
    return '<li class="item"><div class="ico">' + App.catIcon(c) + '</div><div class="body"><div class="t">' + esc(t) + '</div><div class="s">' + meta + tags + '</div></div><div class="amt ' + (inc ? 'inc' : 'exp') + '">' + amt + '</div>' + a + '</li>';
  }
  App.rowHtml = rowHtml; App.entryList = entryList;

  ACT.edit = function (el) { App.nav('#/edit/' + el.dataset.kind + '/' + el.dataset.id); };
  ACT.del = function (el) {
    var kind = el.dataset.kind, id = el.dataset.id, e = kind === 'xfer' ? 'transfers' : 'transactions', rec = Store.get(e, id); if (!rec) return;
    var what = kind === 'xfer' ? 'this transfer of ' + money(rec.amount) : '“' + esc(rec.description || catName(rec.categoryId)) + '” (' + money(rec.amount) + ')';
    App.confirm('Delete entry?', '<p>Delete ' + what + '? This cannot be undone.</p>', 'Delete', true).then(function (ok) {
      if (!ok) return; Store.remove(e, rec).then(function () { App.toast('Deleted', 'good', 1800); }, function (er) { App.toast(er.message, 'bad'); });
    });
  };
  ACT.paid = function (el) {
    var t = Store.get('transactions', el.dataset.id); if (!t) return; t.status = 'paid';
    Store.save('transactions', t).then(function () { App.toast('Marked as paid', 'good', 1800); }, function (er) { App.toast(er.message, 'bad'); });
  };

  V.home = function (view) {
    var ym = App.month, pm = U.addMonthsYM(ym, -1), today = U.today();
    var paid = C.paid(), ms = C.monthSummary(ym), pms = C.monthSummary(pm);
    var allInc = C.total(paid, 'income'), allExp = C.total(paid, 'expense'), bal = C.balance(), open = C.opening();
    var td = C.inRange(paid, today, today), tInc = C.total(td, 'income'), tExp = C.total(td, 'expense');
    var pend = C.txs().filter(function (t) { return t.status === 'pending'; });
    var pendExp = C.total(pend, 'expense'), pendInc = C.total(pend, 'income');
    var bd = C.budget(ym), overall = bd.rec ? Number(bd.rec.overall) || 0 : 0;
    var th = P.get('thresholds'), pct = overall > 0 ? (ms.exp / overall) * 100 : 0;
    var rem = overall - ms.exp, bcls = pct >= th[2] ? 'over' : pct >= th[1] ? 'warn' : '';
    var tiles = [
      tile('inc', 'down', 'Total Income', money(allInc), 'This month: ' + money(ms.inc), trend(ms.inc, pms.inc, true, U.monthLabel(pm).slice(0, 3))),
      tile('exp', 'up', 'Total Expenses', money(allExp), 'This month: ' + money(ms.exp), trend(ms.exp, pms.exp, false, U.monthLabel(pm).slice(0, 3))),
      tile('bal' + (bal < 0 ? ' neg' : ''), 'wallet', 'Current Balance', money(bal), 'Opening ' + money(open) + ' + income − expenses'),
      tile('sav' + (ms.net < 0 ? ' neg' : ''), 'target', 'Monthly Savings', money(ms.net), 'Net for ' + U.monthLabel(ym), trend(ms.net, pms.net, true, U.monthLabel(pm).slice(0, 3))),
      tile('inc', 'down', "Today's Income", money(tInc), dt(today)),
      tile('exp', 'up', "Today's Expenses", money(tExp), dt(today)),
      tile('pend', 'clock', 'Pending Payments', money(pendExp), pend.filter(function (t) { return t.type === 'expense'; }).length + ' to pay' + (pendInc ? ' · ' + money(pendInc) + ' to receive' : '')),
      overall > 0 ? tile('bud' + (rem < 0 ? ' neg' : ''), 'pie', 'Budget Remaining', money(rem), rem < 0 ? 'Over budget by ' + money(-rem) : Math.round(pct) + '% of ' + money(overall) + ' used') : tile('bud', 'pie', 'Budget Remaining', '—', '<a href="#/settings/budget">Set a monthly budget</a>')
    ].join('');
    // budget card
    var budgetCard = '';
    if (bd.rec && (overall > 0 || Object.keys(bd.rec.cats || {}).length)) {
      var exps = C.inRange(paid, U.monthStart(ym), U.monthEnd(ym)).filter(function (t) { return t.type === 'expense'; });
      var rows = Object.keys(bd.rec.cats || {}).map(function (id) {
        var lim = Number(bd.rec.cats[id]) || 0, sp = C.total(exps.filter(function (t) { return t.categoryId === id; }), 'expense'); return { id: id, lim: lim, sp: sp, p: lim > 0 ? (sp / lim) * 100 : 0 };
      }).filter(function (r) { return r.lim > 0 && r.p >= th[0]; }).sort(function (a, b) { return b.p - a.p; }).slice(0, 4);
      budgetCard = '<div class="card"><h3>' + ic('pie') + ' Budget · ' + U.monthLabel(ym) + '</h3>' + (overall > 0 ? '<div class="bar ' + bcls + '" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.min(100, Math.round(pct)) + '"><i style="width:' + Math.min(100, pct) + '%"></i></div><p class="small muted" style="margin:6px 0 0">' + money(ms.exp) + ' of ' + money(overall) + ' (' + Math.round(pct) + '%)' + (pct >= th[2] ? ' — limit reached' : pct >= th[1] ? ' — nearing limit' : '') + '</p>' : '') +
        rows.map(function (r) { return '<div style="margin-top:10px"><div class="small"><b>' + esc(catName(r.id)) + '</b> · ' + Math.round(r.p) + '% used (' + money(r.sp) + ' / ' + money(r.lim) + ')' + (r.p >= th[2] ? ' ⚠ exceeded' : r.p >= th[1] ? ' ⚠ near limit' : '') + '</div><div class="bar ' + (r.p >= th[2] ? 'over' : r.p >= th[1] ? 'warn' : '') + '"><i style="width:' + Math.min(100, r.p) + '%"></i></div></div>'; }).join('') + '</div>';
    }
    var recent = entryList(6);
    var upc = pend.slice().sort(U.byKey('date')).slice(0, 4).map(function (t) { return { k: 'tx', r: t }; });
    var soon = Store.live('recurring').filter(function (r) { return r.active && r.next <= U.addDays(today, 14); }).sort(U.byKey('next')).slice(0, 4);
    var upHtml = upc.map(function (e) { return rowHtml(e); }).join('') + soon.map(function (r) {
      return '<li class="item"><div class="ico">' + ic('repeat') + '</div><div class="body"><div class="t">' + esc(r.description || catName(r.categoryId)) + '</div><div class="s">Due ' + esc(dt(r.next)) + ' · ' + esc(r.freq) + '</div></div><div class="amt ' + (r.type === 'income' ? 'inc' : 'exp') + '">' + (r.type === 'income' ? '+' : '−') + money(r.amount) + '</div></li>';
    }).join('');
    var accs = C.accs(true).map(function (a) { return '<li class="item"><div class="ico">' + ic('wallet') + '</div><div class="body"><div class="t">' + esc(a.name) + '</div></div><div class="amt num">' + money(C.accBalance(a.id)) + '</div></li>'; }).join('');
    view.innerHTML = '<div class="pagehead"><h1>Dashboard</h1>' + monthBar(ym) + '</div><div class="grid tiles">' + tiles + '</div>' + budgetCard +
      '<div class="row2" style="margin-top:var(--gap)"><div class="card"><h3>Recent transactions</h3>' + (recent.length ? '<ul class="list">' + recent.map(function (e) { return rowHtml(e); }).join('') + '</ul><div class="center" style="margin-top:8px"><a href="#/tx">View all</a></div>' : '<div class="empty">' + ic('list') + '<div>No transactions yet.</div>' + (Store.readOnly() ? '' : '<p><a class="btn" href="#/add">Add your first transaction</a></p>') + '</div>') + '</div>' +
      '<div><div class="card"><h3>' + ic('clock') + ' Upcoming &amp; pending</h3>' + (upHtml ? '<ul class="list">' + upHtml + '</ul>' : '<div class="empty small">Nothing pending.</div>') + '<div class="center small" style="margin-top:6px"><a href="#/settings/recurring">Manage recurring</a></div></div><div class="card"><h3>' + ic('wallet') + ' Accounts</h3>' + (accs ? '<ul class="list">' + accs + '</ul>' : '<div class="empty small">No accounts.</div>') + '<div class="center small" style="margin-top:6px"><a href="#/settings/accounts">Manage accounts</a></div></div></div></div>';
  };

  /* ======================================================================
     TRANSACTIONS
  ====================================================================== */
  function filtered() {
    var f = App.txf, q = f.q.trim().toLowerCase(), out = [];
    entryList().forEach(function (en) {
      var r = en.r;
      if (en.k === 'xfer') {
        if (f.type !== 'all' && f.type !== 'transfer') return;
        if (f.cat || f.method || f.status === 'pending') return;
        if (f.acc && r.fromAccountId !== f.acc && r.toAccountId !== f.acc) return;
        if (q && (r.note || '').toLowerCase().indexOf(q) < 0 && ('transfer ' + accName(r.fromAccountId) + ' ' + accName(r.toAccountId)).toLowerCase().indexOf(q) < 0) return;
      } else {
        if (f.type === 'transfer') return;
        if (f.type !== 'all' && r.type !== f.type) return;
        if (f.cat && r.categoryId !== f.cat) return;
        if (f.method && r.paymentMethod !== f.method) return;
        if (f.acc && r.accountId !== f.acc) return;
        if (f.status === 'pending' && r.status !== 'pending') return;
        if (f.status === 'paid' && r.status === 'pending') return;
        if (q && [r.description, r.party, r.reference, r.tags, catName(r.categoryId)].join(' ').toLowerCase().indexOf(q) < 0) return;
      }
      if (f.from && r.date < f.from) return; if (f.to && r.date > f.to) return;
      out.push(en);
    });
    var s = f.sort;
    if (s === 'old') out.reverse(); else if (s === 'high') out.sort(function (a, b) { return b.r.amount - a.r.amount; }); else if (s === 'low') out.sort(function (a, b) { return a.r.amount - b.r.amount; });
    return out;
  }
  App.filtered = filtered;
  function renderTxList() {
    var box = $('#txlist'); if (!box) return;
    var all = filtered(), shown = all.slice(0, App.txShown), mode = P.get('view'), ro = Store.readOnly();
    var inc = C.total(all.filter(function (e) { return e.k === 'tx' && e.r.status !== 'pending'; }).map(function (e) { return e.r; }), 'income');
    var exp = C.total(all.filter(function (e) { return e.k === 'tx' && e.r.status !== 'pending'; }).map(function (e) { return e.r; }), 'expense');
    var sum = '<p class="small muted" style="margin:0 0 8px" aria-live="polite">' + all.length + ' entr' + (all.length === 1 ? 'y' : 'ies') + ' · Income ' + money(inc) + ' · Expenses ' + money(exp) + '</p>';
    if (!all.length) { box.innerHTML = sum + '<div class="empty">' + ic('search') + '<div>No matching transactions.</div></div>'; return; }
    var body = mode === 'tile' ? '<div class="grid cards">' + shown.map(function (e) { return rowHtml(e, 'tile'); }).join('') + '</div>' : '<ul class="list">' + shown.map(function (e) { return rowHtml(e); }).join('') + '</ul>';
    box.innerHTML = sum + body + (all.length > shown.length ? '<div class="center" style="margin-top:12px"><button class="btn sec" data-act="more">Load more (' + (all.length - shown.length) + ' left)</button></div>' : '');
  }
  ACT.more = function () { App.txShown += 30; renderTxList(); };
  ACT['clear-filters'] = function () { resetFilters(); render(); };
  ACT.setview = function (el) { P.set('view', el.dataset.v); $$('[data-act=setview]').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.v === el.dataset.v ? 'true' : 'false'); }); renderTxList(); };
  ACT.ftype = function (el) { App.txf.type = el.dataset.v; App.txShown = 30; $$('[data-act=ftype]').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.v === el.dataset.v ? 'true' : 'false'); }); renderTxList(); };
  V.tx = function (view) {
    var f = App.txf, ro = Store.readOnly();
    var opt = function (arr, val, all) { return '<option value="">' + all + '</option>' + arr.map(function (a) { return '<option value="' + esc(a[0]) + '"' + (a[0] === val ? ' selected' : '') + '>' + esc(a[1]) + '</option>'; }).join(''); };
    var active = f.cat || f.method || f.acc || f.from || f.to || f.status !== 'all';
    view.innerHTML = '<div class="pagehead"><h1>Transactions</h1><div class="seg" style="min-width:110px" role="group" aria-label="View mode"><button data-act="setview" data-v="list" aria-pressed="' + (P.get('view') !== 'tile') + '" aria-label="List view">' + ic('list') + '</button><button data-act="setview" data-v="tile" aria-pressed="' + (P.get('view') === 'tile') + '" aria-label="Tile view">' + ic('grid') + '</button></div></div>' +
      '<div class="card"><label class="sr" for="fq">Search</label><div style="position:relative"><input class="in" id="fq" type="search" placeholder="Search description, note, party, tag…" value="' + esc(f.q) + '" style="padding-left:40px"><span style="position:absolute;left:12px;top:12px;color:var(--muted)">' + ic('search') + '</span></div>' +
      '<div class="pillrow" style="margin-top:10px" role="group" aria-label="Type">' + [['all', 'All'], ['income', 'Income'], ['expense', 'Expense'], ['transfer', 'Transfer']].map(function (t) { return '<button class="pill" data-act="ftype" data-v="' + t[0] + '" aria-pressed="' + (f.type === t[0]) + '">' + t[1] + '</button>'; }).join('') + '</div>' +
      '<details class="acc"' + (active ? ' open' : '') + '><summary>' + ic('filter') + ' More filters &amp; sort</summary><div class="filters" style="margin-top:8px">' +
      '<div><label class="f" for="ffrom">From</label><input class="in" type="date" id="ffrom" value="' + esc(f.from) + '"></div><div><label class="f" for="fto">To</label><input class="in" type="date" id="fto" value="' + esc(f.to) + '"></div>' +
      '<div><label class="f" for="fcat">Category</label><select class="in" id="fcat">' + opt(C.cats().map(function (c) { return [c.id, c.name + (c.type === 'income' ? ' (in)' : '')]; }), f.cat, 'All') + '</select></div>' +
      '<div><label class="f" for="fmeth">Payment method</label><select class="in" id="fmeth">' + opt(Store.METHODS.map(function (m) { return [m, m]; }), f.method, 'All') + '</select></div>' +
      '<div><label class="f" for="facc">Account</label><select class="in" id="facc">' + opt(C.accs().map(function (a) { return [a.id, a.name]; }), f.acc, 'All') + '</select></div>' +
      '<div><label class="f" for="fstat">Status</label><select class="in" id="fstat"><option value="all">All</option><option value="paid"' + (f.status === 'paid' ? ' selected' : '') + '>Paid / received</option><option value="pending"' + (f.status === 'pending' ? ' selected' : '') + '>Pending</option></select></div>' +
      '<div><label class="f" for="fsort">Sort</label><select class="in" id="fsort">' + [['new', 'Newest first'], ['old', 'Oldest first'], ['high', 'Highest amount'], ['low', 'Lowest amount']].map(function (s) { return '<option value="' + s[0] + '"' + (f.sort === s[0] ? ' selected' : '') + '>' + s[1] + '</option>'; }).join('') + '</select></div>' +
      '<div style="align-self:end"><button class="btn sec" style="width:100%" data-act="clear-filters">Clear filters</button></div></div></details></div>' +
      '<div class="card" id="txlist"></div>' + (ro ? '' : '<div class="stickybar noprint"><a class="btn" style="width:100%" href="#/add">' + ic('plus') + ' Add transaction</a></div>');
    var upd = function () { App.txShown = 30; renderTxList(); };
    $('#fq').addEventListener('input', U.debounce(function (e) { f.q = e.target.value; upd(); }, 200));
    [['ffrom', 'from'], ['fto', 'to'], ['fcat', 'cat'], ['fmeth', 'method'], ['facc', 'acc'], ['fstat', 'status'], ['fsort', 'sort']].forEach(function (m) { $('#' + m[0]).addEventListener('change', function (e) { f[m[1]] = e.target.value; upd(); }); });
    renderTxList();
  };

  /* ======================================================================
     ADD / EDIT FORM (income, expense, transfer)
  ====================================================================== */
  var F = null; // current form state
  function nowHM() { var d = new Date(); return U.pad(d.getHours()) + ':' + U.pad(d.getMinutes()); }
  V.form = function (view, parts) {
    if (Store.readOnly()) { view.innerHTML = '<div class="card"><div class="notice warn">This access key is read-only. You cannot add or edit records.</div></div>'; return; }
    var route = parts[0], kind = 'tx', rec = null;
    if (route === 'edit') { kind = parts[1] === 'xfer' ? 'xfer' : 'tx'; rec = Store.get(kind === 'xfer' ? 'transfers' : 'transactions', parts[2]); if (!rec) { view.innerHTML = '<div class="card"><div class="empty">Entry not found.<p><a class="btn" href="#/tx">Back</a></p></div></div>'; return; } }
    if (route === 'xfer') kind = 'xfer';
    var accs = C.accs(true);
    F = { kind: kind, edit: rec, id: rec ? rec.id : U.uid(kind === 'xfer' ? 'xf' : 'tx'), type: rec ? (kind === 'xfer' ? 'transfer' : rec.type) : (kind === 'xfer' ? 'transfer' : 'expense'), saving: false, receipt: null, removeReceipt: false };
    var d = rec || {}, today = U.today();
    var lastAcc = P.get('lastAcc'), lastMeth = P.get('lastMethod');
    var defAcc = d.accountId || (accs.some(function (a) { return a.id === lastAcc; }) ? lastAcc : accs[0] && accs[0].id);
    var accOpts = function (sel) { return accs.concat(C.accs().filter(function (a) { return a.active === false && a.id === sel; })).map(function (a) { return '<option value="' + esc(a.id) + '"' + (a.id === sel ? ' selected' : '') + '>' + esc(a.name) + '</option>'; }).join(''); };
    var methOpts = Store.METHODS.map(function (m) { return '<option' + (m === (d.paymentMethod || lastMeth || 'Cash') ? ' selected' : '') + '>' + esc(m) + '</option>'; }).join('');
    var title = rec ? 'Edit entry' : 'Add transaction';
    var hasRec = rec && kind === 'tx' && rec.attachment && !F.removeReceipt;
    view.innerHTML = '<div class="pagehead"><button class="back" data-act="back" aria-label="Back">' + ic('left') + '</button><h1>' + title + '</h1></div><form class="card" id="txform" novalidate>' +
      '<div class="seg" role="group" aria-label="Entry type"><button type="button" class="exp" data-act="ttype" data-v="expense" aria-pressed="' + (F.type === 'expense') + '">' + ic('up') + ' Expense</button><button type="button" class="inc" data-act="ttype" data-v="income" aria-pressed="' + (F.type === 'income') + '">' + ic('down') + ' Income</button><button type="button" class="xfer" data-act="ttype" data-v="transfer" aria-pressed="' + (F.type === 'transfer') + '">' + ic('swap') + ' Transfer</button></div>' +
      '<label class="f" for="f_amt">Amount (' + esc(P.get('currency')) + ')</label><input class="in amtin" id="f_amt" inputmode="decimal" autocomplete="off" placeholder="0.00" value="' + (d.amount != null ? esc(d.amount) : '') + '" aria-describedby="e_amt"><div class="err" id="e_amt" role="alert"></div>' +
      '<div id="sec_tx"><div class="fgrid two"><div><label class="f" for="f_cat">Category</label><select class="in" id="f_cat"></select><div class="err" id="e_cat" role="alert"></div></div><div><label class="f" for="f_acc">Account / wallet</label><select class="in" id="f_acc">' + accOpts(defAcc) + '</select><div class="err" id="e_acc" role="alert"></div></div></div>' +
      '<div class="fgrid two"><div><label class="f" for="f_meth">Payment method</label><select class="in" id="f_meth">' + methOpts + '</select></div><div><label class="f" for="f_status">Status</label><select class="in" id="f_status"><option value="paid"' + (d.status !== 'pending' ? ' selected' : '') + '>Paid / received</option><option value="pending"' + (d.status === 'pending' ? ' selected' : '') + '>Pending (not counted yet)</option></select></div></div></div>' +
      '<div id="sec_xf" class="hide"><div class="fgrid two"><div><label class="f" for="f_from">From account</label><select class="in" id="f_from">' + accOpts(d.fromAccountId || (accs[0] && accs[0].id)) + '</select></div><div><label class="f" for="f_to">To account</label><select class="in" id="f_to">' + accOpts(d.toAccountId || (accs[1] && accs[1].id)) + '</select><div class="err" id="e_to" role="alert"></div></div></div></div>' +
      '<div class="fgrid two"><div><label class="f" for="f_date">Date</label><input class="in" type="date" id="f_date" value="' + esc(d.date || today) + '"><div class="err" id="e_date" role="alert"></div></div><div id="sec_time"><label class="f" for="f_time">Time</label><input class="in" type="time" id="f_time" value="' + esc(rec ? d.time || '' : nowHM()) + '"></div></div>' +
      '<label class="f" for="f_desc" id="l_desc">Description / note</label><input class="in" id="f_desc" maxlength="200" autocomplete="off" placeholder="e.g. Milk and bread" value="' + esc(kind === 'xfer' ? d.note : d.description) + '"><div class="err" id="e_desc" role="alert"></div>' +
      '<details class="acc" id="sec_more"' + (rec && (d.party || d.reference || d.tags || d.attachment) ? ' open' : '') + '><summary>More details (party, reference, tags, receipt, repeat)</summary>' +
      '<label class="f" for="f_party">Person / party</label><input class="in" id="f_party" maxlength="100" value="' + esc(d.party) + '"><div class="fgrid two"><div><label class="f" for="f_ref">Reference number</label><input class="in" id="f_ref" maxlength="60" value="' + esc(d.reference) + '"></div><div><label class="f" for="f_tags">Tags (comma separated)</label><input class="in" id="f_tags" maxlength="100" value="' + esc(d.tags) + '"></div></div>' +
      '<div id="sec_rcpt"><label class="f" for="f_file">Receipt image (optional)</label>' + (hasRec ? '<p class="small" id="rcptcur">' + ic('clip') + ' ' + esc(rec.attachment.name || 'receipt') + ' <button type="button" class="btn sec" style="min-height:34px;padding:0 10px" data-act="rcpt-view" data-id="' + esc(rec.id) + '">View</button> <button type="button" class="btn sec" style="min-height:34px;padding:0 10px" data-act="rcpt-rm">Remove</button></p>' : '') + '<input class="in" type="file" id="f_file" accept="image/png,image/jpeg,image/webp"><div id="rcptprev"></div><div class="err" id="e_file" role="alert"></div><p class="small muted">' + (Store.mode === 'shared' ? 'Uploaded privately to the workspace Google Drive folder.' : 'Stored only on this device.') + '</p></div>' +
      (!rec || kind === 'xfer' ? '' : '') + (!rec && kind === 'tx' ? '<div id="sec_rep"><label class="f" for="f_rep">Repeat</label><select class="in" id="f_rep"><option value="">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select><p class="small muted">Future entries are created when you open the app on/after their due date.</p></div>' : '') + '</details>' +
      '<div class="stickybar"><div class="btnrow" style="margin:0"><button type="submit" class="btn" id="b_save">' + ic('check') + ' Save</button>' + (rec ? '' : '<button type="button" class="btn sec" data-act="save-more" id="b_more">Save &amp; add another</button>') + '<a class="btn ghost" href="#/' + (rec ? 'tx' : 'home') + '" id="b_cancel">Cancel</a></div></div></form>';
    var typeUI = function () {
      var t = F.type, xf = t === 'transfer';
      $('#sec_tx').classList.toggle('hide', xf); $('#sec_xf').classList.toggle('hide', !xf); $('#sec_time').classList.toggle('hide', xf); $('#sec_rcpt').classList.toggle('hide', xf);
      var rep = $('#sec_rep'); if (rep) rep.classList.toggle('hide', xf);
      $$('[data-act=ttype]').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.v === t ? 'true' : 'false'); });
      if (!xf) {
        var cur = $('#f_cat').value || (rec && rec.categoryId) || '';
        var cats = C.cats(t, true); if (rec && rec.categoryId && !cats.some(function (c) { return c.id === rec.categoryId; }) && rec.type === t) { var oc = C.cat(rec.categoryId); if (oc) cats.push(oc); }
        $('#f_cat').innerHTML = cats.length ? cats.map(function (c) { return '<option value="' + esc(c.id) + '"' + (c.id === cur ? ' selected' : '') + '>' + esc((c.icon || '') + ' ' + c.name) + '</option>'; }).join('') : '<option value="">— no categories —</option>';
      }
      $('#l_desc').textContent = xf ? 'Note (optional)' : 'Description / note';
    };
    F.typeUI = typeUI; typeUI();
    if (rec && kind === 'tx') $('#f_cat').value = rec.categoryId || '';
    $('#txform').addEventListener('submit', function (e) { e.preventDefault(); submitForm(false); });
    $('#f_file').addEventListener('change', function (e) {
      var f = e.target.files[0], er = $('#e_file'); er.textContent = ''; $('#rcptprev').innerHTML = ''; F.receipt = null; if (!f) return;
      if (!/^image\/(png|jpeg|webp)$/.test(f.type)) { er.textContent = 'Only PNG, JPG or WebP images are allowed.'; e.target.value = ''; return; }
      if (f.size > 8 * 1024 * 1024) { er.textContent = 'Image is larger than 8 MB.'; e.target.value = ''; return; }
      U.downscale(f, 1200, 0.72).then(function (data) {
        if (data.length > 900000) throw new Error('Image is still too large after compression.');
        F.receipt = { name: f.name.slice(0, 80), mime: 'image/jpeg', data: data }; $('#rcptprev').innerHTML = '<img src="' + data + '" alt="Receipt preview" style="max-width:160px;border-radius:10px;margin-top:6px">';
      }).catch(function (x) { er.textContent = x.message; });
    });
    setTimeout(function () { var a = $('#f_amt'); if (a && !rec) a.focus(); }, 50);
  };
  ACT.ttype = function (el) { F.type = el.dataset.v; F.typeUI(); };
  ACT['save-more'] = function () { submitForm(true); };
  ACT['rcpt-rm'] = function () { F.removeReceipt = true; var c = $('#rcptcur'); if (c) c.remove(); };
  ACT['rcpt-view'] = function (el) { viewReceipt(el.dataset.id); };
  function viewReceipt(id) {
    var t = Store.get('transactions', id); if (!t || !t.attachment) return;
    var show = function (src) { App.dialog('<h3>Receipt</h3><img src="' + esc(src) + '" alt="Receipt" style="max-width:100%;border-radius:12px"><div class="btnrow"><button class="btn sec" data-dclose>Close</button></div>'); };
    Store.blob('rcpt_' + id).then(function (b) {
      if (b) return show(b.data);
      if (t.attachment.fileId && Store.mode === 'shared') return GD.API.call('file.get', { key: P.getKey(), fileId: t.attachment.fileId }).then(function (r) { show('data:' + r.mime + ';base64,' + r.data); }, function (e) { App.toast(e.message, 'bad'); });
      App.toast('Receipt is not available on this device.', 'warn');
    });
  }
  App.viewReceipt = viewReceipt;
  function setErr(id, msg) { var e = $('#' + id); if (e) e.textContent = msg || ''; return !!msg; }
  function submitForm(another) {
    if (F.saving) return; var isX = F.type === 'transfer', bad = false, first = null;
    ['e_amt', 'e_cat', 'e_acc', 'e_date', 'e_desc', 'e_to'].forEach(function (i) { setErr(i, ''); });
    var amt = U.parseAmount($('#f_amt').value); var date = $('#f_date').value;
    var mark = function (id, msg, field) { setErr(id, msg); bad = true; if (!first) first = $(field); };
    if (!isFinite(amt) || amt <= 0) mark('e_amt', 'Enter an amount greater than 0 (numbers only).', '#f_amt'); else if (amt > 9999999999) mark('e_amt', 'Amount is too large.', '#f_amt');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < '1990-01-01' || date > '2100-12-31') mark('e_date', 'Choose a valid date.', '#f_date');
    var desc = $('#f_desc').value.trim();
    var now = Date.now();
    if (isX) {
      var from = $('#f_from').value, to = $('#f_to').value;
      if (!from || !to) mark('e_to', 'Select both accounts.', '#f_from'); else if (from === to) mark('e_to', 'Choose two different accounts.', '#f_to');
      if (bad) { first && first.focus(); return; }
      var x = Object.assign({}, F.edit || {}, { id: F.id, fromAccountId: from, toAccountId: to, amount: amt, date: date, note: desc });
      return persist('transfers', x, another);
    }
    var cat = $('#f_cat').value, acc = $('#f_acc').value;
    if (!cat) mark('e_cat', 'Choose a category (add one in Settings → Categories).', '#f_cat');
    if (!acc) mark('e_acc', 'Choose an account.', '#f_acc');
    if (!desc) mark('e_desc', 'Add a short description or note.', '#f_desc');
    if (bad) { first && first.focus(); return; }
    var t = Object.assign({}, F.edit || {}, {
      id: F.id, type: F.type, amount: amt, currency: P.get('currency'), categoryId: cat, accountId: acc, date: date, time: $('#f_time').value || '', description: desc,
      paymentMethod: $('#f_meth').value, status: $('#f_status').value, party: $('#f_party').value.trim(), reference: $('#f_ref').value.trim(), tags: $('#f_tags').value.trim()
    });
    if (F.removeReceipt) { t.attachment = null; Store.delBlob('rcpt_' + t.id); }
    var rep = $('#f_rep') ? $('#f_rep').value : '';
    P.set({ lastAcc: acc, lastMethod: t.paymentMethod });
    var go = function () {
      return persist('transactions', t, another).then(function () {
        if (rep) {
          return Store.save('recurring', { id: U.uid('rec'), type: t.type, amount: amt, categoryId: cat, accountId: acc, paymentMethod: t.paymentMethod, description: desc, freq: rep, next: C.nextDate(date, rep), active: true });
        }
      });
    };
    if (F.receipt) {
      t.attachment = { name: F.receipt.name, mime: F.receipt.mime, local: true, pending: Store.mode === 'shared' };
      return Store.putBlob('rcpt_' + t.id, F.receipt.data).then(go);
    }
    return go();
  }
  function persist(entity, rec, another) {
    F.saving = true; var b = $('#b_save'); if (b) b.disabled = true; var m = $('#b_more'); if (m) m.disabled = true;
    return Store.save(entity, rec).then(function () {
      App.toast('Saved', 'good', 1800); F.saving = false;
      if (another) { // keep type/account/date, reset amount + note, new id (prevents duplicate)
        F.id = U.uid(entity === 'transfers' ? 'xf' : 'tx'); F.receipt = null; F.edit = null;
        ['f_amt', 'f_desc', 'f_ref', 'f_tags', 'f_party'].forEach(function (i) { var e = $('#' + i); if (e) e.value = ''; });
        var fe = $('#f_file'); if (fe) fe.value = ''; var rp = $('#rcptprev'); if (rp) rp.innerHTML = '';
        if (b) b.disabled = false; if (m) m.disabled = false; $('#f_amt').focus();
      } else App.nav(F.edit ? '#/tx' : '#/home');
    }, function (e) { F.saving = false; if (b) b.disabled = false; if (m) m.disabled = false; App.toast(e.message || 'Could not save', 'bad'); });
  }

  /* ======================================================================
     BOOT
  ====================================================================== */
  function startApp() {
    shell(); App.booted = true; applyAssets();
    if (!location.hash || location.hash === '#') location.hash = '#/home';
    render();
    Store.runRecurring().then(function (n) { if (n) App.toast(n + ' recurring entr' + (n === 1 ? 'y' : 'ies') + ' added', 'good'); });
    if (Store.mode === 'shared') Sync.start(); else Sync.stop();
  }
  App.startApp = startApp; App.welcome = welcome; App.lockScreen = lockScreen;
  window.addEventListener('hashchange', function () { if (App.booted) render(); });
  App.boot = function () {
    applyTheme();
    if (window.matchMedia) { try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme); } catch (e) {} }
    return loadAssets().catch(function () {}).then(function () {
      var mode = P.get('mode');
      if (!mode) return welcome();
      if (mode === 'personal') return Store.open('personal').then(startApp);
      var ws = { id: P.get('wsId'), name: P.get('wsName'), role: P.get('role') };
      if (!ws.id) { P.set('mode', ''); return welcome(); }
      if (!P.getKey()) return Store.open('shared', ws).then(function () { lockScreen('Enter the Secret Key for “' + ws.name + '” to continue.'); });
      return Store.open('shared', ws).then(startApp);
    });
  };
})();
