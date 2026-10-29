/* GD Expense Tracker — Reports */
(function () {
  'use strict';
  var GD = window.GD, App = GD.App, U = GD.U, Store = GD.Store, P = GD.Prefs, C = Store.calc, esc = U.esc, ic = App.ic, $ = App.$, $$ = App.$$, ACT = App.act;
  var money = App.money, dt = App.dt;
  var R = (App.rep = { period: 'month', day: U.today(), week: U.today(), ym: U.ym(U.today()), year: String(new Date().getFullYear()), from: U.addDays(U.today(), -30), to: U.today() });
  var catName = function (id) { var c = C.cat(id); return c ? c.name : 'Uncategorised'; };

  function range() {
    switch (R.period) {
      case 'day': return { from: R.day, to: R.day, label: dt(R.day) };
      case 'week': var s = U.weekStart(R.week), e = U.addDays(s, 6); return { from: s, to: e, label: dt(s) + ' – ' + dt(e) };
      case 'year': return { from: R.year + '-01-01', to: R.year + '-12-31', label: R.year };
      case 'custom': var f = R.from <= R.to ? R.from : R.to, t = R.from <= R.to ? R.to : R.from; return { from: f, to: t, label: dt(f) + ' – ' + dt(t) };
      default: return { from: U.monthStart(R.ym), to: U.monthEnd(R.ym), label: U.monthLabel(R.ym) };
    }
  }
  function diffDays(a, b) { return Math.round((U.parse(b) - U.parse(a)) / 86400000) + 1; }
  function table(head, rows, rightFrom) {
    return '<div class="tblwrap"><table class="t"><thead><tr>' + head.map(function (h, i) { return '<th scope="col"' + (i >= rightFrom ? ' class="r"' : '') + '>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.map(function (r) { return '<tr>' + r.map(function (c, i) { return '<td' + (i >= rightFrom ? ' class="r num"' : '') + '>' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
  }
  function topN(groups, n) {
    if (groups.length <= n) return groups;
    var rest = groups.slice(n).reduce(function (a, g) { return a + U.minor(g.v); }, 0) / 100;
    return groups.slice(0, n).concat([{ key: '__other', v: rest }]);
  }
  function breakdown(list, type, title) {
    var g = C.groupBy(list.filter(function (t) { return t.type === type; }), function (t) { return t.categoryId; });
    if (!g.length) return '<div class="card"><h3>' + title + '</h3><div class="empty small">No ' + type + ' in this period.</div></div>';
    var total = g.reduce(function (a, b) { return a + U.minor(b.v); }, 0) / 100;
    var top = topN(g, 8);
    var items = top.map(function (x) { return { label: x.key === '__other' ? 'Other' : catName(x.key), v: x.v }; });
    return '<div class="card"><h3>' + title + '</h3>' + GD.Charts.donut(items, money, title) +
      '<details class="acc"><summary>View data table</summary>' + table(['Category', 'Amount', 'Share'], g.map(function (x) { return [esc(catName(x.key)), money(x.v), Math.round((x.v / total) * 100) + '%']; }), 1) + '</details></div>';
  }

  App.views.reports = function (view) {
    var rg = range(), paid = C.inRange(C.paid(), rg.from, rg.to);
    var inc = C.total(paid, 'income'), exp = C.total(paid, 'expense'), net = (U.minor(inc) - U.minor(exp)) / 100;
    var days = diffDays(rg.from, rg.to), body = '';
    var pill = function (k, l) { return '<button class="pill" data-act="rperiod" data-v="' + k + '" aria-pressed="' + (R.period === k) + '">' + l + '</button>'; };
    var picker;
    if (R.period === 'day') picker = '<input class="in" type="date" id="rp_day" value="' + R.day + '" aria-label="Day">';
    else if (R.period === 'week') picker = '<input class="in" type="date" id="rp_week" value="' + R.week + '" aria-label="Any day in the week">';
    else if (R.period === 'year') picker = '<input class="in" type="number" id="rp_year" min="1990" max="2100" value="' + R.year + '" aria-label="Year">';
    else if (R.period === 'custom') picker = '<div class="fgrid two" style="width:100%"><div><label class="f" for="rp_from" style="margin-top:0">From</label><input class="in" type="date" id="rp_from" value="' + R.from + '"></div><div><label class="f" for="rp_to" style="margin-top:0">To</label><input class="in" type="date" id="rp_to" value="' + R.to + '"></div></div>';
    else picker = '<input class="in" type="month" id="rp_month" value="' + R.ym + '" aria-label="Month">';
    var nav = R.period === 'custom' ? '' : '<button class="sbtn" data-act="rprev" aria-label="Previous period">' + ic('left') + '</button>' + '<div style="flex:1">' + picker + '</div>' + '<button class="sbtn" data-act="rnext" aria-label="Next period">' + ic('right') + '</button>';
    if (R.period === 'custom') nav = picker;

    // summary tiles
    var rate = inc > 0 ? Math.round((net / inc) * 100) + '%' : '—';
    body += '<div class="grid tiles"><div class="tile inc"><div class="ti">' + ic('down') + '</div><div class="tl">Income</div><div class="tv">' + money(inc) + '</div><div class="ts">' + paid.filter(function (t) { return t.type === 'income'; }).length + ' entries</div></div>' +
      '<div class="tile exp"><div class="ti">' + ic('up') + '</div><div class="tl">Expenses</div><div class="tv">' + money(exp) + '</div><div class="ts">' + paid.filter(function (t) { return t.type === 'expense'; }).length + ' entries</div></div>' +
      '<div class="tile sav' + (net < 0 ? ' neg' : '') + '"><div class="ti">' + ic('target') + '</div><div class="tl">Net savings</div><div class="tv">' + money(net) + '</div><div class="ts">Savings rate ' + rate + '</div></div>' +
      '<div class="tile bal"><div class="ti">' + ic('wallet') + '</div><div class="tl">Balance now</div><div class="tv">' + money(C.balance()) + '</div><div class="ts">All accounts</div></div></div>';

    // income vs expense chart
    if (days > 1) {
      var groups = [];
      if (days <= 62) {
        for (var d = rg.from; d <= rg.to; d = U.addDays(d, 1)) {
          var l = paid.filter(function (t) { return t.date === d; });
          groups.push({ label: R.period === 'week' ? ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][U.parse(d).getDay()] + ' ' + U.parse(d).getDate() : String(U.parse(d).getDate()), a: C.total(l, 'income'), b: C.total(l, 'expense'), key: d });
        }
      } else {
        for (var m = U.ym(rg.from); m <= U.ym(rg.to); m = U.addMonthsYM(m, 1)) { var s = C.monthSummary(m); groups.push({ label: U.MON[+m.slice(5) - 1], a: s.inc, b: s.exp, key: m }); }
      }
      body += '<div class="charts"><div class="card"><h3>' + ic('chart') + ' Income vs expenses</h3>' + GD.Charts.bars(groups, 'Income', 'Expenses', '#0b8f63', '#d63a44', 'Income versus expenses') +
        '<details class="acc"><summary>View data table</summary>' + table(['Period', 'Income', 'Expenses', 'Net'], groups.map(function (g) { return [esc(g.key), money(g.a), money(g.b), money(g.a - g.b)]; }), 1) + '</details></div>';
      // savings trend (12 months)
      var endYM = U.ym(rg.to), pts = [];
      for (var i = 11; i >= 0; i--) { var mm = U.addMonthsYM(endYM, -i); pts.push({ label: U.MON[+mm.slice(5) - 1], v: C.monthSummary(mm).net, key: mm }); }
      body += '<div class="card"><h3>' + ic('target') + ' Monthly savings trend</h3>' + GD.Charts.line(pts, '#6d4fd8', 'Monthly savings, last 12 months') +
        '<details class="acc"><summary>View data table</summary>' + table(['Month', 'Net savings'], pts.map(function (p) { return [esc(U.monthLabel(p.key)), money(p.v)]; }), 1) + '</details></div></div>';
    }

    body += '<div class="charts" style="margin-top:var(--gap)">' + breakdown(paid, 'expense', 'Expenses by category') + breakdown(paid, 'income', 'Income by category') + '</div>';

    // payment method
    var pm = C.groupBy(paid.filter(function (t) { return t.type === 'expense'; }), function (t) { return t.paymentMethod || 'Other'; });
    var pmTotal = pm.reduce(function (a, b) { return a + U.minor(b.v); }, 0) / 100;
    body += '<div class="card"><h3>' + ic('wallet') + ' Payment methods (expenses)</h3>' + (pm.length ? pm.map(function (x) { var p = pmTotal ? (x.v / pmTotal) * 100 : 0; return '<div style="margin:8px 0"><div class="small" style="display:flex;justify-content:space-between"><b>' + esc(x.key) + '</b><span class="num">' + money(x.v) + ' · ' + Math.round(p) + '%</span></div><div class="bar"><i style="width:' + p + '%"></i></div></div>'; }).join('') : '<div class="empty small">No expenses in this period.</div>') + '</div>';

    // account balances
    body += '<div class="card"><h3>' + ic('wallet') + ' Account balances (now)</h3>' + table(['Account', 'Balance'], C.accs().map(function (a) { return [esc(a.name) + (a.active === false ? ' <span class="tag">inactive</span>' : ''), money(C.accBalance(a.id))]; }), 1) + '</div>';

    // budget vs actual
    var bym = U.ym(rg.to), bd = C.budget(bym), exps = C.inRange(C.paid(), U.monthStart(bym), U.monthEnd(bym)).filter(function (t) { return t.type === 'expense'; });
    var brows = [];
    if (bd.rec) {
      if (Number(bd.rec.overall) > 0) brows.push(['<b>Overall</b>', Number(bd.rec.overall), C.total(exps, 'expense')]);
      Object.keys(bd.rec.cats || {}).forEach(function (id) { var lim = Number(bd.rec.cats[id]) || 0; if (lim > 0) brows.push([esc(catName(id)), lim, C.total(exps.filter(function (t) { return t.categoryId === id; }), 'expense')]); });
    }
    body += '<div class="card"><h3>' + ic('pie') + ' Budget vs actual · ' + U.monthLabel(bym) + '</h3>' + (brows.length ? table(['Item', 'Budget', 'Spent', 'Used'], brows.map(function (r) { var p = r[1] ? Math.round((r[2] / r[1]) * 100) : 0; return [r[0], money(r[1]), money(r[2]), p + '%' + (p >= P.get('thresholds')[2] ? ' ⚠' : '')]; }), 1) : '<div class="empty small">No budget set for this month. <a href="#/settings/budget">Set a budget</a></div>') + '</div>';

    view.innerHTML = '<div class="printhead"><img src="' + esc(App.assets.report || App.logoSrc()) + '" alt=""><div><h2 style="margin:0">' + esc(P.get('appName')) + ' — Report</h2><div>' + esc(rg.label) + ' · generated ' + esc(dt(U.today())) + '</div></div></div>' +
      '<div class="pagehead noprint"><h1>Reports</h1></div><div class="card noprint"><div class="pillrow" role="group" aria-label="Period">' + pill('day', 'Daily') + pill('week', 'Weekly') + pill('month', 'Monthly') + pill('year', 'Yearly') + pill('custom', 'Custom') + '</div>' +
      '<div style="display:flex;gap:8px;align-items:center;margin-top:10px">' + nav + '</div>' +
      '<div class="btnrow noprint"><button class="btn sec" data-act="rcsv">' + ic('dl') + ' Export CSV</button><button class="btn sec" data-act="rprint">' + ic('print') + ' Print / Save PDF</button></div></div>' +
      '<h2 style="margin:12px 2px">' + esc(rg.label) + '</h2>' + body;
    var bind = function (id, fn) { var e = $('#' + id); if (e) e.addEventListener('change', function (ev) { fn(ev.target.value); App.render(); }); };
    bind('rp_day', function (v) { if (v) R.day = v; }); bind('rp_week', function (v) { if (v) R.week = v; }); bind('rp_month', function (v) { if (v) R.ym = v; });
    bind('rp_year', function (v) { if (/^\d{4}$/.test(v)) R.year = v; }); bind('rp_from', function (v) { if (v) R.from = v; }); bind('rp_to', function (v) { if (v) R.to = v; });
  };
  ACT.rperiod = function (el) { R.period = el.dataset.v; App.render(); };
  function shift(dir) {
    if (R.period === 'day') R.day = U.addDays(R.day, dir); else if (R.period === 'week') R.week = U.addDays(R.week, 7 * dir);
    else if (R.period === 'month') R.ym = U.addMonthsYM(R.ym, dir); else if (R.period === 'year') R.year = String(+R.year + dir);
    App.render();
  }
  ACT.rprev = function () { shift(-1); }; ACT.rnext = function () { shift(1); };
  ACT.rprint = function () { window.print(); };
  ACT.rcsv = function () {
    var rg = range(), rows = [['Date', 'Time', 'Type', 'Category', 'Account', 'Payment method', 'Status', 'Amount', 'Description', 'Party', 'Reference', 'Tags']];
    C.inRange(C.txs(), rg.from, rg.to).sort(U.byKey('date')).forEach(function (t) { var a = C.acc(t.accountId); rows.push([t.date, t.time || '', t.type, catName(t.categoryId), a ? a.name : '', t.paymentMethod || '', t.status || 'paid', t.amount, t.description || '', t.party || '', t.reference || '', t.tags || '']); });
    C.inRange(Store.live('transfers'), rg.from, rg.to).forEach(function (t) { var a = C.acc(t.fromAccountId), b = C.acc(t.toAccountId); rows.push([t.date, '', 'transfer', '', (a ? a.name : '?') + ' -> ' + (b ? b.name : '?'), '', 'paid', t.amount, t.note || '', '', '', '']); });
    U.download('gd-expense-report-' + rg.from + '_to_' + rg.to + '.csv', U.csv(rows), 'text/csv;charset=utf-8'); App.toast('CSV exported', 'good', 1800);
  };
})();
