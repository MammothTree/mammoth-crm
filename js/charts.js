/* Mammoth CRM — lightweight SVG charts (no dependencies) */
(function () {
  'use strict';
  const MT = window.MT;
  const u = MT.u;
  const NS = 'http://www.w3.org/2000/svg';
  const charts = {};

  /* ---------- shared tooltip ---------- */
  function tip() {
    let t = document.getElementById('chart-tip');
    if (!t) {
      t = document.createElement('div');
      t.id = 'chart-tip';
      t.setAttribute('role', 'tooltip');
      document.body.appendChild(t);
    }
    return t;
  }
  function showTip(e, html) {
    const t = tip();
    t.innerHTML = html;
    t.style.display = 'block';
    const pad = 14, w = t.offsetWidth, h = t.offsetHeight;
    let x = e.clientX + pad, y = e.clientY - h - pad;
    if (x + w > window.innerWidth - 8) x = e.clientX - w - pad;
    if (y < 8) y = e.clientY + pad;
    t.style.left = x + 'px';
    t.style.top = y + 'px';
  }
  function hideTip() { tip().style.display = 'none'; }
  function bindTip(node, htmlFn) {
    node.addEventListener('mousemove', (e) => showTip(e, htmlFn()));
    node.addEventListener('mouseleave', hideTip);
  }
  charts.hideTip = hideTip;

  function el(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  /** Bar with rounded data-end (top) and square baseline. */
  function barPath(x, y, w, h, r) {
    r = Math.min(r, w / 2, h);
    if (h <= 0) return '';
    return 'M' + x + ',' + (y + h) + 'V' + (y + r) + 'Q' + x + ',' + y + ' ' + (x + r) + ',' + y + 'H' + (x + w - r) + 'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) + 'V' + (y + h) + 'Z';
  }
  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  }

  /**
   * Monthly actual-vs-target column chart.
   * opts: { actual:[12], target:[12], curMonth }
   */
  charts.monthBars = function (host, opts) {
    host.innerHTML = '';
    const W = Math.max(320, host.clientWidth || 640), H = 240;
    const m = { t: 12, r: 8, b: 26, l: 48 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const max = niceMax(Math.max.apply(null, opts.actual.concat(opts.target)) * 1.05);
    const svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', height: H, class: 'chart', role: 'img', 'aria-label': 'Monthly revenue compared with target' }, host);
    const y = (v) => m.t + ih - (v / max) * ih;
    for (let i = 0; i <= 4; i++) {
      const v = (max / 4) * i, yy = y(v);
      el('line', { x1: m.l, x2: W - m.r, y1: yy, y2: yy, class: i === 0 ? 'axis' : 'grid' }, svg);
      const t = el('text', { x: m.l - 8, y: yy + 4, 'text-anchor': 'end', class: 'tick' }, svg);
      t.textContent = u.moneyShort(v);
    }
    const bw = iw / 12;
    const barW = Math.min(30, bw - 10);
    opts.actual.forEach((v, i) => {
      const cx = m.l + bw * i + bw / 2;
      const future = opts.curMonth >= 0 && i > opts.curMonth;
      const g = el('g', { class: 'col' }, svg);
      el('rect', { x: m.l + bw * i, y: m.t, width: bw, height: ih, class: 'hit' }, g);
      if (v > 0) el('path', { d: barPath(cx - barW / 2, y(v), barW, ih + m.t - y(v), 4), class: 'bar' + (i === opts.curMonth ? ' current' : '') }, g);
      const tv = opts.target[i];
      if (tv > 0) el('line', { x1: cx - barW / 2 - 4, x2: cx + barW / 2 + 4, y1: y(tv), y2: y(tv), class: 'target' + (future ? ' future' : '') }, g);
      const lab = el('text', { x: cx, y: H - 8, 'text-anchor': 'middle', class: 'tick' + (i === opts.curMonth ? ' strong' : '') }, g);
      lab.textContent = u.MONTHS[i];
      bindTip(g, () => {
        const d = v - tv;
        return '<strong>' + u.MONTHS[i] + '</strong><div class="tip-row"><span class="sw bar"></span>Revenue <b>' + u.money(v) + '</b></div>' +
          '<div class="tip-row"><span class="sw target"></span>Target <b>' + u.money(tv) + '</b></div>' +
          (future ? '' : '<div class="tip-delta ' + (d >= 0 ? 'up' : 'down') + '">' + (d >= 0 ? '+' : '−') + u.money(Math.abs(d)) + (d >= 0 ? ' over target' : ' under target') + '</div>');
      });
    });
  };

  /**
   * Single-series columns that may go negative (e.g. profit by month).
   * opts: { labels:[], values:[], tip(i) -> html, ariaLabel, fmt(v) -> axis label (default: money) }
   */
  charts.bars = function (host, opts) {
    host.innerHTML = '';
    const W = Math.max(300, host.clientWidth || 600), H = 220;
    const m = { t: 12, r: 8, b: 26, l: 52 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const vals = opts.values;
    const hi = niceMax(Math.max.apply(null, vals.concat([0])) * 1.05 || 1);
    const lowRaw = Math.min.apply(null, vals.concat([0]));
    const lo = lowRaw < 0 ? -niceMax(-lowRaw * 1.05) : 0;
    const svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', height: H, class: 'chart', role: 'img', 'aria-label': opts.ariaLabel || 'Bar chart' }, host);
    const y = (v) => m.t + ((hi - v) / (hi - lo)) * ih;
    const ticks = 4;
    for (let i = 0; i <= ticks; i++) {
      const v = lo + ((hi - lo) / ticks) * i;
      el('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: 'grid' }, svg);
      const t = el('text', { x: m.l - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'tick' }, svg);
      t.textContent = opts.fmt ? opts.fmt(v) : u.moneyShort(v);
    }
    el('line', { x1: m.l, x2: W - m.r, y1: y(0), y2: y(0), class: 'axis' }, svg);
    const n = vals.length;
    const bw = iw / n;
    const barW = Math.max(3, Math.min(34, bw - Math.max(4, bw * 0.3)));
    const every = Math.ceil(n / Math.floor(iw / 44));
    vals.forEach((v, i) => {
      const cx = m.l + bw * i + bw / 2;
      const g = el('g', { class: 'col' }, svg);
      el('rect', { x: m.l + bw * i, y: m.t, width: bw, height: ih, class: 'hit' }, g);
      if (v > 0) el('path', { d: barPath(cx - barW / 2, y(v), barW, y(0) - y(v), 4), class: 'bar' }, g);
      else if (v < 0) {
        // Rounded end points down, anchored at the zero line.
        const h = y(v) - y(0);
        el('path', { d: barPath(cx - barW / 2, y(0), barW, h, 4), class: 'bar neg', transform: 'translate(0 ' + (2 * y(0) + h) + ') scale(1 -1)' }, g);
      }
      if (i % every === 0) {
        const lab = el('text', { x: cx, y: H - 8, 'text-anchor': 'middle', class: 'tick' }, g);
        lab.textContent = opts.labels[i];
      }
      if (opts.tip) bindTip(g, () => opts.tip(i));
    });
  };

  /**
   * Horizontal bars. rows: [{label, value, sub}]
   */
  charts.hbars = function (host, rows, opts) {
    opts = opts || {};
    const max = Math.max.apply(null, rows.map((r) => r.value).concat([1]));
    host.innerHTML = '<div class="hbars">' + rows.map((r, i) =>
      '<div class="hbar" data-i="' + i + '"><div class="hbar-label">' + u.esc(r.label) + '</div>' +
      '<div class="hbar-track"><div class="hbar-fill" style="width:' + Math.max(r.value > 0 ? 1.5 : 0, (r.value / max) * 100).toFixed(2) + '%"></div></div>' +
      '<div class="hbar-val">' + u.esc(opts.fmt ? opts.fmt(r.value) : u.money(r.value)) + (r.sub ? '<small>' + u.esc(r.sub) + '</small>' : '') + '</div></div>'
    ).join('') + '</div>';
    if (opts.tip) u.qsa('.hbar', host).forEach((n) => bindTip(n, () => opts.tip(rows[+n.dataset.i])));
  };

  /**
   * Growth rings: one ring per month (January at the heartwood, December at the bark).
   * Each ring fills clockwise as that month's revenue approaches its target.
   */
  charts.rings = function (host, g) {
    host.innerHTML = '';
    const S = 280, c = S / 2, r0 = 38, step = 8.4, sw = 6;
    const svg = el('svg', { viewBox: '0 0 ' + S + ' ' + S, class: 'rings', role: 'img', 'aria-label': 'Sales goal growth rings: ' + u.pct(g.pctOfGoal) + ' of annual goal' }, host);
    el('circle', { cx: c, cy: c, r: r0 - 8, class: 'pith' }, svg);
    for (let i = 0; i < 12; i++) {
      const r = r0 + i * step;
      // Slightly irregular ring, like real wood grain; deterministic per ring.
      const pts = [];
      const N = 72;
      for (let k = 0; k <= N; k++) {
        const a = -Math.PI / 2 + (k / N) * Math.PI * 2;
        const wob = 1 + 0.018 * Math.sin(a * 3 + i * 1.7) + 0.012 * Math.sin(a * 5 + i * 0.9);
        pts.push((c + Math.cos(a) * r * wob).toFixed(2) + ',' + (c + Math.sin(a) * r * wob).toFixed(2));
      }
      const d = 'M' + pts.join('L');
      const future = g.curMonth >= 0 && i > g.curMonth;
      const frac = g.targets[i] ? Math.min(1, g.actual[i] / g.targets[i]) : 0;
      const over = g.targets[i] && g.actual[i] >= g.targets[i];
      const grp = el('g', { class: 'ring' + (future ? ' future' : '') + (i === g.curMonth ? ' current' : '') }, svg);
      el('path', { d, class: 'ring-track', 'stroke-width': sw }, grp);
      if (frac > 0) el('path', { d, class: 'ring-fill' + (over ? ' met' : ''), 'stroke-width': sw, pathLength: 100, 'stroke-dasharray': (frac * 100).toFixed(2) + ' 100' }, grp);
      el('path', { d, class: 'ring-hit', 'stroke-width': step }, grp);
      bindTip(grp, () => {
        const a = g.actual[i], t = g.targets[i];
        return '<strong>' + u.MONTHS[i] + ' ' + g.year + '</strong><div class="tip-row">Revenue <b>' + u.money(a) + '</b></div><div class="tip-row">Target <b>' + u.money(t) + '</b></div>' +
          (future ? '<div class="tip-muted">Upcoming month</div>' : '<div class="tip-delta ' + (a >= t ? 'up' : 'down') + '">' + (t ? u.pct(a / t) : '—') + ' of target</div>');
      });
    }
    const t1 = el('text', { x: c, y: c + 2, 'text-anchor': 'middle', class: 'rings-center' }, svg);
    t1.textContent = Math.round(g.pctOfGoal * 100) + '%';
    const t2 = el('text', { x: c, y: c + 14, 'text-anchor': 'middle', class: 'rings-sub' }, svg);
    t2.textContent = 'of goal';
  };

  MT.charts = charts;
})();
