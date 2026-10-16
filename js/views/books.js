/* Mammoth CRM — Bookkeeping: bank transactions, categories, period reports for the accountant.
   Protected by its own PIN, separate from the app PIN. */
(function () {
  'use strict';
  const MT = window.MT;
  const u = MT.u, ui = MT.ui, store = MT.store;
  const PIN_KEY = 'mammothcrm.bookspin.v1';
  const UNLOCK_KEY = 'mammothcrm.booksopen';

  const INCOME = ['Job income', 'Other income'];
  const EXPENSE = ['Fuel', 'Equipment repairs & maintenance', 'Equipment rental', 'Subcontractors', 'Dump & disposal fees', 'Materials & supplies', 'Small tools & safety gear', 'Vehicle & equipment loans', 'Insurance', 'Payroll', 'Payroll taxes', 'Office & software', 'Phone & internet', 'Marketing & advertising', 'Rent & utilities', 'Licenses & permits', 'Professional fees', 'Bank & card fees', 'Meals', 'Travel', 'Other expense'];
  const NON = ['Owner draw', 'Owner contribution', 'Transfer', 'Loan principal'];
  const UNCAT = 'Uncategorized';
  const ALL = INCOME.concat(EXPENSE, NON, [UNCAT]);
  // Starter rules: words in the bank description → category. Your own rules win.
  const BUILTIN = [
    [/square inc|sq \*|square deposit|stripe transfer|\bdeposit\b|zelle from|mobile deposit|remote deposit/i, 'Job income'],
    [/\bshell\b|chevron|exxon|\bmobil\b|\bbp\b|sunoco|marathon petro|speedway|\bwawa\b|sheetz|circle k|valero|citgo|pilot travel|love'?s travel|quiktrip|\bfuel\b/i, 'Fuel'],
    [/home depot|lowe'?s|menards|tractor supply|ace hardware|harbor freight|grainger|northern tool/i, 'Materials & supplies'],
    [/stihl|husqvarna|baileys|sherrill|treestuff|wesspur|forestry supplies/i, 'Small tools & safety gear'],
    [/sunbelt|united rentals|herc|rental/i, 'Equipment rental'],
    [/landfill|transfer station|waste|compost|green ?waste|dump/i, 'Dump & disposal fees'],
    [/insurance|progressive|state farm|geico|travelers|hartford|nationwide|liberty mutual/i, 'Insurance'],
    [/gusto|adp|paychex|payroll/i, 'Payroll'],
    [/irs|eftps|dept of revenue|department of revenue|state tax|unemployment/i, 'Payroll taxes'],
    [/google ads|google \*ads|facebook|meta ads|yelp|angi|thumbtack|nextdoor|vistaprint/i, 'Marketing & advertising'],
    [/verizon|at&t|att\b|t-mobile|comcast|xfinity|spectrum/i, 'Phone & internet'],
    [/quickbooks|intuit|microsoft|google \*gsuite|google workspace|adobe|dropbox|jobber|apple\.com/i, 'Office & software'],
    [/service fee|monthly fee|overdraft|wire fee|card fee|square fee|stripe fee/i, 'Bank & card fees'],
    [/transfer to|transfer from|online transfer/i, 'Transfer'],
    [/mcdonald|subway|starbucks|dunkin|chick-fil|restaurant|pizza|cafe/i, 'Meals'],
  ];

  const view = { title: 'Bookkeeping', period: 'month', anchor: null, from: '', to: '', q: '', cat: '', acct: '' };

  /* ---------- PIN ---------- */
  const pinCfg = () => { try { return JSON.parse(localStorage.getItem(PIN_KEY) || 'null'); } catch (e) { return null; } };
  const isOpen = () => { try { return sessionStorage.getItem(UNLOCK_KEY) === '1'; } catch (e) { return false; } };
  const setOpen = (v) => { try { if (v) sessionStorage.setItem(UNLOCK_KEY, '1'); else sessionStorage.removeItem(UNLOCK_KEY); } catch (e) { /* ignore */ } };
  async function setPin(pin) { const salt = Math.random().toString(36).slice(2, 10); localStorage.setItem(PIN_KEY, JSON.stringify({ salt, hash: await MT.lock.hash(pin, salt) })); }
  async function checkPin(pin) { const c = pinCfg(); return !!c && (await MT.lock.hash(pin, c.salt)) === c.hash; }
  view.lock = () => { setOpen(false); };

  function books() {
    const s = store.state;
    s.books = s.books || {};
    const b = s.books;
    if (!Array.isArray(b.accounts)) b.accounts = [];
    if (!Array.isArray(b.txns)) b.txns = [];
    if (!Array.isArray(b.rules)) b.rules = [];
    if (!Array.isArray(b.imports)) b.imports = [];
    return b;
  }

  /* ---------- periods ---------- */
  const D = (y, m, d) => u.isoDate(new Date(y, m, d));
  function range() {
    const a = u.parseISO(view.anchor || u.todayISO());
    const y = a.getFullYear(), m = a.getMonth();
    switch (view.period) {
      case 'week': { const mon = new Date(a); mon.setDate(a.getDate() - ((a.getDay() + 6) % 7)); const f = u.isoDate(mon); return { from: f, to: u.addDays(f, 6), label: 'Week of ' + u.fmtDate(f) }; }
      case 'quarter': { const q = Math.floor(m / 3); return { from: D(y, q * 3, 1), to: D(y, q * 3 + 3, 0), label: 'Q' + (q + 1) + ' ' + y }; }
      case 'year': return { from: D(y, 0, 1), to: D(y, 11, 31), label: String(y) };
      case 'custom': { let f = view.from || D(y, m, 1), t = view.to || u.todayISO(); if (f > t) [f, t] = [t, f]; return { from: f, to: t, label: u.fmtDate(f) + ' – ' + u.fmtDate(t) }; }
      default: return { from: D(y, m, 1), to: D(y, m + 1, 0), label: a.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) };
    }
  }
  function step(n) {
    const a = u.parseISO(view.anchor || u.todayISO());
    if (view.period === 'week') a.setDate(a.getDate() + 7 * n);
    else if (view.period === 'quarter') a.setMonth(a.getMonth() + 3 * n, 1);
    else if (view.period === 'year') a.setFullYear(a.getFullYear() + n, 0, 1);
    else a.setMonth(a.getMonth() + n, 1);
    view.anchor = u.isoDate(a);
  }

  /* ---------- categorizing ---------- */
  function categorize(desc, amount) {
    const b = books();
    const d = String(desc || '');
    const rule = b.rules.find((r) => r.match && d.toLowerCase().includes(r.match.toLowerCase()));
    if (rule) return rule.category;
    for (const [re, cat] of BUILTIN) if (re.test(d)) { if (cat === 'Job income' && amount < 0) continue; return cat; }
    return UNCAT;
  }
  const kindOf = (cat) => (INCOME.includes(cat) ? 'in' : EXPENSE.includes(cat) ? 'out' : NON.includes(cat) ? 'non' : 'uncat');
  const hashOf = (t) => [t.accountId, t.date, Math.round(u.num(t.amount) * 100), String(t.desc).toLowerCase().replace(/\s+/g, ' ').trim()].join('|');

  /* ---------- importing bank files ---------- */
  function parseOFX(text) {
    const out = [];
    const blocks = text.split(/<STMTTRN>/i).slice(1);
    const tag = (blk, n) => { const m = blk.match(new RegExp('<' + n + '>([^<\\r\\n]*)', 'i')); return m ? m[1].trim() : ''; };
    blocks.forEach((blk) => {
      const dt = tag(blk, 'DTPOSTED');
      if (!dt) return;
      out.push({ date: dt.slice(0, 4) + '-' + dt.slice(4, 6) + '-' + dt.slice(6, 8), amount: u.num(tag(blk, 'TRNAMT')), desc: tag(blk, 'NAME') || tag(blk, 'MEMO'), memo: tag(blk, 'NAME') ? tag(blk, 'MEMO') : '', fitid: tag(blk, 'FITID') });
    });
    return out;
  }
  function parseBankCSV(text) {
    const { headers, rows } = MT.views.integrations.parseCSV(text);
    const find = (names) => headers.find((h) => names.some((n) => h.toLowerCase() === n)) || headers.find((h) => names.some((n) => h.toLowerCase().includes(n)));
    const date = find(['date', 'posting date', 'transaction date', 'posted date']);
    const desc = find(['description', 'payee', 'name', 'merchant', 'details', 'memo']);
    const amount = find(['amount', 'transaction amount']);
    const debit = find(['debit', 'withdrawal', 'withdrawals', 'money out']);
    const credit = find(['credit', 'deposit', 'deposits', 'money in']);
    if (!date || !desc || (!amount && !(debit || credit))) throw new Error('Could not find date, description, and amount columns in this file. Columns found: ' + headers.join(', '));
    const money = (v) => { const s = String(v || '').trim(); const neg = /^\(.*\)$/.test(s) || /^-/.test(s.replace(/[$\s]/g, '')); const n = u.num(s.replace(/[^0-9.]/g, '')); return neg ? -n : n; };
    const toISO = (v) => { v = String(v || '').trim(); let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0'); m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if (m) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0'); const d = new Date(v); return isNaN(d) ? '' : u.isoDate(d); };
    return rows.map((r) => {
      let amt = amount ? money(r[amount]) : 0;
      if (!amount) amt = Math.abs(money(r[credit])) - Math.abs(money(r[debit]));
      return { date: toISO(r[date]), amount: amt, desc: r[desc] || '', memo: '', fitid: '' };
    }).filter((t) => t.date && t.amount);
  }
  function importFile(file, root) {
    const rd = new FileReader();
    rd.onload = () => {
      let rows;
      try { rows = /<OFX>|<STMTTRN>/i.test(rd.result) ? parseOFX(rd.result) : parseBankCSV(rd.result); } catch (e) { ui.toast(e.message, 'err'); return; }
      if (!rows.length) { ui.toast('No transactions found in that file.', 'err'); return; }
      const b = books();
      const accts = b.accounts.map((a) => ({ value: a.id, label: a.name }));
      ui.modal({
        title: 'Import bank transactions', size: 'sm',
        body: `<p>${rows.length} transactions from ${u.fmtDate(rows.reduce((m, r) => (r.date < m ? r.date : m), '9999'))} to ${u.fmtDate(rows.reduce((m, r) => (r.date > m ? r.date : m), '0000'))}.</p>
          <label class="field"><span>Which account is this?</span><select class="input" id="bi-acct">${u.options(accts, accts[0] ? accts[0].value : '', accts.length ? null : 'Add an account below')}</select></label>
          <label class="field" style="margin-top:10px"><span>Or add a new account</span><input class="input" id="bi-new" placeholder="e.g. Business checking ••1234"></label>
          <p class="hint">Transactions already imported are skipped automatically. Money out should be negative in your file. If everything shows reversed, tick this box:</p>
          <label class="check"><input type="checkbox" id="bi-flip"><span>Flip signs (my bank shows spending as positive)</span></label>`,
        actions: [{ label: 'Cancel' }, { label: 'Import', kind: 'primary', onClick: (body) => {
          let acctId = u.qs('#bi-acct', body).value;
          const nn = u.qs('#bi-new', body).value.trim();
          if (nn) { const a = { id: u.uid('ba'), name: nn }; b.accounts.push(a); acctId = a.id; }
          if (!acctId) { ui.toast('Name the account this file came from.', 'err'); return false; }
          const flip = u.qs('#bi-flip', body).checked;
          const have = new Set(b.txns.map((t) => t.fitid ? t.accountId + '|' + t.fitid : t.hash));
          let added = 0, dup = 0, auto = 0;
          rows.forEach((r) => {
            const amount = flip ? -r.amount : r.amount;
            const t = { id: u.uid('bt'), accountId: acctId, date: r.date, desc: r.desc, memo: r.memo, amount: Math.round(amount * 100) / 100, fitid: r.fitid, source: 'import' };
            t.hash = hashOf(t);
            if (have.has(t.fitid ? acctId + '|' + t.fitid : t.hash)) { dup++; return; }
            have.add(t.fitid ? acctId + '|' + t.fitid : t.hash);
            t.category = categorize(t.desc, t.amount);
            if (t.category !== UNCAT) auto++;
            b.txns.push(t); added++;
          });
          b.imports.push({ date: new Date().toISOString(), file: file.name, added, dup, accountId: acctId });
          store.save();
          ui.toast(added + ' imported, ' + auto + ' sorted automatically' + (dup ? ', ' + dup + ' already here' : ''));
        } }],
      });
    };
    rd.readAsText(file);
  }

  /* ---------- exports ---------- */
  const csvCell = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  function summary(txns) {
    const by = {};
    txns.forEach((t) => { by[t.category] = (by[t.category] || 0) + u.num(t.amount); });
    const inc = INCOME.map((c) => [c, by[c] || 0]).filter((x) => x[1]);
    const exp = EXPENSE.map((c) => [c, -(by[c] || 0)]).filter((x) => x[1]);
    const non = NON.map((c) => [c, by[c] || 0]).filter((x) => x[1]);
    const totalIn = u.sum(inc, (x) => x[1]), totalOut = u.sum(exp, (x) => x[1]);
    return { inc, exp, non, uncat: by[UNCAT] || 0, totalIn, totalOut, net: totalIn - totalOut };
  }
  function exportCSV(txns, R) {
    const b = books();
    const acct = (id) => (b.accounts.find((a) => a.id === id) || {}).name || '';
    const lines = [['Date', 'Description', 'Category', 'Type', 'Amount', 'Account', 'Memo'].join(',')].concat(
      txns.slice().sort((a, c) => (a.date < c.date ? -1 : 1)).map((t) => [t.date, t.desc, t.category, { in: 'Income', out: 'Expense', non: 'Not income or expense', uncat: 'Uncategorized' }[kindOf(t.category)], u.num(t.amount).toFixed(2), acct(t.accountId), t.memo || ''].map(csvCell).join(',')));
    u.download('transactions-' + R.from + '-to-' + R.to + '.csv', lines.join('\r\n'), 'text/csv');
  }
  function exportSummaryCSV(sm, R) {
    const co = store.state.settings.company;
    const L = [[co.name + ' profit & loss'], ['Period', R.from + ' to ' + R.to], [], ['Income'], ...sm.inc.map((x) => [x[0], x[1].toFixed(2)]), ['Total income', sm.totalIn.toFixed(2)], [], ['Expenses'], ...sm.exp.map((x) => [x[0], x[1].toFixed(2)]), ['Total expenses', sm.totalOut.toFixed(2)], [], ['Net profit', sm.net.toFixed(2)], [], ['Not income or expense'], ...sm.non.map((x) => [x[0], x[1].toFixed(2)]), sm.uncat ? ['Uncategorized (needs review)', sm.uncat.toFixed(2)] : []];
    u.download('profit-and-loss-' + R.from + '-to-' + R.to + '.csv', L.map((r) => r.map(csvCell).join(',')).join('\r\n'), 'text/csv');
  }
  function printPL(sm, R, count) {
    const co = store.state.settings.company;
    const pr = document.getElementById('print-root');
    const row = (l, v, cls) => `<tr class="${cls || ''}"><td>${u.esc(l)}</td><td>${u.money(v, true)}</td></tr>`;
    pr.style.setProperty('--pr-color', (store.state.settings.branding || {}).primary || '#24563a');
    pr.innerHTML = `<div class="pr-head"><div class="pr-from">${store.state.settings.branding.logo ? `<img class="pr-logo" src="${store.state.settings.branding.logo}" alt="">` : ''}<div><div class="pr-brand">${u.esc(co.name)}</div><div class="pr-co">${u.esc(co.address || '')}</div></div></div>
      <div class="pr-meta"><h1>Profit &amp; loss</h1><table><tr><td>Period</td><td>${u.esc(R.label)}</td></tr><tr><td>Dates</td><td>${u.fmtDate(R.from)} – ${u.fmtDate(R.to)}</td></tr><tr><td>Transactions</td><td>${count}</td></tr><tr><td>Prepared</td><td>${u.fmtDate(u.todayISO())}</td></tr></table></div></div>
      <table class="pr-pl"><tbody>
        <tr class="sec"><td colspan="2">Income</td></tr>${sm.inc.map((x) => row(x[0], x[1])).join('')}${row('Total income', sm.totalIn, 'tot')}
        <tr class="sec"><td colspan="2">Expenses</td></tr>${sm.exp.map((x) => row(x[0], x[1])).join('')}${row('Total expenses', sm.totalOut, 'tot')}
        ${row('Net profit', sm.net, 'grand')}
        ${sm.non.length ? '<tr class="sec"><td colspan="2">Not income or expense</td></tr>' + sm.non.map((x) => row(x[0], x[1])).join('') : ''}
        ${sm.uncat ? row('Uncategorized (needs review)', sm.uncat, 'warn') : ''}
      </tbody></table>
      <p class="pr-foot">Cash basis, from bank transactions imported into the CRM. Prepared for the accountant.</p>`;
    document.body.classList.add('printing');
    const done = () => { document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => { window.print(); setTimeout(done, 1000); }, 50);
  }

  /* ---------- render ---------- */
  view.render = function (root) {
    const cfg = pinCfg();
    if (!cfg) return renderSetPin(root);
    if (!isOpen()) return renderGate(root);
    renderBooks(root);
  };

  function renderSetPin(root) {
    root.innerHTML = `<section class="panel books-gate">
      <h2>Protect your books</h2>
      <p>Bookkeeping has its own PIN, separate from the app PIN, so only you and the people you choose can open it. Crew members who use the app can't see it.</p>
      <div class="form-grid"><label class="field"><span>Bookkeeping PIN (4 to 8 digits)</span><input class="input" type="password" inputmode="numeric" maxlength="8" id="bp1" autocomplete="new-password"></label>
      <label class="field"><span>Type it again</span><input class="input" type="password" inputmode="numeric" maxlength="8" id="bp2" autocomplete="new-password"></label></div>
      <div class="btn-row"><button class="btn primary" id="bp-set">Set PIN and open bookkeeping</button></div>
      <p class="hint">To share access, tell that person the PIN. Change it any time inside Bookkeeping. It's a privacy screen, not encryption: the data is stored on this device with the rest of the CRM, and it's included in your backups.</p></section>`;
    u.qs('#bp-set', root).addEventListener('click', async () => {
      const a = u.qs('#bp1', root).value, c = u.qs('#bp2', root).value;
      if (!/^\d{4,8}$/.test(a)) { ui.toast('Use 4 to 8 digits.', 'err'); return; }
      if (a !== c) { ui.toast('The PINs don\'t match.', 'err'); return; }
      await setPin(a); setOpen(true); view.render(root); ui.toast('Bookkeeping PIN set');
    });
  }

  function renderGate(root) {
    root.innerHTML = `<section class="panel books-gate"><h2>Bookkeeping is locked</h2><p>Enter the bookkeeping PIN.</p>
      <div class="input-with-btn"><input class="input" type="password" inputmode="numeric" maxlength="8" id="bg-pin" autocomplete="off" aria-label="Bookkeeping PIN"><button class="btn primary" id="bg-go">Open</button></div>
      <p class="hint">It stays open until you close this browser tab or select Lock.</p></section>`;
    const go = async () => {
      if (await checkPin(u.qs('#bg-pin', root).value)) { setOpen(true); view.render(root); }
      else { ui.toast('That PIN is not right.', 'err'); u.qs('#bg-pin', root).value = ''; }
    };
    u.qs('#bg-go', root).addEventListener('click', go);
    u.qs('#bg-pin', root).addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    setTimeout(() => u.qs('#bg-pin', root) && u.qs('#bg-pin', root).focus(), 50);
  }

  function renderBooks(root) {
    const s = store.state;
    const b = books();
    const R = range();
    const inPeriod = b.txns.filter((t) => t.date >= R.from && t.date <= R.to && (!view.acct || t.accountId === view.acct));
    const sm = summary(inPeriod);
    const q = view.q.toLowerCase();
    const shown = inPeriod.filter((t) => (!view.cat || (view.cat === '__uncat' ? t.category === UNCAT : t.category === view.cat)) && (!q || (t.desc + ' ' + (t.memo || '') + ' ' + t.category).toLowerCase().includes(q)))
      .sort((a, c) => (a.date === c.date ? 0 : a.date < c.date ? 1 : -1));
    const uncat = inPeriod.filter((t) => t.category === UNCAT).length;
    let crmPaid = 0;
    s.deals.forEach((d) => (d.payments || []).forEach((p) => { if (p.date >= R.from && p.date <= R.to) crmPaid += u.num(p.amount); }));
    const acctName = (id) => (b.accounts.find((a) => a.id === id) || {}).name || '';
    const catOpts = (sel) => '<optgroup label="Income">' + INCOME.map((c) => `<option ${c === sel ? 'selected' : ''}>${c}</option>`).join('') + '</optgroup><optgroup label="Expenses">' + EXPENSE.map((c) => `<option ${c === sel ? 'selected' : ''}>${c}</option>`).join('') + '</optgroup><optgroup label="Not income or expense">' + NON.map((c) => `<option ${c === sel ? 'selected' : ''}>${c}</option>`).join('') + `</optgroup><option ${sel === UNCAT ? 'selected' : ''}>${UNCAT}</option>`;

    root.innerHTML = `
      <section class="timebar">
        <div class="seg">${[['week', 'Week'], ['month', 'Month'], ['quarter', 'Quarter'], ['year', 'Year'], ['custom', 'Custom']].map((p) => `<button data-period="${p[0]}" class="${view.period === p[0] ? 'on' : ''}">${p[1]}</button>`).join('')}</div>
        ${view.period === 'custom' ? `<div class="timebar-custom"><label class="field"><span>From</span><input class="input" type="date" id="bk-from" value="${R.from}"></label><label class="field"><span>To</span><input class="input" type="date" id="bk-to" value="${R.to}"></label></div>`
          : `<div class="week-nav"><button class="icon-btn" id="bk-prev" aria-label="Previous">&#8249;</button><b>${u.esc(R.label)}</b><button class="icon-btn" id="bk-next" aria-label="Next">&#8250;</button></div>`}
        <div class="timebar-range"><b>${u.fmtDate(R.from)} – ${u.fmtDate(R.to)}</b><span>${inPeriod.length} transactions</span></div>
      </section>

      <section class="kpis">
        <article class="kpi"><h3 class="kpi-label">Money in</h3><div class="kpi-value">${u.money(sm.totalIn)}</div><div class="kpi-sub">Recorded as paid in the CRM: ${u.money(crmPaid)}</div></article>
        <article class="kpi"><h3 class="kpi-label">Money out</h3><div class="kpi-value">${u.money(sm.totalOut)}</div><div class="kpi-sub">Business expenses</div></article>
        <article class="kpi"><h3 class="kpi-label">Net profit</h3><div class="kpi-value ${sm.net < 0 ? 'neg' : ''}">${u.money(sm.net)}</div><div class="kpi-sub">Cash basis, before owner draws</div></article>
        <article class="kpi"><h3 class="kpi-label">To review</h3><div class="kpi-value ${uncat ? 'neg' : ''}">${uncat}</div><div class="kpi-sub">${uncat ? 'Uncategorized transactions' : 'Everything is categorized'}</div></article>
      </section>

      <div class="grid-2-1">
        <section class="panel">
          <div class="panel-head"><h3>Spending by category</h3></div>
          <div id="bk-cats"></div>
          ${!sm.exp.length ? ui.empty('No expenses in this period yet. Import a bank file to get started.') : ''}
        </section>
        <section class="panel">
          <div class="panel-head"><h3>Send to your accountant</h3></div>
          <p class="hint">Everything below covers ${u.esc(R.label)}. ${uncat ? '<b>' + uncat + ' transactions still need a category.</b>' : ''}</p>
          <div class="stack tight">
            <button class="btn primary" id="bk-pl">Profit &amp; loss (PDF)</button>
            <button class="btn ghost" id="bk-plcsv">Profit &amp; loss (spreadsheet)</button>
            <button class="btn ghost" id="bk-csv">All transactions (spreadsheet)</button>
          </div>
          <div class="panel-head" style="margin-top:20px"><h3>Bank accounts</h3></div>
          ${b.accounts.length ? '<ul class="list compact">' + b.accounts.map((a) => { const last = b.imports.filter((i) => i.accountId === a.id).slice(-1)[0]; return `<li class="list-row"><div class="grow"><div class="row-title">${u.esc(a.name)}</div><div class="row-sub">${last ? 'Last import ' + u.fmtDate(last.date.slice(0, 10)) : 'Nothing imported yet'}</div></div></li>`; }).join('') + '</ul>' : '<p class="hint">No accounts yet. Your first import adds one.</p>'}
          <div class="btn-row"><label class="btn primary file-btn">Import bank file<input type="file" accept=".csv,.ofx,.qfx,.qbo,text/csv" id="bk-file" hidden></label><button class="btn ghost" id="bk-how">How to download from your bank</button></div>
        </section>
      </div>

      <section class="panel">
        <div class="panel-head"><h3>Transactions</h3><div class="btn-row tight-row"><button class="btn ghost sm" id="bk-add">Add cash or manual entry</button><button class="btn ghost sm" id="bk-rules">Category rules (${b.rules.length})</button><button class="btn ghost sm" id="bk-lock">Lock bookkeeping</button></div></div>
        <div class="toolbar">
          <input type="search" class="input" id="bk-q" placeholder="Search descriptions" value="${u.esc(view.q)}">
          <select class="input" id="bk-cat"><option value="">All categories</option><option value="__uncat" ${view.cat === '__uncat' ? 'selected' : ''}>Needs a category</option>${ALL.filter((c) => c !== UNCAT).map((c) => `<option ${view.cat === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
          ${b.accounts.length > 1 ? `<select class="input" id="bk-acct">${u.options(b.accounts.map((a) => ({ value: a.id, label: a.name })), view.acct, 'All accounts')}</select>` : ''}
        </div>
        ${shown.length ? `<div class="table-wrap"><table class="table books-table"><thead><tr><th>Date</th><th>Description</th><th>Category</th><th class="num">Amount</th><th></th></tr></thead><tbody>
          ${shown.slice(0, 300).map((t) => `<tr data-id="${t.id}" class="${t.category === UNCAT ? 'needs' : ''}"><td class="nowrap">${u.fmtShort(t.date)}</td><td>${u.esc(t.desc)}${t.memo ? '<div class="row-sub">' + u.esc(t.memo) + '</div>' : ''}${b.accounts.length > 1 ? '<div class="row-sub">' + u.esc(acctName(t.accountId)) + '</div>' : ''}</td>
            <td><select class="input cat-sel" data-cat="${t.id}" aria-label="Category">${catOpts(t.category)}</select></td>
            <td class="num ${t.amount < 0 ? '' : 'good-text'}">${t.amount < 0 ? '−' : '+'}${u.money(Math.abs(t.amount), true)}</td>
            <td><button class="icon-btn" data-del="${t.id}" aria-label="Delete transaction">&times;</button></td></tr>`).join('')}
        </tbody></table></div>${shown.length > 300 ? '<p class="hint">Showing 300 of ' + shown.length + '. Search or filter to narrow it down.</p>' : ''}` : ui.empty(inPeriod.length ? 'No transactions match.' : 'No transactions in this period.')}
      </section>

      <section class="panel">
        <div class="panel-head"><h3>Automatic bank connection</h3>${ui.badge('Planned', '')}</div>
        <p>Pulling transactions straight from your bank every day needs a bank-data service such as Plaid. That's what QuickBooks and similar apps use. It only runs on a secure server, has its own sign-up and per-account fees, and fits with the cloud connector and shared database. Until then, a weekly or monthly bank-file import takes about a minute, and duplicates are skipped automatically.</p>
      </section>`;

    if (sm.exp.length) MT.charts.hbars(u.qs('#bk-cats', root), sm.exp.map((x) => ({ label: x[0], value: x[1] })).sort((a, c) => c.value - a.value), { tip: (x) => '<strong>' + u.esc(x.label) + '</strong><div class="tip-row">' + u.money(x.value, true) + '</div><div class="tip-muted">' + (sm.totalOut ? u.pct(x.value / sm.totalOut) : '') + ' of spending</div>' });

    const rerender = () => renderBooks(root);
    u.qsa('[data-period]', root).forEach((x) => x.addEventListener('click', () => { view.period = x.dataset.period; if (view.period === 'custom' && !view.from) { view.from = R.from; view.to = R.to; } rerender(); }));
    const pv = u.qs('#bk-prev', root); if (pv) pv.addEventListener('click', () => { step(-1); rerender(); });
    const nx = u.qs('#bk-next', root); if (nx) nx.addEventListener('click', () => { step(1); rerender(); });
    ['from', 'to'].forEach((k) => { const el = u.qs('#bk-' + k, root); if (el) el.addEventListener('change', () => { view[k] = el.value; rerender(); }); });
    const qi = u.qs('#bk-q', root);
    qi.addEventListener('input', u.debounce(() => { view.q = qi.value; rerender(); const n = u.qs('#bk-q', root); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250));
    u.qs('#bk-cat', root).addEventListener('change', (e) => { view.cat = e.target.value; rerender(); });
    const ac = u.qs('#bk-acct', root); if (ac) ac.addEventListener('change', (e) => { view.acct = e.target.value; rerender(); });
    u.qs('#bk-file', root).addEventListener('change', (e) => { const f = e.target.files[0]; if (f) importFile(f, root); e.target.value = ''; });
    u.qs('#bk-pl', root).addEventListener('click', () => printPL(sm, R, inPeriod.length));
    u.qs('#bk-plcsv', root).addEventListener('click', () => exportSummaryCSV(sm, R));
    u.qs('#bk-csv', root).addEventListener('click', () => exportCSV(inPeriod, R));
    u.qs('#bk-lock', root).addEventListener('click', () => { setOpen(false); view.render(root); ui.toast('Bookkeeping locked'); });
    u.qs('#bk-how', root).addEventListener('click', () => ui.modal({
      title: 'Downloading transactions from your bank', size: 'sm',
      body: `<ol class="steps compact"><li>Sign in to your bank's website on a computer.</li><li>Open your checking account and find <b>Download</b> or <b>Export</b> (often a small arrow icon above the transaction list).</li><li>Pick the dates. A full month or quarter is easiest.</li><li>Choose <b>CSV</b> (spreadsheet), or <b>QFX / OFX / Quicken</b> if offered. QFX is the most reliable for skipping duplicates.</li><li>Back here, select <b>Import bank file</b> and choose the downloaded file.</li></ol><p class="hint">Do the same for a business credit card if you have one. Add it as its own account.</p>`,
    }));
    u.qsa('[data-cat]', root).forEach((sel) => sel.addEventListener('change', () => {
      const t = b.txns.find((x) => x.id === sel.dataset.cat);
      const old = t.category;
      t.category = sel.value;
      store.save(true);
      const word = guessKeyword(t.desc);
      const similar = b.txns.filter((x) => x.id !== t.id && x.category === old && word && x.desc.toLowerCase().includes(word.toLowerCase()));
      if (word && sel.value !== UNCAT) {
        ui.modal({
          title: 'Make this automatic?', size: 'sm',
          body: `<p>Put future transactions containing</p><input class="input" id="rl-word" value="${u.esc(word)}"><p style="margin-top:8px">into <b>${u.esc(sel.value)}</b>?</p>${similar.length ? `<label class="check"><input type="checkbox" id="rl-past" checked><span>Also change ${similar.length} similar ${similar.length === 1 ? 'transaction' : 'transactions'} already here</span></label>` : ''}`,
          actions: [{ label: 'Just this one', onClick: () => rerender() }, { label: 'Create rule', kind: 'primary', onClick: (body) => {
            const w = u.qs('#rl-word', body).value.trim();
            if (!w) return false;
            b.rules = b.rules.filter((r) => r.match.toLowerCase() !== w.toLowerCase());
            b.rules.unshift({ id: u.uid('rl'), match: w, category: sel.value });
            const past = u.qs('#rl-past', body);
            if (past && past.checked) b.txns.forEach((x) => { if (x.category === old && x.desc.toLowerCase().includes(w.toLowerCase())) x.category = sel.value; });
            store.save(); ui.toast('Rule saved');
          } }],
        });
      } else rerender();
    }));
    u.qsa('[data-del]', root).forEach((x) => x.addEventListener('click', () => ui.confirm('Delete this transaction?', 'It will be removed from your books. Re-importing the bank file would bring it back.', 'Delete', () => { b.txns = b.txns.filter((t) => t.id !== x.dataset.del); store.save(); })));
    u.qs('#bk-add', root).addEventListener('click', () => addManual(root));
    u.qs('#bk-rules', root).addEventListener('click', () => editRules(root));
  }

  function guessKeyword(desc) {
    const words = String(desc || '').replace(/[#*0-9]+/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !/^(pos|debit|purchase|card|ach|payment|online|recurring|the|and|inc|llc|co)$/i.test(w));
    return words.slice(0, 2).join(' ');
  }

  function addManual(root) {
    const b = books();
    ui.modal({
      title: 'Add a transaction', size: 'sm',
      body: `<div class="form-grid">
        <label class="field"><span>Date</span><input class="input" type="date" name="date" value="${u.todayISO()}"></label>
        <label class="field"><span>Money in or out</span><select class="input" name="dir"><option value="out">Money out</option><option value="in">Money in</option></select></label>
        <label class="field span-2"><span>Description</span><input class="input" name="desc" placeholder="e.g. Cash for dump fees"></label>
        <label class="field"><span>Amount ($)</span><input class="input" type="number" min="0" step="0.01" name="amount"></label>
        <label class="field"><span>Category</span><select class="input" name="category">${ALL.map((c) => `<option>${c}</option>`).join('')}</select></label>
        <label class="field span-2"><span>Account</span><select class="input" name="accountId">${u.options(b.accounts.map((a) => ({ value: a.id, label: a.name })), '', 'Cash / no bank account')}</select></label>
      </div>`,
      actions: [{ label: 'Cancel' }, { label: 'Add', kind: 'primary', onClick: (body) => {
        const f = u.formData(body);
        if (!f.desc || !(f.amount > 0)) { ui.toast('Enter a description and an amount.', 'err'); return false; }
        b.txns.push({ id: u.uid('bt'), accountId: f.accountId, date: f.date, desc: f.desc, memo: '', amount: f.dir === 'in' ? f.amount : -f.amount, category: f.category, source: 'manual', hash: '' });
        store.save(); ui.toast('Added');
      } }],
    });
  }

  function editRules(root) {
    const b = books();
    ui.modal({
      title: 'Category rules',
      body: `<p class="hint">When a bank description contains the words, the transaction is put in that category. Rules are checked before the built-in ones (fuel stations, Home Depot, insurance, and so on).</p>
        ${b.rules.length ? '<ul class="list compact">' + b.rules.map((r) => `<li class="list-row"><div class="grow"><b>"${u.esc(r.match)}"</b> → ${u.esc(r.category)}</div><button class="icon-btn" data-rdel="${r.id}" aria-label="Delete rule">&times;</button></li>`).join('') + '</ul>' : '<p>No rules yet. They\'re created when you change a category and choose "Create rule".</p>'}
        <div class="form-grid" style="margin-top:12px"><label class="field"><span>Description contains</span><input class="input" id="nr-w"></label><label class="field"><span>Category</span><select class="input" id="nr-c">${ALL.filter((c) => c !== UNCAT).map((c) => `<option>${c}</option>`).join('')}</select></label></div>
        <label class="check" style="margin-top:8px"><input type="checkbox" id="nr-apply" checked><span>Apply to uncategorized transactions already here</span></label>`,
      onMount(body, close) {
        u.qsa('[data-rdel]', body).forEach((x) => x.addEventListener('click', () => { b.rules = b.rules.filter((r) => r.id !== x.dataset.rdel); store.save(); close(); editRules(root); }));
      },
      actions: [{ label: 'Close' }, { label: 'Add rule', kind: 'primary', onClick: (body) => {
        const w = u.qs('#nr-w', body).value.trim(), c = u.qs('#nr-c', body).value;
        if (!w) { ui.toast('Enter the words to match.', 'err'); return false; }
        b.rules.unshift({ id: u.uid('rl'), match: w, category: c });
        let n = 0;
        if (u.qs('#nr-apply', body).checked) b.txns.forEach((t) => { if (t.category === UNCAT && t.desc.toLowerCase().includes(w.toLowerCase())) { t.category = c; n++; } });
        store.save(); ui.toast('Rule added' + (n ? ', ' + n + ' transactions updated' : ''));
      } }],
    });
  }

  view.categorize = categorize;
  view.parseOFX = parseOFX;
  view.parseBankCSV = parseBankCSV;
  view.summary = summary;
  view.setPin = setPin;
  view.checkPin = checkPin;
  MT.views.books = view;
})();
