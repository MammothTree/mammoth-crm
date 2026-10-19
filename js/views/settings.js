/* Mammoth CRM — Settings: defaults, crew & roles, security, backups */
(function () {
  'use strict';
  const MT = window.MT;
  const u = MT.u, ui = MT.ui, store = MT.store;
  const ROLES = ['Owner', 'Crew lead', 'Climber', 'Groundsman', 'Equipment operator', 'Office', 'Estimator'];
  const COLORS = ['#24563a', '#2c5f86', '#8a5a2b', '#6250d6', '#b0352e', '#1baf7a', '#c98500', '#e87ba4', '#34495e', '#d95926'];

  const view = { title: 'Settings' };
  const saveSoon = u.debounce(() => store.save(true), 400);

  view.render = function (root) {
    const s = store.state;
    const st = s.settings;
    const pin = MT.lock.isSet();
    const restore = store.restorePoint();
    root.innerHTML = `
      <div class="settings">
        <section class="panel">
          <div class="panel-head"><h3>Defaults</h3><span class="hint">Saved as you type</span></div>
          <div class="form-grid" id="st-def">
            <label class="field"><span>Sales tax on estimates and invoices (%)</span><input class="input" type="number" min="0" step="0.01" name="taxRate" value="${u.esc(st.taxRate)}"></label>
            <label class="field"><span>Estimates valid for (days)</span><input class="input" type="number" min="1" name="estimateValidDays" value="${u.esc(st.estimateValidDays)}"></label>
            <label class="field"><span>Invoice payment terms (days)</span><input class="input" type="number" min="0" name="paymentTermsDays" value="${u.esc(st.paymentTermsDays)}"></label>
            <label class="field"><span>Next invoice number</span><input class="input" type="number" min="1" name="nextInvoiceNo" value="${u.esc(s.nextInvoiceNo)}"></label>
            <label class="field span-2"><span>Notes printed on invoices</span><textarea class="input" rows="2" name="invoiceNotes">${u.esc(st.invoiceNotes)}</textarea></label>
            <label class="field span-2"><span>Footer on estimates and invoices</span><textarea class="input" rows="2" name="estimateFooter">${u.esc(st.estimateFooter)}</textarea></label>
            <label class="field"><span>Fuel price ($ per gallon)</span><input class="input" type="number" min="0" step="0.01" name="fuelPrice" value="${u.esc(st.fuelPrice)}"></label>
            <label class="field"><span>Truck fuel economy (MPG)</span><input class="input" type="number" min="1" step="0.5" name="truckMpg" value="${u.esc(st.truckMpg)}"></label>
            <label class="field"><span>Average driving speed (mph)</span><input class="input" type="number" min="5" step="1" name="avgMph" value="${u.esc(st.avgMph)}"></label>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head"><h3>Security</h3>${pin ? ui.badge('PIN on', 'good') : ui.badge('No PIN', '')}</div>
          <p class="hint">A PIN covers the CRM on a shared computer or phone, and it locks again after a period of no activity. It's a privacy screen: it does not encrypt the data saved in this browser.</p>
          <div class="form-grid">
            <label class="field"><span>${pin ? 'New PIN' : 'Choose a PIN'} (4 to 8 digits)</span><input class="input" type="password" inputmode="numeric" maxlength="8" id="pin1" autocomplete="new-password"></label>
            <label class="field"><span>Type it again</span><input class="input" type="password" inputmode="numeric" maxlength="8" id="pin2" autocomplete="new-password"></label>
            <label class="field"><span>Lock after (minutes of no activity)</span><input class="input" type="number" min="1" max="240" id="lock-min" value="${u.esc(st.lockMinutes || 15)}"></label>
          </div>
          <div class="btn-row"><button class="btn primary" id="pin-set">${pin ? 'Change PIN' : 'Turn on PIN lock'}</button>${pin ? '<button class="btn ghost" id="pin-lock">Lock now</button><button class="btn danger-ghost" id="pin-off">Turn off PIN</button>' : ''}</div>
        </section>

        <section class="panel span-all">
          <div class="panel-head"><h3>Crew &amp; roles</h3><span class="hint">${s.crew.filter((c) => c.active !== false).length} active</span></div>
          <p class="hint">Crew members can be assigned to jobs, clocked in, and filtered on the calendar. Wages set labor cost in Time tracking and Job cost.</p>
          <div class="table-wrap"><table class="items crew-table">
            <thead><tr><th>Name</th><th>Role</th><th class="num">Wage $/hr</th><th>Phone</th><th>Color</th><th>Active</th><th></th></tr></thead>
            <tbody>${s.crew.map((c, i) => `<tr data-i="${i}">
              <td><input class="input" data-f="name" value="${u.esc(c.name)}" aria-label="Name"></td>
              <td><select class="input" data-f="role" aria-label="Role">${u.options(ROLES, c.role)}</select></td>
              <td class="num"><input class="input num" type="number" min="0" step="0.25" data-f="wage" value="${u.esc(c.wage)}" aria-label="Wage"></td>
              <td><input class="input" type="tel" data-f="phone" value="${u.esc(c.phone)}" aria-label="Phone"></td>
              <td><input type="color" data-f="color" value="${u.esc(c.color || '#888888')}" aria-label="Calendar color"></td>
              <td><input type="checkbox" data-f="active" ${c.active !== false ? 'checked' : ''} aria-label="Active"></td>
              <td><button class="icon-btn" data-del="${i}" aria-label="Remove ${u.esc(c.name)}">&times;</button></td></tr>`).join('')}</tbody>
          </table></div>
          <div class="btn-row"><button class="btn ghost" id="crew-add">Add crew member</button></div>
        </section>

        <section class="panel span-all">
          <div class="panel-head"><h3>Backups &amp; data</h3></div>
          <p class="hint">Your data is saved in this browser automatically. Download a backup regularly, or connect GitHub sync under Integrations. Job cam photos and videos stay on the device that added them and aren't in the backup file.</p>
          <div class="btn-row">
            <button class="btn primary" id="dt-export">Download backup</button>
            <label class="btn ghost file-btn">Restore from backup<input type="file" accept="application/json,.json" id="dt-import" hidden></label>
            <button class="btn ghost" id="dt-csv">Export clients (CSV)</button>
          </div>
          ${restore ? `<div class="danger-zone restore-zone">
            <div><b>Undo is available</b><p class="hint">${u.esc(restore.label)} (${u.esc(new Date(restore.at).toLocaleString())}). Undo puts everything back exactly as it was then.</p></div>
            <button class="btn primary" id="dt-undo">Undo</button>
          </div>` : ''}
          ${s.demo ? `<div class="danger-zone">
            <div><b>Remove the sample data</b><p class="hint">Removes only the made-up sample clients, deals, estimates, invoices, time, calendar entries, and photos. Anything you entered yourself stays, and so do your settings, branding, price book, overhead, templates, and SEO setup. A restore point is saved first, so you can undo.</p></div>
            <button class="btn danger" id="dt-clear">Remove sample data</button>
          </div>` : ''}
          <div class="danger-zone">
            <div><b>Reload demo data</b><p class="hint">Replaces everything with the sample data. A restore point is saved first, so you can undo.</p></div>
            <button class="btn danger-ghost" id="dt-demo">Reload demo data</button>
          </div>
        </section>
      </div>`;

    // Defaults autosave
    u.qsa('#st-def [name]', root).forEach((inp) => inp.addEventListener('input', () => {
      if (inp.name === 'nextInvoiceNo') { const n = Math.max(1, Math.round(u.num(inp.value))); s.nextInvoiceNo = n; }
      else st[inp.name] = inp.type === 'number' ? u.num(inp.value) : inp.value;
      saveSoon();
    }));

    // Security
    u.qs('#pin-set', root).addEventListener('click', async () => {
      const a = u.qs('#pin1', root).value, b = u.qs('#pin2', root).value;
      if (!/^\d{4,8}$/.test(a)) { ui.toast('Use 4 to 8 digits for the PIN.', 'err'); return; }
      if (a !== b) { ui.toast('The two PINs don\'t match.', 'err'); return; }
      st.lockMinutes = Math.max(1, u.num(u.qs('#lock-min', root).value) || 15);
      store.save(true);
      await MT.lock.setPin(a);
      view.render(root);
      ui.toast('PIN lock is on. Write your PIN down somewhere safe.');
    });
    u.qs('#lock-min', root).addEventListener('input', (e) => { st.lockMinutes = Math.max(1, u.num(e.target.value) || 15); saveSoon(); MT.lock.arm(); });
    const lk = u.qs('#pin-lock', root); if (lk) lk.addEventListener('click', () => MT.lock.show());
    const off = u.qs('#pin-off', root);
    if (off) off.addEventListener('click', () => {
      ui.modal({
        title: 'Turn off PIN lock', size: 'sm',
        body: '<label class="field"><span>Enter your current PIN</span><input class="input" type="password" inputmode="numeric" id="pin-cur" maxlength="8"></label>',
        actions: [{ label: 'Cancel' }, { label: 'Turn off', kind: 'danger', onClick: async (b, close) => {
          if (!(await MT.lock.check(u.qs('#pin-cur', b).value))) { ui.toast('That PIN is not right.', 'err'); return; }
          MT.lock.clear(); close(); view.render(root); ui.toast('PIN lock turned off');
        }, keepOpen: true }],
      });
    });

    // Crew
    u.qsa('.crew-table tr[data-i]', root).forEach((tr) => {
      const c = s.crew[+tr.dataset.i];
      u.qsa('[data-f]', tr).forEach((inp) => inp.addEventListener(inp.type === 'checkbox' || inp.tagName === 'SELECT' || inp.type === 'color' ? 'change' : 'input', () => {
        c[inp.dataset.f] = inp.type === 'checkbox' ? inp.checked : inp.type === 'number' ? u.num(inp.value) : inp.value;
        saveSoon();
      }));
    });
    u.qsa('[data-del]', root).forEach((b) => b.addEventListener('click', () => {
      const c = s.crew[+b.dataset.del];
      const used = s.timeEntries.some((e) => e.crewId === c.id);
      ui.confirm('Remove ' + c.name + '?', used ? 'Their tracked hours stay on past jobs. Tip: uncheck "Active" instead to keep them on record.' : 'They will be removed from the crew list and from any scheduled jobs.', 'Remove', () => {
        s.crew.splice(+b.dataset.del, 1);
        s.deals.forEach((d) => { if (d.crewIds) d.crewIds = d.crewIds.filter((x) => x !== c.id); });
        store.save();
      });
    }));
    u.qs('#crew-add', root).addEventListener('click', () => {
      s.crew.push({ id: u.uid('cr'), name: '', role: 'Groundsman', wage: u.num(s.overhead.avgWage) || 20, phone: '', color: COLORS[s.crew.length % COLORS.length], active: true });
      store.save();
      const last = u.qsa('.crew-table [data-f=name]', root).pop(); if (last) last.focus();
    });

    // Backups
    u.qs('#dt-export', root).addEventListener('click', () => {
      u.download('mammoth-crm-backup-' + u.todayISO() + '.json', JSON.stringify(s, null, 2));
      ui.toast('Backup downloaded');
    });
    u.qs('#dt-import', root).addEventListener('change', (ev) => {
      const file = ev.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        let data;
        try { data = JSON.parse(reader.result); } catch (e) { ui.toast('That file is not a valid backup (could not read JSON).', 'err'); return; }
        if (!data || !data.version || !Array.isArray(data.customers)) { ui.toast('That file is not a CRM backup.', 'err'); return; }
        ui.confirm('Restore this backup?', 'It has ' + data.customers.length + ' clients and ' + (data.deals || []).length + ' deals. Everything in this browser will be replaced. A restore point is saved first, so you can undo.', 'Restore backup', () => {
          safety('Before restoring a backup file');
          store.replace(data);
          MT.views.estimator.onDataReplaced();
          ui.toast('Backup restored');
        });
      };
      reader.readAsText(file);
      ev.target.value = '';
    });
    u.qs('#dt-csv', root).addEventListener('click', () => {
      const cols = ['name', 'company', 'phone', 'email', 'address', 'city', 'type', 'source', 'notes'];
      const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
      const csv = [cols.concat(['lifetimeValue']).join(',')].concat(s.customers.map((c) => cols.map((k) => q(c[k])).concat([MT.calc.lifetimeValue(s, c.id)]).join(','))).join('\r\n');
      u.download('clients-' + u.todayISO() + '.csv', csv, 'text/csv');
    });
    // Before removing or replacing data, keep a restore point. If the browser has no room for one, download a backup file instead.
    const safety = (label) => {
      if (store.saveRestorePoint(label)) return;
      u.download('mammoth-crm-backup-' + u.todayISO() + '.json', JSON.stringify(s, null, 2));
      ui.toast('A backup file was downloaded first, just in case.');
    };
    const clearBtn = u.qs('#dt-clear', root);
    if (clearBtn) clearBtn.addEventListener('click', () => ui.confirm('Remove the sample data?', 'Only the made-up sample records are removed. Clients, leads, estimates, invoices, photos, and time you entered yourself are kept. You can undo this.', 'Remove sample data', () => {
      safety('Before removing the sample data');
      const k = store.clearAll();
      MT.views.estimator.onDataReplaced();
      const kept = k.customers + k.deals + k.estimates + k.invoices;
      ui.toast(kept ? 'Sample data removed. Kept your ' + k.customers + ' clients, ' + k.deals + ' deals, ' + k.estimates + ' estimates, and ' + k.invoices + ' invoices.' : 'Sample data removed. Ready for real clients.');
    }));
    u.qs('#dt-demo', root).addEventListener('click', () => ui.confirm('Reload demo data?', 'Everything in this browser will be replaced with sample data. A restore point is saved first, so you can undo.', 'Reload demo', () => { safety('Before reloading the demo data'); store.resetDemo(); MT.views.estimator.onDataReplaced(); ui.toast('Demo data reloaded'); }));
    const undoBtn = u.qs('#dt-undo', root);
    if (undoBtn) undoBtn.addEventListener('click', () => ui.confirm('Undo?', 'Your data goes back to how it was at the restore point. Changes made since then are replaced.', 'Undo', () => { if (store.undoToRestorePoint()) { MT.views.estimator.onDataReplaced(); ui.toast('Restored'); } }));
  };

  MT.views.settings = view;
})();
