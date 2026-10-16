/* Mammoth CRM — crew day sheets and hours codes.
   Without a shared online database, the office sends a crew member their day as a link,
   and the crew member sends their hours back as a short code. */
(function () {
  'use strict';
  const MT = window.MT;
  const u = MT.u;

  function b64urlEncode(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    bytes.forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64urlDecode(s) {
    s = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const bin = atob(s);
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  }

  const link = {
    /** Builds a crew member's day: their jobs and visits, with what they need on site. */
    makeSheet(date, crewId) {
      const s = MT.store.state;
      const m = MT.store.crewMember(crewId);
      const co = s.settings.company;
      const items = MT.calc.dayItems(s, date).filter((x) => (x.crewIds || []).includes(crewId));
      return {
        v: 1, id: u.uid('sh').slice(3), d: date, c: crewId, n: m ? m.name : '',
        co: { n: co.name, p: co.phone },
        j: items.map((x) => {
          const c = MT.store.customer(x.customerId) || {};
          return { i: x.kind === 'job' ? x.id : (x.event && x.event.dealId) || x.id, k: x.kind, t: x.title, s: x.start || '', cn: c.name || '', a: [c.address, c.city].filter(Boolean).join(', '), p: c.phone || '', no: [c.notes, x.kind === 'job' ? x.deal.notes : x.event && x.event.notes].filter(Boolean).join(' / ').slice(0, 240), dn: x.dayN || 1, dd: x.days || 1 };
        }),
      };
    },
    sheetUrl(sheet) {
      const base = location.href.split('#')[0].split('?')[0];
      return base + '#crew/' + b64urlEncode(JSON.stringify(sheet));
    },
    readSheet(payload) {
      const o = JSON.parse(b64urlDecode(payload));
      if (!o || o.v !== 1 || !Array.isArray(o.j)) throw new Error('This day sheet link is damaged. Ask the office to send it again.');
      return o;
    },
    /** Code a crew member texts back: "MTH1." + their time entries. */
    hoursCode(sheet, entries, crewName) {
      return 'MTH1.' + b64urlEncode(JSON.stringify({ v: 1, s: sheet ? sheet.id : '', c: sheet ? sheet.c : '', n: crewName || (sheet && sheet.n) || '', e: entries.map((e) => ({ i: e.id, j: e.j || '', d: e.d, s: e.s, e: e.e, b: e.b || 0, no: e.no || '' })) }));
    },
    parseHours(text) {
      const m = String(text || '').match(/MTH1\.([A-Za-z0-9_-]+)/);
      if (!m) throw new Error('No hours code found. It starts with "MTH1."');
      const o = JSON.parse(b64urlDecode(m[1]));
      if (!o || !Array.isArray(o.e)) throw new Error('That hours code is damaged.');
      return o;
    },
    /** Adds a crew member's texted hours to Time tracking. Returns how many entries were new. */
    importHours(o) {
      const s = MT.store.state;
      let crew = s.crew.find((c) => c.id === o.c) || s.crew.find((c) => c.name.toLowerCase() === String(o.n).toLowerCase());
      if (!crew) {
        crew = { id: u.uid('cr'), name: o.n || 'Crew member', role: 'Groundsman', wage: u.num(s.overhead.avgWage) || 20, phone: '', color: '#2c5f86', active: true };
        s.crew.push(crew);
      }
      let n = 0;
      o.e.forEach((e) => {
        if (!e.s || s.timeEntries.some((x) => x.id === 'tx_' + e.i)) return;
        const deal = MT.store.deal(e.j);
        s.timeEntries.push({ id: 'tx_' + e.i, crewId: crew.id, dealId: deal ? deal.id : '', kind: deal ? 'job' : 'office', date: e.d, start: e.s, end: e.e || '', breakMin: u.num(e.b), note: e.no || 'Sent from phone' });
        n++;
      });
      if (n) MT.store.log('time', 'Imported ' + n + ' time ' + (n === 1 ? 'entry' : 'entries') + ' from ' + crew.name + "'s phone");
      MT.store.save();
      return { n, crew };
    },
    /** Paste-a-code dialog used by Time tracking and the Phone app tab. */
    importDialog() {
      MT.ui.modal({
        title: 'Import crew hours', size: 'sm',
        body: '<p class="hint">Paste the message a crew member sent from the crew view. It contains a code starting with "MTH1.".</p><textarea class="input" rows="5" id="hc-text" placeholder="MTH1.…"></textarea><div id="hc-prev"></div>',
        onMount(b) {
          const t = u.qs('#hc-text', b), p = u.qs('#hc-prev', b);
          t.addEventListener('input', () => {
            try {
              const o = link.parseHours(t.value);
              const hrs = u.sum(o.e, (e) => MT.calc.entryHours({ date: e.d, start: e.s, end: e.e || e.s, breakMin: e.b }));
              p.innerHTML = '<p class="hint good-text">' + u.esc(o.n || 'Crew member') + ': ' + o.e.length + ' time ' + (o.e.length === 1 ? 'entry' : 'entries') + ', ' + (Math.round(hrs * 100) / 100) + ' hours.</p>';
            } catch (e) { p.innerHTML = t.value.trim() ? '<p class="hint neg">' + u.esc(e.message) + '</p>' : ''; }
          });
        },
        actions: [{ label: 'Cancel' }, { label: 'Import hours', kind: 'primary', onClick: (b) => {
          let o;
          try { o = link.parseHours(u.qs('#hc-text', b).value); } catch (e) { MT.ui.toast(e.message, 'err'); return false; }
          const r = link.importHours(o);
          MT.ui.toast(r.n ? 'Imported ' + r.n + ' time ' + (r.n === 1 ? 'entry' : 'entries') + ' for ' + r.crew.name : 'Those hours were already imported');
        } }],
      });
    },
    b64urlEncode, b64urlDecode,
  };
  MT.crewlink = link;
})();
