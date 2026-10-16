/* Mammoth CRM — Calendar: jobs, estimate visits, and other events */
(function () {
  'use strict';
  const MT = window.MT;
  const u = MT.u, ui = MT.ui, store = MT.store, calc = MT.calc;
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const KIND = { job: 'Job', visit: 'Estimate visit', other: 'Other' };

  const view = { title: 'Calendar', mode: 'month', cursor: null, crew: '' };
  const monday = (iso) => { const d = u.parseISO(iso); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return u.isoDate(d); };
  const fmtTime = (hhmm) => { if (!hhmm) return ''; const [h, m] = hhmm.split(':').map(Number); return ((h + 11) % 12 + 1) + (m ? ':' + String(m).padStart(2, '0') : '') + (h < 12 ? 'a' : 'p'); };
  const itemsOn = (iso) => calc.dayItems(store.state, iso).filter((x) => !view.crew || (x.crewIds || []).includes(view.crew));

  function chip(x, full) {
    const c = store.customer(x.customerId);
    const crew = (x.crewIds || []).map((id) => store.crewMember(id)).filter(Boolean);
    return `<div class="cal-item k-${x.kind}" draggable="true" data-kind="${x.kind}" data-id="${x.id}" tabindex="0" title="${u.esc(x.title)}">
      <span class="ci-time">${fmtTime(x.start)}</span><span class="ci-title">${u.esc(x.title)}${x.days > 1 ? ' (day ' + x.dayN + ' of ' + x.days + ')' : ''}</span>
      ${full ? `<span class="ci-sub">${c ? u.esc(c.name) + (c.address ? ', ' + u.esc(c.address) : '') : u.esc(KIND[x.kind] || '')}</span>
      ${crew.length ? '<span class="ci-crew">' + crew.map((m) => `<i style="background:${u.esc(m.color || '#888')}" title="${u.esc(m.name)}">${u.esc(u.initials(m.name))}</i>`).join('') + '</span>' : ''}` : ''}
    </div>`;
  }

  view.render = function (root) {
    const s = store.state;
    const today = u.todayISO();
    if (!view.cursor) view.cursor = today;
    let start, end, label;
    if (view.mode === 'week') {
      start = monday(view.cursor); end = u.addDays(start, 6);
      label = u.fmtShort(start) + ' – ' + u.fmtDate(end);
    } else {
      const c = u.parseISO(view.cursor);
      const first = u.isoDate(new Date(c.getFullYear(), c.getMonth(), 1));
      const last = u.isoDate(new Date(c.getFullYear(), c.getMonth() + 1, 0));
      start = monday(first); end = u.addDays(monday(last), 6);
      label = c.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    const days = [];
    for (let d = start; d <= end; d = u.addDays(d, 1)) days.push(d);
    const curMonth = u.parseISO(view.cursor).getMonth();
    const unscheduled = s.deals.filter((d) => d.stage === 'won' && !d.scheduledDate);
    const crew = s.crew.filter((c) => c.active !== false);

    root.innerHTML = `
      <div class="toolbar">
        <div class="week-nav">
          <button class="icon-btn" id="cal-prev" aria-label="Previous">&#8249;</button>
          <b class="cal-label">${u.esc(label)}</b>
          <button class="icon-btn" id="cal-next" aria-label="Next">&#8250;</button>
          <button class="btn ghost sm" id="cal-today">Today</button>
        </div>
        <div class="seg" role="tablist"><button role="tab" data-mode="month" class="${view.mode === 'month' ? 'on' : ''}">Month</button><button role="tab" data-mode="week" class="${view.mode === 'week' ? 'on' : ''}">Week</button></div>
        <select class="input" id="cal-crew" aria-label="Crew member">${u.options(crew.map((c) => ({ value: c.id, label: c.name })), view.crew, 'Whole team')}</select>
        <span class="spacer"></span>
        <div class="legend"><span><i class="sw k-job"></i>Jobs</span><span><i class="sw k-visit"></i>Estimate visits</span><span><i class="sw k-other"></i>Other</span></div>
        <button class="btn primary" id="cal-add">Add to calendar</button>
      </div>
      <div class="cal-layout">
        <section class="panel flush cal ${view.mode}">
          <div class="cal-head">${DAYS.map((d) => `<div>${d}</div>`).join('')}</div>
          <div class="cal-grid">${days.map((d) => {
            const its = itemsOn(d);
            const max = view.mode === 'month' ? 3 : 99;
            const dt = u.parseISO(d);
            return `<div class="cal-day ${d === today ? 'today' : ''} ${view.mode === 'month' && dt.getMonth() !== curMonth ? 'other-month' : ''} ${d < today ? 'past' : ''}" data-day="${d}">
              <div class="cal-date"><span>${view.mode === 'week' ? DAYS[(dt.getDay() + 6) % 7] + ' ' : ''}${dt.getDate()}</span>${its.length ? '' : ''}</div>
              <div class="cal-items">${its.slice(0, max).map((x) => chip(x, view.mode === 'week')).join('')}${its.length > max ? `<button class="cal-more" data-more="${d}">+${its.length - max} more</button>` : ''}</div>
            </div>`;
          }).join('')}</div>
        </section>
        <aside class="panel cal-side">
          <div class="panel-head"><h3>Jobs to schedule</h3><span class="hint">${unscheduled.length}</span></div>
          ${unscheduled.length ? '<div class="unsched">' + unscheduled.map((d) => `<div class="cal-item k-job" draggable="true" data-kind="unscheduled" data-id="${d.id}" tabindex="0"><span class="ci-title">${u.esc(d.title)}</span><span class="ci-sub">${u.esc(store.customerName(d.customerId))}, ${u.money(d.value)}</span></div>`).join('') + '</div><p class="hint">Drag a job onto a day, or click it to pick a date.</p>' : '<p class="hint">Every won job has a date. New wins show up here until you schedule them.</p>'}
          <a class="link" href="#routes">Plan the route for a day</a>
        </aside>
      </div>`;

    const go = (n) => {
      if (view.mode === 'week') view.cursor = u.addDays(view.cursor, 7 * n);
      else { const c = u.parseISO(view.cursor); view.cursor = u.isoDate(new Date(c.getFullYear(), c.getMonth() + n, 1)); }
      view.render(root);
    };
    u.qs('#cal-prev', root).addEventListener('click', () => go(-1));
    u.qs('#cal-next', root).addEventListener('click', () => go(1));
    u.qs('#cal-today', root).addEventListener('click', () => { view.cursor = today; view.render(root); });
    u.qsa('[data-mode]', root).forEach((b) => b.addEventListener('click', () => { view.mode = b.dataset.mode; view.render(root); }));
    u.qs('#cal-crew', root).addEventListener('change', (e) => { view.crew = e.target.value; view.render(root); });
    u.qs('#cal-add', root).addEventListener('click', () => addOn(today >= start && today <= end ? today : start));

    const openItem = (kind, id) => {
      if (kind === 'job' || kind === 'unscheduled') { if (kind === 'unscheduled') scheduleJob(id, today); else MT.views.pipeline.openDeal(id); }
      else editEvent(id);
    };
    u.qsa('.cal-item', root).forEach((el) => {
      el.addEventListener('click', (e) => { e.stopPropagation(); openItem(el.dataset.kind, el.dataset.id); });
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter') openItem(el.dataset.kind, el.dataset.id); });
      el.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', el.dataset.kind + '|' + el.dataset.id); el.classList.add('dragging'); });
      el.addEventListener('dragend', () => el.classList.remove('dragging'));
    });
    u.qsa('.cal-more', root).forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); view.mode = 'week'; view.cursor = b.dataset.more; view.render(root); }));
    u.qsa('.cal-day', root).forEach((cell) => {
      cell.addEventListener('click', () => addOn(cell.dataset.day));
      cell.addEventListener('dragover', (e) => { e.preventDefault(); cell.classList.add('drop'); });
      cell.addEventListener('dragleave', () => cell.classList.remove('drop'));
      cell.addEventListener('drop', (e) => {
        e.preventDefault(); cell.classList.remove('drop');
        const [kind, id] = e.dataTransfer.getData('text/plain').split('|');
        const day = cell.dataset.day;
        if (kind === 'job' || kind === 'unscheduled') {
          const d = store.deal(id); if (!d) return;
          if (kind === 'unscheduled') { scheduleJob(id, day); return; }
          d.scheduledDate = day;
          store.log('schedule', 'Moved "' + d.title + '" to ' + u.fmtDate(day), { customerId: d.customerId, dealId: d.id });
        } else {
          const ev = s.events.find((x) => x.id === id); if (!ev) return;
          ev.date = day;
        }
        store.save();
        ui.toast('Moved to ' + u.fmtDate(day, { weekday: 'long', month: 'short', day: 'numeric' }));
      });
    });
  };

  function crewPicker(selected) {
    return '<div class="crew-pick" id="ev-crew">' + store.state.crew.filter((c) => c.active !== false).map((c) => `<label class="crew-chip"><input type="checkbox" value="${c.id}" ${(selected || []).includes(c.id) ? 'checked' : ''}><span style="--c:${u.esc(c.color || '#888')}">${u.esc(c.name)}</span></label>`).join('') + '</div>';
  }

  function scheduleJob(dealId, day) {
    const d = store.deal(dealId);
    if (!d) return;
    ui.modal({
      title: 'Schedule ' + d.title, size: 'sm',
      body: `<div class="form-grid">
        <label class="field"><span>Date</span><input class="input" type="date" name="date" value="${u.esc(day)}"></label>
        <label class="field"><span>Start time</span><input class="input" type="time" name="start" value="${u.esc(d.startTime || '07:30')}"></label>
        <label class="field"><span>Days</span><input class="input" type="number" min="1" name="days" value="${u.esc(d.days || 1)}"></label>
        <div class="field span-2"><span>Crew</span>${crewPicker(d.crewIds)}</div></div>`,
      actions: [{ label: 'Cancel' }, { label: 'Schedule job', kind: 'primary', onClick: (b) => {
        const f = u.formData(b);
        if (!f.date) { ui.toast('Pick a date.', 'err'); return false; }
        Object.assign(d, { scheduledDate: f.date, startTime: f.start, days: Math.max(1, u.num(f.days) || 1), crewIds: u.qsa('#ev-crew input:checked', b).map((x) => x.value) });
        store.log('schedule', 'Scheduled "' + d.title + '" for ' + u.fmtDate(f.date), { customerId: d.customerId, dealId: d.id });
        store.save();
        ui.toast('Job scheduled');
      } }],
    });
  }

  function addOn(day) {
    const s = store.state;
    const jobs = s.deals.filter((d) => d.stage === 'won' && (!d.scheduledDate || d.scheduledDate >= u.todayISO())).sort((a, b) => (!a.scheduledDate ? -1 : !b.scheduledDate ? 1 : 0));
    ui.modal({
      title: 'Add to ' + u.fmtDate(day, { weekday: 'long', month: 'long', day: 'numeric' }), size: 'sm',
      body: `<div class="seg add-kind" role="tablist"><button data-k="job" class="on">Job</button><button data-k="visit">Estimate visit</button><button data-k="other">Other</button></div>
        <div data-pane="job"><label class="field"><span>Which job?</span><select class="input" id="ad-job">${u.options(jobs.map((d) => ({ value: d.id, label: d.title + ', ' + store.customerName(d.customerId) + (d.scheduledDate ? ' (now ' + u.fmtShort(d.scheduledDate) + ')' : ' (not scheduled)') })), '', jobs.length ? 'Choose a won job' : 'No won jobs to schedule')}</select></label></div>
        <div data-pane="event" hidden><div class="form-grid">
          <label class="field span-2 visit-only"><span>Client</span><select class="input" id="ad-cust">${u.options(s.customers.slice().sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ value: c.id, label: c.name })), '', 'Choose a client')}</select></label>
          <label class="field span-2 other-only"><span>What is it?</span><input class="input" id="ad-title" placeholder="e.g. Truck to the shop"></label>
          <label class="field"><span>Start</span><input class="input" type="time" id="ad-start" value="09:00"></label>
          <label class="field"><span>End</span><input class="input" type="time" id="ad-end"></label>
          <div class="field span-2"><span>Who</span>${crewPicker(['cr0'])}</div>
          <label class="field span-2"><span>Notes</span><input class="input" id="ad-notes"></label>
        </div></div>`,
      onMount(b) {
        let k = 'job';
        u.qsa('.add-kind button', b).forEach((x) => x.addEventListener('click', () => {
          k = x.dataset.k; b.dataset.kind = k;
          u.qsa('.add-kind button', b).forEach((y) => y.classList.toggle('on', y === x));
          u.qs('[data-pane=job]', b).hidden = k !== 'job';
          u.qs('[data-pane=event]', b).hidden = k === 'job';
          u.qsa('.visit-only', b).forEach((y) => { y.hidden = k !== 'visit'; });
          u.qsa('.other-only', b).forEach((y) => { y.hidden = k !== 'other'; });
        }));
        b.dataset.kind = 'job';
      },
      actions: [{ label: 'Cancel' }, { label: 'Add', kind: 'primary', onClick: (b) => {
        const k = b.dataset.kind;
        if (k === 'job') {
          const id = u.qs('#ad-job', b).value;
          if (!id) { ui.toast('Choose a job.', 'err'); return false; }
          setTimeout(() => scheduleJob(id, day), 0);
          return;
        }
        const cid = u.qs('#ad-cust', b).value;
        const c = store.customer(cid);
        if (k === 'visit' && !c) { ui.toast('Choose the client for the visit.', 'err'); return false; }
        const title = k === 'visit' ? 'Estimate visit: ' + c.name : u.qs('#ad-title', b).value.trim();
        if (!title) { ui.toast('Describe what this is.', 'err'); return false; }
        const lead = k === 'visit' ? s.deals.find((d) => d.customerId === cid && store.OPEN_STAGES.includes(d.stage)) : null;
        s.events.push({ id: u.uid('ev'), type: k, title, date: day, start: u.qs('#ad-start', b).value, end: u.qs('#ad-end', b).value, customerId: k === 'visit' ? cid : '', dealId: lead ? lead.id : '', crewIds: u.qsa('#ev-crew input:checked', b).map((x) => x.value), notes: u.qs('#ad-notes', b).value.trim() });
        if (lead && lead.stage === 'lead') store.setStage(lead, 'contacted');
        store.save();
        ui.toast('Added to the calendar');
      } }],
    });
  }

  function editEvent(id) {
    const s = store.state;
    const ev = s.events.find((x) => x.id === id);
    if (!ev) return;
    const c = store.customer(ev.customerId);
    ui.modal({
      title: ev.title, size: 'sm',
      body: `<div class="form-grid">
        <label class="field span-2"><span>Title</span><input class="input" name="title" value="${u.esc(ev.title)}"></label>
        <label class="field"><span>Date</span><input class="input" type="date" name="date" value="${u.esc(ev.date)}"></label>
        <label class="field"><span>Start</span><input class="input" type="time" name="start" value="${u.esc(ev.start)}"></label>
        <label class="field"><span>End</span><input class="input" type="time" name="end" value="${u.esc(ev.end)}"></label>
        <div class="field span-2"><span>Who</span>${crewPicker(ev.crewIds)}</div>
        <label class="field span-2"><span>Notes</span><textarea class="input" rows="2" name="notes">${u.esc(ev.notes)}</textarea></label>
      </div>
      ${c ? `<p class="hint">${u.esc(c.name)}, ${u.esc([c.address, c.city].filter(Boolean).join(', '))}, ${u.esc(c.phone)}</p>` : ''}`,
      actions: [
        { label: 'Delete', kind: 'danger-ghost', left: true, onClick: () => { s.events = s.events.filter((x) => x.id !== id); store.save(); ui.toast('Removed from the calendar'); } },
        ev.dealId ? { label: 'Open lead', kind: 'ghost', onClick: () => MT.views.pipeline.openDeal(ev.dealId) } : null,
        { label: 'Cancel' },
        { label: 'Save', kind: 'primary', onClick: (b) => { Object.assign(ev, u.formData(b), { crewIds: u.qsa('#ev-crew input:checked', b).map((x) => x.value) }); store.save(); ui.toast('Saved'); } },
      ].filter(Boolean),
    });
  }

  MT.views.calendar = view;
})();
