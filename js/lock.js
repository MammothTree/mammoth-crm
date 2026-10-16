/* Mammoth CRM — PIN lock (a privacy screen for shared devices; it does not encrypt data) */
(function () {
  'use strict';
  const MT = window.MT;
  const u = MT.u;
  const KEY = 'mammothcrm.lock.v1';

  async function hash(pin, salt) {
    const text = salt + ':' + pin;
    if (window.crypto && crypto.subtle && window.isSecureContext !== false) {
      try {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
        return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
      } catch (e) { /* fall through */ }
    }
    let h1 = 0x811c9dc5, h2 = 0;
    for (let i = 0; i < text.length; i++) { h1 = Math.imul(h1 ^ text.charCodeAt(i), 16777619); h2 = (h2 * 31 + text.charCodeAt(i)) | 0; }
    return 'f' + (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
  }
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } };

  let timer = null, locked = false;
  const lock = {
    hash,
    isSet: () => !!(read() && read().hash),
    isLocked: () => locked,
    async setPin(pin) {
      const salt = Math.random().toString(36).slice(2, 10);
      localStorage.setItem(KEY, JSON.stringify({ hash: await hash(pin, salt), salt }));
      lock.arm();
    },
    async check(pin) { const c = read(); return !!c && (await hash(pin, c.salt)) === c.hash; },
    clear() { localStorage.removeItem(KEY); clearTimeout(timer); document.getElementById('lock-btn').hidden = true; },
    minutes() { const s = MT.store.state; return Math.max(1, u.num(s && s.settings.lockMinutes) || 15); },
    arm() {
      clearTimeout(timer);
      const btn = document.getElementById('lock-btn');
      if (btn) btn.hidden = !lock.isSet();
      if (!lock.isSet() || locked) return;
      timer = setTimeout(() => lock.show(), lock.minutes() * 60000);
    },
    show() {
      // A phone kept in crew view is already limited to the crew screen; the PIN guards leaving it instead.
      if (!lock.isSet() || (MT.crewLocal && MT.crewLocal.get().locked)) return;
      locked = true;
      clearTimeout(timer);
      const el = document.getElementById('lock');
      const co = MT.store.state.settings.company;
      const logo = MT.store.state.settings.branding.logo;
      let entry = '';
      el.innerHTML = `<div class="lock-card" role="dialog" aria-modal="true" aria-label="Enter PIN to unlock">
        ${logo ? `<img class="lock-logo" src="${logo}" alt="">` : ''}
        <h2>${u.esc(co.name || 'CRM')}</h2>
        <p class="lock-msg" id="lock-msg">Enter your PIN</p>
        <div class="lock-dots" id="lock-dots" aria-hidden="true"></div>
        <input class="lock-input" id="lock-input" type="password" inputmode="numeric" autocomplete="off" aria-label="PIN" maxlength="8">
        <div class="lock-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map((k) => k === '' ? '<span></span>' : `<button type="button" data-k="${k}">${k}</button>`).join('')}</div>
        <button type="button" class="btn primary lock-go" id="lock-go">Unlock</button>
        <p class="hint lock-hint">Forgot your PIN? Open this CRM in a different browser and restore a backup, or clear this browser's site data (which erases data saved only here).</p>
      </div>`;
      el.hidden = false;
      document.body.classList.add('is-locked');
      const input = u.qs('#lock-input', el), dots = u.qs('#lock-dots', el), msg = u.qs('#lock-msg', el);
      const draw = () => { dots.innerHTML = Array.from({ length: Math.max(4, entry.length) }, (_, i) => `<i class="${i < entry.length ? 'on' : ''}"></i>`).join(''); };
      const tryIt = async () => {
        if (await lock.check(entry)) { lock.hide(); return; }
        msg.textContent = 'That PIN is not right. Try again.';
        el.querySelector('.lock-card').classList.remove('shake'); void el.offsetWidth; el.querySelector('.lock-card').classList.add('shake');
        entry = ''; input.value = ''; draw();
      };
      u.qsa('[data-k]', el).forEach((b) => b.addEventListener('click', () => {
        const k = b.dataset.k;
        if (k === '⌫') entry = entry.slice(0, -1); else if (entry.length < 8) entry += k;
        input.value = entry; draw();
        input.focus();
      }));
      input.addEventListener('input', () => { entry = input.value.replace(/\D/g, '').slice(0, 8); input.value = entry; draw(); });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryIt(); });
      u.qs('#lock-go', el).addEventListener('click', tryIt);
      draw();
      setTimeout(() => input.focus(), 50);
    },
    hide() {
      locked = false;
      const el = document.getElementById('lock');
      el.hidden = true; el.innerHTML = '';
      document.body.classList.remove('is-locked');
      lock.arm();
    },
    init() {
      ['mousemove', 'keydown', 'touchstart', 'click', 'scroll'].forEach((ev) => document.addEventListener(ev, u.debounce(() => { if (!locked) lock.arm(); }, 1000), { passive: true }));
      const btn = document.getElementById('lock-btn');
      if (btn) btn.addEventListener('click', () => lock.show());
      if (lock.isSet()) lock.show(); else lock.arm();
    },
  };
  MT.lock = lock;
})();
