/* Mammoth CRM — Branding: business profile, logo, colors */
(function () {
  'use strict';
  const MT = window.MT;
  const u = MT.u, ui = MT.ui, store = MT.store, brand = MT.brand;

  const view = { title: 'Branding' };
  const saveSoon = u.debounce(() => store.save(true), 500);

  view.render = function (root) {
    const s = store.state;
    const co = s.settings.company;
    const b = s.settings.branding;
    const yard = co.yardGeo;
    root.innerHTML = `
      <div class="brand-layout">
        <div class="stack">
          <section class="panel">
            <div class="panel-head"><h3>Business profile</h3></div>
            <p class="hint">Shown on estimates, invoices, templates, and the lock screen.</p>
            <div class="form-grid" id="bp">
              <label class="field"><span>Business name</span><input class="input" name="name" value="${u.esc(co.name)}"></label>
              <label class="field"><span>Your name</span><input class="input" name="owner" value="${u.esc(co.owner)}"></label>
              <label class="field"><span>Short name (sidebar)</span><input class="input" name="shortName" value="${u.esc(co.shortName)}" maxlength="18"></label>
              <label class="field"><span>Tagline (sidebar)</span><input class="input" name="tagline" value="${u.esc(co.tagline)}" maxlength="28"></label>
              <label class="field"><span>Phone</span><input class="input" name="phone" value="${u.esc(co.phone)}"></label>
              <label class="field"><span>Email</span><input class="input" name="email" value="${u.esc(co.email)}"></label>
              <label class="field"><span>Mailing address</span><input class="input" name="address" value="${u.esc(co.address)}"></label>
              <label class="field"><span>Website</span><input class="input" name="website" value="${u.esc(co.website)}"></label>
              <label class="field"><span>License / certification #</span><input class="input" name="license" value="${u.esc(co.license)}"></label>
            </div>
            <div class="form-grid" style="margin-top:14px">
              <label class="field span-2"><span>Yard or shop address (where routes start and end)</span>
                <div class="input-with-btn"><input class="input" id="bp-yard" value="${u.esc(co.yardAddress || '')}" placeholder="Street, city, state"><button class="btn ghost sm" id="bp-yard-go" type="button">Find on map</button></div>
                <small id="bp-yard-msg">${yard ? (yard.sample ? 'Using a sample location for the demo route.' : 'Located at ' + yard.lat.toFixed(4) + ', ' + yard.lon.toFixed(4)) : 'Not located yet.'}</small></label>
            </div>
          </section>

          <section class="panel">
            <div class="panel-head"><h3>Logo</h3></div>
            <div class="logo-row">
              <div class="logo-box">${b.logo ? `<img src="${b.logo}" alt="Your logo">` : '<span class="hint">No logo yet</span>'}</div>
              <div class="stack tight">
                <label class="btn primary file-btn">${b.logo ? 'Replace logo' : 'Upload logo'}<input type="file" accept="image/*" id="lg-file" hidden></label>
                ${b.logo ? '<button class="btn ghost" id="lg-colors">Suggest colors from my logo</button><button class="btn danger-ghost" id="lg-del">Remove logo</button>' : ''}
                <p class="hint">PNG with a transparent background works best. It appears in the sidebar, on printed estimates and invoices, and on the lock screen.</p>
              </div>
            </div>
            <div id="lg-sugg"></div>
          </section>
        </div>

        <div class="stack">
          <section class="panel">
            <div class="panel-head"><h3>Colors</h3><button class="btn ghost sm" id="cl-reset">Reset to default</button></div>
            <div class="presets">${brand.PRESETS.map((p) => `<button class="preset ${b.preset === p.id ? 'on' : ''}" data-preset="${p.id}" aria-label="${u.esc(p.name)}">
              <span class="pv"><i style="background:${p.sidebar}"></i><i style="background:${p.primary}"></i><i style="background:${p.accent}"></i></span><span>${u.esc(p.name)}</span></button>`).join('')}</div>
            <div class="form-grid color-grid">
              ${[['primary', 'Main color', 'Buttons, links, charts'], ['accent', 'Accent', 'Highlights and the current month'], ['sidebar', 'Sidebar', 'Navigation background']].map((x) => `
                <label class="field"><span>${x[1]}</span>
                  <div class="color-in"><input type="color" data-color="${x[0]}" value="${u.esc(b[x[0]])}" aria-label="${x[1]} picker"><input class="input" data-hex="${x[0]}" value="${u.esc(b[x[0]])}" maxlength="7" aria-label="${x[1]} hex"></div>
                  <small>${x[2]}</small></label>`).join('')}
            </div>
            <div id="cl-check"></div>
          </section>
          <section class="panel">
            <div class="panel-head"><h3>Heading style</h3></div>
            <div class="radio-cards">
              <label class="radio-card ${b.headings !== 'standard' ? 'on' : ''}"><input type="radio" name="hd" value="wide" ${b.headings !== 'standard' ? 'checked' : ''}><span class="hd-wide">Wide &amp; bold</span><small>Strong, workwear feel</small></label>
              <label class="radio-card ${b.headings === 'standard' ? 'on' : ''}"><input type="radio" name="hd" value="standard" ${b.headings === 'standard' ? 'checked' : ''}><span class="hd-std">Standard</span><small>Quieter, classic</small></label>
            </div>
          </section>
          <section class="panel brand-preview">
            <div class="panel-head"><h3>Preview</h3></div>
            <div class="bpv">
              <div class="bpv-side"><span class="bpv-logo">${b.logo ? `<img src="${b.logo}" alt="">` : ''}</span><b>${u.esc(co.shortName || co.name)}</b><i class="on">Sales hub</i><i>Leads</i><i>Estimates</i></div>
              <div class="bpv-main"><h2>${u.esc(co.name)}</h2><p class="hint">Changes apply across the whole CRM right away.</p>
                <div class="btn-row"><button class="btn primary sm" type="button">New estimate</button><button class="btn ghost sm" type="button">Cancel</button></div>
                <div class="bpv-bars"><i style="height:40%"></i><i style="height:65%"></i><i style="height:52%"></i><i class="cur" style="height:80%"></i></div></div>
            </div>
          </section>
        </div>
      </div>`;

    const check = () => {
      const bb = s.settings.branding;
      const issues = [];
      if (brand.valid(bb.primary) && brand.contrast(bb.primary, '#fcfdfb') < 4.5) issues.push('Your main color is light, so the CRM uses a slightly darker shade of it for text and buttons to keep them readable.');
      if (brand.valid(bb.sidebar) && brand.valid(bb.primary) && brand.contrast(bb.sidebar, '#fcfdfb') > 12 && brand.contrast(bb.sidebar, bb.primary) < 1.3) issues.push('Your sidebar and main colors are very close. Pick a contrasting sidebar so the active tab stands out.');
      u.qs('#cl-check', root).innerHTML = issues.map((x) => `<p class="hint check-note">${u.esc(x)}</p>`).join('');
    };
    check();

    const apply = () => { brand.apply(); check(); saveSoon(); };
    u.qsa('#bp [name]', root).forEach((inp) => inp.addEventListener('input', () => { co[inp.name] = inp.value; if (inp.name === 'shortName' || inp.name === 'tagline' || inp.name === 'name') brand.apply(); saveSoon(); }));
    u.qsa('[data-color]', root).forEach((inp) => inp.addEventListener('input', () => {
      s.settings.branding[inp.dataset.color] = inp.value; s.settings.branding.preset = 'custom';
      u.qs('[data-hex=' + inp.dataset.color + ']', root).value = inp.value;
      u.qsa('.preset', root).forEach((p) => p.classList.remove('on'));
      apply();
    }));
    u.qsa('[data-hex]', root).forEach((inp) => inp.addEventListener('input', () => {
      let v = inp.value.trim(); if (v && v[0] !== '#') v = '#' + v;
      if (!brand.valid(v) || v.length !== 7) return;
      s.settings.branding[inp.dataset.hex] = v.toLowerCase(); s.settings.branding.preset = 'custom';
      u.qs('[data-color=' + inp.dataset.hex + ']', root).value = v.toLowerCase();
      apply();
    }));
    u.qsa('[data-preset]', root).forEach((btn) => btn.addEventListener('click', () => {
      const p = brand.PRESETS.find((x) => x.id === btn.dataset.preset);
      Object.assign(s.settings.branding, { primary: p.primary, accent: p.accent, sidebar: p.sidebar, preset: p.id });
      store.save(true); brand.apply(); view.render(root);
    }));
    u.qs('#cl-reset', root).addEventListener('click', () => {
      const p = brand.PRESETS[0];
      Object.assign(s.settings.branding, { primary: p.primary, accent: p.accent, sidebar: p.sidebar, preset: p.id, headings: 'wide' });
      store.save(true); brand.apply(); view.render(root);
      ui.toast('Colors reset to the default');
    });
    u.qsa('[name=hd]', root).forEach((r) => r.addEventListener('change', () => { s.settings.branding.headings = r.value; store.save(true); brand.apply(); view.render(root); }));
    u.qs('#lg-file', root).addEventListener('change', async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try {
        s.settings.branding.logo = await brand.readLogo(f, 360);
        store.save(true); brand.apply(); view.render(root);
        ui.toast('Logo saved');
      } catch (err) { ui.toast(err.message, 'err'); }
    });
    const del = u.qs('#lg-del', root);
    if (del) del.addEventListener('click', () => { s.settings.branding.logo = ''; store.save(true); brand.apply(); view.render(root); });
    const sug = u.qs('#lg-colors', root);
    if (sug) sug.addEventListener('click', async () => {
      const cols = await brand.logoColors(s.settings.branding.logo);
      const host = u.qs('#lg-sugg', root);
      if (!cols.length) { host.innerHTML = '<p class="hint">Your logo has no strong colors to pull from. Pick colors on the right.</p>'; return; }
      host.innerHTML = '<p class="hint">Colors in your logo. Click one to use it as your main color, or as the accent.</p><div class="sugg">' +
        cols.map((c) => `<div class="sugg-c"><i style="background:${c}"></i><code>${c}</code><button class="btn ghost sm" data-use="primary" data-c="${c}">Main</button><button class="btn ghost sm" data-use="accent" data-c="${c}">Accent</button></div>`).join('') + '</div>';
      u.qsa('[data-use]', host).forEach((bt) => bt.addEventListener('click', () => {
        s.settings.branding[bt.dataset.use] = bt.dataset.c; s.settings.branding.preset = 'custom';
        store.save(true); brand.apply(); view.render(root);
      }));
    });
    u.qs('#bp-yard-go', root).addEventListener('click', async () => {
      const q = u.qs('#bp-yard', root).value.trim();
      const msg = u.qs('#bp-yard-msg', root);
      if (!q) { ui.toast('Enter your yard address first.', 'err'); return; }
      co.yardAddress = q;
      msg.textContent = 'Looking it up…';
      const g = await MT.views.routes.geocode(q);
      if (g) { co.yardGeo = g; store.save(true); msg.textContent = 'Located at ' + g.lat.toFixed(4) + ', ' + g.lon.toFixed(4); ui.toast('Yard located'); }
      else { store.save(true); msg.textContent = 'Could not find that address. Check the spelling, or try again when online.'; }
    });
    u.qs('#bp-yard', root).addEventListener('input', (e) => { co.yardAddress = e.target.value; saveSoon(); });
  };

  MT.views.branding = view;
})();
