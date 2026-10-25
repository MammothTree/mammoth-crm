/* Mammoth CRM — Training: narrated walkthroughs of the real screens, practice tasks, quizzes, progress per person,
   and your own videos (uploaded recordings or YouTube/Loom/Drive links) attached to lessons. */
(function () {
  'use strict';
  const MT = window.MT;
  const u = MT.u, ui = MT.ui, store = MT.store;
  const WHO_KEY = 'mammothcrm.trainee';
  const VOICE_KEY = 'mammothcrm.tourvoice';

  const view = { title: 'Training', lesson: null, answers: {} };
  const T = () => store.state.training || (store.state.training = { videos: [], progress: {} });
  const lessons = () => MT.trainingLessons || [];
  const lessonById = (id) => lessons().find((l) => l.id === id);
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } };

  /* ---------------- people & progress ---------------- */
  function people() {
    const set = new Set(Object.keys(T().progress || {}));
    (store.state.crew || []).filter((c) => c.active !== false && c.name).forEach((c) => set.add(c.name));
    const who = lsGet(WHO_KEY);
    if (who) set.add(who);
    return Array.from(set);
  }
  const who = () => lsGet(WHO_KEY) || '';
  function prog(lessonId, person) {
    const p = T().progress[person || who()] || {};
    return p[lessonId] || {};
  }
  function setProg(lessonId, patch) {
    const w = who();
    if (!w) return;
    const P = T().progress;
    P[w] = P[w] || {};
    P[w][lessonId] = Object.assign({}, P[w][lessonId] || {}, patch);
    store.save(true);
  }
  function status(lessonId, person) {
    const p = prog(lessonId, person);
    if (p.mastered) return { id: 'mastered', label: 'Mastered', kind: 'good' };
    if (p.watched || (p.practice || []).length) return { id: 'started', label: 'Started', kind: 'info' };
    return { id: 'new', label: 'Not started', kind: '' };
  }

  /* ---------------- render ---------------- */
  view.render = function (root) {
    const p = MT.app.params;
    if (p.lesson) { view.lesson = p.lesson; MT.app.params = {}; }
    if (view.lesson && lessonById(view.lesson)) renderLesson(root, lessonById(view.lesson));
    else renderHome(root);
  };

  function whoBar() {
    const w = who();
    return `<section class="panel tr-who">
      <div><b>Who's learning?</b><span class="hint"> Progress is saved for each person and syncs to your other devices.</span></div>
      <div class="chip-row">${people().map((n) => `<button class="chip ${n === w ? 'on' : ''}" data-who="${u.esc(n)}">${u.esc(n)}</button>`).join('')}<button class="chip" id="tr-addwho">+ Add a name</button></div>
    </section>`;
  }

  function renderHome(root) {
    const w = who();
    const all = lessons();
    const done = w ? all.filter((l) => status(l.id).id === 'mastered').length : 0;
    const vids = T().videos || [];
    root.innerHTML = `
      ${whoBar()}
      <section class="panel tr-hero">
        <div class="tr-hero-text">
          <h3>Learn the CRM, one job at a time</h3>
          <p>Each lesson is a short narrated walkthrough of the real screens. Press play and a voice explains each part while the CRM highlights it. Then try the practice tasks and a quick quiz. Pass the quiz to mark a lesson Mastered.</p>
          <div class="btn-row"><button class="btn primary" id="tr-next">${w ? (done === all.length ? 'Replay the first lesson' : 'Continue: ' + u.esc((all.find((l) => status(l.id).id !== 'mastered') || all[0]).title)) : 'Start the first lesson'}</button></div>
        </div>
        ${w ? `<div class="tr-meter" aria-label="${done} of ${all.length} lessons mastered"><div class="tr-meter-num">${done}<small>/${all.length}</small></div><div class="tr-meter-bar"><span style="width:${Math.round((done / all.length) * 100)}%"></span></div><div class="hint">${u.esc(w)}: lessons mastered</div></div>` : ''}
      </section>
      ${MT.trainingLevels.map((lv) => {
        const ls = all.filter((l) => l.level === lv.id);
        if (!ls.length) return '';
        return `<section class="tr-level"><h3 class="tr-level-h">${u.esc(lv.name)}</h3><div class="tr-grid">${ls.map((l, i) => {
          const st = status(l.id);
          const nv = vids.filter((v) => v.lessonId === l.id).length;
          return `<article class="tr-card ${st.id}" data-open="${l.id}" tabindex="0" role="button" aria-label="${u.esc(l.title)}">
            <div class="tr-card-top"><span class="tr-num">${all.indexOf(l) + 1}</span>${ui.badge(st.label, st.kind)}</div>
            <h4>${u.esc(l.title)}</h4>
            <p>${u.esc(l.summary)}</p>
            <div class="tr-card-foot"><span class="hint">${l.mins} min · ${l.steps.length} steps${nv ? ' · ' + nv + ' video' + (nv === 1 ? '' : 's') : ''}</span><button class="btn ghost sm" data-play="${l.id}">▶ Play</button></div>
          </article>`;
        }).join('')}</div></section>`;
      }).join('')}
      <section class="panel">
        <div class="panel-head"><h3>Our videos</h3><button class="btn ghost sm" id="tr-addvid">Add a video</button></div>
        ${videoList(vids, true)}
        <p class="hint">Record your own: on iPhone, swipe down and tap Screen Recording (press and hold it to turn on the microphone). On Windows, open the Snipping Tool and choose Record. Upload recordings up to 50 MB (they back up to GitHub), or paste a YouTube (unlisted), Loom, or Google Drive link for longer ones.</p>
      </section>
      ${w && Object.keys(T().progress).length > 1 ? teamTable() : ''}`;
    bindCommon(root);
    u.qs('#tr-next', root).addEventListener('click', () => {
      if (!ensureWho(() => view.render(root))) return;
      const l = all.find((x) => status(x.id).id !== 'mastered') || all[0];
      view.lesson = l.id; view.render(root);
    });
    u.qsa('[data-open]', root).forEach((c) => {
      const go = (e) => { if (e.target.closest('[data-play]')) return; view.lesson = c.dataset.open; view.answers = {}; view.render(root); window.scrollTo(0, 0); };
      c.addEventListener('click', go);
      c.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(e); });
    });
    u.qsa('[data-play]', root).forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); play(b.dataset.play); }));
    u.qs('#tr-addvid', root).addEventListener('click', () => addVideo(null, () => view.render(root)));
  }

  function teamTable() {
    const ps = Object.keys(T().progress);
    return `<section class="panel"><div class="panel-head"><h3>Team progress</h3></div><div class="table-wrap"><table class="table">
      <thead><tr><th>Lesson</th>${ps.map((n) => `<th>${u.esc(n)}</th>`).join('')}</tr></thead>
      <tbody>${lessons().map((l) => `<tr><td>${u.esc(l.title)}</td>${ps.map((n) => { const st = status(l.id, n); return `<td>${st.id === 'new' ? '<span class="muted">—</span>' : ui.badge(st.label, st.kind)}</td>`; }).join('')}</tr>`).join('')}</tbody>
    </table></div></section>`;
  }

  function renderLesson(root, l) {
    const all = lessons();
    const i = all.indexOf(l);
    const p = prog(l.id);
    const st = status(l.id);
    const vids = (T().videos || []).filter((v) => v.lessonId === l.id);
    root.innerHTML = `
      <div class="btn-row"><button class="btn ghost sm" id="tr-back">All lessons</button><span class="spacer"></span>
        ${i > 0 ? `<button class="btn ghost sm" data-go="${all[i - 1].id}">← ${u.esc(all[i - 1].title)}</button>` : ''}
        ${i < all.length - 1 ? `<button class="btn ghost sm" data-go="${all[i + 1].id}">${u.esc(all[i + 1].title)} →</button>` : ''}</div>
      ${whoBar()}
      <section class="panel tr-lesson-head">
        <div class="tr-card-top"><span class="tr-num">${i + 1}</span>${ui.badge(st.label, st.kind)}<span class="hint">${l.mins} min</span></div>
        <h3>${u.esc(l.title)}</h3>
        <p>${u.esc(l.summary)}</p>
        <button class="btn primary tr-play" data-play="${l.id}">▶ Play the walkthrough</button>
        <span class="hint">${'speechSynthesis' in window ? 'Turn your sound on. You can pause, go back, or skip at any time.' : 'Your browser can\'t read aloud, so the walkthrough shows the text and moves on by itself.'}</span>
      </section>
      <div class="tr-cols">
        <section class="panel">
          <div class="panel-head"><h3>What the walkthrough covers</h3></div>
          <ol class="tr-steps">${l.steps.map((s, k) => `<li><button class="link-btn" data-step="${k}">${u.esc(s.title)}</button><p>${u.esc(s.say)}</p></li>`).join('')}</ol>
        </section>
        <div>
          <section class="panel">
            <div class="panel-head"><h3>Videos</h3><button class="btn ghost sm" id="tr-addvid">Add a video</button></div>
            ${videoList(vids, false) || '<p class="hint">No videos for this lesson yet. Record yourself doing it for real and add it here.</p>'}
          </section>
          <section class="panel">
            <div class="panel-head"><h3>Practice</h3><span class="hint">Do it for real in the CRM</span></div>
            <ul class="tr-practice">${l.practice.map((t, k) => `<li><label class="check"><input type="checkbox" data-pr="${k}" ${(p.practice || []).includes(k) ? 'checked' : ''}><span>${u.esc(t)}</span></label></li>`).join('')}</ul>
          </section>
          <section class="panel">
            <div class="panel-head"><h3>Quick quiz</h3>${p.mastered ? ui.badge('Mastered ' + u.fmtDate(p.mastered.slice(0, 10)), 'good') : ''}</div>
            <div class="tr-quiz">${l.quiz.map((q, k) => `<fieldset data-q="${k}"><legend>${k + 1}. ${u.esc(q.q)}</legend>${q.a.map((a, j) => `<label class="check"><input type="radio" name="q${k}" value="${j}" ${view.answers[l.id + k] === j ? 'checked' : ''}><span>${u.esc(a)}</span></label>`).join('')}<p class="tr-why" hidden></p></fieldset>`).join('')}</div>
            <div class="btn-row"><button class="btn primary" id="tr-check">Check my answers</button></div>
            <p id="tr-result" class="hint"></p>
          </section>
        </div>
      </div>`;
    bindCommon(root);
    u.qs('#tr-back', root).addEventListener('click', () => { view.lesson = null; view.render(root); });
    u.qsa('[data-go]', root).forEach((b) => b.addEventListener('click', () => { view.lesson = b.dataset.go; view.answers = {}; view.render(root); window.scrollTo(0, 0); }));
    u.qsa('[data-play]', root).forEach((b) => b.addEventListener('click', () => play(l.id)));
    u.qsa('[data-step]', root).forEach((b) => b.addEventListener('click', () => play(l.id, +b.dataset.step)));
    u.qs('#tr-addvid', root).addEventListener('click', () => addVideo(l.id, () => view.render(root)));
    u.qsa('[data-pr]', root).forEach((c) => c.addEventListener('change', () => {
      if (!ensureWho(() => view.render(root))) { c.checked = !c.checked; return; }
      const cur = new Set(prog(l.id).practice || []);
      if (c.checked) cur.add(+c.dataset.pr); else cur.delete(+c.dataset.pr);
      setProg(l.id, { practice: Array.from(cur) });
    }));
    u.qsa('.tr-quiz input', root).forEach((r) => r.addEventListener('change', () => { view.answers[l.id + r.name.slice(1)] = +r.value; }));
    u.qs('#tr-check', root).addEventListener('click', () => {
      let right = 0, answered = 0;
      l.quiz.forEach((q, k) => {
        const fs = u.qs(`[data-q="${k}"]`, root);
        const pick = u.qs('input:checked', fs);
        const why = u.qs('.tr-why', fs);
        fs.classList.remove('ok', 'no');
        if (!pick) { why.hidden = true; return; }
        answered++;
        const ok = +pick.value === q.c;
        if (ok) right++;
        fs.classList.add(ok ? 'ok' : 'no');
        why.hidden = false;
        why.textContent = (ok ? 'Right. ' : 'Not quite. The answer is "' + q.a[q.c] + '". ') + (q.why || '');
      });
      const res = u.qs('#tr-result', root);
      if (answered < l.quiz.length) { res.textContent = 'Answer every question first.'; return; }
      if (right === l.quiz.length) {
        if (!ensureWho(() => view.render(root))) return;
        const first = !prog(l.id).mastered;
        setProg(l.id, { mastered: prog(l.id).mastered || new Date().toISOString(), watched: prog(l.id).watched || new Date().toISOString() });
        if (first) store.log('note', who() + ' mastered the "' + l.title + '" lesson');
        store.save(true);
        res.innerHTML = '<b class="good-tx">All correct. Lesson mastered!</b>' + (i < all.length - 1 ? ' Next up: ' + u.esc(all[i + 1].title) + '.' : ' That was the last lesson. Nice work!');
        ui.toast('Lesson mastered: ' + l.title);
      } else res.textContent = right + ' of ' + l.quiz.length + ' right. Review the walkthrough and try again.';
    });
  }

  function bindCommon(root) {
    u.qsa('[data-who]', root).forEach((b) => b.addEventListener('click', () => { lsSet(WHO_KEY, b.dataset.who); view.render(root); }));
    const add = u.qs('#tr-addwho', root);
    if (add) add.addEventListener('click', () => askName(() => view.render(root)));
    u.qsa('[data-vid]', root).forEach((b) => b.addEventListener('click', () => { const v = (T().videos || []).find((x) => x.id === b.dataset.vid); if (v) playVideo(v); }));
    u.qsa('[data-rmvid]', root).forEach((b) => b.addEventListener('click', () => {
      const v = (T().videos || []).find((x) => x.id === b.dataset.rmvid);
      if (!v) return;
      ui.confirm('Remove "' + v.title + '"?', 'The video is removed from Training' + (v.kind === 'video' ? ', this device, and the GitHub backup' : '') + '.', 'Remove video', async () => {
        T().videos = T().videos.filter((x) => x.id !== v.id);
        if (v.kind === 'video') await MT.media.removeItem(v).catch(() => {});
        store.save(true);
        view.render(root);
      });
    }));
  }

  function askName(done) {
    ui.modal({
      title: 'Who\'s learning?', size: 'sm',
      body: '<label class="field"><span>Name</span><input class="input" id="tr-name" placeholder="First name"></label>',
      actions: [{ label: 'Cancel' }, { label: 'Save', kind: 'primary', onClick: (b) => {
        const n = u.qs('#tr-name', b).value.trim().slice(0, 40);
        if (!n) { ui.toast('Type a name.', 'err'); return false; }
        lsSet(WHO_KEY, n);
        T().progress[n] = T().progress[n] || {};
        store.save(true);
        if (done) done();
      } }],
    });
  }
  function ensureWho(done) { if (who()) return true; askName(done); return false; }

  /* ---------------- videos ---------------- */
  function videoList(vids, showLesson) {
    if (!vids.length) return showLesson ? '<p class="hint">No videos yet.</p>' : '';
    return `<ul class="tr-vids">${vids.map((v) => `<li>
        <button class="tr-vid" data-vid="${v.id}"><span class="tr-vid-ic" aria-hidden="true">▶</span><span><b>${u.esc(v.title)}</b><span class="hint">${showLesson && v.lessonId && lessonById(v.lessonId) ? u.esc(lessonById(v.lessonId).title) + ' · ' : ''}${v.kind === 'link' ? u.esc(hostOf(v.url)) : (v.size ? Math.round(v.size / 1e5) / 10 + ' MB' : '') + (v.remote ? ' · backed up' : v.tooBig ? ' · too big to back up' : '')}</span></span></button>
        <button class="icon-btn" data-rmvid="${v.id}" aria-label="Remove ${u.esc(v.title)}">&times;</button></li>`).join('')}</ul>`;
  }
  const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return 'link'; } };

  function embedUrl(url) {
    let m = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/.exec(url);
    if (m) return 'https://www.youtube-nocookie.com/embed/' + m[1] + '?rel=0';
    m = /loom\.com\/(?:share|embed)\/([\w]+)/.exec(url);
    if (m) return 'https://www.loom.com/embed/' + m[1];
    m = /drive\.google\.com\/file\/d\/([\w-]+)/.exec(url);
    if (m) return 'https://drive.google.com/file/d/' + m[1] + '/preview';
    return '';
  }

  function addVideo(lessonId, done) {
    ui.modal({
      title: 'Add a training video',
      body: `<div class="form-grid">
          <label class="field span-2"><span>Title</span><input class="input" id="av-title" placeholder="e.g. How I build a removal estimate"></label>
          <label class="field span-2"><span>Lesson</span><select class="input" id="av-lesson">${u.options(lessons().map((l) => ({ value: l.id, label: l.title })), lessonId || '', 'General (no lesson)')}</select></label>
          <label class="field span-2"><span>Paste a link (YouTube, Loom, Google Drive)</span><input class="input" id="av-url" placeholder="https://…"></label>
          <div class="field span-2"><span>…or upload a recording</span><label class="btn ghost file-btn">Choose video file<input type="file" accept="video/*" id="av-file" hidden></label> <span class="hint" id="av-fname"></span></div>
        </div>
        <p class="hint">Uploads up to 50 MB back up to GitHub so every device can play them. For longer videos, upload to YouTube as Unlisted and paste the link.</p>`,
      onMount(b) { u.qs('#av-file', b).addEventListener('change', (e) => { const f = e.target.files[0]; u.qs('#av-fname', b).textContent = f ? f.name + ' (' + Math.round(f.size / 1e5) / 10 + ' MB)' : ''; if (f && !u.qs('#av-title', b).value) u.qs('#av-title', b).value = f.name.replace(/\.[^.]+$/, ''); }); },
      actions: [{ label: 'Cancel' }, { label: 'Add video', kind: 'primary', keepOpen: true, onClick: async (b, close) => {
        const title = u.qs('#av-title', b).value.trim();
        const url = u.qs('#av-url', b).value.trim();
        const file = u.qs('#av-file', b).files[0];
        const lid = u.qs('#av-lesson', b).value;
        if (!file && !/^https?:\/\//.test(url)) { ui.toast('Paste a link or choose a video file.', 'err'); return; }
        let rec;
        try {
          if (file) {
            ui.toast('Saving the video…');
            rec = await MT.media.ingest(file);
            if (rec.kind !== 'video') { await MT.media.removeItem(rec); ui.toast('That file isn\'t a video.', 'err'); return; }
            if (rec.size > MT.media.MAX_BACKUP) rec.tooBig = true;
          } else rec = { id: u.uid('tv'), kind: 'link', url, addedAt: new Date().toISOString() };
        } catch (e) { ui.toast(e.message || 'Could not save the video.', 'err'); return; }
        rec.title = title || (file ? file.name : hostOf(url) + ' video');
        rec.lessonId = lid || '';
        T().videos = (T().videos || []).concat(rec);
        store.save(true);
        if (rec.kind === 'video') { MT.media.persist(); if (MT.sync.ready() && MT.sync.cfg().mediaAuto) MT.media.backupAll().catch(() => {}); }
        close();
        ui.toast('Video added' + (rec.tooBig ? '. It\'s over 50 MB, so it stays on this device only' : ''));
        if (done) done();
      } }],
    });
  }

  async function playVideo(v) {
    let inner = '';
    if (v.kind === 'link') {
      const em = embedUrl(v.url);
      inner = em ? `<div class="tr-embed"><iframe src="${u.esc(em)}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen title="${u.esc(v.title)}"></iframe></div>` : `<p>This link opens on its own site.</p><a class="btn primary" href="${u.esc(v.url)}" target="_blank" rel="noopener">Open video</a>`;
    } else {
      let src = await MT.media.url(v.id);
      if (!src && v.remote && MT.sync.ready()) { ui.toast('Downloading the video…'); try { src = await MT.media.fetchRemote(v, false); } catch (e) { src = null; } }
      if (!src) { ui.toast(v.remote ? 'Connect GitHub sync on this device to play this video.' : 'This video is on the device that added it and isn\'t backed up yet.', 'err'); return; }
      inner = `<video class="tr-video" src="${src}" controls playsinline autoplay></video>`;
    }
    ui.modal({ title: v.title, size: 'lg', body: inner, actions: [{ label: 'Close' }] });
  }

  /* ---------------- narrated walkthrough ---------------- */
  const tour = { lesson: null, i: 0, playing: false, timer: null, els: null, token: 0 };
  const voiceOn = () => lsGet(VOICE_KEY) !== 'off';
  const canSpeak = () => 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';

  function pickVoice() {
    if (!canSpeak()) return null;
    const vs = window.speechSynthesis.getVoices() || [];
    const en = vs.filter((v) => /^en(-|_|$)/i.test(v.lang));
    return en.find((v) => /natural|neural|online/i.test(v.name) && /en-US/i.test(v.lang)) || en.find((v) => /en-US/i.test(v.lang)) || en[0] || null;
  }

  function play(lessonId, start) {
    const l = lessonById(lessonId);
    if (!l) return;
    if (!who()) { askName(() => play(lessonId, start)); return; }
    stopTour(true);
    tour.lesson = l; tour.i = start || 0; tour.playing = true;
    tour.returnTo = { route: MT.app.route, lesson: view.lesson };
    buildOverlay();
    setProg(l.id, { watched: prog(l.id).watched || new Date().toISOString() });
    showStep();
  }
  view.play = play;

  function buildOverlay() {
    const wrap = document.createElement('div');
    wrap.className = 'tour';
    wrap.innerHTML = `<div class="tour-spot" hidden></div>
      <div class="tour-card" role="dialog" aria-live="polite" aria-label="Walkthrough">
        <div class="tour-top"><span class="tour-lesson"></span><span class="tour-count"></span><button class="icon-btn tour-x" aria-label="Exit walkthrough">&times;</button></div>
        <div class="tour-bar"><span></span></div>
        <h4 class="tour-title"></h4>
        <p class="tour-say"></p>
        <div class="tour-ctl">
          <button class="btn ghost sm tour-voice" aria-pressed="${voiceOn()}">${voiceOn() ? '🔊 Voice on' : '🔈 Voice off'}</button>
          <span class="spacer"></span>
          <button class="btn ghost sm tour-prev" aria-label="Back">◀ Back</button>
          <button class="btn ghost sm tour-pp"></button>
          <button class="btn primary sm tour-next">Next ▶</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    tour.els = { wrap, spot: u.qs('.tour-spot', wrap), card: u.qs('.tour-card', wrap) };
    u.qs('.tour-x', wrap).addEventListener('click', () => stopTour());
    u.qs('.tour-prev', wrap).addEventListener('click', () => { if (tour.i > 0) { tour.i--; showStep(); } });
    u.qs('.tour-next', wrap).addEventListener('click', () => next(true));
    u.qs('.tour-pp', wrap).addEventListener('click', () => { tour.playing = !tour.playing; if (tour.playing) speakStep(); else hush(); paintControls(); });
    u.qs('.tour-voice', wrap).addEventListener('click', (e) => {
      lsSet(VOICE_KEY, voiceOn() ? 'off' : 'on');
      e.target.textContent = voiceOn() ? '🔊 Voice on' : '🔈 Voice off';
      e.target.setAttribute('aria-pressed', voiceOn());
      if (tour.playing) speakStep(); else hush();
    });
    tour.onKey = (e) => { if (e.key === 'Escape') stopTour(); else if (e.key === 'ArrowRight') next(true); else if (e.key === 'ArrowLeft' && tour.i > 0) { tour.i--; showStep(); } };
    tour.onMove = () => place();
    document.addEventListener('keydown', tour.onKey);
    window.addEventListener('resize', tour.onMove);
    window.addEventListener('scroll', tour.onMove, true);
  }

  function paintControls() {
    if (!tour.els) return;
    const l = tour.lesson;
    u.qs('.tour-pp', tour.els.wrap).textContent = tour.playing ? '❚❚ Pause' : '▶ Play';
    u.qs('.tour-next', tour.els.wrap).textContent = tour.i >= l.steps.length - 1 ? 'Finish ✓' : 'Next ▶';
    u.qs('.tour-prev', tour.els.wrap).disabled = tour.i === 0;
  }

  async function showStep() {
    const l = tour.lesson, s = l.steps[tour.i];
    const my = ++tour.token;
    hush();
    document.body.classList.remove('nav-open');
    // A step without its own screen uses the one from the nearest step before it (so starting mid-lesson works).
    let k = tour.i;
    while (k > 0 && !l.steps[k].route) k--;
    const route = l.steps[k].route;
    const before = s.before || (!s.route && l.steps[k].before);
    if (before) { try { before(); } catch (e) { /* view not loaded */ } }
    if (route && MT.app.route !== route) { MT.app.go(route); await wait(120); }
    else if (before) { MT.app.render(); await wait(60); }
    if (my !== tour.token || !tour.els) return;
    u.qs('.tour-lesson', tour.els.wrap).textContent = l.title;
    u.qs('.tour-count', tour.els.wrap).textContent = (tour.i + 1) + ' / ' + l.steps.length;
    u.qs('.tour-bar span', tour.els.wrap).style.width = Math.round(((tour.i + 1) / l.steps.length) * 100) + '%';
    u.qs('.tour-title', tour.els.wrap).textContent = s.title;
    u.qs('.tour-say', tour.els.wrap).textContent = s.say;
    paintControls();
    const el = s.el ? await waitFor(s.el, 1500) : null;
    if (my !== tour.token || !tour.els) return;
    tour.target = el;
    tour.nudged = false;
    if (el) { try { el.scrollIntoView({ block: 'center' }); } catch (e) { el.scrollIntoView(); } await wait(80); }
    place();
    if (tour.playing) speakStep();
  }

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  function visible(el) { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2 && getComputedStyle(el).visibility !== 'hidden'; }
  async function waitFor(sel, ms) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const el = u.qsa(sel).find(visible);
      if (el) return el;
      await wait(100);
    }
    return null;
  }

  function place() {
    if (!tour.els) return;
    const { spot, card } = tour.els;
    const el = tour.target && document.contains(tour.target) ? tour.target : (tour.lesson.steps[tour.i].el ? u.qsa(tour.lesson.steps[tour.i].el).find(visible) : null);
    tour.target = el || null;
    const vw = window.innerWidth, vh = window.innerHeight;
    const narrow = vw < 700;
    card.classList.toggle('centered', !el);
    card.classList.toggle('sheet', narrow);
    if (!el) { spot.hidden = true; tour.els.wrap.classList.add('dim'); card.style.left = card.style.top = ''; return; }
    tour.els.wrap.classList.remove('dim');
    const r = el.getBoundingClientRect();
    const pad = 6;
    spot.hidden = false;
    Object.assign(spot.style, { left: Math.max(4, r.left - pad) + 'px', top: Math.max(4, r.top - pad) + 'px', width: Math.min(vw - 8, r.width + pad * 2) + 'px', height: Math.min(vh - 8, r.height + pad * 2) + 'px' });
    if (narrow) { card.style.left = card.style.top = ''; return; }
    const cw = card.offsetWidth, ch = card.offsetHeight;
    let top = r.bottom + 14;
    if (top + ch > vh - 10) top = r.top - ch - 14;
    if (top < 10) top = Math.min(vh - ch - 10, Math.max(10, r.top + 10));
    let left = Math.min(Math.max(10, r.left + r.width / 2 - cw / 2), vw - cw - 10);
    if (r.width > vw * 0.6 && r.height > vh * 0.5) { top = vh - ch - 16; left = vw - cw - 16; } // big areas: park the card in the corner
    top = Math.min(Math.max(10, top), Math.max(10, vh - ch - 10)); // always on screen
    // Short screens: if the card would cover the spot, scroll the spot up once and place again.
    if (!tour.nudged && top < r.bottom && top + ch > r.top && r.height < vh / 3) {
      tour.nudged = true;
      window.scrollBy(0, r.top - 70);
      return place();
    }
    card.style.left = left + 'px';
    card.style.top = top + 'px';
  }

  function hush() {
    clearTimeout(tour.timer);
    if (canSpeak()) { try { window.speechSynthesis.cancel(); } catch (e) { /* ignore */ } }
  }

  function speakStep() {
    hush();
    const s = tour.lesson && tour.lesson.steps[tour.i];
    if (!s) return;
    const my = tour.token;
    const after = () => { if (my === tour.token && tour.playing) tour.timer = setTimeout(() => next(false), 900); };
    if (voiceOn() && canSpeak()) {
      const ut = new SpeechSynthesisUtterance(s.title + '. ' + s.say);
      const v = pickVoice();
      if (v) ut.voice = v;
      ut.rate = 1; ut.pitch = 1; ut.lang = (v && v.lang) || 'en-US';
      let ended = false;
      ut.onend = () => { if (!ended) { ended = true; after(); } };
      ut.onerror = () => { if (!ended) { ended = true; tour.timer = setTimeout(after, readTime(s)); } };
      window.speechSynthesis.speak(ut);
      // Some browsers never fire onend: move on after a generous reading time.
      tour.timer = setTimeout(() => { if (!ended) { ended = true; after(); } }, readTime(s) * 1.8 + 4000);
    } else tour.timer = setTimeout(after, readTime(s));
  }
  const readTime = (s) => 2500 + (s.title.length + s.say.length) * 55;

  function next(manual) {
    if (!tour.lesson) return;
    if (tour.i < tour.lesson.steps.length - 1) { tour.i++; showStep(); return; }
    finish();
  }

  function finish() {
    const l = tour.lesson;
    stopTour(true);
    view.lesson = l.id;
    MT.app.go('training');
    setTimeout(() => ui.toast('Walkthrough done. Now try the practice tasks and the quiz.'), 300);
  }

  function stopTour(silent) {
    hush();
    tour.token++;
    if (tour.els) {
      tour.els.wrap.remove();
      document.removeEventListener('keydown', tour.onKey);
      window.removeEventListener('resize', tour.onMove);
      window.removeEventListener('scroll', tour.onMove, true);
    }
    tour.els = null;
    if (!silent && tour.returnTo) { view.lesson = tour.returnTo.lesson || (tour.lesson && tour.lesson.id); MT.app.go('training'); }
    tour.lesson = silent ? tour.lesson : null;
  }
  view.stopTour = stopTour;
  view.tourState = () => ({ active: !!tour.els, lesson: tour.lesson && tour.lesson.id, i: tour.i, playing: tour.playing, target: tour.target || null });

  MT.views.training = view;
})();
