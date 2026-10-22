/* Mammoth CRM — files attached to jobs (contracts, permits, signed estimates, PDFs).
   The files themselves live in the device's media storage (IndexedDB) and back up to the private GitHub data repository
   with the Job cam photos; the list of files (name, size, backup location) is saved on the deal. */
(function () {
  'use strict';
  const MT = window.MT;
  const u = MT.u, ui = MT.ui, store = MT.store;

  const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.rtf,.odt,.pages,image/*';
  const fmtSize = (b) => (b > 1e9 ? (b / 1e9).toFixed(1) + ' GB' : b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' KB');
  const icon = (m) => (/pdf/.test(m.mime) || /\.pdf$/i.test(m.name) ? 'PDF' : /^image\//.test(m.mime) ? 'IMG' : /sheet|excel|csv/.test(m.mime) || /\.(xlsx?|csv)$/i.test(m.name) ? 'XLS' : /word|document/.test(m.mime) || /\.docx?$/i.test(m.name) ? 'DOC' : 'FILE');

  const files = {
    ACCEPT,
    list(deal) { return (deal && deal.files) || []; },

    /** Stores the chosen files on this device and lists them on the deal. Returns how many were added. */
    async add(deal, fileList) {
      const added = [];
      for (const file of Array.from(fileList || [])) {
        const id = u.uid('f');
        await MT.media.put(id, file);
        const m = { id, kind: 'file', name: file.name || 'File', mime: file.type || 'application/octet-stream', size: file.size, addedAt: new Date().toISOString() };
        if (file.size > MT.media.MAX_BACKUP) m.tooBig = true;
        added.push(m);
      }
      if (!added.length) return 0;
      const live = store.deal(deal.id) || deal;
      live.files = (live.files || []).concat(added);
      if (live !== deal) deal.files = live.files;
      store.log('note', 'Attached ' + (added.length === 1 ? added[0].name : added.length + ' files') + ' to "' + live.title + '"', { customerId: live.customerId, dealId: live.id });
      store.save(true);
      MT.media.persist();
      if (MT.sync.ready() && MT.sync.cfg().mediaAuto) MT.media.backupAll().catch(() => {});
      return added.length;
    },

    /** Opens a file in a new tab (or downloads it when the browser can't show it). */
    async open(m) {
      let url = await MT.media.url(m.id);
      if (!url && m.remote && MT.sync.ready()) { ui.toast('Downloading ' + m.name + '…'); try { url = await MT.media.fetchRemote(m, false); } catch (e) { url = null; } }
      if (!url) { ui.toast(m.remote ? 'Connect GitHub sync on this device to open this file.' : 'This file is on the device that attached it and isn\'t backed up yet.', 'err'); return; }
      const a = document.createElement('a');
      a.href = url; a.target = '_blank'; a.rel = 'noopener';
      if (!/pdf|image|text/.test(m.mime)) a.download = m.name;
      document.body.appendChild(a); a.click(); a.remove();
    },

    async remove(deal, m) {
      const live = store.deal(deal.id) || deal;
      live.files = (live.files || []).filter((x) => x.id !== m.id);
      if (live !== deal) deal.files = live.files;
      await MT.media.removeItem(m).catch(() => {});
      store.save(true);
    },

    /** Removes every attached file of a deal that is being deleted. */
    removeAll(deal) { (deal.files || []).forEach((m) => MT.media.removeItem(m).catch(() => {})); },

    /** Renders the attachments list with an Attach button into el. */
    panel(el, deal, opts) {
      opts = opts || {};
      const draw = () => {
        const list = files.list(store.deal(deal.id) || deal);
        el.innerHTML = `<div class="att-list">${list.map((m) => `
            <div class="att-row" data-id="${m.id}">
              <span class="att-icon" aria-hidden="true">${icon(m)}</span>
              <button type="button" class="att-name link-btn" data-open="${m.id}">${u.esc(m.name)}</button>
              <span class="att-meta">${fmtSize(m.size || 0)}${m.remote ? ' · backed up' : m.tooBig ? ' · too big to back up' : ''}</span>
              <button type="button" class="icon-btn" data-rm="${m.id}" aria-label="Remove ${u.esc(m.name)}">&times;</button>
            </div>`).join('') || `<p class="hint">${u.esc(opts.empty || 'No files yet. Attach the signed contract, permits, or anything else for this job.')}</p>`}</div>
          <label class="btn ghost sm file-btn">Attach a file<input type="file" multiple accept="${ACCEPT}" hidden></label>`;
        u.qs('input[type=file]', el).addEventListener('change', async (ev) => {
          const picked = ev.target.files;
          if (!picked || !picked.length) return;
          try { const n = await files.add(deal, picked); ui.toast(n === 1 ? 'File attached' : n + ' files attached'); } catch (e) { ui.toast('Could not save the file: ' + (e.message || e), 'err'); }
          draw();
          if (opts.onChange) opts.onChange();
        });
        u.qsa('[data-open]', el).forEach((b) => b.addEventListener('click', () => { const m = list.find((x) => x.id === b.dataset.open); if (m) files.open(m); }));
        u.qsa('[data-rm]', el).forEach((b) => b.addEventListener('click', () => {
          const m = list.find((x) => x.id === b.dataset.rm);
          if (!m) return;
          ui.confirm('Remove ' + m.name + '?', 'The file is deleted from this job, this device, and the GitHub backup.', 'Remove file', async () => { await files.remove(deal, m); draw(); if (opts.onChange) opts.onChange(); });
        }));
      };
      draw();
    },
  };

  MT.files = files;
})();
