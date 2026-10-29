/* GD Expense Tracker — utilities (no dependencies) */
(function () {
  'use strict';
  var GD = (window.GD = window.GD || {});
  var U = (GD.U = {});

  U.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  U.uid = function (p) {
    var a = new Uint8Array(6);
    (window.crypto || window.msCrypto).getRandomValues(a);
    var h = ''; for (var i = 0; i < a.length; i++) h += ('0' + a[i].toString(16)).slice(-2);
    return (p || 'id') + '_' + Date.now().toString(36) + h;
  };
  U.pad = function (n) { return ('0' + n).slice(-2); };
  U.iso = function (d) { return d.getFullYear() + '-' + U.pad(d.getMonth() + 1) + '-' + U.pad(d.getDate()); };
  U.today = function () { return U.iso(new Date()); };
  U.parse = function (s) { var p = String(s).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2] || 1); };
  U.ym = function (iso) { return String(iso).slice(0, 7); };
  U.addDays = function (iso, n) { var d = U.parse(iso); d.setDate(d.getDate() + n); return U.iso(d); };
  U.addMonthsYM = function (ym, n) { var p = ym.split('-').map(Number); var d = new Date(p[0], p[1] - 1 + n, 1); return d.getFullYear() + '-' + U.pad(d.getMonth() + 1); };
  U.addMonths = function (iso, n) {
    var d = U.parse(iso), day = d.getDate();
    var t = new Date(d.getFullYear(), d.getMonth() + n, 1);
    var last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
    t.setDate(Math.min(day, last)); return U.iso(t);
  };
  U.monthStart = function (ym) { return ym + '-01'; };
  U.monthEnd = function (ym) { var p = ym.split('-').map(Number); return U.iso(new Date(p[0], p[1], 0)); };
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  U.MON = MON;
  U.monthLabel = function (ym) { var p = ym.split('-'); return MON[+p[1] - 1] + ' ' + p[0]; };
  U.fmtDate = function (iso, fmt) {
    if (!iso) return '';
    var p = String(iso).slice(0, 10).split('-'); if (p.length < 3) return iso;
    switch (fmt) {
      case 'dd-mm-yyyy': return p[2] + '-' + p[1] + '-' + p[0];
      case 'dd MMM yyyy': return p[2] + ' ' + MON[+p[1] - 1] + ' ' + p[0];
      case 'yyyy-mm-dd': return p.join('-');
      default: return p[2] + '/' + p[1] + '/' + p[0];
    }
  };
  U.weekStart = function (iso) { var d = U.parse(iso); var w = (d.getDay() + 6) % 7; d.setDate(d.getDate() - w); return U.iso(d); };

  // money — all sums are done in integer minor units to avoid float drift
  U.minor = function (x) { return Math.round(Number(x) * 100); };
  U.sum = function (arr, fn) { var t = 0; for (var i = 0; i < arr.length; i++) t += U.minor(fn ? fn(arr[i]) : arr[i]); return t / 100; };
  var nfCache = {};
  U.money = function (n, cur, opts) {
    cur = cur || 'INR'; n = Number(n) || 0;
    var key = cur + (opts && opts.compact ? 'c' : '');
    try {
      nfCache[key] = nfCache[key] || new Intl.NumberFormat(cur === 'INR' ? 'en-IN' : undefined, { style: 'currency', currency: cur, maximumFractionDigits: 2, minimumFractionDigits: opts && opts.compact ? 0 : 2 });
      return nfCache[key].format(n);
    } catch (e) { return cur + ' ' + n.toFixed(2); }
  };
  U.num = function (n) { return (Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 }); };
  U.parseAmount = function (s) {
    var t = String(s == null ? '' : s).replace(/[,\s₹$€£]/g, '');
    if (!/^\d*\.?\d+$|^\d+\.?$/.test(t)) return NaN;
    return Math.round(parseFloat(t) * 100) / 100;
  };

  U.debounce = function (fn, ms) { var t; return function () { var a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms); }; };
  U.download = function (name, text, mime) {
    var b = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };
  U.csv = function (rows) {
    return '﻿' + rows.map(function (r) {
      return r.map(function (v) {
        v = v == null ? '' : String(v);
        if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; // neutralise spreadsheet formula injection
        return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(',');
    }).join('\r\n');
  };
  U.readText = function (file) {
    return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; r.readAsText(file); });
  };
  U.readDataUrl = function (file) {
    return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; r.readAsDataURL(file); });
  };
  // Downscale a raster image to JPEG/PNG data URL (keeps aspect ratio)
  U.downscale = function (file, maxPx, quality, keepPng) {
    return U.readDataUrl(file).then(function (url) {
      return new Promise(function (res, rej) {
        var im = new Image();
        im.onload = function () {
          var k = Math.min(1, maxPx / Math.max(im.width, im.height));
          var c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
          var x = c.getContext('2d'); if (!keepPng) { x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); }
          x.drawImage(im, 0, 0, c.width, c.height);
          res(c.toDataURL(keepPng ? 'image/png' : 'image/jpeg', quality || 0.8));
        };
        im.onerror = function () { rej(new Error('Image could not be read')); };
        im.src = url;
      });
    });
  };
  U.copy = function (text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (res) {
      var t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); } catch (e) {} t.remove(); res();
    });
  };
  U.clone = function (o) { return JSON.parse(JSON.stringify(o)); };
  U.byKey = function (k, dir) { return function (a, b) { return (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * (dir || 1); }; };
})();
