/* Mammoth CRM — Time tracking: clock in/out, weekly timesheets, labor cost */
(function () {
  'use strict';
  const MT = window.MT;
  const u = MT.u, ui = MT.ui, store = MT.store, calc = MT.calc;
  const KINDS = [{ value: 'shop', label: 'Shop / maintenance' }, { value: 'travel', label: 'Travel / supply run' }, { value: 'office', label: 'Office / estimates' }];
  const DAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const view = { title: 'Time tracking', weekStart: null, crewFilter: '' };
  let ticker = null;

  function monday(iso) { const d = u.parseISO(iso); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return u.isoDate(d); }
  const fmtH = (h) => { const m = Math.round(h * 60); return Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm'; };
  const hrs = (h) => { const v = Math.round(h * 100) / 100; return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/, ''); };
  const fmtTime = (hhmm) => { if (!hhmm) return ''; const [h, m] = hhmm.split(':').map(Number); return ((h + 11) % 12 + 1) + ':' + String(m).padStart(2, '0') + (h < 12 ? ' am' : ' pm'); };
  function jobLabel(e) {
    if (e.dealId) { const d = store.deal(e.dealId); return d ? d.title + ' (' + store.customerName(d.customerId) + ')' : 'Deleted job'; }
    const k = KINDS.find((x) => x.value === e.kind); return k ? k.label : 'Other time';
  }
  function jobOptions(selected) {
    const s = store.state, today = u.todayISO();
    const todays = calc.dayItems(s, today).filter((x) => x.kind === 'job').map((x) => x.deal);
    const recent = s.deals.filter((d) => d.stage === 'won' && !todays.includes(d) && d.scheduledDate && Math.abs(u.daysBetween(d.scheduledDate, today)) <= 30)
      .sort((a, b) => (a.scheduledDate < b.scheduledDate ? 1 : -1));
    const opt = (d) => `<option value="${d.id}" ${d.id === selected ? 'selected' : ''}>${u.esc(d.title + ' (' + store.customerName(d.customerId) + ')')}</option>`;
    return (todays.length ? '<optgroup label="Today\'s jobs">' + todays.map(opt).join('') + '</optgroup>' : '') +
      (recent.length ? '<optgroup label="Other recent jobs">' + recent.map(opt).join('') + '</optgroup>' : '') +
      '<optgroup label="Not on a job">' + KINDS.map((k) => `<option value="kind:${k.value}" ${'kind:' + k.value === selected ? 'selected' : ''}>${k.label}</option>`).join('') + '</optgroup>';
  }
  const openEntry = (crewId) => store.state.timeEntries.find((e) => e.crewId === crewId && !e.end && e.date === u.todayISO());

  view.render = function (root) {
    const s = store.state;
    if (!view.weekStart) view.weekStart = monday(u.todayISO());
    const today = u.todayISO();
    const ws = view.weekStart, we = u.addDays(ws, 6);
    const crew = s.crew.filter((c) => c.active !== false);
    const weekEntries = s.timeEntries.filter((e) => e.date >= ws && e.date <= we && (!view.crewFilter || e.crewId === view.crewFilter));
    const burden = 1 + u.num(s.overhead.laborBurden) / 100;
    const perPerson = crew.map((c) => {
      const es = weekEntries.filter((e) => e.crewId === c.id);
      const byDay = DAY.map((_, i) => u.sum(es.filter((e) => e.date === u.addDays(ws, i)), calc.entryHours));
      const total = u.sum(byDay);
      return { c, byDay, total, jobHours: u.sum(es.filter((e) => e.dealId), calc.entryHours), cost: total * u.num(c.wage) * burden + Math.max(0, total - 40) * u.num(c.wage) * 0.5 * burden };
    }).filter((x) => !view.crewFilter || x.c.id === view.crewFilter);
    const totalH = u.sum(perPerson, (x) => x.total), jobH = u.sum(perPerson, (x) => x.jobHours), cost = u.sum(perPerson, (x) => x.cost);
    const overtime = perPerson.filter((x) => x.total > 40);
    const onClock = crew.filter((c) => openEntry(c.id));

    root.innerHTML = `
      <section class="panel">
        <div class="panel-head"><h3>Today</h3><div class="btn-row tight-row"><span class="hint">${onClock.length} of ${crew.length} on the clock</span><button class="btn primary sm" id="tt-crew">Clock in a crew</button></div></div>
        <div class="clock-grid">${crew.map((c) => {
          const o = openEntry(c.id);
          return `<div class="clock-card ${o ? 'on' : ''}">
            <span class="avatar" style="background:${u.esc(c.color || '#888')};color:#fff" aria-hidden="true">${u.esc(u.initials(c.name))}</span>
            <div class="grow"><div class="row-title">${u.esc(c.name)}</div>
              <div class="row-sub">${o ? 'Since ' + fmtTime(o.start) + ', <span data-elapsed="' + o.id + '">' + fmtH(calc.entryHours(o)) + '</span><br>' + u.esc(jobLabel(o)) : u.esc(c.role) + ', off the clock'}</div></div>
            <button class="btn ${o ? 'danger' : 'ghost'} sm" data-clock="${c.id}">${o ? 'Clock out' : 'Clock in'}</button>
          </div>`;
        }).join('') || ui.empty('Add your crew in Settings to track time.')}</div>
      </section>

      <div class="toolbar">
        <div class="week-nav">
          <button class="icon-btn" id="wk-prev" aria-label="Previous week">&#8249;</button>
          <b>${u.fmtShort(ws)} – ${u.fmtDate(we)}</b>
          <button class="icon-btn" id="wk-next" aria-label="Next week">&#8250;</button>
          ${ws !== monday(today) ? '<button class="btn ghost sm" id="wk-now">This week</button>' : ''}
        </div>
        <select class="input" id="tt-filter" aria-label="Crew member">${u.options(crew.map((c) => ({ value: c.id, label: c.name })), view.crewFilter, 'Everyone')}</select>
        <span class="spacer"></span>
        <button class="btn ghost" id="tt-import">Import crew hours</button>
        <button class="btn ghost" id="tt-add">Add time</button>
      </div>

      <section class="kpis">
        <article class="kpi"><h3 class="kpi-label">Hours this week</h3><div class="kpi-value">${hrs(totalH)}</div><div class="kpi-sub">${perPerson.filter((x) => x.total).length} people worked</div></article>
        <article class="kpi"><h3 class="kpi-label">On jobs</h3><div class="kpi-value">${totalH ? u.pct(jobH / totalH) : '—'}</div><div class="kpi-sub">Your overhead assumes ${u.esc(s.overhead.utilization)}% billable</div></article>
        <article class="kpi"><h3 class="kpi-label">Labor cost</h3><div class="kpi-value">${u.money(cost)}</div><div class="kpi-sub">Wages plus ${u.esc(s.overhead.laborBurden)}% burden</div></article>
        <article class="kpi"><h3 class="kpi-label">Overtime</h3><div class="kpi-value ${overtime.length ? 'neg' : ''}">${overtime.length ? hrs(u.sum(overtime, (x) => x.total - 40)) + ' hrs' : 'None'}</div><div class="kpi-sub">${overtime.length ? overtime.map((x) => u.esc(x.c.name)).join(', ') + ' over 40 hours' : 'Nobody over 40 hours'}</div></article>
      </section>

      <section class="panel flush"><div class="table-wrap"><table class="table timesheet">
        <thead><tr><th>Crew member</th>${DAY.map((dn, i) => `<th class="num ${u.addDays(ws, i) === today ? 'today' : ''}">${dn} ${u.parseISO(u.addDays(ws, i)).getDate()}</th>`).join('')}<th class="num">Total</th><th class="num">Cost</th></tr></thead>
        <tbody>${perPerson.map((x) => `<tr><td><div class="who"><span class="dot" style="background:${u.esc(x.c.color || '#888')}"></span>${u.esc(x.c.name)}</div></td>
          ${x.byDay.map((h, i) => `<td class="num cell ${u.addDays(ws, i) === today ? 'today' : ''}"><button class="ts-cell" data-cell="${x.c.id}|${u.addDays(ws, i)}" aria-label="${u.esc(x.c.name)}, ${DAY[i]}">${h ? hrs(h) : '·'}</button></td>`).join('')}
          <td class="num"><b class="${x.total > 40 ? 'neg' : ''}">${hrs(x.total)}</b></td><td class="num">${u.money(x.cost)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td>Total</td>${DAY.map((_, i) => `<td class="num">${hrs(u.sum(perPerson, (x) => x.byDay[i]))}</td>`).join('')}<td class="num">${hrs(totalH)}</td><td class="num">${u.money(cost)}</td></tr></tfoot>
      </table></div></section>

      <section class="panel">
        <div class="panel-head"><h3>Time entries</h3><span class="hint">${weekEntries.length} this week</span></div>
        ${weekEntries.length ? `<div class="table-wrap"><table class="table">
          <thead><tr><th>Date</th><th>Who</th><th>Job or task</th><th>Time</th><th class="num">Break</th><th class="num">Hours</th><th class="num">Cost</th></tr></thead>
          <tbody>${weekEntries.slice().sort((a, b) => (a.date + a.start < b.date + b.start ? 1 : -1)).map((e) => {
            const c = store.crewMember(e.crewId);
            return `<tr class="click" data-entry="${e.id}"><td class="nowrap">${u.fmtDate(e.date, { weekday: 'short', month: 'short', day: 'numeric' })}</td><td>${u.esc(c ? c.name : 'Removed')}</td><td>${u.esc(jobLabel(e))}</td><td class="nowrap">${fmtTime(e.start)} – ${e.end ? fmtTime(e.end) : '<span class="badge info">On the clock</span>'}</td><td class="num">${e.breakMin ? e.breakMin + 'm' : ''}</td><td class="num">${hrs(calc.entryHours(e))}</td><td class="num">${u.money(calc.entryCost(e, s))}</td></tr>`;
          }).join('')}</tbody></table></div>` : ui.empty('No time recorded this week.')}
      </section>`;

    // live elapsed timers
    clearInterval(ticker);
    ticker = setInterval(() => {
      const els = u.qsa('[data-elapsed]');
      if (!els.length) { clearInterval(ticker); return; }
      els.forEach((el) => { const e = s.timeEntries.find((x) => x.id === el.dataset.elapsed); if (e) el.textContent = fmtH(calc.entryHours(e)); });
    }, 30000);

    u.qsa('[data-clock]', root).forEach((b) => b.addEventListener('click', () => {
      const o = openEntry(b.dataset.clock);
      if (o) clockOut(o); else clockIn([b.dataset.clock]);
    }));
    u.qs('#tt-crew', root).addEventListener('click', () => clockIn(null));
    u.qs('#wk-prev', root).addEventListener('click', () => { view.weekStart = u.addDays(view.weekStart, -7); view.render(root); });
    u.qs('#wk-next', root).addEventListener('click', () => { view.weekStart = u.addDays(view.weekStart, 7); view.render(root); });
    const now = u.qs('#wk-now', root); if (now) now.addEventListener('click', () => { view.weekStart = monday(today); view.render(root); });
    u.qs('#tt-filter', root).addEventListener('change', (e) => { view.crewFilter = e.target.value; view.render(root); });
    u.qs('#tt-import', root).addEventListener('click', () => MT.crewlink.importDialog());
    u.qs('#tt-add', root).addEventListener('click', () => editEntry(null, { crewId: view.crewFilter || (crew[0] && crew[0].id), date: today }));
    u.qsa('[data-entry]', root).forEach((tr) => tr.addEventListener('click', () => editEntry(tr.dataset.entry)));
    u.qsa('[data-cell]', root).forEach((b) => b.addEventListener('click', () => {
      const [cid, date] = b.dataset.cell.split('|');
      const es = s.timeEntries.filter((e) => e.crewId === cid && e.date === date);
      if (es.length === 1) editEntry(es[0].id); else if (!es.length) editEntry(null, { crewId: cid, date }); else dayList(cid, date, es);
    }));
  };

  function dayList(cid, date, es) {
    const c = store.crewMember(cid);
    ui.modal({
      title: (c ? c.name : '') + ', ' + u.fmtDate(date, { weekday: 'long', month: 'short', day: 'numeric' }), size: 'sm',
      body: '<ul class="list compact">' + es.map((e) => `<li class="list-row" data-e="${e.id}"><div class="grow"><div class="row-title">${u.esc(jobLabel(e))}</div><div class="row-sub">${fmtTime(e.start)} – ${e.end ? fmtTime(e.end) : 'now'}</div></div><div class="amt">${hrs(calc.entryHours(e))} h</div></li>`).join('') + '</ul>',
      onMount(b, close) { u.qsa('[data-e]', b).forEach((li) => li.addEventListener('click', () => { close(); editEntry(li.dataset.e); })); },
      actions: [{ label: 'Close' }, { label: 'Add time', kind: 'primary', onClick: () => editEntry(null, { crewId: cid, date }) }],
    });
  }

  function clockIn(crewIds) {
    const s = store.state;
    const crew = s.crew.filter((c) => c.active !== false);
    const firstJob = calc.dayItems(s, u.todayISO()).find((x) => x.kind === 'job');
    const pre = crewIds || (firstJob ? firstJob.crewIds : []);
    ui.modal({
      title: crewIds && crewIds.length === 1 ? 'Clock in ' + (store.crewMember(crewIds[0]) || {}).name : 'Clock in a crew', size: 'sm',
      body: `<div class="form-grid one">
        <label class="field"><span>Working on</span><select class="input" id="ci-job">${jobOptions(firstJob ? firstJob.id : '')}</select></label>
        <label class="field"><span>Start time</span><input class="input" type="time" id="ci-start" value="${calc.nowHHMM()}"></label>
        <div class="field"><span>Who</span><div class="crew-pick" id="ci-who">${crew.map((c) => `<label class="crew-chip"><input type="checkbox" value="${c.id}" ${pre.includes(c.id) ? 'checked' : ''} ${openEntry(c.id) ? 'disabled' : ''}><span style="--c:${u.esc(c.color || '#888')}">${u.esc(c.name)}${openEntry(c.id) ? ' (on the clock)' : ''}</span></label>`).join('')}</div></div>
      </div>`,
      onMount(b) {
        if (!crewIds) u.qs('#ci-job', b).addEventListener('change', (e) => {
          const d = store.deal(e.target.value);
          if (d && d.crewIds && d.crewIds.length) u.qsa('#ci-who input', b).forEach((x) => { if (!x.disabled) x.checked = d.crewIds.includes(x.value); });
        });
      },
      actions: [{ label: 'Cancel' }, { label: 'Clock in', kind: 'primary', onClick: (b) => {
        const who = u.qsa('#ci-who input:checked', b).map((x) => x.value).filter((id) => !openEntry(id));
        if (!who.length) { ui.toast('Choose who is clocking in.', 'err'); return false; }
        const job = u.qs('#ci-job', b).value;
        const start = u.qs('#ci-start', b).value || calc.nowHHMM();
        who.forEach((cid) => s.timeEntries.push({ id: u.uid('te'), crewId: cid, dealId: job.startsWith('kind:') ? '' : job, kind: job.startsWith('kind:') ? job.slice(5) : 'job', date: u.todayISO(), start, end: '', breakMin: 0, note: '' }));
        store.log('time', who.map((id) => (store.crewMember(id) || {}).name).join(', ') + ' clocked in' + (job.startsWith('kind:') ? '' : ' on "' + (store.deal(job) || {}).title + '"'), { dealId: job.startsWith('kind:') ? '' : job });
        store.save();
        ui.toast(who.length === 1 ? 'Clocked in' : who.length + ' people clocked in');
      } }],
    });
  }

  function clockOut(e) {
    const s = store.state;
    const sameJob = s.timeEntries.filter((x) => !x.end && x.date === e.date && x.dealId === e.dealId && x.kind === e.kind && x.id !== e.id);
    const worked = calc.entryHours(e);
    ui.modal({
      title: 'Clock out ' + (store.crewMember(e.crewId) || {}).name, size: 'sm',
      body: `<div class="form-grid">
        <label class="field"><span>End time</span><input class="input" type="time" id="co-end" value="${calc.nowHHMM()}"></label>
        <label class="field"><span>Unpaid break (minutes)</span><input class="input" type="number" min="0" step="5" id="co-break" value="${worked > 6 ? 30 : 0}"></label>
        ${sameJob.length ? `<label class="check span-2"><input type="checkbox" id="co-all" checked><span>Also clock out the ${sameJob.length} other ${sameJob.length === 1 ? 'person' : 'people'} on this job</span></label>` : ''}
        <label class="field span-2"><span>Note (optional)</span><input class="input" id="co-note" placeholder="e.g. Finished removal, grinding tomorrow"></label>
      </div>`,
      actions: [{ label: 'Cancel' }, { label: 'Clock out', kind: 'primary', onClick: (b) => {
        const end = u.qs('#co-end', b).value || calc.nowHHMM();
        const brk = u.num(u.qs('#co-break', b).value);
        const all = u.qs('#co-all', b);
        const list = [e].concat(all && all.checked ? sameJob : []);
        list.forEach((x) => { x.end = end; x.breakMin = brk; x.note = u.qs('#co-note', b).value.trim() || x.note; });
        store.log('time', list.map((x) => (store.crewMember(x.crewId) || {}).name).join(', ') + ' clocked out', { dealId: e.dealId });
        store.save();
        ui.toast(list.length === 1 ? 'Clocked out' : list.length + ' people clocked out');
      } }],
    });
  }

  function editEntry(id, preset) {
    const s = store.state;
    const existing = id ? s.timeEntries.find((x) => x.id === id) : null;
    const e = existing ? Object.assign({}, existing) : Object.assign({ id: u.uid('te'), crewId: '', dealId: '', kind: 'job', date: u.todayISO(), start: '07:30', end: '15:30', breakMin: 30, note: '' }, preset || {});
    const crew = s.crew.map((c) => ({ value: c.id, label: c.name }));
    ui.modal({
      title: existing ? 'Edit time' : 'Add time', size: 'sm',
      body: `<div class="form-grid">
        <label class="field"><span>Crew member</span><select class="input" name="crewId">${u.options(crew, e.crewId)}</select></label>
        <label class="field"><span>Date</span><input class="input" type="date" name="date" value="${u.esc(e.date)}"></label>
        <label class="field span-2"><span>Job or task</span><select class="input" id="te-job">${jobOptions(e.dealId || 'kind:' + e.kind)}${e.dealId && !jobOptions('').includes(e.dealId) ? `<option value="${e.dealId}" selected>${u.esc(jobLabel(e))}</option>` : ''}</select></label>
        <label class="field"><span>Start</span><input class="input" type="time" name="start" value="${u.esc(e.start)}"></label>
        <label class="field"><span>End (blank if still working)</span><input class="input" type="time" name="end" value="${u.esc(e.end)}"></label>
        <label class="field"><span>Unpaid break (minutes)</span><input class="input" type="number" min="0" step="5" name="breakMin" value="${u.esc(e.breakMin)}"></label>
        <label class="field"><span>Note</span><input class="input" name="note" value="${u.esc(e.note)}"></label>
      </div>`,
      actions: [
        existing ? { label: 'Delete', kind: 'danger-ghost', left: true, onClick: () => { s.timeEntries = s.timeEntries.filter((x) => x.id !== e.id); store.save(); ui.toast('Time entry deleted'); } } : null,
        { label: 'Cancel' },
        { label: existing ? 'Save' : 'Add time', kind: 'primary', onClick: (b) => {
          const f = u.formData(b);
          if (!f.crewId) { ui.toast('Choose a crew member.', 'err'); return false; }
          if (!f.start) { ui.toast('Enter a start time.', 'err'); return false; }
          const job = u.qs('#te-job', b).value;
          Object.assign(e, f, { breakMin: u.num(f.breakMin), dealId: job.startsWith('kind:') ? '' : job, kind: job.startsWith('kind:') ? job.slice(5) : 'job' });
          if (existing) Object.assign(existing, e); else s.timeEntries.push(e);
          store.save();
          ui.toast(existing ? 'Time saved' : 'Time added');
        } },
      ].filter(Boolean),
    });
  }

  view.clockIn = clockIn;
  MT.views.time = view;
})();
