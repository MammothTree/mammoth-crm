/* Mammoth CRM — import a client list from Google Sheets (paste or CSV) or Excel (.xlsx) */
(function () {
  'use strict';
  const MT = window.MT;
  const u = MT.u, ui = MT.ui, store = MT.store;

  // CRM fields and the column names that usually hold them.
  const FIELDS = [
    { key: 'name', label: 'Full name', words: ['full name', 'name', 'client', 'client name', 'customer', 'customer name', 'contact', 'contact name'] },
    { key: 'first', label: 'First name', words: ['first name', 'first', 'firstname', 'given name'] },
    { key: 'last', label: 'Last name', words: ['last name', 'last', 'lastname', 'surname', 'family name'] },
    { key: 'company', label: 'Company', words: ['company', 'business', 'organization', 'company name', 'business name'] },
    { key: 'phone', label: 'Phone', words: ['phone', 'phone number', 'mobile', 'cell', 'telephone', 'tel', 'primary phone'] },
    { key: 'email', label: 'Email', words: ['email', 'e-mail', 'email address', 'mail'] },
    { key: 'address', label: 'Street address', words: ['address', 'street', 'street address', 'address 1', 'address line 1', 'service address', 'property address'] },
    { key: 'city', label: 'City', words: ['city', 'town'] },
    { key: 'state', label: 'State', words: ['state', 'st', 'province', 'region'] },
    { key: 'zip', label: 'ZIP', words: ['zip', 'zip code', 'zipcode', 'postal code', 'postcode'] },
    { key: 'source', label: 'How they found you', words: ['source', 'lead source', 'referral source', 'how did you hear', 'referred by'] },
    { key: 'type', label: 'Residential or commercial', words: ['type', 'client type', 'customer type', 'category'] },
    { key: 'notes', label: 'Notes', words: ['notes', 'note', 'comments', 'comment', 'memo', 'details'] },
  ];

  /** Tab-separated text, as Google Sheets and Excel put on the clipboard. */
  function parseTSV(text) {
    const rows = []; let row = [], cell = '', q = false;
    text = String(text).replace(/\r\n?/g, '\n');
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"' && cell === '') q = true;
      else if (ch === '\t') { row.push(cell); cell = ''; }
      else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((c) => String(c).trim()));
  }
  /** Rows from a CSV file, as arrays. */
  function parseCSVRows(text) {
    const { headers, rows } = MT.views.integrations.parseCSV(text);
    return [headers].concat(rows.map((r) => headers.map((h) => r[h])));
  }
  let xlsxP = null;
  function loadXLSX() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (xlsxP) return xlsxP;
    xlsxP = new Promise((res, rej) => {
      const sc = document.createElement('script');
      sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      sc.onload = () => res(window.XLSX);
      sc.onerror = () => { xlsxP = null; rej(new Error('Reading Excel files needs an internet connection. Or save the sheet as CSV and import that.')); };
      document.head.appendChild(sc);
    });
    return xlsxP;
  }
  async function readFile(file) {
    if (/\.(xlsx|xls|ods)$/i.test(file.name)) {
      const X = await loadXLSX();
      const wb = X.read(await file.arrayBuffer(), { type: 'array' });
      const sh = wb.Sheets[wb.SheetNames[0]];
      return X.utils.sheet_to_json(sh, { header: 1, raw: false, defval: '' }).filter((r) => r.some((c) => String(c).trim()));
    }
    const text = await file.text();
    return text.includes('\t') && !text.split('\n')[0].includes(',') ? parseTSV(text) : parseCSVRows(text);
  }

  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  function guessMap(headers) {
    const map = {};
    const used = new Set();
    const n = headers.map(norm);
    // 1) exact column names for every field, so "First Name" goes to First name, not Full name
    FIELDS.forEach((f) => { const i = n.findIndex((h, k) => !used.has(k) && f.words.includes(h)); if (i >= 0) { map[f.key] = i; used.add(i); } });
    // 2) partial matches for fields still missing ("Service Address", "Mobile #")
    FIELDS.forEach((f) => {
      if (map[f.key] != null) return;
      const i = n.findIndex((h, k) => !used.has(k) && f.words.some((w) => w.length > 4 && h.includes(w)));
      if (i >= 0) { map[f.key] = i; used.add(i); }
    });
    return map;
  }  const looksLikeHeader = (row) => row.some((c) => FIELDS.some((f) => f.words.includes(norm(c))));
  function fmtPhone(p) {
    const d = String(p || '').replace(/\D/g, '');
    const t = d.length === 11 && d[0] === '1' ? d.slice(1) : d;
    return t.length === 10 ? '(' + t.slice(0, 3) + ') ' + t.slice(3, 6) + '-' + t.slice(6) : String(p || '').trim();
  }
  const titleCase = (s) => String(s || '').trim().replace(/\s+/g, ' ').replace(/\b([a-z])/g, (m) => m.toUpperCase());

  function toClient(row, map) {
    const get = (k) => (map[k] == null ? '' : String(row[map[k]] == null ? '' : row[map[k]]).trim());
    let name = [get('first'), get('last')].filter(Boolean).join(' ') || get('name');
    if (!name && get('company')) name = get('company');
    if (name === name.toUpperCase() || name === name.toLowerCase()) name = titleCase(name.toLowerCase());
    const cityParts = [get('city'), [get('state'), get('zip')].filter(Boolean).join(' ')].filter(Boolean);
    const type = /comm|business/i.test(get('type')) || /\b(hoa|llc|inc|corp|co\.|company|properties|property management|association|church|school|city of|county)\b/i.test(get('company') + ' ' + name) ? 'Commercial' : 'Residential';
    const src = get('source');
    const source = store.SOURCES.find((x) => x.toLowerCase() === src.toLowerCase()) || (src ? 'Other' : '');
    return {
      name, company: get('company'), phone: fmtPhone(get('phone')), email: get('email').toLowerCase(),
      address: get('address'), city: cityParts.join(', '), source, type,
      notes: [get('notes'), src && source === 'Other' ? 'Source: ' + src : ''].filter(Boolean).join(' / '),
    };
  }
  const digits = (p) => String(p || '').replace(/\D/g, '').slice(-10);
  function findExisting(c) {
    return store.state.customers.find((x) => (c.email && x.email && x.email.toLowerCase() === c.email) || (digits(c.phone).length === 10 && digits(x.phone) === digits(c.phone)) || (c.name && x.name.toLowerCase() === c.name.toLowerCase() && (!c.address || !x.address || x.address.toLowerCase() === c.address.toLowerCase())));
  }

  /* ---------- dialogs ---------- */
  function open() {
    ui.modal({
      title: 'Import clients',
      body: `<div class="seg imp-tabs"><button class="on" data-t="paste">Paste from Google Sheets</button><button data-t="file">Upload a file</button></div>
        <div data-pane="paste">
          <ol class="steps compact"><li>In Google Sheets, select your client rows, including the header row (click the row numbers, or press Ctrl+A).</li><li>Copy them (Ctrl+C, or Cmd+C on a Mac).</li><li>Click in the box below and paste (Ctrl+V).</li></ol>
          <textarea class="input imp-paste" id="imp-text" rows="8" placeholder="Paste your rows here"></textarea>
        </div>
        <div data-pane="file" hidden>
          <p>In Google Sheets choose <b>File → Download → Comma-separated values (.csv)</b> or <b>Microsoft Excel (.xlsx)</b>. Excel files work as-is.</p>
          <label class="btn primary file-btn">Choose a file<input type="file" id="imp-file" accept=".csv,.tsv,.txt,.xlsx,.xls,.ods,text/csv" hidden></label>
          <p class="hint" id="imp-fname"></p>
        </div>
        <label class="check" style="margin-top:10px"><input type="checkbox" id="imp-head" checked><span>The first row has column names</span></label>`,
      onMount(b) {
        u.qsa('.imp-tabs button', b).forEach((x) => x.addEventListener('click', () => {
          u.qsa('.imp-tabs button', b).forEach((y) => y.classList.toggle('on', y === x));
          u.qsa('[data-pane]', b).forEach((p) => { p.hidden = p.dataset.pane !== x.dataset.t; });
        }));
        u.qs('#imp-file', b).addEventListener('change', (e) => { const f = e.target.files[0]; u.qs('#imp-fname', b).textContent = f ? f.name : ''; b._file = f; });
      },
      actions: [{ label: 'Cancel' }, { label: 'Next', kind: 'primary', onClick: (b) => {
        const text = u.qs('#imp-text', b).value;
        const file = b._file;
        const hasHead = u.qs('#imp-head', b).checked;
        const fileTab = !u.qs('[data-pane=file]', b).hidden;
        if (fileTab ? !file : !text.trim()) { ui.toast(fileTab ? 'Choose a file first.' : 'Paste your rows from Google Sheets into the box first.', 'err'); return false; }
        (async () => {
          let rows;
          try { rows = fileTab ? await readFile(file) : text.trim() ? (text.includes('\t') ? parseTSV(text) : parseCSVRows(text)) : null; }
          catch (e) { ui.toast(e.message || 'Could not read that file.', 'err'); return; }
          if (!rows || !rows.length) { ui.toast('Paste some rows or choose a file first.', 'err'); return; }
          const header = hasHead || looksLikeHeader(rows[0]);
          const width = Math.max.apply(null, rows.map((r) => r.length));
          const headers = header ? rows[0].map((h, i) => String(h || '').trim() || 'Column ' + (i + 1)) : Array.from({ length: width }, (_, i) => 'Column ' + String.fromCharCode(65 + i));
          const data = header ? rows.slice(1) : rows;
          if (!data.length) { ui.toast('No client rows found under the header row.', 'err'); return; }
          setTimeout(() => mapStep(headers, data), 0);
        })();
      } }],
    });
  }

  function mapStep(headers, data) {
    const map = guessMap(headers);
    const colOpts = (sel) => '<option value="">(not in my sheet)</option>' + headers.map((h, i) => `<option value="${i}" ${String(sel) === String(i) ? 'selected' : ''}>${u.esc(h)}</option>`).join('');
    ui.modal({
      title: 'Match your columns', size: 'lg',
      body: `<p class="hint">${data.length} rows found. Check which column holds each detail; the guesses are filled in already. Only a name is required.</p>
        <div class="imp-map">${FIELDS.map((f) => `<label class="field"><span>${f.label}</span><select class="input" data-f="${f.key}">${colOpts(map[f.key])}</select></label>`).join('')}</div>
        <h4 class="sub-h">Preview</h4><div id="imp-prev"></div>
        <label class="check" style="margin-top:10px"><input type="checkbox" id="imp-fill" checked><span>For clients I already have, fill in any details that are missing (nothing gets overwritten)</span></label>`,
      onMount(b) {
        const draw = () => {
          const m = {};
          u.qsa('[data-f]', b).forEach((s) => { if (s.value !== '') m[s.dataset.f] = +s.value; });
          b._map = m;
          const clients = data.map((r) => toClient(r, m));
          const valid = clients.filter((c) => c.name);
          const dup = valid.filter((c) => findExisting(c)).length;
          b._clients = clients;
          u.qs('#imp-prev', b).innerHTML = `<p><b>${valid.length - dup} new clients</b>${dup ? ', ' + dup + ' already in the CRM' : ''}${clients.length - valid.length ? ', ' + (clients.length - valid.length) + ' rows with no name will be skipped' : ''}.</p>
            <div class="table-wrap"><table class="table"><thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Address</th><th></th></tr></thead><tbody>
            ${clients.slice(0, 6).map((c) => `<tr><td>${u.esc(c.name) || '<span class="neg">No name</span>'}${c.company ? '<div class="row-sub">' + u.esc(c.company) + '</div>' : ''}</td><td class="nowrap">${u.esc(c.phone)}</td><td>${u.esc(c.email)}</td><td>${u.esc([c.address, c.city].filter(Boolean).join(', '))}</td><td>${c.name && findExisting(c) ? ui.badge('Already here', 'info') : c.name ? ui.badge('New', 'good') : ''}</td></tr>`).join('')}
            </tbody></table></div>${clients.length > 6 ? '<p class="hint">and ' + (clients.length - 6) + ' more</p>' : ''}`;
        };
        u.qsa('[data-f]', b).forEach((s) => s.addEventListener('change', draw));
        draw();
      },
      actions: [{ label: 'Back', onClick: () => setTimeout(open, 0) }, { label: 'Import clients', kind: 'primary', onClick: (b) => {
        const fill = u.qs('#imp-fill', b).checked;
        let added = 0, updated = 0;
        const seen = [];
        b._clients.forEach((c) => {
          if (!c.name) return;
          const ex = findExisting(c) || seen.find((x) => (c.email && x.email === c.email) || (digits(c.phone).length === 10 && digits(x.phone) === digits(c.phone)));
          if (ex) {
            if (!fill) return;
            let ch = false;
            ['company', 'phone', 'email', 'address', 'city', 'source', 'notes'].forEach((k) => { if (!ex[k] && c[k]) { ex[k] = c[k]; ch = true; } });
            if (ch) { if (ex.geo && !ex.geo.sample) delete ex.geo; updated++; }
            return;
          }
          const nc = Object.assign({ id: u.uid('c'), createdAt: u.todayISO() }, c);
          store.state.customers.unshift(nc);
          seen.push(nc);
          added++;
        });
        if (!added && !updated) { ui.toast('Nothing new to import. Every client is already in the CRM.'); return; }
        store.log('customer', 'Imported ' + added + ' clients' + (updated ? ' and updated ' + updated : '') + ' from a spreadsheet');
        store.save();
        ui.toast(added + ' clients imported' + (updated ? ', ' + updated + ' updated' : ''));
      } }],
    });
  }

  MT.clientImport = { open, parseTSV, guessMap, toClient, readFile, findExisting };
})();
