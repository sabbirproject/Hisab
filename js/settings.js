/* GD Expense Tracker — Settings, accounts, budgets, categories, recurring, assets, data mode, backup, privacy */
(function () {
  'use strict';
  var GD = window.GD, App = GD.App, U = GD.U, Store = GD.Store, Sync = GD.Sync, P = GD.Prefs, C = Store.calc, esc = U.esc, ic = App.ic, $ = App.$, $$ = App.$$, ACT = App.act;
  var money = App.money, dt = App.dt;
  var S = (App.sub = {});
  var catName = function (id) { var c = C.cat(id); return c ? c.name : 'Uncategorised'; };
  function parseSigned(s) { s = String(s == null ? '' : s).trim(); var neg = s[0] === '-'; var v = U.parseAmount(neg ? s.slice(1) : s); return isFinite(v) ? (neg ? -v : v) : NaN; }
  function page(view, title, inner, back) {
    view.innerHTML = '<div class="pagehead"><a class="back" href="#/' + (back || 'settings') + '" aria-label="Back">' + ic('left') + '</a><h1>' + title + '</h1></div>' + inner;
  }
  function ro() { return Store.readOnly(); }
  function guard() { if (ro()) { App.toast('Read-only key: changes are not allowed.', 'warn'); return true; } return false; }
  function errBox(id) { return '<div class="err" id="' + id + '" role="alert"></div>'; }
  function fieldVal(d, id) { return d.querySelector('#' + id).value; }

  /* ---------------- settings menu ---------------- */
  function menuItem(href, icon, title, sub, act) {
    return (act ? '<button class="mrow" data-act="' + act + '">' : '<a href="#/settings/' + href + '">') + '<span class="mi">' + ic(icon) + '</span><span class="mt"><b>' + title + '</b><span>' + sub + '</span></span>' + ic('right') + (act ? '</button>' : '</a>');
  }
  App.views.settings = function (view, args) {
    var sub = args[0];
    if (sub && S[sub]) return S[sub](view, args.slice(1));
    var shared = Store.mode === 'shared';
    view.innerHTML = '<div class="pagehead"><h1>Settings</h1></div>' +
      '<div class="card menu"><h3>Everyday</h3>' + menuItem('accounts', 'wallet', 'Accounts &amp; transfers', 'Cash, bank, UPI, wallets — balances and transfers') + menuItem('budget', 'pie', 'Budgets', 'Monthly and category limits') + menuItem('categories', 'tag', 'Categories', 'Add, edit, reorder, deactivate') + menuItem('recurring', 'repeat', 'Recurring &amp; upcoming', 'Salary, rent, EMI, subscriptions') + '</div>' +
      '<div class="card menu"><h3>App</h3>' + menuItem('appearance', 'settings', 'Appearance &amp; preferences', 'Currency, date format, theme, alerts') + menuItem('assets', 'image', 'Branding &amp; assets', 'Logo, icon, favicon, illustration, report image') + menuItem('data', shared ? 'cloud' : 'lock', 'Data mode &amp; sync', shared ? 'Shared · ' + esc((Store.ws && Store.ws.name) || '') : 'Personal · stored on this device') + menuItem('backup', 'dl', 'Backup, export &amp; import', 'JSON backup, CSV export, restore') + menuItem('privacy', 'shield', 'Privacy &amp; installation', 'What is stored where · install as an app') + '</div>' +
      '<div class="card menu"><h3>Owner only</h3>' + menuItem('owner', 'key', 'Owner administration', 'Secret keys, workspaces, Drive backups (needs the owner secret)') + '</div>' +
      '<div class="card menu"><h3>Danger zone</h3>' + menuItem('danger', 'alert', 'Clear data &amp; reset', 'Clear local data, reset app settings') + '</div>';
  };

  /* ---------------- accounts ---------------- */
  S.accounts = function (view) {
    var accs = C.accs();
    page(view, 'Accounts', '<div class="card"><ul class="list">' + (accs.map(function (a) {
      var t = (Store.ACC_TYPES.find(function (x) { return x[0] === a.type; }) || ['', a.type])[1];
      return '<li class="item"><div class="ico">' + ic('wallet') + '</div><div class="body"><div class="t">' + esc(a.name) + (a.active === false ? ' <span class="tag">inactive</span>' : '') + '</div><div class="s">' + esc(t) + ' · opening ' + money(a.opening || 0) + '</div></div><div class="amt num">' + money(C.accBalance(a.id)) + '</div><div class="actions"><button class="sbtn" data-act="acc-hist" data-id="' + esc(a.id) + '" aria-label="Transaction history" title="History">' + ic('list') + '</button>' + (ro() ? '' : '<button class="sbtn" data-act="acc-edit" data-id="' + esc(a.id) + '" aria-label="Edit">' + ic('edit') + '</button><button class="sbtn danger" data-act="acc-del" data-id="' + esc(a.id) + '" aria-label="Delete">' + ic('trash') + '</button>') + '</div></li>';
    }).join('') || '<div class="empty">No accounts yet.</div>') + '</ul>' + (ro() ? '' : '<div class="btnrow"><button class="btn" data-act="acc-new">' + ic('plus') + ' New account</button><a class="btn sec" href="#/xfer">' + ic('swap') + ' Record transfer</a></div>') + '</div>' +
      '<p class="small muted">Balance = opening balance + paid income − paid expenses ± transfers. Transfers are never counted as income or expense. Pending items are not included.</p>');
  };
  ACT['acc-hist'] = function (el) { App.resetFilters(); App.txf.acc = el.dataset.id; App.nav('#/tx'); };
  ACT['acc-new'] = function () { if (!guard()) accountDialog(null); };
  ACT['acc-edit'] = function (el) { if (!guard()) accountDialog(Store.get('accounts', el.dataset.id)); };
  ACT['acc-del'] = function (el) {
    if (guard()) return; var a = Store.get('accounts', el.dataset.id); if (!a) return;
    if (C.isUsedAcc(a.id)) { App.confirm('Account has history', '<p>“' + esc(a.name) + '” is used by transactions, so it cannot be deleted. Deactivate it instead? (It stays in reports but is hidden from new entries.)</p>', 'Deactivate', false).then(function (ok) { if (ok) { a.active = false; Store.save('accounts', a).then(function () { App.render(); }); } }); return; }
    App.confirm('Delete account?', '<p>Delete “' + esc(a.name) + '”?</p>', 'Delete', true).then(function (ok) { if (ok) Store.remove('accounts', a).then(function () { App.render(); }); });
  };
  function accountDialog(acc) {
    App.dialog('<h3>' + (acc ? 'Edit account' : 'New account') + '</h3><label class="f" for="a_name">Name</label><input class="in" id="a_name" maxlength="60" value="' + esc(acc ? acc.name : '') + '"><label class="f" for="a_type">Type</label><select class="in" id="a_type">' + Store.ACC_TYPES.map(function (t) { return '<option value="' + t[0] + '"' + (acc && acc.type === t[0] ? ' selected' : '') + '>' + t[1] + '</option>'; }).join('') + '</select><label class="f" for="a_open">Opening balance</label><input class="in" id="a_open" inputmode="decimal" value="' + (acc ? esc(acc.opening || 0) : '0') + '"><label class="switch"><span>Active</span><input type="checkbox" id="a_act"' + (!acc || acc.active !== false ? ' checked' : '') + '></label>' + errBox('a_err') + '<p class="small muted">Never enter bank passwords, UPI PINs or card CVVs anywhere in this app.</p><div class="btnrow"><button class="btn sec" data-dclose>Cancel</button><button class="btn" id="a_save">Save</button></div>', function (d, api) {
      d.querySelector('#a_save').onclick = function () {
        var name = fieldVal(d, 'a_name').trim(), op = parseSigned(fieldVal(d, 'a_open')), er = d.querySelector('#a_err');
        if (!name) { er.textContent = 'Enter a name.'; return; } if (!isFinite(op)) { er.textContent = 'Opening balance must be a number.'; return; }
        if (C.accs().some(function (x) { return x.name.toLowerCase() === name.toLowerCase() && (!acc || x.id !== acc.id); })) { er.textContent = 'An account with this name already exists.'; return; }
        var rec = Object.assign({}, acc || { id: U.uid('acc') }, { name: name, type: fieldVal(d, 'a_type'), opening: op, active: d.querySelector('#a_act').checked });
        Store.save('accounts', rec).then(function () { api.close(); App.render(); App.toast('Account saved'); }, function (e) { er.textContent = e.message; });
      };
    });
  }

  /* ---------------- budgets ---------------- */
  App.bmonth = U.ym(U.today());
  S.budget = function (view) {
    var ym = App.bmonth, bd = C.budget(ym), rec = bd.rec || { overall: 0, cats: {} };
    var exps = C.inRange(C.paid(), U.monthStart(ym), U.monthEnd(ym)).filter(function (t) { return t.type === 'expense'; });
    var th = P.get('thresholds');
    var inherited = bd.rec && bd.from !== ym ? '<div class="notice">No budget saved for ' + U.monthLabel(ym) + ' — showing ' + (bd.from === 'default' ? 'your default budget' : 'the budget from ' + U.monthLabel(bd.from)) + '. Save to create this month\'s own budget.</div>' : '';
    var rows = C.cats('expense').map(function (c) {
      var lim = Number((rec.cats || {})[c.id]) || 0, sp = C.total(exps.filter(function (t) { return t.categoryId === c.id; }), 'expense'), p = lim > 0 ? (sp / lim) * 100 : 0;
      return '<div style="margin:12px 0"><label class="f" for="bc_' + esc(c.id) + '" style="margin:0 0 4px">' + App.catIcon(c) + ' ' + esc(c.name) + (c.active === false ? ' (inactive)' : '') + '</label><input class="in" data-bcat="' + esc(c.id) + '" id="bc_' + esc(c.id) + '" inputmode="decimal" placeholder="No limit" value="' + (lim ? esc(lim) : '') + '"' + (ro() ? ' disabled' : '') + '><div class="small muted">Spent ' + money(sp) + (lim ? ' · ' + Math.round(p) + '% used' + (p >= th[2] ? ' ⚠ exceeded' : p >= th[1] ? ' ⚠ near limit' : '') : '') + '</div>' + (lim ? '<div class="bar ' + (p >= th[2] ? 'over' : p >= th[1] ? 'warn' : '') + '"><i style="width:' + Math.min(100, p) + '%"></i></div>' : '') + '</div>';
    }).join('');
    var hist = Store.live('budgets').filter(function (b) { return b.month !== 'default'; }).sort(U.byKey('month', -1)).map(function (b) {
      var sp = C.total(C.inRange(C.paid(), U.monthStart(b.month), U.monthEnd(b.month)), 'expense');
      return '<li class="item"><div class="body"><div class="t">' + U.monthLabel(b.month) + '</div><div class="s">Budget ' + money(b.overall || 0) + ' · spent ' + money(sp) + '</div></div><button class="sbtn" data-act="bud-go" data-m="' + b.month + '" aria-label="Open ' + U.monthLabel(b.month) + '">' + ic('right') + '</button></li>';
    }).join('');
    page(view, 'Budgets', '<div class="card"><div style="display:flex;justify-content:center;margin-bottom:8px"><div class="monthsel"><button data-act="bprev" aria-label="Previous month">' + ic('left') + '</button><input type="month" id="bmonth" value="' + ym + '" aria-label="Budget month"><button data-act="bnext" aria-label="Next month">' + ic('right') + '</button></div></div>' + inherited +
      '<label class="f" for="b_overall">Overall monthly spending limit (' + esc(P.get('currency')) + ')</label><input class="in" id="b_overall" inputmode="decimal" placeholder="No limit" value="' + (Number(rec.overall) ? esc(rec.overall) : '') + '"' + (ro() ? ' disabled' : '') + '><div class="small muted">Spent this month: ' + money(C.total(exps, 'expense')) + '</div>' + errBox('b_err') +
      '<h3 style="margin-top:16px">Category limits</h3>' + rows + (ro() ? '' : '<div class="btnrow"><button class="btn" data-act="bud-save">Save for ' + U.monthLabel(ym) + '</button><button class="btn sec" data-act="bud-default">Save as default for all months</button></div><div class="btnrow"><button class="btn ghost" data-act="bud-clear">Remove this month\'s budget</button></div>') + '<p class="small muted">Alerts appear on the dashboard at ' + th.join('% / ') + '% of a limit (change in Appearance).</p></div>' +
      (hist ? '<div class="card"><h3>Budget history</h3><ul class="list">' + hist + '</ul></div>' : ''));
    var m = $('#bmonth'); if (m) m.addEventListener('change', function (e) { if (/^\d{4}-\d{2}$/.test(e.target.value)) { App.bmonth = e.target.value; App.render(); } });
  };
  ACT.bprev = function () { App.bmonth = U.addMonthsYM(App.bmonth, -1); App.render(); };
  ACT.bnext = function () { App.bmonth = U.addMonthsYM(App.bmonth, 1); App.render(); };
  ACT['bud-go'] = function (el) { App.bmonth = el.dataset.m; App.render(); window.scrollTo(0, 0); };
  function readBudget() {
    var er = $('#b_err'), ov = $('#b_overall').value.trim(), overall = 0; er.textContent = '';
    if (ov) { overall = U.parseAmount(ov); if (!isFinite(overall)) { er.textContent = 'Overall limit must be a number.'; return null; } }
    var cats = {}; var bad = false;
    $$('[data-bcat]').forEach(function (i) { var v = i.value.trim(); if (!v) return; var n = U.parseAmount(v); if (!isFinite(n)) { bad = true; i.focus(); } else if (n > 0) cats[i.dataset.bcat] = n; });
    if (bad) { er.textContent = 'Category limits must be numbers.'; return null; }
    return { overall: overall, cats: cats };
  }
  function saveBudget(month) {
    if (guard()) return; var v = readBudget(); if (!v) return;
    var ex = Store.live('budgets').find(function (b) { return b.month === month; });
    var rec = Object.assign({}, ex || { id: 'bud_' + month }, { month: month, overall: v.overall, cats: v.cats });
    Store.save('budgets', rec).then(function () { App.toast('Budget saved'); App.render(); }, function (e) { App.toast(e.message, 'bad'); });
  }
  ACT['bud-save'] = function () { saveBudget(App.bmonth); };
  ACT['bud-default'] = function () { saveBudget('default'); };
  ACT['bud-clear'] = function () {
    if (guard()) return; var ex = Store.live('budgets').find(function (b) { return b.month === App.bmonth; }); if (!ex) { App.toast('No budget saved for this month.', 'warn'); return; }
    Store.remove('budgets', ex).then(function () { App.render(); });
  };

  /* ---------------- categories ---------------- */
  App.ctab = 'expense';
  S.categories = function (view) {
    var type = App.ctab, list = C.cats(type);
    page(view, 'Categories', '<div class="card"><div class="seg" role="group" aria-label="Category type"><button class="exp" data-act="ctab" data-v="expense" aria-pressed="' + (type === 'expense') + '">Expense</button><button class="inc" data-act="ctab" data-v="income" aria-pressed="' + (type === 'income') + '">Income</button></div><ul class="list" style="margin-top:8px">' +
      (list.map(function (c, i) {
        return '<li class="item"><div class="ico">' + App.catIcon(c) + '</div><div class="body"><div class="t">' + esc(c.name) + (c.active === false ? ' <span class="tag">inactive</span>' : '') + '</div></div>' + (ro() ? '' : '<div class="actions"><button class="sbtn" data-act="cat-up" data-id="' + esc(c.id) + '" aria-label="Move up"' + (i === 0 ? ' disabled' : '') + '>' + ic('arrowup') + '</button><button class="sbtn" data-act="cat-down" data-id="' + esc(c.id) + '" aria-label="Move down"' + (i === list.length - 1 ? ' disabled' : '') + '>' + ic('arrowdown') + '</button><button class="sbtn" data-act="cat-edit" data-id="' + esc(c.id) + '" aria-label="Edit">' + ic('edit') + '</button><button class="sbtn danger" data-act="cat-del" data-id="' + esc(c.id) + '" aria-label="Delete">' + ic('trash') + '</button></div>') + '</li>';
      }).join('') || '<div class="empty small">No categories.</div>') + '</ul>' + (ro() ? '' : '<div class="btnrow"><button class="btn" data-act="cat-new">' + ic('plus') + ' New ' + type + ' category</button></div>') + '</div>');
  };
  ACT.ctab = function (el) { App.ctab = el.dataset.v; App.render(); };
  function moveCat(id, dir) {
    if (guard()) return; var c = Store.get('categories', id), list = C.cats(c.type), i = list.findIndex(function (x) { return x.id === id; }), j = i + dir;
    if (j < 0 || j >= list.length) return; var tmp = list[i]; list[i] = list[j]; list[j] = tmp;
    var changed = []; list.forEach(function (x, k) { if (x.order !== k) { x.order = k; changed.push(x); } });
    Store.saveMany('categories', changed).then(function () { App.render(); });
  }
  ACT['cat-up'] = function (el) { moveCat(el.dataset.id, -1); }; ACT['cat-down'] = function (el) { moveCat(el.dataset.id, 1); };
  ACT['cat-new'] = function () { if (!guard()) catDialog(null); };
  ACT['cat-edit'] = function (el) { if (!guard()) catDialog(Store.get('categories', el.dataset.id)); };
  ACT['cat-del'] = function (el) {
    if (guard()) return; var c = Store.get('categories', el.dataset.id); if (!c) return;
    if (C.isUsedCat(c.id)) { App.confirm('Category in use', '<p>“' + esc(c.name) + '” has transactions, so it cannot be deleted. Deactivate it to hide it from new entries?</p>', 'Deactivate', false).then(function (ok) { if (ok) { c.active = false; Store.save('categories', c).then(function () { App.render(); }); } }); return; }
    App.confirm('Delete category?', '<p>Delete “' + esc(c.name) + '”?</p>', 'Delete', true).then(function (ok) { if (ok) Store.remove('categories', c).then(function () { App.render(); }); });
  };
  function catDialog(c) {
    var img = c && c.iconImg || '';
    App.dialog('<h3>' + (c ? 'Edit category' : 'New ' + App.ctab + ' category') + '</h3><label class="f" for="c_name">Name</label><input class="in" id="c_name" maxlength="40" value="' + esc(c ? c.name : '') + '"><label class="f" for="c_icon">Icon (emoji)</label><input class="in" id="c_icon" maxlength="8" value="' + esc(c ? c.icon : '🏷️') + '"><label class="f" for="c_img">Or upload an icon image (optional)</label><div class="assetprev"><span id="c_prev"></span><input class="in" type="file" id="c_img" accept="image/png,image/jpeg,image/webp" style="flex:1"></div><button class="btn sec" id="c_rmimg" style="margin-top:6px;min-height:36px' + (img ? '' : ';display:none') + '">Remove image</button><label class="switch"><span>Active</span><input type="checkbox" id="c_act"' + (!c || c.active !== false ? ' checked' : '') + '></label>' + errBox('c_err') + '<div class="btnrow"><button class="btn sec" data-dclose>Cancel</button><button class="btn" id="c_save">Save</button></div>', function (d, api) {
      var prev = function () { d.querySelector('#c_prev').innerHTML = img ? '<img src="' + esc(img) + '" alt="" style="width:44px;height:44px;border-radius:10px;object-fit:cover">' : ''; d.querySelector('#c_rmimg').style.display = img ? '' : 'none'; }; prev();
      d.querySelector('#c_img').addEventListener('change', function (e) {
        var f = e.target.files[0]; if (!f) return; var er = d.querySelector('#c_err'); er.textContent = '';
        if (!/^image\/(png|jpeg|webp)$/.test(f.type) || f.size > 2 * 1024 * 1024) { er.textContent = 'Use a PNG/JPG/WebP image under 2 MB.'; e.target.value = ''; return; }
        U.downscale(f, 64, 0.85, true).then(function (u) { img = u; prev(); }, function (x) { er.textContent = x.message; });
      });
      d.querySelector('#c_rmimg').onclick = function () { img = ''; prev(); };
      d.querySelector('#c_save').onclick = function () {
        var name = fieldVal(d, 'c_name').trim(), er = d.querySelector('#c_err'); if (!name) { er.textContent = 'Enter a name.'; return; }
        var type = c ? c.type : App.ctab;
        if (C.cats(type).some(function (x) { return x.name.toLowerCase() === name.toLowerCase() && (!c || x.id !== c.id); })) { er.textContent = 'This category already exists.'; return; }
        var rec = Object.assign({}, c || { id: U.uid('cat'), type: type, order: C.cats(type).length }, { name: name, icon: fieldVal(d, 'c_icon').trim() || '🏷️', iconImg: img || '', active: d.querySelector('#c_act').checked });
        Store.save('categories', rec).then(function () { api.close(); App.render(); }, function (e) { er.textContent = e.message; });
      };
    });
  }

  /* ---------------- recurring ---------------- */
  S.recurring = function (view) {
    var list = Store.live('recurring').sort(U.byKey('next'));
    page(view, 'Recurring &amp; upcoming', '<div class="notice">Recurring entries are created <b>when you open the app</b> on or after the due date. Browsers cannot reliably run background reminders, so check “Upcoming &amp; pending” on the dashboard. ' + (Store.mode === 'shared' ? 'In Shared Mode every device creates the same entry id, so opening the app on several devices never duplicates it.' : '') + '</div><div class="card"><ul class="list">' + (list.map(function (r) {
      return '<li class="item"><div class="ico">' + ic('repeat') + '</div><div class="body"><div class="t">' + esc(r.description || catName(r.categoryId)) + (r.active ? '' : ' <span class="tag">paused</span>') + '</div><div class="s">' + esc(r.freq) + ' · next ' + esc(dt(r.next)) + ' · ' + esc(catName(r.categoryId)) + '</div></div><div class="amt ' + (r.type === 'income' ? 'inc' : 'exp') + '">' + (r.type === 'income' ? '+' : '−') + money(r.amount) + '</div>' + (ro() ? '' : '<div class="actions"><button class="sbtn" data-act="rec-toggle" data-id="' + esc(r.id) + '" aria-label="' + (r.active ? 'Pause' : 'Resume') + '">' + (r.active ? '⏸' : '▶') + '</button><button class="sbtn danger" data-act="rec-del" data-id="' + esc(r.id) + '" aria-label="Delete">' + ic('trash') + '</button></div>') + '</li>';
    }).join('') || '<div class="empty">No recurring entries yet.</div>') + '</ul>' + (ro() ? '' : '<div class="btnrow"><button class="btn" data-act="rec-new">' + ic('plus') + ' New recurring entry</button><button class="btn sec" data-act="rec-run">Create due entries now</button></div>') + '</div>');
  };
  ACT['rec-toggle'] = function (el) { if (guard()) return; var r = Store.get('recurring', el.dataset.id); r.active = !r.active; Store.save('recurring', r).then(function () { App.render(); }); };
  ACT['rec-del'] = function (el) { if (guard()) return; var r = Store.get('recurring', el.dataset.id); App.confirm('Delete recurring entry?', '<p>Entries already created are kept; no new ones will be made.</p>', 'Delete', true).then(function (ok) { if (ok) Store.remove('recurring', r).then(function () { App.render(); }); }); };
  ACT['rec-run'] = function () { Store.runRecurring().then(function (n) { App.toast(n ? n + ' entr' + (n === 1 ? 'y' : 'ies') + ' created' : 'Nothing is due', n ? 'good' : 'warn'); App.render(); }); };
  ACT['rec-new'] = function () {
    if (guard()) return;
    var accs = C.accs(true);
    App.dialog('<h3>New recurring entry</h3><div class="seg" role="group"><button class="exp" data-act="rtype" data-v="expense" aria-pressed="true">Expense</button><button class="inc" data-act="rtype" data-v="income" aria-pressed="false">Income</button></div><label class="f" for="r_amt">Amount</label><input class="in" id="r_amt" inputmode="decimal"><label class="f" for="r_cat">Category</label><select class="in" id="r_cat"></select><div class="fgrid two"><div><label class="f" for="r_acc">Account</label><select class="in" id="r_acc">' + accs.map(function (a) { return '<option value="' + esc(a.id) + '">' + esc(a.name) + '</option>'; }).join('') + '</select></div><div><label class="f" for="r_freq">Repeats</label><select class="in" id="r_freq"><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly" selected>Monthly</option><option value="yearly">Yearly</option></select></div></div><label class="f" for="r_desc">Description</label><input class="in" id="r_desc" maxlength="200"><label class="f" for="r_next">First due date</label><input class="in" type="date" id="r_next" value="' + U.today() + '">' + errBox('r_err') + '<div class="btnrow"><button class="btn sec" data-dclose>Cancel</button><button class="btn" id="r_save">Save</button></div>', function (d, api) {
      var type = 'expense';
      var fill = function () { d.querySelector('#r_cat').innerHTML = C.cats(type, true).map(function (c) { return '<option value="' + esc(c.id) + '">' + esc((c.icon || '') + ' ' + c.name) + '</option>'; }).join(''); $$('[data-act=rtype]', d).forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.v === type ? 'true' : 'false'); }); };
      fill();
      d.addEventListener('click', function (e) { var b = e.target.closest('[data-act=rtype]'); if (b) { type = b.dataset.v; fill(); } });
      d.querySelector('#r_save').onclick = function () {
        var amt = U.parseAmount(fieldVal(d, 'r_amt')), er = d.querySelector('#r_err'), desc = fieldVal(d, 'r_desc').trim(), next = fieldVal(d, 'r_next');
        if (!isFinite(amt) || amt <= 0) { er.textContent = 'Enter a valid amount.'; return; } if (!desc) { er.textContent = 'Add a description.'; return; } if (!next) { er.textContent = 'Pick the first due date.'; return; } if (!fieldVal(d, 'r_cat')) { er.textContent = 'Choose a category.'; return; }
        Store.save('recurring', { id: U.uid('rec'), type: type, amount: amt, categoryId: fieldVal(d, 'r_cat'), accountId: fieldVal(d, 'r_acc'), paymentMethod: 'Other', description: desc, freq: fieldVal(d, 'r_freq'), next: next, active: true }).then(function () { api.close(); Store.runRecurring().then(function () { App.render(); }); }, function (e) { er.textContent = e.message; });
      };
    });
  };

  /* ---------------- appearance ---------------- */
  var CURR = ['INR', 'USD', 'EUR', 'GBP', 'BDT', 'AED', 'SAR', 'PKR', 'NPR', 'LKR', 'AUD', 'CAD', 'SGD', 'JPY', 'CNY'];
  S.appearance = function (view) {
    var cur = P.get('currency'), th = P.get('thresholds');
    var sel = function (id, opts, val) { return '<select class="in" id="' + id + '">' + opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(val) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>'; };
    page(view, 'Appearance &amp; preferences', '<div class="card"><label class="f" for="p_name" style="margin-top:0">Application name</label><input class="in" id="p_name" maxlength="40" value="' + esc(P.get('appName')) + '">' +
      '<div class="fgrid two"><div><label class="f" for="p_cur">Currency</label>' + sel('p_cur', CURR.concat(CURR.indexOf(cur) < 0 ? [cur] : []).map(function (c) { return [c, c]; }), cur) + '</div><div><label class="f" for="p_cur2">…or other 3-letter code</label><input class="in" id="p_cur2" maxlength="3" placeholder="e.g. NGN" style="text-transform:uppercase"></div></div>' +
      '<p class="small muted">Currency changes how amounts are displayed; existing records are not converted.</p>' +
      '<label class="f" for="p_date">Date format (display only — stored as YYYY-MM-DD)</label>' + sel('p_date', [['dd/mm/yyyy', 'dd/mm/yyyy (28/10/2026)'], ['dd-mm-yyyy', 'dd-mm-yyyy'], ['dd MMM yyyy', 'dd MMM yyyy (28 Oct 2026)'], ['yyyy-mm-dd', 'yyyy-mm-dd']], P.get('dateFmt')) +
      '<label class="f" for="p_theme">Theme</label>' + sel('p_theme', [['light', 'Light'], ['dark', 'Dark'], ['auto', 'Match device']], P.get('theme')) +
      '<label class="switch"><span>Compact mode (tighter spacing)</span><input type="checkbox" id="p_compact"' + (P.get('compact') ? ' checked' : '') + '></label>' +
      '<label class="f">Budget alert thresholds (% of limit)</label><div class="fgrid" style="grid-template-columns:repeat(3,1fr);gap:8px"><input class="in" id="p_t0" inputmode="numeric" value="' + th[0] + '" aria-label="Notice at"><input class="in" id="p_t1" inputmode="numeric" value="' + th[1] + '" aria-label="Warning at"><input class="in" id="p_t2" inputmode="numeric" value="' + th[2] + '" aria-label="Exceeded at"></div>' +
      (Store.mode === 'shared' ? '<label class="f" for="p_sync">Automatic sync</label>' + sel('p_sync', [[0, 'Manual only'], [30, 'Every 30 seconds'], [60, 'Every minute'], [300, 'Every 5 minutes'], [900, 'Every 15 minutes']], P.get('syncSec')) : '') + errBox('p_err') + '<div class="btnrow"><button class="btn" data-act="pref-save">Save preferences</button></div></div>');
  };
  ACT['pref-save'] = function () {
    var er = $('#p_err'); er.textContent = '';
    var cur = ($('#p_cur2').value.trim().toUpperCase() || $('#p_cur').value);
    if (!/^[A-Z]{3}$/.test(cur)) { er.textContent = 'Currency must be a 3-letter code.'; return; }
    try { new Intl.NumberFormat('en', { style: 'currency', currency: cur }); } catch (e) { er.textContent = 'Unknown currency code.'; return; }
    var t = [0, 1, 2].map(function (i) { return parseInt($('#p_t' + i).value, 10); });
    if (t.some(function (x) { return !(x > 0 && x <= 200); }) || !(t[0] <= t[1] && t[1] <= t[2])) { er.textContent = 'Thresholds must be increasing percentages (for example 75, 90, 100).'; return; }
    var name = $('#p_name').value.trim() || 'GD Expense Tracker';
    var o = { currency: cur, dateFmt: $('#p_date').value, theme: $('#p_theme').value, compact: $('#p_compact').checked, thresholds: t, appName: name };
    if ($('#p_sync')) o.syncSec = Number($('#p_sync').value);
    P.set(o); App.applyTheme(); document.title = name; if (Store.mode === 'shared') Sync.start();
    $$('.brand b, .side .logo b').forEach(function (e) { e.textContent = name; });
    App.toast('Preferences saved'); App.render();
  };

  /* ---------------- branding & assets ---------------- */
  var SLOTS = [
    ['logo', 'Application logo', 'Shown in the header and sidebar. Aspect ratio is preserved.', 512, true],
    ['icon', 'App icon', 'Used for this browser tab/home-screen shortcut on this device. For an installed PWA icon, replace the files in the icons/ folder (see guide).', 512, true],
    ['favicon', 'Favicon', 'Small browser-tab icon.', 96, true],
    ['welcome', 'Welcome-screen illustration', 'Large image on the first-launch screen.', 900, true],
    ['report', 'Report branding image', 'Printed at the top of reports.', 600, true]
  ];
  var DEFAULT_SRC = function (k) { return k === 'welcome' ? App.fullLogoSrc() : (k === 'report' || k === 'logo' ? 'icons/logo-mark.png' : 'icons/icon-192.png'); };
  S.assets = function (view) {
    page(view, 'Branding &amp; assets', '<div class="notice">Images are saved <b>only in this browser</b> (they are not uploaded anywhere). PNG, JPG, WebP or SVG up to 1.5 MB. Until you upload one, the GD Tech Academy logo defaults are used.</div>' + SLOTS.map(function (s) {
      var cur = App.assets[s[0]], src = cur || (s[0] === 'welcome' ? App.fullLogoSrc() : (window.GD_CONFIG && window.GD_CONFIG.LOGO_MARK) || DEFAULT_SRC(s[0]));
      return '<div class="card"><h3>' + s[1] + '</h3><p class="small muted" style="margin:0 0 8px">' + s[2] + '</p><div class="assetprev"><img src="' + esc(src) + '" alt="' + esc(s[1]) + ' preview" style="' + (s[0] === 'welcome' ? 'width:130px;height:auto' : '') + '"><div style="flex:1;min-width:180px"><input class="in" type="file" data-asset="' + s[0] + '" accept="image/png,image/jpeg,image/webp,image/svg+xml" aria-label="Upload ' + esc(s[1]) + '"></div></div>' + (cur ? '<div class="btnrow"><button class="btn sec" data-act="asset-rm" data-k="' + s[0] + '">Remove &amp; use default</button></div>' : '') + '</div>';
    }).join('') + '<p class="small muted">Category icons: upload one per category in Settings → Categories.</p>');
    $$('[data-asset]').forEach(function (inp) { inp.addEventListener('change', function () { onAssetPick(inp); }); });
  };
  function onAssetPick(inp) {
    var f = inp.files[0]; if (!f) return; var slot = SLOTS.find(function (s) { return s[0] === inp.dataset.asset; });
    var ok = /^image\/(png|jpeg|webp|svg\+xml)$/.test(f.type);
    if (!ok) { App.toast('Unsupported file type. Use PNG, JPG, WebP or SVG.', 'bad'); inp.value = ''; return; }
    if (f.size > 1.5 * 1024 * 1024) { App.toast('File is larger than 1.5 MB.', 'bad'); inp.value = ''; return; }
    var make;
    if (f.type === 'image/svg+xml') {
      make = U.readText(f).then(function (t) {
        if (t.length > 200000 || /<script|onload\s*=|onerror\s*=|javascript:|<foreignObject|<iframe/i.test(t)) throw new Error('This SVG contains scripts or unsafe elements and was rejected.');
        return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(t)));
      });
    } else make = U.downscale(f, slot[3], 0.9, f.type !== 'image/jpeg');
    make.then(function (data) {
      App.dialog('<h3>Preview — ' + esc(slot[1]) + '</h3><div class="center"><img src="' + esc(data) + '" alt="Preview" style="max-width:100%;max-height:240px;background:#020a1c;border-radius:12px"></div><div class="btnrow"><button class="btn sec" data-dclose>Cancel</button><button class="btn" id="as_save">Save</button></div>', function (d, api) {
        d.querySelector('#as_save').onclick = function () { App.saveAsset(slot[0], data).then(function () { api.close(); App.toast('Saved'); App.render(); $$('[data-logo]').forEach(function (i) { i.src = App.logoSrc(); }); }); };
        d.addEventListener('close', function () { inp.value = ''; });
      });
    }).catch(function (e) { App.toast(e.message, 'bad'); inp.value = ''; });
  }
  ACT['asset-rm'] = function (el) { App.delAsset(el.dataset.k).then(function () { App.toast('Default restored'); App.render(); }); };

  /* ---------------- data mode & sync ---------------- */
  S.data = function (view) {
    var shared = Store.mode === 'shared', s = Sync.status, inner = '';
    if (shared) {
      var ops = Store.outbox, pend = ops.filter(function (o) { return o.status === 'pending'; }), bad = ops.filter(function (o) { return o.status !== 'pending'; });
      inner += '<div class="card"><h3>' + ic('cloud') + ' Shared mode</h3><p>Workspace: <b>' + esc(Store.ws.name) + '</b> · access: <b>' + esc(Store.ws.role === 'viewer' ? 'read-only (viewer)' : 'read &amp; write') + '</b>' + (P.get('keyLabel') ? ' · key: ' + esc(P.get('keyLabel')) : '') + '</p><p class="small muted">Last sync: ' + (s.last ? new Date(s.last).toLocaleString() : 'not yet') + ' · status: ' + esc(s.state) + (s.msg ? ' — ' + esc(s.msg) : '') + '</p><div class="btnrow"><button class="btn" data-act="sync">' + ic('refresh') + ' Sync now</button><button class="btn sec" data-act="chg-key">' + ic('key') + ' Change key</button></div></div>' +
        '<div class="card"><h3>Sync queue</h3><p>' + pend.length + ' pending · ' + bad.length + ' need attention</p>' + (ops.length ? '<ul class="list">' + ops.map(function (o) {
          var rec = Store.get(o.entity, o.recId); var nm = rec ? (rec.description || rec.name || rec.note || o.entity) : o.recId;
          return '<li class="item"><div class="body"><div class="t">' + esc(o.entity) + ' · ' + esc(nm) + '</div><div class="s">' + (o.status === 'pending' ? '⏳ waiting to sync' : o.status === 'conflict' ? '⚠ changed on another device' : '⚠ ' + esc(o.error || 'failed')) + '</div></div>' + (o.status === 'conflict' ? '<div class="actions"><button class="btn sec" style="min-height:36px;padding:0 10px" data-act="op-mine" data-id="' + esc(o.id) + '">Keep mine</button><button class="btn sec" style="min-height:36px;padding:0 10px" data-act="op-server" data-id="' + esc(o.id) + '">Use server</button></div>' : o.status === 'failed' ? '<div class="actions"><button class="btn sec" style="min-height:36px;padding:0 10px" data-act="op-retry" data-id="' + esc(o.id) + '">Retry</button><button class="btn sec" style="min-height:36px;padding:0 10px" data-act="op-server" data-id="' + esc(o.id) + '">Discard</button></div>' : '') + '</li>';
        }).join('') + '</ul>' : '<div class="empty small">Everything is synchronized.</div>') + '</div>' +
        '<div class="card"><h3>Switch data mode</h3><p class="small">Switch to Personal Mode to work with private, on-device records. Shared and personal data are <b>never merged</b>.</p><div class="btnrow"><button class="btn sec" data-act="to-personal">Switch to Personal Mode…</button></div></div>';
    } else {
      inner += '<div class="card"><h3>' + ic('lock') + ' Personal mode</h3><p>Your records are stored in this browser only (IndexedDB). Nothing is sent to Google. They are not synced to other devices — use Backup to move them.</p>' + (Store.memoryOnly ? '<div class="notice bad">Browser storage is not available right now — data will be lost when you close this tab.</div>' : '') + '</div>' +
        '<div class="card"><h3>' + ic('cloud') + ' Switch to Shared Mode</h3><p class="small">Join a synchronized workspace with a Secret Key from the owner. Your personal records stay on this device, are <b>not uploaded</b> and are <b>not merged</b> into the shared workspace. You can switch back at any time.</p><div class="btnrow"><button class="btn" data-act="to-shared">Join shared workspace…</button></div></div>';
    }
    page(view, 'Data mode &amp; sync', inner);
  };
  ACT['op-mine'] = function (el) { Sync.resolve(el.dataset.id, 'mine').then(function () { App.render(); }); };
  ACT['op-retry'] = function (el) { Sync.resolve(el.dataset.id, 'retry').then(function () { App.render(); }); };
  ACT['op-server'] = function (el) { Sync.resolve(el.dataset.id, 'server').then(function () { App.render(); }); };
  ACT['to-personal'] = function () {
    App.confirm('Switch to Personal Mode?', '<p>You will see only the private records stored on this device. The shared workspace “' + esc(Store.ws.name) + '” stays on the server and its cached copy stays (locked) on this device. Unsynced shared changes wait until you return.</p><p><b>Nothing is merged or uploaded.</b></p>', 'Switch to Personal', false).then(function (ok) {
      if (!ok) return; Sync.stop(); P.set({ mode: 'personal' }); Store.open('personal').then(function () { App.startApp(); location.hash = '#/home'; });
    });
  };
  ACT['to-shared'] = function () {
    var cfg = GD.API.url();
    App.dialog('<h3>Join shared workspace</h3><div class="notice warn">Your personal records stay on this device and are <b>not</b> uploaded or merged. Anyone holding a valid key can access that workspace.</div><label class="f" for="s_key">Secret Key</label><input class="in" id="s_key" autocomplete="off" spellcheck="false">' + (cfg ? '<input type="hidden" id="s_url" value="' + esc(cfg) + '">' : '<label class="f" for="s_url">Apps Script Web App URL</label><input class="in" id="s_url" inputmode="url" placeholder="https://script.google.com/macros/s/…/exec">') + '<label class="switch"><span>Remember key on this device</span><input type="checkbox" id="s_rem" checked></label>' + errBox('s_err') + '<div class="btnrow"><button class="btn sec" data-dclose>Cancel</button><button class="btn" id="s_go">Join</button></div>', function (d, api) {
      d.querySelector('#s_go').onclick = function () { joinFromDialog(d, api); };
    });
  };
  ACT['chg-key'] = function () {
    App.dialog('<h3>Change access key</h3><label class="f" for="s_key">New Secret Key</label><input class="in" id="s_key" autocomplete="off" spellcheck="false"><input type="hidden" id="s_url" value="' + esc(GD.API.url()) + '"><label class="switch"><span>Remember key on this device</span><input type="checkbox" id="s_rem"' + (P.get('remember') ? ' checked' : '') + '></label>' + errBox('s_err') + '<div class="btnrow"><button class="btn sec" data-dclose>Cancel</button><button class="btn" id="s_go">Verify &amp; use</button></div>', function (d, api) {
      d.querySelector('#s_go').onclick = function () { joinFromDialog(d, api, true); };
    });
  };
  function joinFromDialog(d, api, same) {
    var key = fieldVal(d, 's_key').trim(), url = fieldVal(d, 's_url').trim(), er = d.querySelector('#s_err'); er.textContent = '';
    if (!key) { er.textContent = 'Enter the Secret Key.'; return; }
    if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(url) && !/^https?:\/\/(localhost|127\.0\.0\.1)/.test(url)) { er.textContent = 'Enter a valid Apps Script Web App URL.'; return; }
    var prev = P.get('serverUrl'); P.set('serverUrl', url);
    GD.API.call('auth.verify', { key: key }).then(function (r) {
      if (same && Store.ws && r.workspace.id !== Store.ws.id) { P.set('serverUrl', prev); er.textContent = 'This key belongs to a different workspace. Use “Switch data mode” flow to change workspace.'; return; }
      var ws = { id: r.workspace.id, name: r.workspace.name, role: r.role };
      var rem = d.querySelector('#s_rem').checked;
      P.set({ mode: 'shared', wsId: ws.id, wsName: ws.name, role: r.role, keyLabel: r.label || '', remember: rem, serverUrl: url }); P.setKey(key, rem);
      Sync.stop(); Sync.reset(); return Store.open('shared', ws).then(function () { api.close(); App.startApp(); location.hash = '#/home'; App.toast('Connected to ' + ws.name); });
    }).catch(function (e) { P.set('serverUrl', prev || ''); er.textContent = e.code === 'auth' ? 'That key is not valid, has expired, or was revoked.' : e.message; });
  }

  /* ---------------- backup / export / import ---------------- */
  function snapshot() {
    var o = { format: 'gd-expense-tracker-backup', formatVersion: 1, appVersion: (window.GD_CONFIG && window.GD_CONFIG.VERSION) || '1.0.0', createdAt: new Date().toISOString(), mode: Store.mode, currency: P.get('currency'), data: {} };
    Store.ENT.forEach(function (e) { o.data[e] = Store.live(e).map(function (r) { var c = U.clone(r); delete c.v; delete c.seq; delete c.dirty; return c; }); });
    return o;
  }
  S.backup = function (view) {
    var last = P.get('lastBackup');
    var counts = Store.ENT.map(function (e) { return Store.live(e).length + ' ' + e; }).join(' · ');
    page(view, 'Backup, export &amp; import', '<div class="card"><h3>' + ic('dl') + ' Export</h3><p class="small muted">' + esc(counts) + '</p>' + (Store.mode === 'personal' ? '<div class="notice warn">Personal data lives only in this browser. Export a backup regularly — clearing site data deletes it.</div>' : '<div class="notice">Shared export downloads the authorized workspace data (fetched from the server when online).</div>') + '<p class="small">Last backup on this device: <b>' + (last ? new Date(last).toLocaleString() : 'never') + '</b></p><div class="btnrow"><button class="btn" data-act="bk-json">' + ic('dl') + ' Download JSON backup</button><button class="btn sec" data-act="bk-csv">' + ic('dl') + ' Export transactions (CSV)</button></div></div>' +
      '<div class="card"><h3>' + ic('ul') + ' Import / restore</h3><p class="small muted">Choose a JSON backup made by this app. You will see a preview and must confirm before anything changes. Nothing is uploaded automatically' + (Store.mode === 'shared' ? ' — in Shared Mode, imported records are added to the workspace queue and sync like normal edits' : '') + '.</p><input class="in" type="file" id="bk_file" accept="application/json,.json"><div id="bk_prev"></div></div>');
    $('#bk_file').addEventListener('change', function (e) { var f = e.target.files[0]; if (f) importPreview(f); });
  };
  ACT['bk-json'] = function () {
    var done = function (snap) { U.download('gd-expense-backup-' + U.today() + '.json', JSON.stringify(snap, null, 2), 'application/json'); P.set('lastBackup', Date.now()); App.toast('Backup downloaded'); };
    if (Store.mode !== 'shared') return done(snapshot());
    Sync.now().then(function () {
      return GD.API.call('export', { key: P.getKey() }).then(function (r) { var snap = snapshot(); snap.data = r.data; snap.serverExport = true; done(snap); }, function (e) { App.toast('Server unreachable — exporting the synced copy on this device.', 'warn'); done(snapshot()); });
    });
  };
  ACT['bk-csv'] = function () {
    var rows = [['Date', 'Time', 'Type', 'Category', 'Account', 'Payment method', 'Status', 'Amount', 'Description', 'Party', 'Reference', 'Tags']];
    C.txs().sort(U.byKey('date')).forEach(function (t) { var a = C.acc(t.accountId); rows.push([t.date, t.time || '', t.type, catName(t.categoryId), a ? a.name : '', t.paymentMethod || '', t.status || 'paid', t.amount, t.description || '', t.party || '', t.reference || '', t.tags || '']); });
    U.download('gd-expense-transactions-' + U.today() + '.csv', U.csv(rows), 'text/csv;charset=utf-8'); App.toast('CSV exported');
  };
  var IMP = null;
  function validateBackup(j) {
    if (!j || j.format !== 'gd-expense-tracker-backup') return 'This is not a GD Expense Tracker backup file.';
    if (j.formatVersion !== 1) return 'Unsupported backup version (' + j.formatVersion + ').';
    if (!j.data || typeof j.data !== 'object') return 'Backup has no data section.';
    var bad = null;
    Store.ENT.forEach(function (e) { if (j.data[e] != null && !Array.isArray(j.data[e])) bad = e + ' is malformed'; });
    if (bad) return bad;
    (j.data.transactions || []).forEach(function (t) { if (!t || typeof t.id !== 'string' || !(t.type === 'income' || t.type === 'expense') || !isFinite(Number(t.amount)) || !/^\d{4}-\d{2}-\d{2}$/.test(t.date || '')) bad = 'A transaction record is invalid (id, type, amount or date).'; });
    (j.data.accounts || []).forEach(function (a) { if (!a || typeof a.id !== 'string' || typeof a.name !== 'string') bad = 'An account record is invalid.'; });
    (j.data.categories || []).forEach(function (a) { if (!a || typeof a.id !== 'string' || typeof a.name !== 'string' || !(a.type === 'income' || a.type === 'expense')) bad = 'A category record is invalid.'; });
    (j.data.transfers || []).forEach(function (a) { if (!a || typeof a.id !== 'string' || !isFinite(Number(a.amount))) bad = 'A transfer record is invalid.'; });
    return bad;
  }
  var sig = function (t) { return [t.type, t.amount, t.date, t.accountId, (t.description || '').toLowerCase()].join('|'); };
  function importPreview(file) {
    var box = $('#bk_prev'); box.innerHTML = '';
    if (file.size > 20 * 1024 * 1024) { box.innerHTML = '<div class="notice bad">File is too large.</div>'; return; }
    U.readText(file).then(function (t) {
      var j; try { j = JSON.parse(t); } catch (e) { box.innerHTML = '<div class="notice bad">That file is not valid JSON.</div>'; return; }
      var bad = validateBackup(j); if (bad) { box.innerHTML = '<div class="notice bad">' + esc(bad) + '</div>'; return; }
      var existSig = {}; C.txs().forEach(function (t) { existSig[sig(t)] = 1; });
      var rows = Store.ENT.map(function (e) {
        var list = j.data[e] || [], dupId = list.filter(function (r) { return Store.get(e, r.id) && !Store.get(e, r.id).deleted; }).length;
        var dupSig = e === 'transactions' ? list.filter(function (r) { return !Store.get(e, r.id) && existSig[sig(r)]; }).length : 0;
        return { e: e, total: list.length, dupId: dupId, dupSig: dupSig, fresh: list.length - dupId - dupSig };
      });
      IMP = { j: j, rows: rows };
      box.innerHTML = '<div class="notice good">Backup from <b>' + esc((j.createdAt || '').slice(0, 10)) + '</b> (' + esc(j.mode || '?') + ' mode, app ' + esc(j.appVersion || '?') + ').</div>' + '<div class="tblwrap"><table class="t"><thead><tr><th scope="col">Data</th><th class="r" scope="col">In file</th><th class="r" scope="col">New</th><th class="r" scope="col">Same id</th><th class="r" scope="col">Looks duplicate</th></tr></thead><tbody>' + rows.map(function (r) { return '<tr><td>' + r.e + '</td><td class="r">' + r.total + '</td><td class="r">' + r.fresh + '</td><td class="r">' + r.dupId + '</td><td class="r">' + r.dupSig + '</td></tr>'; }).join('') + '</tbody></table></div>' +
        '<label class="f" for="imp_mode">How should it be applied?</label><select class="in" id="imp_mode"><option value="skip">Merge — add new records, skip duplicates</option><option value="overwrite">Merge — add new, overwrite records with the same id</option>' + (Store.mode === 'personal' ? '<option value="replace">Replace everything on this device</option>' : '') + '</select><div class="btnrow"><button class="btn" data-act="imp-go">Import</button></div>';
    });
  }
  ACT['imp-go'] = function () {
    if (!IMP || guard()) return; var mode = $('#imp_mode').value;
    App.confirm('Apply import?', mode === 'replace' ? '<p><b>All current data on this device will be erased</b> and replaced by the backup. This cannot be undone.</p>' : '<p>Records will be merged into your current data (' + (mode === 'skip' ? 'duplicates are skipped' : 'same-id records are overwritten') + ').</p>', 'Import', mode === 'replace').then(function (ok) {
      if (!ok) return; var j = IMP.j;
      var run = mode === 'replace' ? Store.clearAll() : Promise.resolve();
      var existSig = {}; C.txs().forEach(function (t) { existSig[sig(t)] = 1; });
      run.then(function () {
        return Store.ENT.reduce(function (p, e) {
          return p.then(function () {
            var recs = (j.data[e] || []).filter(function (r) {
              var ex = Store.get(e, r.id);
              if (ex && !ex.deleted) return mode === 'overwrite';
              if (e === 'transactions' && existSig[sig(r)] && mode !== 'replace') return false; return true;
            }).map(function (r) { var c = U.clone(r); var ex = Store.get(e, c.id); if (ex) { c.v = ex.v; c.seq = ex.seq; } delete c.deleted; delete c.deletedAt; return c; });
            return recs.length ? Store.saveMany(e, recs) : null;
          });
        }, Promise.resolve());
      }).then(function () { IMP = null; App.toast('Import complete'); App.nav('#/home'); }, function (e) { App.toast('Import failed: ' + e.message, 'bad'); });
    });
  };

  /* ---------------- privacy & installation ---------------- */
  S.privacy = function (view) {
    var noPwa = window.GD_CONFIG && window.GD_CONFIG.PWA === false;
    page(view, 'Privacy &amp; installation', '<div class="card"><h3>' + ic('shield') + ' What is stored where</h3>' + '<table class="t"><tbody><tr><th scope="row">Personal Mode records</th><td>This browser only (IndexedDB). Never sent to Google.</td></tr><tr><th scope="row">Preferences</th><td>This browser (localStorage): currency, theme, etc.</td></tr><tr><th scope="row">Branding images</th><td>This browser only.</td></tr><tr><th scope="row">Shared Mode records</th><td>Your Google Sheet (via Apps Script) + an offline copy on each device.</td></tr><tr><th scope="row">Receipts (Shared Mode)</th><td>Private folder in the owner\'s Google Drive. Never public.</td></tr><tr><th scope="row">Secret Key</th><td>Kept on this device (if “remember” is on). The server stores only a salted hash.</td></tr></tbody></table><p class="small muted">The app never asks for or stores bank passwords, UPI PINs or card CVVs. Data is not end-to-end encrypted: the sheet owner can read shared records.</p></div>' +
      '<div class="card"><h3>' + ic('dl') + ' Install as an app</h3>' + (noPwa ? '<div class="notice warn">This copy is running from a Blogger page. Blogger cannot host the manifest/service-worker files needed for full PWA install or offline app shell. You can still use “Add to Home screen” for a shortcut. For a real installable PWA, host the same files on GitHub Pages (see the guide).</div>' : '') + (App.deferredInstall ? '<button class="btn" data-act="install">Install now</button>' : '<ul><li><b>Android (Chrome):</b> ⋮ menu → <i>Install app</i> / <i>Add to Home screen</i>.</li><li><b>iPhone/iPad (Safari):</b> Share → <i>Add to Home Screen</i>.</li><li><b>Windows/Mac (Chrome, Edge):</b> install icon at the right of the address bar.</li></ul>') + '<p class="small muted">Personal-mode data and the app screens work offline once installed/loaded over HTTPS. Shared-mode changes are queued and synced when you are online.</p></div>');
  };

  /* ---------------- danger zone ---------------- */
  S.danger = function (view) {
    page(view, 'Clear data &amp; reset', '<div class="card"><h3>Reset app settings</h3><p class="small">Resets currency, theme, date format, alert thresholds etc. Your records and branding images are kept.</p><button class="btn sec" data-act="reset-prefs">Reset settings</button></div>' +
      '<div class="card"><h3>' + (Store.mode === 'shared' ? 'Clear shared cache on this device' : 'Clear all local data') + '</h3><p class="small">' + (Store.mode === 'shared' ? 'Deletes the offline copy of this workspace (and unsynced changes) from <b>this device only</b>. Server data is not touched; sign in again to re-download it.' : 'Permanently deletes <b>all personal records on this device</b>. Download a backup first.') + '</p><button class="btn danger" data-act="clear-data">' + (Store.mode === 'shared' ? 'Clear cache…' : 'Delete all local data…') + '</button></div>');
  };
  ACT['reset-prefs'] = function () {
    App.confirm('Reset settings?', '<p>Your records stay. Mode and sign-in are kept.</p>', 'Reset', false).then(function (ok) {
      if (!ok) return; var keep = { mode: P.get('mode'), wsId: P.get('wsId'), wsName: P.get('wsName'), role: P.get('role'), serverUrl: P.get('serverUrl'), keyLabel: P.get('keyLabel'), remember: P.get('remember') };
      P.reset(); P.set(keep); App.applyTheme(); App.toast('Settings reset'); App.nav('#/home'); setTimeout(function () { location.reload(); }, 400);
    });
  };
  ACT['clear-data'] = function () {
    var shared = Store.mode === 'shared';
    App.dialog('<h3>' + (shared ? 'Clear shared cache?' : 'Delete all local data?') + '</h3><p>' + (shared ? 'Unsynced offline changes will be lost.' : 'This permanently erases every transaction, account, category and budget stored on this device.') + '</p><label class="f" for="cd_t">Type <b>DELETE</b> to confirm</label><input class="in" id="cd_t" autocomplete="off">' + errBox('cd_e') + '<div class="btnrow"><button class="btn sec" data-dclose>Cancel</button><button class="btn danger" id="cd_go">Delete</button></div>', function (d, api) {
      d.querySelector('#cd_go').onclick = function () {
        if (fieldVal(d, 'cd_t').trim() !== 'DELETE') { d.querySelector('#cd_e').textContent = 'Type DELETE exactly.'; return; }
        api.close(); Sync.stop();
        var p = shared ? Store.clearAll().then(function () { return Store.db.clear('meta'); }) : Store.clearAll().then(function () { return Store.db.clear('meta'); }).then(function () { return Store.seed(); });
        p.then(function () { App.toast('Data cleared'); if (shared) { Sync.start(); } App.nav('#/home'); });
      };
    });
  };
})();
