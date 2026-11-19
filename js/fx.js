/* Mammoth CRM — little sounds and celebrations.
   Sounds are made in the browser (Web Audio), so there are no files to download. Each kind of event has its own short
   sound: a chime and confetti when an estimate is approved or a job is won, a coin for a payment, a pop for a new invoice,
   a ping for a new lead or client, and a soft tick while scrolling. Every action already goes through the activity log
   (store.log), so this listens there. Settings → Sounds & celebrations turns each part on or off, per device. */
(function () {
  'use strict';
  const MT = window.MT;
  const store = MT.store;
  const KEY = 'mammothcrm.fx';
  const DEFAULTS = { sounds: true, scroll: true, confetti: true, volume: 0.6 };
  const reduceMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  let ctx = null, master = null;
  const startedAt = Date.now();

  const fx = {
    cfg() { try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return Object.assign({}, DEFAULTS); } },
    set(patch) { const c = Object.assign(fx.cfg(), patch); try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) { /* private mode: this visit only */ } if (master) master.gain.value = c.volume; return c; },

    /** Browsers only allow sound after you tap or click once; the first touch wakes it up. */
    audio() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        try { ctx = new AC(); } catch (e) { return null; }
        master = ctx.createGain();
        master.gain.value = fx.cfg().volume;
        master.connect(ctx.destination);
      }
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return ctx;
    },

    /* One note: frequency (or [from, to] for a slide), start offset, length, shape, loudness. */
    tone(freq, at, dur, type, vol) {
      const a = ctx, t = a.currentTime + (at || 0);
      const o = a.createOscillator(), g = a.createGain();
      o.type = type || 'sine';
      if (Array.isArray(freq)) { o.frequency.setValueAtTime(freq[0], t); o.frequency.exponentialRampToValueAtTime(freq[1], t + dur); } else o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + dur + 0.02);
    },
    /* A short burst of filtered noise (whoosh, shutter, tick). */
    noise(at, dur, f1, f2, vol) {
      const a = ctx, t = a.currentTime + (at || 0);
      const len = Math.max(1, Math.floor(a.sampleRate * dur));
      const buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = a.createBufferSource(), bp = a.createBiquadFilter(), g = a.createGain();
      src.buffer = buf; bp.type = 'bandpass'; bp.Q.value = 1.2;
      bp.frequency.setValueAtTime(f1, t); bp.frequency.exponentialRampToValueAtTime(f2 || f1, t + dur);
      g.gain.setValueAtTime(vol || 0.15, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(bp); bp.connect(g); g.connect(master);
      src.start(t); src.stop(t + dur + 0.02);
    },

    SOUNDS: {
      tick() { fx.tone(2200, 0, 0.018, 'sine', 0.035); },
      blip() { fx.tone(880, 0, 0.09, 'sine', 0.09); },
      ping() { fx.tone(1318.5, 0, 0.45, 'sine', 0.16); fx.tone(2637, 0, 0.25, 'sine', 0.03); },
      pop() { fx.tone([380, 920], 0, 0.07, 'triangle', 0.22); fx.tone(920, 0.06, 0.12, 'sine', 0.07); },
      send() { fx.noise(0, 0.28, 700, 3200, 0.12); fx.tone([660, 990], 0.05, 0.16, 'sine', 0.06); },
      coin() { fx.tone(987.8, 0, 0.09, 'square', 0.05); fx.tone(1318.5, 0.08, 0.38, 'square', 0.05); fx.tone(1318.5, 0.08, 0.38, 'sine', 0.1); },
      win() { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => { fx.tone(f, i * 0.085, 0.5 - i * 0.05, 'triangle', 0.16); fx.tone(f * 2, i * 0.085, 0.2, 'sine', 0.025); }); },
      shutter() { fx.noise(0, 0.03, 3000, 3000, 0.25); fx.noise(0.07, 0.04, 2000, 1500, 0.18); },
      calendar() { fx.tone(1046.5, 0, 0.12, 'sine', 0.12); fx.tone(1568, 0.1, 0.3, 'sine', 0.12); },
      clock() { fx.tone(1500, 0, 0.03, 'square', 0.04); fx.tone(1150, 0.16, 0.03, 'square', 0.04); },
      down() { fx.tone([440, 330], 0, 0.3, 'sine', 0.08); },
      bonk() { fx.tone([240, 170], 0, 0.18, 'sine', 0.16); },
    },
    play(name) {
      const c = fx.cfg();
      if (!c.sounds || !fx.SOUNDS[name] || document.hidden) return;
      if (!fx.audio()) return;
      try { fx.SOUNDS[name](); } catch (e) { /* sound is a nice-to-have */ }
    },

    /** Which sound (and celebration) each logged action gets. Higher wins when two happen together (e.g. Won + stage move). */
    forLog(type, text) {
      text = String(text || '');
      if (type === 'won' || (type === 'stage' && / to Won$/.test(text))) return { sound: 'win', p: 10, confetti: 'big' };
      if (type === 'payment') return /^Receipt/.test(text) ? { sound: 'send', p: 5 } : { sound: 'coin', p: 8, confetti: 'small' };
      if (type === 'invoice') return /^Sent invoice/.test(text) ? { sound: 'send', p: 5 } : { sound: 'pop', p: 6 };
      if (type === 'estimate') return { sound: / sent /.test(text) ? 'send' : 'pop', p: 5 };
      if (type === 'message') return { sound: 'send', p: 5 };
      if (type === 'lead' || type === 'customer') return { sound: 'ping', p: 4 };
      if (type === 'jobcam') return { sound: 'shutter', p: 4 };
      if (type === 'schedule') return { sound: 'calendar', p: 3 };
      if (type === 'time') return { sound: 'clock', p: 3 };
      if (type === 'lost' || (type === 'stage' && / to Lost$/.test(text))) return { sound: 'down', p: 3 };
      if (type === 'stage' || type === 'note') return { sound: 'blip', p: 1 };
      return null;
    },
    onLog(type, text) {
      if (Date.now() - startedAt < 1500) return; // not while the app is loading
      const m = fx.forLog(type, text);
      if (!m) return;
      if (!fx.pending || m.p > fx.pending.p) fx.pending = m;
      clearTimeout(fx.timer);
      fx.timer = setTimeout(() => {
        const x = fx.pending; fx.pending = null;
        if (Date.now() - (fx.lastAt || 0) < 250 && x.p < 8) return;
        fx.lastAt = Date.now();
        fx.play(x.sound);
        if (x.confetti) fx.confetti(x.confetti === 'big' ? 140 : 45);
      }, 40);
    },

    /** Confetti in the brand colors, falling for about two seconds. Never blocks taps. */
    confetti(n) {
      if (!fx.cfg().confetti || reduceMotion() || document.hidden) return;
      const cv = document.createElement('canvas');
      cv.className = 'fx-confetti';
      cv.setAttribute('aria-hidden', 'true');
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = window.innerWidth, H = window.innerHeight;
      cv.width = W * dpr; cv.height = H * dpr;
      document.body.appendChild(cv);
      const g = cv.getContext('2d');
      if (!g) { cv.remove(); return; }
      g.scale(dpr, dpr);
      const css = getComputedStyle(document.documentElement);
      const colors = [css.getPropertyValue('--canopy').trim() || '#24563a', '#f2a900', '#e85d2a', '#2c7fb8', '#7cc26b', '#ffd34d'];
      const parts = Array.from({ length: n || 120 }, () => ({
        x: W / 2 + (Math.random() - 0.5) * W * 0.3, y: H * 0.35 + (Math.random() - 0.5) * 40,
        vx: (Math.random() - 0.5) * 13, vy: -Math.random() * 13 - 4, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
        w: 6 + Math.random() * 6, h: 8 + Math.random() * 8, c: colors[Math.floor(Math.random() * colors.length)],
      }));
      const t0 = performance.now(), LIFE = 2300;
      const frame = (t) => {
        const k = (t - t0) / LIFE;
        g.clearRect(0, 0, W, H);
        parts.forEach((p) => {
          p.vy += 0.38; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.r += p.vr;
          g.save(); g.globalAlpha = Math.max(0, 1 - Math.max(0, k - 0.6) / 0.4);
          g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)));
          g.restore();
        });
        if (k < 1 && cv.isConnected) requestAnimationFrame(frame); else cv.remove();
      };
      requestAnimationFrame(frame);
      setTimeout(() => cv.remove(), LIFE + 400); // also when the tab was in the background and frames paused
    },
  };

  // Every action in the CRM is logged; play its sound when it happens.
  const origLog = store.log;
  store.log = function (type, text) {
    const r = origLog.apply(this, arguments);
    try { fx.onLog(type, text); } catch (e) { /* never get in the way of saving */ }
    return r;
  };

  // Error messages get a soft "bonk".
  const origToast = MT.ui.toast;
  MT.ui.toast = function (msg, kind) {
    if (kind === 'err') fx.play('bonk');
    return origToast.apply(this, arguments);
  };

  // A soft tick every so often while scrolling (any scrolling area).
  const scrolled = new WeakMap();
  document.addEventListener('scroll', (e) => {
    const c = fx.cfg();
    if (!c.sounds || !c.scroll) return;
    const el = e.target === document ? document.scrollingElement || document.documentElement : e.target;
    if (!el || el.scrollTop == null) return;
    const last = scrolled.get(el);
    const pos = el.scrollTop + (el.scrollLeft || 0);
    if (last == null) { scrolled.set(el, pos); return; }
    if (Math.abs(pos - last) >= 90) {
      scrolled.set(el, pos);
      const now = Date.now();
      if (now - (fx.lastTick || 0) > 45) { fx.lastTick = now; if (ctx) fx.play('tick'); }
    }
  }, { capture: true, passive: true });

  // Wake up sound on the first touch, click, or key.
  const wake = () => { if (fx.cfg().sounds) fx.audio(); };
  ['pointerdown', 'keydown', 'touchend'].forEach((ev) => document.addEventListener(ev, wake, { capture: true, passive: true }));

  MT.fx = fx;
})();
