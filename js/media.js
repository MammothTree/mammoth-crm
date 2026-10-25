/* Mammoth CRM — media storage for Job Cam (IndexedDB).
   Photos and videos are stored as files in the browser's database; folder and caption info lives in the main CRM data. */
(function () {
  'use strict';
  const MT = window.MT;
  const u = MT.u;
  const DB_NAME = 'mammothcrm-media';
  const STORE = 'files';
  const MAX_EDGE = 2560; // photos larger than this are resized to save space
  const THUMB_EDGE = 480;

  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('This browser cannot store photos and videos (IndexedDB unavailable).')); return; }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Could not open media storage.'));
    });
    return dbp;
  }
  function tx(mode, fn) {
    return db().then((d) => new Promise((resolve, reject) => {
      const t = d.transaction(STORE, mode);
      const st = t.objectStore(STORE);
      const r = fn(st);
      t.oncomplete = () => resolve(r && 'result' in r ? r.result : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('Storage aborted. The device may be out of space.'));
    }));
  }

  const urlCache = new Map();
  const media = {
    put(key, blob) { return tx('readwrite', (s) => s.put(blob, key)); },
    get(key) { return tx('readonly', (s) => s.get(key)); },
    del(key) { urlCache.delete(key); return tx('readwrite', (s) => s.delete(key)); },
    clear() { urlCache.forEach((url) => URL.revokeObjectURL(url)); urlCache.clear(); return tx('readwrite', (s) => s.clear()); },
    /** Object URL for a stored file (cached). Resolves null when the file is not on this device. */
    async url(key) {
      if (urlCache.has(key)) return urlCache.get(key);
      const blob = await media.get(key);
      if (!blob) return null;
      const url = URL.createObjectURL(blob);
      urlCache.set(key, url);
      return url;
    },
    async removeItem(item) {
      if (item.sample) return;
      await media.del(item.id);
      await media.del(item.id + ':t');
      if (item.remote && MT.sync.ready()) {
        MT.sync.deleteFile(item.remote.path, item.remote.sha).catch(() => {});
        if (item.remote.tpath) MT.sync.deleteFile(item.remote.tpath, item.remote.tsha).catch(() => {});
      }
    },

    /* ---------- backup to the private GitHub data repository ---------- */
    MAX_BACKUP: 50 * 1024 * 1024, // GitHub warns above 50 MB per file
    TRAINING: { id: 'training', name: 'Training videos' }, // backup folder for the Training tab's own videos
    /** Media on this device that isn't backed up yet. */
    /** Every stored file with its owner: Job cam photos and videos, plus files attached to jobs (deal.files). */
    allItems() {
      const s = MT.store.state, out = [];
      (s.jobFolders || []).forEach((f) => (f.media || []).forEach((m) => out.push({ f, m })));
      (s.deals || []).forEach((d) => (d.files || []).forEach((m) => out.push({ f: d, m })));
      ((s.training && s.training.videos) || []).forEach((m) => { if (m.kind === 'video') out.push({ f: media.TRAINING, m }); });
      return out;
    },
    pendingBackup() {
      return media.allItems().filter((x) => !x.m.sample && !x.m.remote && !x.m.tooBig);
    },
    backupStats() {
      let total = 0, done = 0;
      media.allItems().forEach((x) => { if (x.m.sample) return; total++; if (x.m.remote) done++; });
      return { total, done, pending: media.pendingBackup().length };
    },
    async backupOne(f, m) {
      const blob = await media.get(m.id);
      if (!blob) return false; // added on another device that hasn't backed it up yet
      if (blob.size > media.MAX_BACKUP) { m.tooBig = true; return false; }
      const isFile = m.kind === 'file';
      const fromName = isFile && /\.([a-z0-9]{1,6})$/i.exec(m.name || '');
      const ext = fromName ? fromName[1].toLowerCase() : (m.mime && m.mime.split('/')[1] || 'bin').replace('jpeg', 'jpg').replace('quicktime', 'mov').split(';')[0];
      const base = (isFile ? 'files/' : 'media/') + f.id + '/' + m.id;
      const main = await MT.sync.putFile(base + '.' + ext, blob, (isFile ? 'Job file: ' + (f.title || '') : 'Job cam: ' + (f.name || '')) + ' (' + m.name + ')');
      m.remote = { path: main.path, sha: main.sha, at: new Date().toISOString() };
      const thumb = await media.get(m.id + ':t');
      if (thumb) { const t = await MT.sync.putFile(base + '-thumb.jpg', thumb, 'Job cam thumbnail'); m.remote.tpath = t.path; m.remote.tsha = t.sha; }
      return true;
    },
    /** Uploads everything not yet backed up. progress(done, total) is optional. */
    async backupAll(progress) {
      if (!MT.sync.ready() || media.backingUp) return { done: 0, failed: 0 };
      media.backingUp = true;
      const list = media.pendingBackup();
      let done = 0, failed = 0, lastErr = '';
      try {
        for (let i = 0; i < list.length; i++) {
          if (progress) progress(i, list.length);
          try { if (await media.backupOne(list[i].f, list[i].m)) { done++; MT.store.save(true); } } catch (e) { failed++; lastErr = e.message; if (/401|403|rejected/i.test(e.message)) break; }
        }
      } finally { media.backingUp = false; }
      if (progress) progress(list.length, list.length);
      return { done, failed, lastErr };
    },
    /** Downloads a backed-up file that isn't on this device yet, and keeps it here. */
    async fetchRemote(m, thumb) {
      if (!m.remote || !MT.sync.ready()) return null;
      const key = thumb ? m.id + ':t' : m.id;
      const path = thumb ? m.remote.tpath : m.remote.path;
      if (!path) return null;
      const blob = await MT.sync.getFile(path);
      const typed = blob.type && blob.type !== 'application/octet-stream' ? blob : new Blob([blob], { type: thumb ? 'image/jpeg' : m.mime || 'application/octet-stream' });
      await media.put(key, typed);
      urlCache.delete(key);
      return media.url(key);
    },
    async estimate() {
      if (!navigator.storage || !navigator.storage.estimate) return null;
      try { return await navigator.storage.estimate(); } catch (e) { return null; }
    },
    persist() {
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    },

    /** Stores a File and returns its metadata record. */
    async ingest(file) {
      const isVideo = file.type.startsWith('video/');
      const isImage = file.type.startsWith('image/');
      if (!isVideo && !isImage) throw new Error(file.name + ' is not a photo or video.');
      const id = u.uid('m');
      let blob = file, w = 0, h = 0, thumb = null, duration = 0;
      if (isImage) {
        const img = await loadImage(file);
        w = img.naturalWidth; h = img.naturalHeight;
        // Resize very large photos; keep GIFs/originals that are already reasonable.
        if (Math.max(w, h) > MAX_EDGE && file.type !== 'image/gif') {
          const r = await draw(img, w, h, MAX_EDGE, 'image/jpeg', 0.88);
          blob = r.blob; w = r.w; h = r.h;
        }
        thumb = (await draw(img, img.naturalWidth, img.naturalHeight, THUMB_EDGE, 'image/jpeg', 0.8)).blob;
        URL.revokeObjectURL(img.src);
      } else {
        const v = await videoPoster(file).catch(() => null);
        if (v) { thumb = v.blob; w = v.w; h = v.h; duration = v.duration; }
      }
      await media.put(id, blob);
      if (thumb) await media.put(id + ':t', thumb);
      return {
        id, kind: isVideo ? 'video' : 'image', name: file.name, mime: blob.type || file.type, size: blob.size,
        w, h, duration, hasThumb: !!thumb, tag: '', caption: '', addedAt: new Date().toISOString(),
        takenAt: file.lastModified ? new Date(file.lastModified).toISOString() : '',
      };
    },

    /** Generated illustration used for demo folders (no real file stored). */
    sampleSVG(item) {
      const sc = item.sample || {};
      const seed = sc.layout || sc.seed || 1; // same layout for every photo of one property
      const rnd = (n) => { const x = Math.sin(seed * 9301 + n * 49297) * 233280; return x - Math.floor(x); };
      const shot = sc.seed || 1; // small framing change per photo
      const zoom = 1 + ((shot * 37) % 10) / 100, dx = ((shot * 53) % 30) - 15;
      const sky = sc.scene === 'after' ? ['#9cc7e8', '#e3f0f8'] : sc.scene === 'during' ? ['#b9c7cf', '#e9eef0'] : ['#8fa3ad', '#d9e1e4'];
      const grass = sc.scene === 'after' ? '#6f9e4c' : '#5f8a42';
      const house = rnd(1) > 0.4;
      const hx = 40 + rnd(2) * 200;
      const tx = house ? (hx > 160 ? 70 + rnd(3) * 60 : 250 + rnd(3) * 60) : 140 + rnd(3) * 120;
      let tree = '';
      if (sc.scene === 'before') {
        tree = `<rect x="${tx - 9}" y="120" width="18" height="110" fill="#5b4330"/>
          <path d="M${tx} 125 L${tx - 34} 92 M${tx} 140 L${tx + 38} 104 M${tx} 112 L${tx + 14} 70" stroke="#5b4330" stroke-width="7" stroke-linecap="round"/>
          <circle cx="${tx - 30}" cy="80" r="36" fill="#476b33"/><circle cx="${tx + 28}" cy="88" r="40" fill="#3f612d"/><circle cx="${tx}" cy="54" r="42" fill="#4d7537"/>
          <circle cx="${tx + 34}" cy="58" r="20" fill="#7a6a4a" opacity=".85"/>`;
      } else if (sc.scene === 'during') {
        tree = `<rect x="${tx - 9}" y="110" width="18" height="120" fill="#5b4330"/>
          <path d="M${tx} 128 L${tx - 26} 100" stroke="#5b4330" stroke-width="7" stroke-linecap="round"/>
          <circle cx="${tx - 24}" cy="92" r="20" fill="#476b33"/>
          <line x1="${tx}" y1="110" x2="${tx + 70}" y2="40" stroke="#333" stroke-width="2"/>
          <rect x="${tx + 40}" y="196" width="90" height="34" rx="4" fill="#e2a400"/><rect x="${tx + 104}" y="182" width="30" height="24" rx="3" fill="#e2a400"/>
          <circle cx="${tx + 58}" cy="232" r="8" fill="#222"/><circle cx="${tx + 116}" cy="232" r="8" fill="#222"/>
          <path d="M${tx - 70} 228 l18 -14 l20 6 l14 -10 l18 18z" fill="#6d5a3c"/>`;
      } else {
        tree = `<ellipse cx="${tx}" cy="228" rx="18" ry="6" fill="#6d5034"/><ellipse cx="${tx}" cy="226" rx="12" ry="3.5" fill="#a07b52"/>`;
      }
      const houseSvg = house ? `<rect x="${hx}" y="140" width="110" height="90" fill="#d8cfc1"/><path d="M${hx - 10} 142 L${hx + 55} 96 L${hx + 120} 142z" fill="#7a5a44"/>
        <rect x="${hx + 18}" y="165" width="22" height="22" fill="#8fb3c9"/><rect x="${hx + 68}" y="180" width="22" height="50" fill="#6a4e3a"/>` : '';
      const label = 'Sample photo: ' + (sc.scene || 'job');
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="1200" height="900">
        <defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/></linearGradient></defs>
        <rect width="400" height="300" fill="url(#s)"/>
        <g transform="translate(${200 + dx} 150) scale(${zoom}) translate(-200 -150)">
        <path d="M-40 175 Q100 150 200 170 T440 160 V340 H-40z" fill="#7d9a6b" opacity=".6"/>
        <rect x="-40" y="222" width="480" height="120" fill="${grass}"/>
        ${houseSvg}${tree}</g>
        <rect x="10" y="270" width="${label.length * 7 + 16}" height="22" rx="4" fill="rgba(0,0,0,.55)"/>
        <text x="18" y="285" font-family="Segoe UI, sans-serif" font-size="12" fill="#fff">${label}</text></svg>`;
      return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    },
  };

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not read ' + file.name + '. The format may not be supported by this browser (for example HEIC). Try exporting it as JPEG.'));
      img.src = URL.createObjectURL(file);
    });
  }
  function draw(src, sw, sh, maxEdge, type, q) {
    const scale = Math.min(1, maxEdge / Math.max(sw, sh));
    const w = Math.round(sw * scale), h = Math.round(sh * scale);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(src, 0, 0, w, h);
    return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve({ blob: b, w, h }) : reject(new Error('Could not process image.'))), type, q));
  }
  function videoPoster(file) {
    return new Promise((resolve, reject) => {
      const v = document.createElement('video');
      const url = URL.createObjectURL(file);
      let done = false;
      const finish = (fn) => { if (done) return; done = true; clearTimeout(t); fn(); v.removeAttribute('src'); v.load(); URL.revokeObjectURL(url); };
      const t = setTimeout(() => finish(() => reject(new Error('timeout'))), 8000);
      v.muted = true; v.playsInline = true; v.preload = 'metadata';
      v.onloadedmetadata = () => { v.currentTime = Math.min(1, (v.duration || 2) / 3); };
      v.onseeked = () => {
        draw(v, v.videoWidth, v.videoHeight, THUMB_EDGE, 'image/jpeg', 0.8)
          .then((r) => finish(() => resolve({ blob: r.blob, w: v.videoWidth, h: v.videoHeight, duration: v.duration })), (e) => finish(() => reject(e)));
      };
      v.onerror = () => finish(() => reject(new Error('Unsupported video')));
      v.src = url;
    });
  }

  MT.media = media;
})();
