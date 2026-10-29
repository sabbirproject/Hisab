/* GD Expense Tracker — lightweight SVG charts (no library) */
(function () {
  'use strict';
  var GD = (window.GD = window.GD || {});
  var esc = GD.U.esc;
  var PALETTE = ['#0a5fe0', '#14b8a6', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#84cc16', '#ec4899', '#64748b', '#f97316'];

  function niceMax(v) {
    if (v <= 0) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p;
    var m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
    return m * p;
  }
  function short(n) {
    var a = Math.abs(n);
    if (a >= 1e7) return (n / 1e7).toFixed(1).replace(/\.0$/, '') + 'Cr';
    if (a >= 1e5) return (n / 1e5).toFixed(1).replace(/\.0$/, '') + 'L';
    if (a >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
    return String(Math.round(n));
  }

  // groups: [{label, a, b}] — grouped bars (income vs expense)
  function bars(groups, labelA, labelB, colA, colB, title) {
    var W = 320, H = 170, L = 34, B = 22, T = 8, R = 6;
    var max = niceMax(Math.max.apply(null, groups.map(function (g) { return Math.max(g.a, g.b); }).concat([1])));
    var iw = W - L - R, ih = H - T - B, gw = iw / Math.max(groups.length, 1), bw = Math.min(16, gw / 2.6);
    var every = Math.ceil(groups.length / 8);
    var s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(title) + '">';
    for (var i = 0; i <= 4; i++) {
      var y = T + ih - (ih * i) / 4;
      s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '" stroke="currentColor" opacity=".12"/><text x="' + (L - 4) + '" y="' + (y + 3) + '" text-anchor="end">' + short((max * i) / 4) + '</text>';
    }
    groups.forEach(function (g, k) {
      var cx = L + gw * k + gw / 2;
      var ha = (g.a / max) * ih, hb = (g.b / max) * ih;
      s += '<rect x="' + (cx - bw - 1) + '" y="' + (T + ih - ha) + '" width="' + bw + '" height="' + ha + '" rx="3" fill="' + colA + '"/>';
      s += '<rect x="' + (cx + 1) + '" y="' + (T + ih - hb) + '" width="' + bw + '" height="' + hb + '" rx="3" fill="' + colB + '"/>';
      if (k % every === 0) s += '<text x="' + cx + '" y="' + (H - 7) + '" text-anchor="middle">' + esc(g.label) + '</text>';
    });
    return s + '</svg><div class="legend"><span><i style="background:' + colA + '"></i>' + esc(labelA) + '</span><span><i style="background:' + colB + '"></i>' + esc(labelB) + '</span></div>';
  }

  // line: [{label, v}] — savings trend (can be negative)
  function line(points, color, title) {
    var W = 320, H = 160, L = 38, B = 22, T = 10, R = 8;
    var vals = points.map(function (p) { return p.v; });
    var mx = Math.max.apply(null, vals.concat([0])), mn = Math.min.apply(null, vals.concat([0]));
    if (mx === mn) { mx += 1; }
    var iw = W - L - R, ih = H - T - B;
    var X = function (i) { return L + (points.length === 1 ? iw / 2 : (iw * i) / (points.length - 1)); };
    var Y = function (v) { return T + ih - ((v - mn) / (mx - mn)) * ih; };
    var s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(title) + '">';
    for (var i = 0; i <= 3; i++) {
      var v = mn + ((mx - mn) * i) / 3, y = Y(v);
      s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '" stroke="currentColor" opacity=".12"/><text x="' + (L - 4) + '" y="' + (y + 3) + '" text-anchor="end">' + short(v) + '</text>';
    }
    var zy = Y(0);
    s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + zy + '" y2="' + zy + '" stroke="currentColor" opacity=".35" stroke-dasharray="3 3"/>';
    var d = points.map(function (p, k) { return (k ? 'L' : 'M') + X(k).toFixed(1) + ' ' + Y(p.v).toFixed(1); }).join(' ');
    s += '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>';
    points.forEach(function (p, k) {
      s += '<circle cx="' + X(k) + '" cy="' + Y(p.v) + '" r="3.5" fill="' + color + '"/>';
      if (points.length <= 12 || k % 2 === 0) s += '<text x="' + X(k) + '" y="' + (H - 7) + '" text-anchor="middle">' + esc(p.label) + '</text>';
    });
    return s + '</svg>';
  }

  // donut: [{label, v}] with legend
  function donut(items, fmt, title) {
    var total = items.reduce(function (a, b) { return a + b.v; }, 0);
    if (total <= 0) return '';
    var R = 52, r = 32, cx = 60, cy = 60, ang = -Math.PI / 2;
    var s = '<svg class="chart" style="max-width:190px;margin:0 auto" viewBox="0 0 120 120" role="img" aria-label="' + esc(title) + '">';
    items.forEach(function (it, i) {
      var frac = it.v / total, a2 = ang + frac * Math.PI * 2;
      var col = PALETTE[i % PALETTE.length];
      if (frac >= 0.9999) {
        s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + ((R + r) / 2) + '" fill="none" stroke="' + col + '" stroke-width="' + (R - r) + '"/>';
      } else {
        var x1 = cx + R * Math.cos(ang), y1 = cy + R * Math.sin(ang), x2 = cx + R * Math.cos(a2), y2 = cy + R * Math.sin(a2);
        var x3 = cx + r * Math.cos(a2), y3 = cy + r * Math.sin(a2), x4 = cx + r * Math.cos(ang), y4 = cy + r * Math.sin(ang);
        var big = frac > 0.5 ? 1 : 0;
        s += '<path d="M' + x1 + ' ' + y1 + ' A' + R + ' ' + R + ' 0 ' + big + ' 1 ' + x2 + ' ' + y2 + ' L' + x3 + ' ' + y3 + ' A' + r + ' ' + r + ' 0 ' + big + ' 0 ' + x4 + ' ' + y4 + ' Z" fill="' + col + '"/>';
      }
      ang = a2;
    });
    s += '</svg><div class="legend">';
    items.forEach(function (it, i) {
      s += '<span><i style="background:' + PALETTE[i % PALETTE.length] + '"></i>' + esc(it.label) + ' · ' + Math.round((it.v / total) * 100) + '%</span>';
    });
    return s + '</div>';
  }

  GD.Charts = { bars: bars, line: line, donut: donut, PALETTE: PALETTE };
})();
