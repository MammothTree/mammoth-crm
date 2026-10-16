/* Mammoth CRM — Phone app: install on phones, crew view, and sending a crew their day */
(function () {
  'use strict';
  const MT = window.MT;
  const u = MT.u, ui = MT.ui, store = MT.store;

  const view = { title: 'Phone app', sendDate: null, sendCrew: '' };
  let qrP = null;
  function loadQR() {
    if (window.QRCode) return Promise.resolve(window.QRCode);
    if (qrP) return qrP;
    qrP = new Promise((res, rej) => {
      const sc = document.createElement('script');
      sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
      sc.onload = () => res(window.QRCode);
      sc.onerror = () => { qrP = null; rej(new Error('QR codes need an internet connection.')); };
      document.head.appendChild(sc);
    });
    return qrP;
  }
  async function qr(el, text) {
    try {
      const Q = await loadQR();
      el.innerHTML = '';
      new Q(el, { text, width: 180, height: 180, correctLevel: Q.CorrectLevel.L });
    } catch (e) { el.innerHTML = '<p class="hint">' + u.esc(e.message && e.message.includes('overflow') ? 'Too much for a QR code. Send the link by text instead.' : e.message || 'No QR code available.') + '</p>'; }
  }
  const hosted = () => /^https?:$/.test(location.protocol);
  const installed = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const appUrl = () => location.href.split('#')[0].split('?')[0];

  view.render = function (root) {
    const s = store.state;
    const L = MT.crewLocal.get();
    if (!view.sendDate) view.sendDate = u.todayISO();
    const crew = s.crew.filter((c) => c.active !== false && c.role !== 'Office');
    if (!view.sendCrew && crew.length) {
      const busy = crew.find((c) => MT.calc.dayItems(s, view.sendDate).some((x) => (x.crewIds || []).includes(c.id) && x.kind === 'job'));
      view.sendCrew = (busy || crew[0]).id;
    }
    const count = view.sendCrew ? MT.calc.dayItems(s, view.sendDate).filter((x) => (x.crewIds || []).includes(view.sendCrew)).length : 0;
    const member = store.crewMember(view.sendCrew);

    root.innerHTML = `
      <section class="panel app-status ${hosted() ? 'ok' : ''}">
        <div class="panel-head"><h3>${installed() ? 'Installed on this device' : hosted() ? 'Ready to install' : 'Step 1: give the app a web address'}</h3>${ui.badge(installed() ? 'Installed' : hosted() ? 'Online' : 'Only on this computer', installed() || hosted() ? 'good' : 'warn')}</div>
        ${hosted() ? `
          <div class="app-live">
            <div><p>Your CRM is live at:</p><p class="app-url"><b>${u.esc(appUrl())}</b> <button class="btn ghost sm" id="ap-copy">Copy</button></p>
              <p class="hint">Scan the code with a phone camera to open it, then install it (steps below).</p>
              ${!installed() && MT.installPrompt ? '<button class="btn primary" id="ap-install">Install on this device</button>' : ''}</div>
            <div class="qr" id="ap-qr"></div>
          </div>` : `
          <p>Right now the CRM opens from a file on this computer. Phones can only install apps from a web address, so put this folder online once. Any of these hosts is free:</p>
          <ol class="steps">
            <li><b>Netlify (easiest):</b> go to <a href="https://app.netlify.com/drop" target="_blank" rel="noopener">app.netlify.com/drop</a>, sign up with your email, and drag this whole folder (<code>${u.esc(decodeURIComponent(location.pathname.split('/').slice(-2, -1)[0] || 'the CRM folder'))}</code>) onto the page. You'll get an address like <code>mammoth-crm.netlify.app</code>. To update later, drag the folder onto your site's <b>Deploys</b> page.</li>
            <li><b>GitHub Pages:</b> when you can make a GitHub account, follow the steps in <code>README.md</code>.</li>
            <li><b>Cloudflare Pages:</b> similar to Netlify. Create a free account, choose <b>Upload assets</b>, and drop the folder.</li>
          </ol>
          <p class="hint">Your client data is never uploaded. It stays on each device, so the website only holds the app itself. Open the new address in your browser and come back to this tab to install it.</p>`}
      </section>

      <div class="grid-2 app-grid">
        <section class="panel">
          <div class="panel-head"><h3>Install on a phone</h3></div>
          <h4 class="sub-h">iPhone or iPad</h4>
          <ol class="steps compact"><li>Open the CRM's web address in <b>Safari</b>.</li><li>Tap the <b>Share</b> button (square with an arrow).</li><li>Tap <b>Add to Home Screen</b>, then <b>Add</b>.</li></ol>
          <h4 class="sub-h">Android</h4>
          <ol class="steps compact"><li>Open the web address in <b>Chrome</b>.</li><li>Tap <b>Install app</b> when it pops up, or tap the <b>⋮</b> menu and choose <b>Install app</b> (or <b>Add to Home screen</b>).</li></ol>
          <p class="hint">The app then opens full screen from its icon, works without signal, and updates itself the next time it's opened online.</p>
        </section>
        <section class="panel">
          <div class="panel-head"><h3>Crew view</h3></div>
          <p>A simple screen for the field: today's stops with directions, a tap to call the client, gate codes and notes, big Clock in and Clock out buttons, and job photos.</p>
          <div class="btn-row"><button class="btn primary" id="ap-crew">Open crew view</button></div>
          <label class="check" style="margin-top:12px"><input type="checkbox" id="ap-lock" ${L.locked ? 'checked' : ''}><span>Keep this device in crew view${MT.lock.isSet() ? ' (your PIN is needed to leave it)' : '. Turn on a PIN in Settings so crews can\'t leave it'}</span></label>
        </section>
      </div>

      <section class="panel">
        <div class="panel-head"><h3>Send a crew member their day</h3></div>
        <p class="hint">Until your phones share live data, send each person a link with their stops. They open it on their phone and clock in and out there. When they're done, they text their hours back, and you paste the hours into Time tracking.</p>
        <div class="toolbar">
          <label class="field"><span>Day</span><input class="input" type="date" id="ap-date" value="${view.sendDate}"></label>
          <label class="field"><span>Crew member</span><select class="input" id="ap-who">${u.options(crew.map((c) => ({ value: c.id, label: c.name })), view.sendCrew)}</select></label>
          <span class="hint">${count} ${count === 1 ? 'stop' : 'stops'} for ${u.esc(member ? member.name : '')}</span>
          <span class="spacer"></span>
          <button class="btn primary" id="ap-make" ${count ? '' : 'disabled'}>Create link</button>
        </div>
        <div id="ap-out"></div>
      </section>

      <section class="panel">
        <div class="panel-head"><h3>Hours sent back from phones</h3><button class="btn ghost sm" id="ap-import">Import crew hours</button></div>
        <p class="hint">Paste the text a crew member sent you. Their hours are added to Time tracking and Job cost. Importing the same message twice won't double-count.</p>
      </section>

      <section class="panel">
        <div class="panel-head"><h3>Share live data between devices</h3>${MT.sync.ready() ? ui.badge('This device is connected', 'good') : ui.badge('Not connected', 'warn')}</div>
        <p>Connect a phone or computer in <a href="#integrations">Integrations → GitHub backup &amp; sync</a> with your access key. It then gets the latest schedule, clients, and photos whenever it opens, and sends changes back within seconds.</p>
        <p class="hint"><b>Who gets the key:</b> anyone with it can see all CRM data, including bookkeeping. Give it to yourself and the people you trust with everything. For other crew members, use the day links above. They only see their own stops.</p>
      </section>`;

    if (hosted()) {
      qr(u.qs('#ap-qr', root), appUrl());
      u.qs('#ap-copy', root).addEventListener('click', () => u.copyText(appUrl()).then(() => ui.toast('Address copied')));
      const ins = u.qs('#ap-install', root);
      if (ins) ins.addEventListener('click', async () => { MT.installPrompt.prompt(); const r = await MT.installPrompt.userChoice; MT.installPrompt = null; if (r.outcome === 'accepted') ui.toast('Installed'); view.render(root); });
    }
    u.qs('#ap-crew', root).addEventListener('click', () => MT.app.go('crew'));
    u.qs('#ap-lock', root).addEventListener('change', (e) => {
      const L2 = MT.crewLocal.get(); L2.locked = e.target.checked; MT.crewLocal.set(L2);
      ui.toast(e.target.checked ? 'This device will open in crew view' : 'Crew view lock turned off');
      if (e.target.checked) MT.app.go('crew');
    });
    u.qs('#ap-date', root).addEventListener('change', (e) => { view.sendDate = e.target.value || u.todayISO(); view.render(root); });
    u.qs('#ap-who', root).addEventListener('change', (e) => { view.sendCrew = e.target.value; view.render(root); });
    u.qs('#ap-import', root).addEventListener('click', () => MT.crewlink.importDialog());
    u.qs('#ap-make', root).addEventListener('click', () => {
      const sheet = MT.crewlink.makeSheet(view.sendDate, view.sendCrew);
      const url = MT.crewlink.sheetUrl(sheet);
      const m = store.crewMember(view.sendCrew) || {};
      const text = `${m.name ? m.name.split(' ')[0] + ', h' : 'H'}ere are your stops for ${u.fmtDate(view.sendDate, { weekday: 'long', month: 'short', day: 'numeric' })}: ${url}`;
      const out = u.qs('#ap-out', root);
      out.innerHTML = `<div class="app-live">
        <div>${hosted() ? '' : '<p class="notice"><span>This link points to a file on this computer, so it only opens here. Put the CRM online first (step 1 above) to send links to phones.</span></p>'}
          <p class="hint">Link for ${u.esc(m.name || '')}, ${sheet.j.length} ${sheet.j.length === 1 ? 'stop' : 'stops'}. It holds client names, addresses, and phone numbers, so only send it to your crew.</p>
          <input class="input" readonly value="${u.esc(url)}" id="ap-link">
          <div class="btn-row"><button class="btn ghost" id="ap-lcopy">Copy link</button>${m.phone ? `<a class="btn primary" href="sms:${u.esc(String(m.phone).replace(/[^\d+]/g, ''))}?&body=${encodeURIComponent(text)}">Text it to ${u.esc(m.name.split(' ')[0])}</a>` : ''}</div></div>
        <div class="qr" id="ap-lqr"></div></div>`;
      qr(u.qs('#ap-lqr', out), url);
      u.qs('#ap-lcopy', out).addEventListener('click', () => u.copyText(url).then(() => ui.toast('Link copied')));
    });
  };

  MT.views.app = view;
})();
