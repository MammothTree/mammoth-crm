/* Mammoth CRM — shared utilities and UI primitives */
(function () {
  'use strict';
  const MT = (window.MT = window.MT || {});

  const currency0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const currency2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const u = {
    MONTHS,
    esc(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    },
    uid(prefix) {
      return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    },
    num(v) {
      const n = parseFloat(v);
      return isFinite(n) ? n : 0;
    },
    money(n, cents) {
      return (cents ? currency2 : currency0).format(u.num(n));
    },
    moneyShort(n) {
      n = u.num(n);
      const a = Math.abs(n);
      if (a >= 1e6) return (n < 0 ? '-' : '') + '$' + (a / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M';
      if (a >= 1e3) return (n < 0 ? '-' : '') + '$' + (a / 1e3).toFixed(a >= 1e4 ? 0 : 1) + 'k';
      return currency0.format(n);
    },
    pct(n, d) {
      return (u.num(n) * 100).toFixed(d == null ? 0 : d) + '%';
    },
    round(n, step) {
      return Math.round(u.num(n) / step) * step;
    },
    todayISO() {
      return u.isoDate(new Date());
    },
    isoDate(d) {
      const z = (x) => String(x).padStart(2, '0');
      return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
    },
    parseISO(s) {
      if (!s) return null;
      const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
      if (!y || !m || !d) return null;
      return new Date(y, m - 1, d);
    },
    addDays(iso, n) {
      const d = u.parseISO(iso) || new Date();
      d.setDate(d.getDate() + n);
      return u.isoDate(d);
    },
    daysBetween(a, b) {
      const da = u.parseISO(a), db = u.parseISO(b);
      if (!da || !db) return 0;
      return Math.round((db - da) / 86400000);
    },
    fmtDate(iso, opts) {
      const d = u.parseISO(iso);
      if (!d) return '—';
      return d.toLocaleDateString('en-US', opts || { month: 'short', day: 'numeric', year: 'numeric' });
    },
    fmtShort(iso) {
      return u.fmtDate(iso, { month: 'short', day: 'numeric' });
    },
    relDays(iso) {
      const n = u.daysBetween(u.todayISO(), iso);
      if (n === 0) return 'Today';
      if (n === 1) return 'Tomorrow';
      if (n === -1) return 'Yesterday';
      return n > 0 ? 'in ' + n + ' days' : Math.abs(n) + ' days ago';
    },
    initials(name) {
      return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
    },
    firstName(name) {
      return String(name || '').trim().split(/\s+/)[0] || '';
    },
    qs(sel, root) {
      return (root || document).querySelector(sel);
    },
    qsa(sel, root) {
      return Array.from((root || document).querySelectorAll(sel));
    },
    debounce(fn, ms) {
      let t;
      return function () {
        const args = arguments, self = this;
        clearTimeout(t);
        t = setTimeout(() => fn.apply(self, args), ms);
      };
    },
    sum(arr, fn) {
      return arr.reduce((a, x) => a + u.num(fn ? fn(x) : x), 0);
    },
    download(filename, text, type) {
      const blob = new Blob([text], { type: type || 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    },
    copyText(text) {
      const legacy = () => {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (e) { /* nothing more we can do */ } finally { ta.remove(); }
        return Promise.resolve();
      };
      // The clipboard API can refuse after a wait (e.g. creating a pay link first); fall back to the older method.
      if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).catch(legacy);
      return legacy();
    },
    options(list, selected, placeholder) {
      let h = placeholder != null ? '<option value="">' + u.esc(placeholder) + '</option>' : '';
      list.forEach((o) => {
        const v = typeof o === 'object' ? o.value : o;
        const l = typeof o === 'object' ? o.label : o;
        h += '<option value="' + u.esc(v) + '"' + (String(v) === String(selected) ? ' selected' : '') + '>' + u.esc(l) + '</option>';
      });
      return h;
    },
    /** Reads all [name] fields inside a form/container into an object. */
    formData(root) {
      const out = {};
      u.qsa('[name]', root).forEach((el) => {
        if (el.type === 'checkbox') out[el.name] = el.checked;
        else if (el.type === 'number') out[el.name] = el.value === '' ? '' : u.num(el.value);
        else out[el.name] = el.value.trim();
      });
      return out;
    },
  };
  MT.u = u;

  /* ---------- Toasts ---------- */
  const ui = {};
  ui.toast = function (msg, kind) {
    let host = u.qs('#toasts');
    if (!host) {
      host = document.createElement('div');
      host.id = 'toasts';
      host.setAttribute('aria-live', 'polite');
      document.body.appendChild(host);
    }
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || 'ok');
    el.textContent = msg;
    host.appendChild(el);
    setTimeout(() => el.classList.add('out'), 2800);
    setTimeout(() => el.remove(), 3200);
  };

  /* ---------- Modal ---------- */
  ui.modal = function (opts) {
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML =
      '<div class="modal ' + (opts.size || '') + '" role="dialog" aria-modal="true" aria-label="' + u.esc(opts.title) + '">' +
      '<div class="modal-head"><h3>' + u.esc(opts.title) + '</h3><button class="icon-btn" data-close aria-label="Close">&times;</button></div>' +
      '<div class="modal-body">' + (opts.body || '') + '</div>' +
      '<div class="modal-foot"></div></div>';
    const foot = u.qs('.modal-foot', wrap);
    const close = () => {
      document.removeEventListener('keydown', onKey);
      wrap.remove();
    };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    (opts.actions || [{ label: 'Close', kind: 'ghost' }]).forEach((a) => {
      const b = document.createElement('button');
      b.className = 'btn ' + (a.kind || 'ghost');
      if (a.left) b.style.marginRight = 'auto';
      b.textContent = a.label;
      b.addEventListener('click', () => {
        const r = a.onClick ? a.onClick(u.qs('.modal-body', wrap), close) : undefined;
        if (r !== false && !a.keepOpen) close();
      });
      foot.appendChild(b);
    });
    wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
    u.qsa('[data-close]', wrap).forEach((b) => b.addEventListener('click', close));
    document.addEventListener('keydown', onKey);
    document.body.appendChild(wrap);
    if (opts.onMount) opts.onMount(u.qs('.modal-body', wrap), close);
    const first = u.qs('.modal-body input, .modal-body select, .modal-body textarea', wrap);
    if (first) setTimeout(() => first.focus(), 30);
    return close;
  };

  ui.confirm = function (title, message, okLabel, onOk) {
    ui.modal({
      title,
      body: '<p>' + u.esc(message) + '</p>',
      size: 'sm',
      actions: [
        { label: 'Cancel', kind: 'ghost' },
        { label: okLabel || 'Confirm', kind: 'danger', onClick: onOk },
      ],
    });
  };

  ui.badge = function (text, kind) {
    return '<span class="badge ' + (kind || '') + '">' + u.esc(text) + '</span>';
  };

  ui.empty = function (text) {
    return '<div class="empty">' + u.esc(text) + '</div>';
  };

  MT.ui = ui;
})();
