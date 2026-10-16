/* Mammoth CRM — Dashboard */
(function () {
  'use strict';
  const MT = window.MT;
  const u = MT.u, ui = MT.ui, store = MT.store, calc = MT.calc;
  const RANGE_KEY = 'mammothcrm.range';

  const PRESETS = [
    { id: 'month', label: 'This month' },
    { id: 'lastmonth', label: 'Last month' },
    { id: 'quarter', label: 'This quarter' },
    { id: 'lastquarter', label: 'Last quarter' },
    { id: 'ytd', label: 'Year to date' },
    { id: '12m', label: 'Last 12 months' },
    { id: 'lastyear', label: 'Last year' },
    { id: 'custom', label: 'Custom' },
  ];

  /* ---------- date range helpers ---------- */
  const D = (y, m, d) => u.isoDate(new Date(y, m, d));
  function shiftMonths(iso, n) {
    const d = u.parseISO(iso);
    const day = d.getDate();
    const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
    const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
    t.setDate(Math.min(day, last));
    return u.isoDate(t);
  }
  /** Returns { from, to, prevFrom, prevTo } for the chosen range. */
  function resolve(r) {
    const now = new Date();
    const today = u.todayISO();
    const y = now.getFullYear(), m = now.getMonth(), q = Math.floor(m / 3) * 3;
    let from, to, unit = 0; // unit: months to shift back for "to date" comparisons
    switch (r.preset) {
      case 'lastmonth': from = D(y, m - 1, 1); to = D(y, m, 0); unit = 1; break;
      case 'quarter': from = D(y, q, 1); to = today; unit = 3; break;
      case 'lastquarter': from = D(y, q - 3, 1); to = D(y, q, 0); unit = 3; break;
      case 'ytd': from = D(y, 0, 1); to = today; unit = 12; break;
      case '12m': from = u.addDays(shiftMonths(today, -12), 1); to = today; unit = 12; break;
      case 'lastyear': from = D(y - 1, 0, 1); to = D(y - 1, 11, 31); unit = 12; break;
      case 'custom':
        from = r.from || D(y, m, 1); to = r.to || today;
        if (from > to) { const t = from; from = to; to = t; }
        break;
      default: from = D(y, m, 1); to = today; unit = 1;
    }
    let prevFrom, prevTo;
    if (unit) {
      prevFrom = shiftMonths(from, -unit);
      prevTo = shiftMonths(to, -unit);
      // Whole calendar periods compare to the whole previous period.
      if (r.preset === 'lastmonth' || r.preset === 'lastquarter') prevTo = u.addDays(from, -1);
    } else {
      const len = u.daysBetween(from, to);
      prevTo = u.addDays(from, -1);
      prevFrom = u.addDays(prevTo, -len);
    }
    return { from, to, prevFrom, prevTo, days: u.daysBetween(from, to) + 1 };
  }
  function rangeText(from, to) {
    const a = u.parseISO(from), b = u.parseISO(to);
    const sameYear = a.getFullYear() === b.getFullYear();
    const thisYear = b.getFullYear() === new Date().getFullYear();
    const f = (d, withYear) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: withYear ? 'numeric' : undefined });
    if (from === to) return f(a, !thisYear);
    if (sameYear && a.getMonth() === b.getMonth()) return u.MONTHS[a.getMonth()] + ' ' + a.getDate() + '–' + b.getDate() + (thisYear ? '' : ', ' + b.getFullYear());
    return f(a, !sameYear || !thisYear) + ' – ' + f(b, !thisYear || !sameYear);
  }
  function loadRange() {
    try { const r = JSON.parse(localStorage.getItem(RANGE_KEY) || 'null'); if (r && r.preset) return r; } catch (e) { /* ignore */ }
    return { preset: 'month', from: '', to: '' };
  }
  function saveRange(r) { try { localStorage.setItem(RANGE_KEY, JSON.stringify(r)); } catch (e) { /* ignore */ } }

  /* ---------- KPI helpers ---------- */
  function delta(cur, prev, opts) {
    opts = opts || {};
    if (cur == null || prev == null) return '<div class="kpi-delta flat">No comparison available</div>';
    let diff, text;
    if (opts.points) {
      diff = cur - prev;
      if (Math.abs(diff) < 0.005) return '<div class="kpi-delta flat">' + icon('flat') + 'Same as ' + opts.vs + '</div>';
      text = (diff > 0 ? '+' : '−') + Math.abs(diff * 100).toFixed(0) + ' pts vs ' + opts.vs;
    } else {
      if (!prev) return '<div class="kpi-delta flat">' + (cur ? 'Nothing in ' + opts.vs + ' to compare' : 'None in either period') + '</div>';
      diff = (cur - prev) / Math.abs(prev);
      if (Math.abs(diff) < 0.005) return '<div class="kpi-delta flat">' + icon('flat') + 'Same as ' + opts.vs + '</div>';
      text = (diff > 0 ? '+' : '−') + Math.abs(diff * 100).toFixed(0) + '% vs ' + opts.vs;
    }
    const good = opts.lowerIsBetter ? diff < 0 : diff > 0;
    return '<div class="kpi-delta ' + (good ? 'up' : 'down') + '">' + icon(diff > 0 ? 'up' : 'down') + u.esc(text) + '</div>';
  }
  function icon(dir) {
    const p = dir === 'up' ? 'M6 15l6-6 6 6' : dir === 'down' ? 'M6 9l6 6 6-6' : 'M6 12h12';
    return '<svg class="kpi-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="' + p + '"/></svg>';
  }

  function buckets(p) {
    const weekly = u.daysBetween(p.from, p.to) <= 120;
    const out = [];
    if (weekly) {
      // Weeks start Monday.
      let s = u.parseISO(p.from);
      s.setDate(s.getDate() - ((s.getDay() + 6) % 7));
      let start = u.isoDate(s);
      while (start <= p.to) {
        const end = u.addDays(start, 6);
        out.push({ from: start < p.from ? p.from : start, to: end > p.to ? p.to : end, label: u.fmtShort(start < p.from ? p.from : start), weekly: true });
        start = u.addDays(start, 7);
      }
    } else {
      const a = u.parseISO(p.from);
      let cur = new Date(a.getFullYear(), a.getMonth(), 1);
      const multiYear = u.parseISO(p.from).getFullYear() !== u.parseISO(p.to).getFullYear();
      while (u.isoDate(cur) <= p.to) {
        const s = u.isoDate(cur), e = u.isoDate(new Date(cur.getFullYear(), cur.getMonth() + 1, 0));
        out.push({ from: s < p.from ? p.from : s, to: e > p.to ? p.to : e, label: u.MONTHS[cur.getMonth()] + (multiYear ? " '" + String(cur.getFullYear()).slice(2) : '') });
        cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
      }
    }
    out.forEach((b) => {
      const js = p.costed.filter((j) => j.d.closedAt >= b.from && j.d.closedAt <= b.to);
      b.profit = u.sum(js, (j) => j.profit);
      b.revenue = u.sum(js, (j) => j.revenue);
      b.count = js.length;
    });
    return out;
  }

  function followUps(state) {
    const today = u.todayISO();
    const out = [];
    state.deals.filter((d) => d.stage === 'won' && calc.balance(d) > 0 && calc.jobDate(d) && u.daysBetween(calc.jobDate(d), today) > 14).forEach((d) => {
      const age = u.daysBetween(calc.jobDate(d), today);
      out.push({ kind: 'deal', id: d.id, sort: -age - 1000, title: 'Collect ' + u.money(calc.balance(d)) + ' from ' + store.customerName(d.customerId), sub: 'Job done ' + age + ' days ago: ' + d.title, amount: calc.balance(d) });
    });
    state.estimates.filter((e) => e.status === 'sent').forEach((e) => {
      const age = u.daysBetween(e.sentAt || e.date, today);
      if (age >= 3) out.push({ kind: 'estimate', id: e.id, sort: -age, title: e.number + ' for ' + store.customerName(e.customerId), sub: 'Sent ' + age + ' days ago, no decision yet', amount: calc.estimate(e, state).total });
    });
    state.deals.filter((d) => store.OPEN_STAGES.includes(d.stage) && d.expectedClose && d.expectedClose < today).forEach((d) => {
      out.push({ kind: 'deal', id: d.id, sort: u.daysBetween(today, d.expectedClose), title: d.title, sub: store.customerName(d.customerId) + ', expected to close ' + u.relDays(d.expectedClose), amount: d.value });
    });
    state.deals.filter((d) => d.stage === 'lead' && u.daysBetween(d.createdAt, today) >= 2).forEach((d) => {
      out.push({ kind: 'deal', id: d.id, sort: -u.daysBetween(d.createdAt, today), title: 'Call ' + store.customerName(d.customerId), sub: 'New lead ' + u.daysBetween(d.createdAt, today) + ' days old: ' + d.title, amount: d.value });
    });
    return out.sort((a, b) => a.sort - b.sort).slice(0, 8);
  }

  function showOwing(p) {
    const today = u.todayISO();
    const rows = p.owing.slice().sort((a, b) => calc.balance(b) - calc.balance(a));
    ui.modal({
      title: 'Unpaid balances',
      size: 'lg',
      body: `<p class="hint">All won jobs with money still owed, largest first. Total owed: <b>${u.money(p.owedAll)}</b>${p.overdue.length ? ', of which ' + u.money(p.overdueTotal) + ' is more than 14 days past the job date' : ''}.</p>
        ${rows.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Customer</th><th>Job</th><th>Job date</th><th class="num">Job total</th><th class="num">Paid</th><th class="num">Balance</th></tr></thead><tbody>
        ${rows.map((d) => { const age = calc.jobDate(d) ? u.daysBetween(calc.jobDate(d), today) : 0; return `<tr class="click" data-deal="${d.id}"><td>${u.esc(store.customerName(d.customerId))}</td><td>${u.esc(d.title)}</td><td class="nowrap">${u.fmtShort(calc.jobDate(d))}${age > 14 ? ' ' + ui.badge(age + ' days', 'bad') : age < 0 ? ' ' + ui.badge('Upcoming', 'info') : ''}</td><td class="num">${u.money(d.value)}</td><td class="num">${u.money(calc.paid(d))}</td><td class="num"><b>${u.money(calc.balance(d))}</b></td></tr>`; }).join('')}
        </tbody></table></div>` : ui.empty('Nobody owes you money right now.')}`,
      onMount(b, close) { u.qsa('[data-deal]', b).forEach((tr) => tr.addEventListener('click', () => { close(); MT.views.pipeline.openDeal(tr.dataset.deal); })); },
    });
  }

  MT.views = MT.views || {};
  const view = (MT.views.dashboard = { title: 'Sales hub', range: null, mode: 'overview' });

  view.render = function (outer) {
    if (MT.app.params.mode) { view.mode = MT.app.params.mode; MT.app.params = {}; }
    outer.innerHTML = `<div class="seg" role="tablist">
        <button role="tab" data-mode="overview" class="${view.mode !== 'goal' ? 'on' : ''}" aria-selected="${view.mode !== 'goal'}">Overview</button>
        <button role="tab" data-mode="goal" class="${view.mode === 'goal' ? 'on' : ''}" aria-selected="${view.mode === 'goal'}">Sales goal</button>
      </div><div id="hub-host" class="stack"></div>`;
    u.qsa('.seg button', outer).forEach((b) => b.addEventListener('click', () => { view.mode = b.dataset.mode; view.render(outer); }));
    const host = u.qs('#hub-host', outer);
    if (view.mode === 'goal') MT.views.pipeline.renderGoal(host);
    else renderOverview(host);
  };

  function renderOverview(root) {
    const s = store.state;
    if (!view.range) view.range = loadRange();
    const R = resolve(view.range);
    const p = calc.period(s, R.from, R.to);
    const prev = calc.period(s, R.prevFrom, R.prevTo);
    const prevText = rangeText(R.prevFrom, R.prevTo);
    const vs = { month: 'last month', lastmonth: 'the month before', quarter: 'last quarter', lastquarter: 'the quarter before', ytd: 'last year', '12m': 'the 12 months before', lastyear: 'the year before' }[view.range.preset] || 'the period before';
    const g = calc.goal(s);
    const oh = calc.overhead(s);
    const pipe = calc.pipeline(s);
    const today = u.todayISO();
    const upcoming = s.deals.filter((d) => d.stage === 'won' && d.scheduledDate && d.scheduledDate >= today).sort((a, b) => (a.scheduledDate < b.scheduledDate ? -1 : 1)).slice(0, 6);
    const fu = followUps(s);
    const monthName = new Date().toLocaleDateString('en-US', { month: 'long' });
    const beFrac = oh.breakEvenRevenueMonthly ? g.monthActual / oh.breakEvenRevenueMonthly : 0;
    const ahead = g.paceDelta >= 0;
    const best = p.costed.slice().sort((a, b) => b.profit - a.profit);
    const nTop = Math.min(4, Math.ceil(best.length / 2));
    const nBot = Math.min(4, best.length - nTop);
    const ytdPaid = calc.period(s, g.year + '-01-01', g.year + '-12-31').paid;

    root.innerHTML = `
      <section class="timebar" aria-label="Date range">
        <div class="seg timebar-presets" role="radiogroup" aria-label="Date range presets">
          ${PRESETS.map((x) => `<button role="radio" aria-checked="${view.range.preset === x.id}" class="${view.range.preset === x.id ? 'on' : ''}" data-preset="${x.id}">${x.label}</button>`).join('')}
        </div>
        <div class="timebar-custom" ${view.range.preset === 'custom' ? '' : 'hidden'}>
          <label class="field"><span>From</span><input class="input" type="date" id="rg-from" value="${R.from}" max="${today}"></label>
          <label class="field"><span>To</span><input class="input" type="date" id="rg-to" value="${R.to}"></label>
        </div>
        <div class="timebar-range"><b>${u.esc(rangeText(R.from, R.to))}</b><span>${R.days} ${R.days === 1 ? 'day' : 'days'}, compared with ${u.esc(prevText)}</span></div>
      </section>

      <section class="kpis" aria-label="Key numbers for the selected dates">
        <article class="kpi">
          <h3 class="kpi-label">Revenue paid</h3>
          <div class="kpi-value">${u.money(p.paid)}</div>
          <div class="kpi-sub">${p.paymentCount} ${p.paymentCount === 1 ? 'payment' : 'payments'} collected</div>
          ${delta(p.paid, prev.paid, { vs })}
        </article>
        <article class="kpi">
          <h3 class="kpi-label">Outstanding</h3>
          <div class="kpi-value">${u.money(p.outstanding)}</div>
          <div class="kpi-sub">Unpaid on ${p.outstandingCount} ${p.outstandingCount === 1 ? 'job' : 'jobs'} won in this period</div>
          <button class="kpi-link" id="kpi-owing">${u.money(p.owedAll)} owed across all jobs${p.overdue.length ? ', ' + p.overdue.length + ' overdue' : ''}</button>
        </article>
        <article class="kpi">
          <h3 class="kpi-label">Estimates</h3>
          <div class="kpi-value">${p.estCount}</div>
          <div class="kpi-sub">${u.money(p.estValue)} quoted, ${p.estAccepted} accepted</div>
          ${delta(p.estCount, prev.estCount, { vs })}
        </article>
        <article class="kpi">
          <h3 class="kpi-label">Close rate</h3>
          <div class="kpi-value">${p.closeRate == null ? '—' : u.pct(p.closeRate)}</div>
          <div class="kpi-sub">${p.wonCount + p.lostCount ? p.wonCount + ' won of ' + (p.wonCount + p.lostCount) + ' decided' : 'No deals won or lost in this period'}</div>
          ${delta(p.closeRate, prev.closeRate, { vs, points: true })}
        </article>
      </section>

      <section class="panel profit-panel">
        <div class="panel-head"><h3>Profit on jobs won</h3><span class="hint">${u.esc(rangeText(R.from, R.to))}</span></div>
        <div class="profit-grid">
          <dl class="profit-stats">
            <div class="ps-main"><dt>Total profit</dt><dd class="${p.profit < 0 ? 'neg' : ''}">${u.money(p.profit)}</dd>${delta(p.costed.length ? p.profit : null, prev.costed.length ? prev.profit : null, { vs })}</div>
            <div><dt>Average profit per job</dt><dd class="${p.avgProfit < 0 ? 'neg' : ''}">${u.money(p.avgProfit)}</dd>${delta(p.costed.length ? p.avgProfit : null, prev.costed.length ? prev.avgProfit : null, { vs })}</div>
            <div><dt>Average margin</dt><dd>${u.pct(p.margin, 1)}</dd><div class="ps-note">Target ${u.esc(s.overhead.targetProfit)}%</div></div>
            <div><dt>Revenue booked</dt><dd>${u.money(p.booked)}</dd><div class="ps-note">${p.wonCount} ${p.wonCount === 1 ? 'job' : 'jobs'} won</div></div>
          </dl>
          <div class="profit-chart">
            <div class="legend"><span><i class="sw bar"></i>Profit</span><span><i class="sw neg"></i>Loss</span><span class="muted">By ${u.daysBetween(R.from, R.to) <= 120 ? 'week' : 'month'} won</span></div>
            <div id="dash-profit"></div>
          </div>
        </div>
        ${p.missingCost ? `<p class="hint">${p.missingCost} won ${p.missingCost === 1 ? 'job has' : 'jobs have'} no job cost yet and ${p.missingCost === 1 ? 'is' : 'are'} left out of profit. Open the deal and add its job cost.</p>` : ''}
        ${best.length ? `<div class="grid-2 profit-lists">
          <div><h4 class="sub-h">Most profitable</h4><ul class="list compact">${best.slice(0, nTop).map(jobRow).join('')}</ul></div>
          <div><h4 class="sub-h">Least profitable</h4><ul class="list compact">${best.slice(best.length - nBot).reverse().map(jobRow).join('') || '<li>' + ui.empty('Not enough jobs to compare.') + '</li>'}</ul></div>
        </div>` : ui.empty('No won jobs with costs in this period.')}
      </section>

      <section class="goal-hero panel">
        <div class="rings-wrap" id="dash-rings"></div>
        <div class="goal-copy">
          <h2 class="display">${u.money(g.ytd)} <span class="of">booked of ${u.money(g.annual)} goal for ${g.year}</span></h2>
          <p class="goal-line ${ahead ? 'good' : 'warn'}">
            <span class="status-dot" aria-hidden="true"></span>
            ${ahead ? u.money(g.paceDelta) + ' ahead of pace' : u.money(-g.paceDelta) + ' behind pace'}
          </p>
          <dl class="facts">
            <div><dt>Still to book</dt><dd>${u.money(g.remaining)}</dd></div>
            <div><dt>Needed per month</dt><dd>${u.money(g.neededPerMonth)}</dd></div>
            <div><dt>Forecast with pipeline</dt><dd>${u.money(g.forecast)}</dd></div>
          </dl>
          <p class="hint">Each ring is a month, January at the center. A full ring means that month hit its target.</p>
        </div>
        <div class="month-stack">
          <div class="stat">
            <div class="stat-label">${monthName} booked</div>
            <div class="stat-value">${u.money(g.monthActual)}</div>
            <div class="meter"><span style="width:${Math.min(100, g.monthTarget ? (g.monthActual / g.monthTarget) * 100 : 0)}%"></span></div>
            <div class="stat-sub">${g.monthTarget ? u.pct(g.monthActual / g.monthTarget) : '0%'} of ${u.money(g.monthTarget)} target</div>
          </div>
          <div class="stat">
            <div class="stat-label">Break-even this month</div>
            <div class="stat-value">${beFrac >= 1 ? 'Covered' : u.money(oh.breakEvenRevenueMonthly - g.monthActual) + ' to go'}</div>
            <div class="meter ${beFrac >= 1 ? 'met' : ''}"><span style="width:${Math.min(100, beFrac * 100)}%"></span></div>
            <div class="stat-sub">Overhead + labor is ${u.money(oh.breakEvenRevenueMonthly)}/mo</div>
          </div>
          <div class="stat-pair">
            <div class="stat"><div class="stat-label">Open pipeline</div><div class="stat-value sm">${u.money(pipe.value)}</div><div class="stat-sub">${pipe.open.length} deals, ${u.moneyShort(pipe.weighted)} weighted</div></div>
            <div class="stat"><div class="stat-label">Collected in ${g.year}</div><div class="stat-value sm">${u.money(ytdPaid)}</div><div class="stat-sub">Payments received</div></div>
          </div>
        </div>
      </section>

      <div class="grid-2-1">
        <section class="panel">
          <div class="panel-head"><h3>Booked revenue by month, ${g.year}</h3>
            <div class="legend"><span><i class="sw bar"></i>Booked revenue</span><span><i class="sw target"></i>Monthly target</span></div>
          </div>
          <div id="dash-months"></div>
        </section>
        <section class="panel">
          <div class="panel-head"><h3>Open pipeline by stage</h3><a href="#pipeline" class="link">Open pipeline</a></div>
          <div id="dash-stages"></div>
        </section>
      </div>

      <div class="grid-3">
        <section class="panel">
          <div class="panel-head"><h3>Upcoming jobs</h3></div>
          ${upcoming.length ? '<ul class="list">' + upcoming.map((d) => `
            <li class="list-row" data-deal="${d.id}">
              <div class="date-chip"><b>${u.parseISO(d.scheduledDate).getDate()}</b><span>${u.MONTHS[u.parseISO(d.scheduledDate).getMonth()]}</span></div>
              <div class="grow"><div class="row-title">${u.esc(d.title)}</div><div class="row-sub">${u.esc(store.customerName(d.customerId))}, ${u.esc(u.relDays(d.scheduledDate))}</div></div>
              <div class="amt">${u.money(d.value)}</div>
            </li>`).join('') + '</ul>' : ui.empty('No jobs on the schedule. Won deals with a job date show up here.')}
        </section>
        <section class="panel">
          <div class="panel-head"><h3>Needs follow-up</h3></div>
          ${fu.length ? '<ul class="list">' + fu.map((f) => `
            <li class="list-row" data-${f.kind}="${f.id}">
              <div class="grow"><div class="row-title">${u.esc(f.title)}</div><div class="row-sub">${u.esc(f.sub)}</div></div>
              <div class="amt">${u.moneyShort(f.amount)}</div>
            </li>`).join('') + '</ul>' : ui.empty('You are caught up. Nothing is waiting on a follow-up.')}
        </section>
        <section class="panel">
          <div class="panel-head"><h3>Recent activity</h3></div>
          <ul class="feed">${s.activities.slice(0, 8).map((a) => `
            <li class="feed-${u.esc(a.type)}"><span class="feed-dot" aria-hidden="true"></span><div><div>${u.esc(a.text)}</div><time>${u.esc(u.fmtDate(a.ts.slice(0, 10)))}</time></div></li>`).join('') || '<li>' + ui.empty('Activity appears here as you work.') + '</li>'}
          </ul>
        </section>
      </div>`;

    function jobRow(j) {
      return `<li class="list-row" data-deal="${j.d.id}"><div class="grow"><div class="row-title">${u.esc(j.d.title)}</div><div class="row-sub">${u.esc(store.customerName(j.d.customerId))}, ${u.money(j.revenue)} job, ${j.revenue ? u.pct(j.profit / j.revenue) : '0%'} margin</div></div><div class="amt ${j.profit < 0 ? 'neg' : ''}">${u.money(j.profit)}</div></li>`;
    }

    // Charts
    const bs = buckets(p);
    MT.charts.bars(u.qs('#dash-profit', root), {
      labels: bs.map((b) => b.label),
      values: bs.map((b) => b.profit),
      ariaLabel: 'Profit by ' + (bs[0] && bs[0].weekly ? 'week' : 'month'),
      tip: (i) => {
        const b = bs[i];
        return '<strong>' + (b.weekly ? 'Week of ' : '') + u.esc(rangeText(b.from, b.to)) + '</strong>' +
          '<div class="tip-row">Profit <b>' + u.money(b.profit) + '</b></div><div class="tip-row">Revenue <b>' + u.money(b.revenue) + '</b></div>' +
          '<div class="tip-muted">' + b.count + (b.count === 1 ? ' job' : ' jobs') + (b.revenue ? ', ' + u.pct(b.profit / b.revenue) + ' margin' : '') + '</div>';
      },
    });
    MT.charts.rings(u.qs('#dash-rings', root), g);
    MT.charts.monthBars(u.qs('#dash-months', root), { actual: g.actual, target: g.targets, curMonth: g.curMonth });
    MT.charts.hbars(u.qs('#dash-stages', root), pipe.byStage.map((b) => ({ label: b.name, value: b.value, sub: b.count + (b.count === 1 ? ' deal' : ' deals') })), {
      tip: (r) => '<strong>' + u.esc(r.label) + '</strong><div class="tip-row">Value <b>' + u.money(r.value) + '</b></div><div class="tip-muted">' + u.esc(r.sub) + '</div>',
    });

    // Time bar
    u.qsa('[data-preset]', root).forEach((b) => b.addEventListener('click', () => {
      view.range.preset = b.dataset.preset;
      if (b.dataset.preset === 'custom' && !view.range.from) { view.range.from = R.from; view.range.to = R.to; }
      saveRange(view.range);
      renderOverview(root);
    }));
    const onDate = () => {
      const f = u.qs('#rg-from', root).value, t = u.qs('#rg-to', root).value;
      if (!f || !t) return;
      view.range = { preset: 'custom', from: f, to: t };
      saveRange(view.range);
      renderOverview(root);
    };
    u.qs('#rg-from', root).addEventListener('change', onDate);
    u.qs('#rg-to', root).addEventListener('change', onDate);

    u.qs('#kpi-owing', root).addEventListener('click', () => showOwing(p));
    u.qsa('[data-deal]', root).forEach((n) => n.addEventListener('click', () => MT.views.pipeline.openDeal(n.dataset.deal)));
    u.qsa('[data-estimate]', root).forEach((n) => n.addEventListener('click', () => MT.app.go('estimator', { id: n.dataset.estimate })));
  }
})();
