/* Mammoth CRM — Job Cam: photo & video folders per job */
(function () {
  'use strict';
  const MT = window.MT;
  const u = MT.u, ui = MT.ui, store = MT.store, media = MT.media;

  const STATUSES = [
    { id: 'pending', name: 'Pending approval', kind: 'warn' },
    { id: 'approved', name: 'Approved', kind: 'good' },
    { id: 'inprogress', name: 'In progress', kind: 'info' },
    { id: 'completed', name: 'Completed', kind: 'done' },
    { id: 'onhold', name: 'On hold', kind: '' },
    { id: 'disapproved', name: 'Disapproved', kind: 'bad' },
  ];
  const TAGS = [{ value: 'before', label: 'Before' }, { value: 'during', label: 'During' }, { value: 'after', label: 'After' }];
  const statusOf = (id) => STATUSES.find((s) => s.id === id) || STATUSES[0];
  const badge = (id) => { const s = statusOf(id); return '<span class="badge jc-' + s.id + ' ' + s.kind + '">' + u.esc(s.name) + '</span>'; };

  const saveSilently = u.debounce(() => store.save(true), 400);
  const view = { title: 'Job cam', folderId: null, q: '', status: '', customerId: '', filter: 'all', uploadTag: '' };

  function folders() { return store.state.jobFolders; }
  function folder(id) { return folders().find((f) => f.id === id); }
  function counts(f) {
    const img = f.media.filter((m) => m.kind === 'image').length;
    const vid = f.media.length - img;
    return [img ? img + (img === 1 ? ' photo' : ' photos') : '', vid ? vid + (vid === 1 ? ' video' : ' videos') : ''].filter(Boolean).join(', ') || 'No media yet';
  }
  function fmtSize(b) { return b > 1e9 ? (b / 1e9).toFixed(1) + ' GB' : b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' KB'; }
  function fmtDur(s) { s = Math.round(s || 0); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

  /** Fills every [data-thumb] image inside root with its stored thumbnail. */
  function hydrate(root) {
    u.qsa('[data-thumb]', root).forEach(async (el) => {
      const [fid, mid] = el.dataset.thumb.split('|');
      const f = folder(fid); const m = f && f.media.find((x) => x.id === mid);
      if (!m) return;
      let src = null;
      try {
        if (m.sample) src = media.sampleSVG(m);
        else src = (m.hasThumb && (await media.url(m.id + ':t'))) || (m.kind === 'image' ? await media.url(m.id) : null);
      } catch (e) { src = null; }
      if (!src && m.remote && MT.sync.ready()) { try { src = await media.fetchRemote(m, !!m.remote.tpath); } catch (e) { src = null; } }
      if (src) { el.src = src; el.closest('.thumb').classList.add('loaded'); }
      else el.closest('.thumb').classList.add(m.kind === 'video' ? 'is-video-nothumb' : 'missing');
    });
  }

  view.render = function (root) {
    const p = MT.app.params;
    if (p.dealId) { openForDeal(p.dealId); MT.app.params = {}; }
    if (p.customerId) { view.customerId = p.customerId; view.folderId = null; MT.app.params = {}; }
    if (p.folderId) { view.folderId = p.folderId; MT.app.params = {}; }
    if (view.folderId && !folder(view.folderId)) view.folderId = null;
    if (view.folderId) renderFolder(root, folder(view.folderId)); else renderList(root);
  };

  function openForDeal(dealId) {
    let f = folders().find((x) => x.dealId === dealId);
    if (!f) {
      const d = store.deal(dealId);
      if (!d) return;
      const c = store.customer(d.customerId) || {};
      f = newFolder({ name: d.title, customerId: d.customerId, dealId: d.id, address: c.address ? c.address + (c.city ? ', ' + c.city : '') : '', status: d.stage === 'won' ? 'approved' : 'pending' });
      store.save(true);
    }
    view.folderId = f.id;
  }

  function newFolder(o) {
    const f = Object.assign({ id: u.uid('jf'), name: 'New job', customerId: '', dealId: '', address: '', status: 'pending', notes: '', media: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, o);
    folders().unshift(f);
    store.log('jobcam', 'Created job cam folder "' + f.name + '"', { customerId: f.customerId, dealId: f.dealId });
    return f;
  }

  function backupChip() {
    const st = media.backupStats();
    if (!st.total) return '';
    if (!MT.sync.ready()) return '<a class="btn ghost sm" href="#integrations">Turn on photo backup</a>';
    if (!st.pending) return '<span class="badge good">All ' + st.done + ' backed up to GitHub</span>';
    return '<button class="btn ghost sm" id="jc-backup">' + (media.backingUp ? 'Backing up…' : 'Back up ' + st.pending + ' to GitHub') + '</button>';
  }

  /* ================= Folder list ================= */
  function renderList(root) {
    const q = view.q.toLowerCase();
    const all = folders();
    const list = all
      .filter((f) => !view.status || f.status === view.status)
      .filter((f) => !view.customerId || f.customerId === view.customerId)
      .filter((f) => !q || (f.name + ' ' + store.customerName(f.customerId) + ' ' + f.address).toLowerCase().includes(q))
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    const custName = view.customerId ? store.customerName(view.customerId) : '';
    root.innerHTML = `
      <div class="toolbar">
        <input type="search" class="input" id="jc-q" placeholder="Search jobs, customers, or addresses" value="${u.esc(view.q)}" aria-label="Search job folders">
        <select class="input" id="jc-status" aria-label="Status">${u.options(STATUSES.map((s) => ({ value: s.id, label: s.name })), view.status, 'All statuses')}</select>
        ${custName ? `<button class="btn ghost sm" id="jc-clear-cust">Showing ${u.esc(custName)} only &times;</button>` : ''}
        <span class="spacer"></span>
        <span class="hint jc-storage" id="jc-storage"></span>
        ${backupChip()}
        <button class="btn primary" id="jc-new">New job folder</button>
      </div>
      <div class="jc-statusbar" role="group" aria-label="Filter by status">
        ${STATUSES.map((s) => { const n = all.filter((f) => f.status === s.id).length; return `<button class="jc-stat ${view.status === s.id ? 'on' : ''}" data-st="${s.id}"><span class="dot ${s.kind} jc-${s.id}"></span>${u.esc(s.name)}<b>${n}</b></button>`; }).join('')}
      </div>
      ${list.length ? `<div class="jc-grid">${list.map((f) => {
        const cover = f.media.find((m) => m.kind === 'image') || f.media[0];
        return `<article class="jc-card" data-id="${f.id}" tabindex="0" aria-label="${u.esc(f.name)}">
          <div class="thumb jc-cover">${cover ? `<img alt="" data-thumb="${f.id}|${cover.id}">` : '<div class="jc-nomedia"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg></div>'}</div>
          <div class="jc-card-body">
            <div class="jc-card-top"><h4>${u.esc(f.name)}</h4>${badge(f.status)}</div>
            <div class="row-sub">${u.esc(store.customer(f.customerId) ? store.customerName(f.customerId) : 'No customer linked')}</div>
            <div class="jc-card-meta"><span>${u.esc(counts(f))}</span><span>${u.fmtShort(f.updatedAt.slice(0, 10))}</span></div>
          </div>
        </article>`;
      }).join('')}</div>` : `<section class="panel">${ui.empty(all.length ? 'No folders match these filters.' : 'No job folders yet. Create one for each job to keep its photos and videos together.')}</section>`}`;

    hydrate(root);
    showStorage(root);
    const qi = u.qs('#jc-q', root);
    qi.addEventListener('input', u.debounce(() => { view.q = qi.value; renderList(root); const n = u.qs('#jc-q', root); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 200));
    u.qs('#jc-status', root).addEventListener('change', (e) => { view.status = e.target.value; renderList(root); });
    u.qsa('.jc-stat', root).forEach((b) => b.addEventListener('click', () => { view.status = view.status === b.dataset.st ? '' : b.dataset.st; renderList(root); }));
    const cc = u.qs('#jc-clear-cust', root);
    if (cc) cc.addEventListener('click', () => { view.customerId = ''; renderList(root); });
    u.qs('#jc-new', root).addEventListener('click', () => editFolder(null));
    const bk = u.qs('#jc-backup', root);
    if (bk) bk.addEventListener('click', async () => {
      bk.disabled = true;
      const r = await media.backupAll((i, n) => { bk.textContent = 'Backing up ' + Math.min(i + 1, n) + ' of ' + n + '…'; });
      ui.toast(r.failed ? 'Backed up ' + r.done + ', ' + r.failed + ' failed: ' + r.lastErr : 'Backed up ' + r.done + (r.done === 1 ? ' file' : ' files') + ' to GitHub', r.failed ? 'err' : 'ok');
      MT.app.render();
    });
    u.qsa('.jc-card', root).forEach((c) => {
      const open = () => { view.folderId = c.dataset.id; view.filter = 'all'; MT.app.render(); window.scrollTo(0, 0); };
      c.addEventListener('click', open);
      c.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
    });
  }

  async function showStorage(root) {
    const est = await media.estimate();
    const el = u.qs('#jc-storage', root);
    if (el && est && est.quota) el.textContent = fmtSize(est.usage || 0) + ' used of ' + fmtSize(est.quota) + ' available';
  }

  /* ================= Folder edit ================= */
  function editFolder(id, preset) {
    const s = store.state;
    const existing = id ? folder(id) : null;
    const f = existing ? Object.assign({}, existing) : Object.assign({ name: '', customerId: view.customerId || '', dealId: '', address: '', status: 'pending', notes: '' }, preset || {});
    const custs = s.customers.slice().sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ value: c.id, label: c.name }));
    const dealOpts = (cid) => s.deals.filter((d) => d.customerId === cid).map((d) => ({ value: d.id, label: d.title + ' (' + store.stage(d.stage).name + ')' }));
    ui.modal({
      title: existing ? 'Edit job folder' : 'New job folder',
      body: `<div class="form-grid">
        <label class="field span-2"><span>Folder name</span><input class="input" name="name" value="${u.esc(f.name)}" placeholder="e.g. Whitaker oak removal"></label>
        <label class="field"><span>Customer</span><select class="input" name="customerId">${u.options(custs, f.customerId, 'No customer')}</select></label>
        <label class="field"><span>Pipeline deal</span><select class="input" name="dealId">${u.options(dealOpts(f.customerId), f.dealId, 'Not linked')}</select></label>
        <label class="field"><span>Status</span><select class="input" name="status">${u.options(STATUSES.map((x) => ({ value: x.id, label: x.name })), f.status)}</select></label>
        <label class="field"><span>Job address</span><input class="input" name="address" value="${u.esc(f.address)}"></label>
        <label class="field span-2"><span>Notes</span><textarea class="input" rows="3" name="notes">${u.esc(f.notes)}</textarea></label>
      </div>`,
      onMount(b) {
        const cs = u.qs('[name=customerId]', b), ds = u.qs('[name=dealId]', b), nm = u.qs('[name=name]', b), ad = u.qs('[name=address]', b);
        cs.addEventListener('change', () => {
          ds.innerHTML = u.options(dealOpts(cs.value), '', 'Not linked');
          const c = store.customer(cs.value);
          if (c && !ad.value) ad.value = c.address + (c.city ? ', ' + c.city : '');
        });
        ds.addEventListener('change', () => { const d = store.deal(ds.value); if (d && !nm.value) nm.value = d.title; });
      },
      actions: [
        { label: 'Cancel' },
        { label: existing ? 'Save folder' : 'Create folder', kind: 'primary', onClick: (b) => {
          const v = u.formData(b);
          if (!v.name) {
            const d = store.deal(v.dealId), c = store.customer(v.customerId);
            v.name = d ? d.title : c ? c.name + ' job' : '';
          }
          if (!v.name) { ui.toast('Give the folder a name.', 'err'); return false; }
          if (existing) {
            if (existing.status !== v.status) logStatus(existing, v.status);
            Object.assign(existing, v, { updatedAt: new Date().toISOString() });
            store.save();
            ui.toast('Folder saved');
          } else {
            const nf = newFolder(v);
            view.folderId = nf.id;
            store.save();
            ui.toast('Folder created. Add photos and videos.');
          }
        } },
      ],
    });
  }

  function logStatus(f, status) {
    store.log('jobcam', 'Job cam "' + f.name + '" marked ' + statusOf(status).name, { customerId: f.customerId, dealId: f.dealId });
  }

  /* ================= Folder detail ================= */
  function visibleMedia(f) {
    return f.media.filter((m) => view.filter === 'all' || (view.filter === 'video' ? m.kind === 'video' : view.filter === 'photo' ? m.kind === 'image' : m.tag === view.filter));
  }

  function renderFolder(root, f) {
    const c = store.customer(f.customerId);
    const d = f.dealId ? store.deal(f.dealId) : null;
    const shown = visibleMedia(f);
    const cnt = (k) => f.media.filter((m) => (k === 'video' ? m.kind === 'video' : k === 'photo' ? m.kind === 'image' : m.tag === k)).length;
    root.innerHTML = `
      <div><button class="btn ghost sm" id="jc-back">All job folders</button></div>
      <section class="panel jc-head">
        <div class="jc-head-main">
          <h2 class="jc-title">${u.esc(f.name)}</h2>
          <div class="jc-sub">
            ${c ? `<a href="#" id="jc-cust">${u.esc(c.name)}</a>` : '<span class="muted">No customer linked</span>'}
            ${f.address ? `<span>${u.esc(f.address)}</span>` : ''}
            ${d ? `<a href="#" id="jc-deal">Deal: ${u.esc(d.title)} (${u.esc(store.stage(d.stage).name)})</a>` : ''}
          </div>
          ${f.notes ? `<p class="jc-notes">${u.esc(f.notes)}</p>` : ''}
        </div>
        <div class="jc-head-side">
          <label class="field"><span>Status</span><select class="input jc-status-sel jc-${f.status}" id="jc-status-sel">${u.options(STATUSES.map((x) => ({ value: x.id, label: x.name })), f.status)}</select></label>
          <div class="btn-row"><button class="btn ghost sm" id="jc-edit">Edit details</button><button class="btn danger-ghost sm" id="jc-del">Delete folder</button></div>
        </div>
      </section>

      <section class="panel jc-upload" id="jc-drop">
        <div class="jc-upload-row">
          <label class="btn primary file-btn">Take photo or video<input type="file" accept="image/*,video/*" capture="environment" id="jc-cam" hidden></label>
          <label class="btn ghost file-btn">Upload files<input type="file" accept="image/*,video/*" multiple id="jc-files" hidden></label>
          <label class="field jc-tagsel"><span>Label new uploads as</span><select class="input" id="jc-uptag">${u.options(TAGS, view.uploadTag, 'No label')}</select></label>
          <span class="hint jc-drop-hint">or drag photos and videos here</span>
        </div>
        <div class="jc-progress" id="jc-progress" hidden><div class="meter"><span style="width:0%"></span></div><span class="hint"></span></div>
      </section>

      <div class="jc-filters seg" role="tablist">
        ${[['all', 'All', f.media.length], ['before', 'Before', cnt('before')], ['during', 'During', cnt('during')], ['after', 'After', cnt('after')], ['photo', 'Photos', cnt('photo')], ['video', 'Videos', cnt('video')]]
          .map((x) => `<button role="tab" data-f="${x[0]}" class="${view.filter === x[0] ? 'on' : ''}" aria-selected="${view.filter === x[0]}">${x[1]} <small>${x[2]}</small></button>`).join('')}
      </div>

      ${shown.length ? `<div class="jc-media">${shown.map((m) => `
        <figure class="jc-tile" data-mid="${m.id}" tabindex="0" aria-label="${u.esc(m.caption || m.name)}">
          <div class="thumb">${m.kind === 'video' || m.hasThumb || m.sample || m.kind === 'image' ? `<img alt="" data-thumb="${f.id}|${m.id}">` : ''}
            ${m.kind === 'video' ? `<span class="jc-play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span><span class="jc-dur">${fmtDur(m.duration)}</span>` : ''}
            ${m.tag ? `<span class="jc-tag">${u.esc(m.tag)}</span>` : ''}
            <span class="jc-missing">Not on this device</span>
          </div>
          ${m.caption ? `<figcaption>${u.esc(m.caption)}</figcaption>` : ''}
        </figure>`).join('')}</div>`
        : `<section class="panel">${ui.empty(f.media.length ? 'Nothing matches this filter.' : 'No photos or videos yet. Take one with your camera or upload files above.')}</section>`}`;

    hydrate(root);
    u.qs('#jc-back', root).addEventListener('click', () => { view.folderId = null; MT.app.render(); });
    const cl = u.qs('#jc-cust', root);
    if (cl) cl.addEventListener('click', (e) => { e.preventDefault(); MT.views.customers.detail(c.id); });
    const dl = u.qs('#jc-deal', root);
    if (dl) dl.addEventListener('click', (e) => { e.preventDefault(); MT.views.pipeline.openDeal(d.id); });
    u.qs('#jc-status-sel', root).addEventListener('change', (e) => {
      logStatus(f, e.target.value);
      f.status = e.target.value;
      f.updatedAt = new Date().toISOString();
      store.save();
      ui.toast('Marked ' + statusOf(f.status).name);
    });
    u.qs('#jc-edit', root).addEventListener('click', () => editFolder(f.id));
    u.qs('#jc-del', root).addEventListener('click', () => ui.confirm('Delete "' + f.name + '"?', 'This permanently deletes the folder and its ' + f.media.length + ' photos and videos from this device.', 'Delete folder', async () => {
      for (const m of f.media) { try { await media.removeItem(m); } catch (e) { /* keep going */ } }
      store.state.jobFolders = folders().filter((x) => x.id !== f.id);
      view.folderId = null;
      store.save();
      ui.toast('Folder deleted');
    }));
    u.qs('#jc-uptag', root).addEventListener('change', (e) => { view.uploadTag = e.target.value; });
    u.qsa('.jc-filters button', root).forEach((b) => b.addEventListener('click', () => { view.filter = b.dataset.f; renderFolder(root, f); }));
    ['#jc-cam', '#jc-files'].forEach((sel) => u.qs(sel, root).addEventListener('change', (e) => { upload(root, f, Array.from(e.target.files)); e.target.value = ''; }));
    const drop = u.qs('#jc-drop', root);
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('drop'); });
    drop.addEventListener('dragleave', (e) => { if (!drop.contains(e.relatedTarget)) drop.classList.remove('drop'); });
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('drop'); upload(root, f, Array.from(e.dataTransfer.files || [])); });
    u.qsa('.jc-tile', root).forEach((t) => {
      const open = () => lightbox(f, t.dataset.mid);
      t.addEventListener('click', open);
      t.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
    });
  }

  async function upload(root, f, files) {
    files = files.filter((x) => x.type.startsWith('image/') || x.type.startsWith('video/'));
    if (!files.length) { ui.toast('Choose photo or video files.', 'err'); return; }
    media.persist();
    const prog = u.qs('#jc-progress', root);
    prog.hidden = false;
    let ok = 0;
    const errors = [];
    for (let i = 0; i < files.length; i++) {
      u.qs('.hint', prog).textContent = 'Saving ' + (i + 1) + ' of ' + files.length + ': ' + files[i].name;
      u.qs('.meter span', prog).style.width = ((i / files.length) * 100) + '%';
      try {
        const rec = await media.ingest(files[i]);
        rec.tag = view.uploadTag;
        f.media.unshift(rec);
        ok++;
      } catch (e) {
        errors.push(e && e.name === 'QuotaExceededError' ? 'This device is out of storage space. Delete some media or free up space.' : (e.message || 'Could not save ' + files[i].name));
        if (e && e.name === 'QuotaExceededError') break;
      }
    }
    if (ok) {
      f.updatedAt = new Date().toISOString();
      store.log('jobcam', 'Added ' + ok + (ok === 1 ? ' file' : ' files') + ' to job cam "' + f.name + '"', { customerId: f.customerId, dealId: f.dealId });
      store.save();
      ui.toast('Added ' + ok + (ok === 1 ? ' file' : ' files'));
      if (MT.sync.ready() && MT.sync.cfg().mediaAuto) media.backupAll().then((r) => { if (r.done) { ui.toast('Backed up ' + r.done + (r.done === 1 ? ' file' : ' files') + ' to GitHub'); if (MT.app.route === 'jobcam') MT.app.render(); } else if (r.failed) ui.toast('Photo backup failed: ' + r.lastErr, 'err'); });
    } else prog.hidden = true;
    errors.slice(0, 3).forEach((m) => ui.toast(m, 'err'));
  }

  /* ================= Lightbox ================= */
  function lightbox(f, mid) {
    let idx = visibleMedia(f).findIndex((m) => m.id === mid);
    const wrap = document.createElement('div');
    wrap.className = 'lightbox';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-label', 'Media viewer');
    document.body.appendChild(wrap);
    let dirty = false;
    const mark = () => { dirty = true; saveSilently(); };

    const close = () => {
      document.removeEventListener('keydown', onKey);
      wrap.remove();
      if (dirty) { f.updatedAt = new Date().toISOString(); store.save(); }
    };
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') { if (e.key === 'Escape') close(); return; }
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    const go = (step) => { const list = visibleMedia(f); if (!list.length) return close(); idx = (idx + step + list.length) % list.length; draw(); };

    async function draw() {
      const list = visibleMedia(f);
      const m = list[idx];
      if (!m) return close();
      wrap.innerHTML = `
        <div class="lb-stage">
          <button class="lb-nav prev" aria-label="Previous" ${list.length < 2 ? 'hidden' : ''}>&#8249;</button>
          <div class="lb-media" id="lb-media"><span class="hint">Loading…</span></div>
          <button class="lb-nav next" aria-label="Next" ${list.length < 2 ? 'hidden' : ''}>&#8250;</button>
        </div>
        <aside class="lb-side">
          <div class="lb-top"><span class="hint">${idx + 1} of ${list.length}</span><button class="icon-btn lb-close" aria-label="Close">&times;</button></div>
          <label class="field"><span>Caption</span><textarea class="input" rows="3" id="lb-cap" placeholder="What does this show?">${u.esc(m.caption)}</textarea></label>
          <label class="field"><span>Label</span><select class="input" id="lb-tag">${u.options(TAGS, m.tag, 'No label')}</select></label>
          <dl class="lb-info">
            <div><dt>File</dt><dd>${u.esc(m.name)}</dd></div>
            ${m.size ? `<div><dt>Size</dt><dd>${fmtSize(m.size)}${m.w ? ', ' + m.w + ' × ' + m.h : ''}</dd></div>` : ''}
            ${m.kind === 'video' && m.duration ? `<div><dt>Length</dt><dd>${fmtDur(m.duration)}</dd></div>` : ''}
            <div><dt>Added</dt><dd>${u.fmtDate(m.addedAt.slice(0, 10))}</dd></div>
          </dl>
          <div class="lb-actions">
            <button class="btn ghost" id="lb-dl">Download</button>
            <button class="btn ghost" id="lb-cover">Use as folder cover</button>
            <button class="btn danger-ghost" id="lb-del">Delete</button>
          </div>
        </aside>`;
      const box = u.qs('#lb-media', wrap);
      let src = null;
      try { src = m.sample ? media.sampleSVG(m) : await media.url(m.id); } catch (e) { src = null; }
      if (!src && m.remote && MT.sync.ready()) {
        const bx = u.qs('#lb-media', wrap); if (bx) bx.innerHTML = '<span class="hint">Downloading from your GitHub backup…</span>';
        try { src = await media.fetchRemote(m, false); } catch (e) { src = null; }
      }
      if (!wrap.isConnected) return;
      if (!src) box.innerHTML = '<p class="lb-missing">' + (m.remote ? 'Could not download this file from GitHub. Check your connection and the GitHub key in Integrations.' : 'This file is only on the device that added it, and it hasn\'t been backed up to GitHub yet.') + '</p>';
      else if (m.kind === 'video') box.innerHTML = '<video controls playsinline preload="metadata" src="' + src + '"></video>';
      else box.innerHTML = '<img alt="' + u.esc(m.caption || m.name) + '" src="' + src + '">';

      u.qs('.lb-close', wrap).addEventListener('click', close);
      u.qsa('.lb-nav', wrap).forEach((b) => b.addEventListener('click', () => go(b.classList.contains('prev') ? -1 : 1)));
      u.qs('#lb-cap', wrap).addEventListener('input', (e) => { m.caption = e.target.value; mark(); });
      u.qs('#lb-tag', wrap).addEventListener('change', (e) => { m.tag = e.target.value; mark(); });
      u.qs('#lb-cover', wrap).addEventListener('click', () => { f.media.splice(f.media.indexOf(m), 1); f.media.unshift(m); mark(); ui.toast('Set as folder cover'); });
      u.qs('#lb-dl', wrap).addEventListener('click', () => {
        if (!src) return ui.toast('This file isn\'t on this device.', 'err');
        const a = document.createElement('a');
        a.href = src;
        a.download = m.sample ? 'sample-' + m.id + '.svg' : m.name;
        document.body.appendChild(a); a.click(); a.remove();
      });
      u.qs('#lb-del', wrap).addEventListener('click', () => ui.confirm('Delete this ' + (m.kind === 'video' ? 'video' : 'photo') + '?', 'It will be removed from this folder and this device.', 'Delete', async () => {
        try { await media.removeItem(m); } catch (e) { /* already gone */ }
        f.media.splice(f.media.indexOf(m), 1);
        mark();
        ui.toast('Deleted');
        if (!visibleMedia(f).length) close(); else { idx = Math.min(idx, visibleMedia(f).length - 1); draw(); }
      }));
    }
    wrap.addEventListener('mousedown', (e) => { if (e.target === wrap || e.target.classList.contains('lb-stage')) close(); });
    document.addEventListener('keydown', onKey);
    draw();
  }

  view.STATUSES = STATUSES;
  view.openFolderForDeal = (dealId) => MT.app.go('jobcam', { dealId });
  MT.views.jobcam = view;
})();
