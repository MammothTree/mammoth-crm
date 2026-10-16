/* Mammoth CRM — branding: applies the business's colors, logo, and name to the app */
(function () {
  'use strict';
  const MT = window.MT;
  const u = MT.u;

  const PRESETS = [
    { id: 'mammoth', name: 'Mammoth navy', primary: '#02133b', accent: '#a6a6a6', sidebar: '#02133b' },
    { id: 'forest', name: 'Forest', primary: '#24563a', accent: '#e2a400', sidebar: '#2e2620' },
    { id: 'redwood', name: 'Redwood', primary: '#8c2f1c', accent: '#d9a441', sidebar: '#2b1d18' },
    { id: 'pine', name: 'Pine & steel', primary: '#1f4e5f', accent: '#f2a72c', sidebar: '#1b2629' },
    { id: 'safety', name: 'Safety orange', primary: '#c4501b', accent: '#2f3b45', sidebar: '#222a31' },
    { id: 'evergreen', name: 'Evergreen', primary: '#2f6b2f', accent: '#c7b02a', sidebar: '#1f2a1c' },
    { id: 'slate', name: 'Slate', primary: '#34495e', accent: '#27ae60', sidebar: '#1f2833' },
  ];

  /* ---------- color math ---------- */
  function hexToRgb(hex) {
    let h = String(hex || '').replace('#', '').trim();
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    if (!/^[0-9a-f]{6}$/i.test(h)) return null;
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  const rgbToHex = (r) => '#' + r.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  function rgbToHsl([r, g, b]) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h /= 6;
    }
    return [h, s, l];
  }
  function hslToRgb([h, s, l]) {
    if (s === 0) return [l, l, l].map((v) => v * 255);
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = (t) => { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map((v) => v * 255);
  }
  const withL = (hex, l) => { const hsl = rgbToHsl(hexToRgb(hex)); hsl[2] = l; return rgbToHex(hslToRgb(hsl)); };
  const shiftL = (hex, d) => { const hsl = rgbToHsl(hexToRgb(hex)); hsl[2] = Math.max(0, Math.min(1, hsl[2] + d)); return rgbToHex(hslToRgb(hsl)); };
  function luminance(hex) {
    const c = hexToRgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  const contrast = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const textOn = (hex) => (contrast(hex, '#ffffff') >= contrast(hex, '#141414') ? '#ffffff' : '#141414');

  /** Light-mode primary must read on a light surface; darken until it clears 4.5:1. */
  function readableOnLight(hex) {
    let h = hex, n = 0;
    while (contrast(h, '#fcfdfb') < 4.5 && n++ < 20) h = shiftL(h, -0.03);
    return h;
  }
  function readableOnDark(hex) {
    let h = hex, n = 0;
    while (contrast(h, '#1a1e19') < 4.5 && n++ < 20) h = shiftL(h, 0.03);
    return h;
  }

  const brand = {
    PRESETS, hexToRgb, contrast, textOn, readableOnLight,
    valid: (hex) => !!hexToRgb(hex),
    /** Applies colors, headings style, sidebar name/logo, and favicon. */
    apply() {
      const s = MT.store.state;
      const b = (s.settings && s.settings.branding) || {};
      const co = s.settings.company;
      const root = document.documentElement.style;
      const set = (k, v) => root.setProperty(k, v);
      if (brand.valid(b.primary)) {
        const p = readableOnLight(b.primary);
        const pd = readableOnDark(withL(b.primary, Math.max(0.45, rgbToHsl(hexToRgb(b.primary))[2])));
        set('--brand-primary', p);
        set('--brand-primary-hover', shiftL(p, -0.06));
        set('--brand-on-primary', textOn(p));
        set('--brand-series', shiftL(p, 0.06));
        set('--brand-series-strong', shiftL(p, -0.04));
        set('--brand-primary-dark', pd);
        set('--brand-primary-dark-hover', shiftL(pd, 0.06));
        set('--brand-on-primary-dark', textOn(pd));
        set('--brand-series-dark', pd);
        set('--brand-series-strong-dark', shiftL(pd, 0.1));
      }
      if (brand.valid(b.accent)) set('--brand-accent', b.accent);
      if (brand.valid(b.sidebar)) {
        set('--brand-sidebar', b.sidebar);
        set('--brand-sidebar-2', shiftL(b.sidebar, luminance(b.sidebar) > 0.4 ? -0.06 : 0.06));
        const t = textOn(b.sidebar);
        set('--brand-on-sidebar', t === '#ffffff' ? '#ece6dd' : '#1d1d1b');
        set('--brand-on-sidebar-muted', t === '#ffffff' ? 'rgba(236,230,221,.62)' : 'rgba(29,29,27,.62)');
      }
      document.documentElement.setAttribute('data-headings', b.headings === 'standard' ? 'standard' : 'wide');
      // Sidebar identity
      const nameEl = document.getElementById('brand-name'), subEl = document.getElementById('brand-sub');
      if (nameEl) nameEl.textContent = co.shortName || (co.name || 'Your business').split(' ')[0];
      if (subEl) subEl.textContent = co.tagline || 'CRM';
      const mark = document.getElementById('brand-mark-wrap');
      if (mark) mark.innerHTML = b.logo ? '<img class="brand-logo" src="' + b.logo + '" alt="">' : mark.dataset.default;
      const meta = document.querySelector('meta[name=theme-color]');
      if (meta && brand.valid(b.sidebar)) meta.setAttribute('content', b.sidebar);
    },
    /** Reads an image file and returns a resized PNG data URL (keeps transparency). */
    readLogo(file, maxEdge) {
      return new Promise((resolve, reject) => {
        if (!file.type.startsWith('image/')) { reject(new Error('Choose an image file (PNG, JPG, or SVG).')); return; }
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, (maxEdge || 360) / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
          const c = document.createElement('canvas');
          c.width = Math.max(1, Math.round((img.naturalWidth || 360) * scale));
          c.height = Math.max(1, Math.round((img.naturalHeight || 360) * scale));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          URL.revokeObjectURL(img.src);
          resolve(c.toDataURL('image/png'));
        };
        img.onerror = () => reject(new Error('Could not read that image.'));
        img.src = URL.createObjectURL(file);
      });
    },
    /** Picks the most common strong colors in a logo, to suggest a palette. */
    logoColors(dataUrl) {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = 48; c.height = 48;
          const g = c.getContext('2d');
          g.drawImage(img, 0, 0, 48, 48);
          const px = g.getImageData(0, 0, 48, 48).data;
          const buckets = {};
          for (let i = 0; i < px.length; i += 4) {
            if (px[i + 3] < 200) continue;
            const hsl = rgbToHsl([px[i], px[i + 1], px[i + 2]]);
            if (hsl[1] < 0.18 || hsl[2] < 0.12 || hsl[2] > 0.88) continue; // skip greys, near-black, near-white
            const key = [px[i] >> 5, px[i + 1] >> 5, px[i + 2] >> 5].join(',');
            (buckets[key] = buckets[key] || { n: 0, r: 0, g: 0, b: 0 }).n++;
            buckets[key].r += px[i]; buckets[key].g += px[i + 1]; buckets[key].b += px[i + 2];
          }
          const top = Object.values(buckets).sort((a, b) => b.n - a.n).slice(0, 4).map((x) => rgbToHex([x.r / x.n, x.g / x.n, x.b / x.n]));
          resolve(top);
        };
        img.onerror = () => resolve([]);
        img.src = dataUrl;
      });
    },
  };
  MT.brand = brand;
})();
