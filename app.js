/*
  Remotie tradie lead funnel.
  Plain browser script: no build step, no dependencies.
  The pure helpers at the top are also exported for Node (tests/app.test.js).
  The DOM wiring in init() only runs in a browser.
*/
(function () {
  'use strict';

  const ENDPOINT = 'https://formspree.io/f/xdeglzdo';
  const OTHER = 'Other Trade';

  // label: exact value emailed to Remotie. short: tiles, recap and email subject.
  // kind: "urgent" trades win jobs by answering first, "project" trades win by following up quotes.
  // keys: extra search words, including US, Canadian and Australian slang.
  const TRADES = [
    { label: 'Appliance Repair', kind: 'urgent', keys: 'appliance washer dryer oven dishwasher fridge repair' },
    { label: 'Bricklaying & Masonry', short: 'Bricklaying', kind: 'project', keys: 'brickie bricklayer brick mason masonry stone block retaining wall' },
    { label: 'Cabinetry & Joinery', short: 'Cabinetry', kind: 'project', keys: 'cabinet cabinets cabinet maker joiner joinery kitchens' },
    { label: 'Carpentry / Carpenter', short: 'Carpentry', kind: 'project', keys: 'carpenter chippy chippie framing framer trim finish carpentry' },
    { label: 'Concrete & Paving', short: 'Concrete', kind: 'project', keys: 'concreter concrete paving pavers driveway driveways asphalt slab' },
    { label: 'Demolition', kind: 'project', keys: 'demo demolition strip out' },
    { label: 'Electrician / Electrical', short: 'Electrical', kind: 'urgent', keys: 'electrician sparky sparkie electrical wiring power lighting ev charger' },
    { label: 'Excavation & Earthmoving', short: 'Excavation', kind: 'project', keys: 'excavator excavation earthmoving digger bobcat site prep grading' },
    { label: 'Fencing & Decking', short: 'Fencing', kind: 'project', keys: 'fencer fencing fence fences decking deck decks pergola gates' },
    { label: 'Foundation Repair', kind: 'project', keys: 'foundation foundations underpinning restumping slab repair' },
    { label: 'Garage Door Services', short: 'Garage Doors', kind: 'urgent', keys: 'garage door doors opener openers roller' },
    { label: 'General Contracting & Remodeling', short: 'General Contracting', kind: 'project', keys: 'builder builders building general contractor gc remodeling remodelling remodel renovation renovations reno construction' },
    { label: 'Glass & Glazing', short: 'Glazing', kind: 'urgent', keys: 'glazier glass glazing windows window shower screens' },
    { label: 'Gutter Installation & Cleaning', short: 'Gutters', kind: 'project', keys: 'gutter gutters guttering downpipes downspouts leaf guard' },
    { label: 'Handyman Services', short: 'Handyman', kind: 'project', keys: 'handyman handy man odd jobs maintenance property maintenance' },
    { label: 'HVAC (Heating, Ventilation & Air Conditioning)', short: 'HVAC', kind: 'urgent', keys: 'hvac heating cooling air conditioning aircon air con ac furnace heat pump ducting ducted ventilation' },
    { label: 'Insulation', kind: 'project', keys: 'insulation insulate spray foam batts' },
    { label: 'Irrigation & Sprinklers', short: 'Irrigation', kind: 'project', keys: 'irrigation sprinkler sprinklers reticulation retic' },
    { label: 'Landscaping & Lawn Care', short: 'Landscaping', kind: 'project', keys: 'landscaper landscaping gardener gardening lawn lawns mowing yard hardscape turf' },
    { label: 'Locksmith', kind: 'urgent', keys: 'locksmith locks keys lockout' },
    { label: 'Painting & Decorating', short: 'Painting', kind: 'project', keys: 'painter painters painting decorator decorating' },
    { label: 'Pest Control', kind: 'urgent', keys: 'pest pests exterminator termites rodents bugs' },
    { label: 'Plastering & Drywall', short: 'Plastering', kind: 'project', keys: 'plasterer plaster drywall gyprock sheetrock render rendering' },
    { label: 'Plumbing', kind: 'urgent', keys: 'plumber plumbers plumbing drains gas fitter gasfitter gasfitting hot water leak leaks blocked' },
    { label: 'Pool Building & Maintenance', short: 'Pools', kind: 'project', keys: 'pool pools spa spas pool builder pool service pool cleaning' },
    { label: 'Pressure Washing & Exterior Cleaning', short: 'Pressure Washing', kind: 'project', keys: 'pressure washing power washing soft wash exterior cleaning window cleaning' },
    { label: 'Refrigeration', kind: 'urgent', keys: 'refrigeration fridgie cool room cold room commercial fridge freezer' },
    { label: 'Roofing', kind: 'project', keys: 'roofer roofers roof roofing shingles metal roof reroof re-roof' },
    { label: 'Siding & Cladding', short: 'Siding', kind: 'project', keys: 'siding cladding exterior' },
    { label: 'Solar Installation', short: 'Solar', kind: 'project', keys: 'solar panels battery batteries installer pv' },
    { label: 'Tiling & Flooring', short: 'Tiling', kind: 'project', keys: 'tiler tilers tiling tiles flooring floors timber floors carpet vinyl laminate' },
    { label: 'Tree Services / Arborist', short: 'Tree Services', kind: 'project', keys: 'arborist tree trees lopping removal stump grinding' },
    { label: 'Water Damage & Restoration', short: 'Restoration', kind: 'urgent', keys: 'water damage restoration flood mould mold' },
    { label: 'Waterproofing', kind: 'project', keys: 'waterproofing waterproofer membrane' },
    { label: 'Welding & Fabrication', short: 'Welding', kind: 'project', keys: 'welder welding fabrication fabricator steel' },
    { label: OTHER, short: 'Other', kind: null, keys: 'other something else not listed' }
  ];

  const COUNTRIES = {
    US: { name: 'United States', dial: '+1', placeholder: '(555) 123-4567', hint: 'Enter a 10-digit number, like (415) 555-0123.' },
    CA: { name: 'Canada', dial: '+1', placeholder: '(555) 123-4567', hint: 'Enter a 10-digit number, like (604) 555-0187.' },
    AU: { name: 'Australia', dial: '+61', placeholder: '0412 345 678', hint: 'Enter a mobile or landline, like 0412 345 678.' }
  };

  const REVENUE = [[0, 10], [10, 25], [25, 50], [50, 100], [100, 250], [250, null]]; // $k per month
  const ADS = [[0, 0], [0, 1000], [1000, 3000], [3000, 7500], [7500, 15000], [15000, null]]; // $ per month

  const CREW_REACT = [
    'Running solo means you miss calls while you work. We fix that first.',
    'Small crew, big workload. Steady calls keep everyone busy.',
    'A crew this size needs a full calendar every single week.',
    'Big crew. Gaps in the pipeline get expensive fast.',
    'Serious operation. We help keep every crew booked solid.'
  ];

  const REVENUE_REACT = [
    'Room to grow fast. A steady flow of local calls changes everything here.',
    'Solid base. You are ready for a steadier flow of jobs.',
    'Strong numbers. Time to plug the gaps that leak jobs.',
    'Busy operation. The right systems keep it running smoothly.',
    'Big operation. Protecting your pipeline is the priority now.',
    'Market leader territory. We help you stay on top.'
  ];

  const ADS_FEEDBACK = [
    'Good news. Google Maps and AI search can bring steady calls without paying for ads.',
    'Lean spend. We make sure every one of those clicks gets a fast answer.',
    'We find the leaks so more of that spend turns into booked jobs.',
    'We help plug lead leaks so every ad dollar turns into booked jobs.',
    'At this spend, one missed call can cost you hundreds. We make sure none slip through.',
    'Big budget. Instant answers and follow-ups make every dollar work harder.'
  ];

  // Seconds each answer takes. They add up to the 45 seconds promised on the page.
  const WEIGHTS = { employees: 6, revenue: 6, ads: 6, trade: 6, name: 7, email: 8, phone: 6 };

  const FOCUS = {
    calls: 'Missed-call recovery',
    maps: 'Top 3 on Google Maps',
    follow: 'Automatic quote follow-up',
    ai: 'Top pick in AI search'
  };
  const FOCUS_ORDER = ['calls', 'maps', 'follow', 'ai']; // tie-break order

  /* ---------- Pure helpers ---------- */

  const digitsOnly = v => String(v == null ? '' : v).replace(/\D/g, '');
  const cleanText = v => String(v == null ? '' : v).trim().replace(/\s+/g, ' ');
  const findTrade = label => TRADES.find(t => t.label === label) || null;
  const tradeShort = label => { const t = findTrade(label); return t ? (t.short || t.label) : String(label || ''); };

  function group(d, sizes) {
    const out = [];
    let i = 0;
    for (let g = 0; g < sizes.length && i < d.length; g++) { out.push(d.slice(i, i + sizes[g])); i += sizes[g]; }
    return out.join(' ');
  }

  function nanp(d) {
    if (!d) return '';
    if (d.length < 4) return '(' + d;
    if (d.length < 7) return '(' + d.slice(0, 3) + ') ' + d.slice(3);
    return '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6, 10);
  }

  function auLocal(d) {
    if (/^(0[45]|1[38])/.test(d)) return group(d, [4, 3, 3]); // 0412 345 678, 1300 123 456
    if (d[0] === '0') return group(d, [2, 4, 4]); // 02 9876 5432
    if (/^[45]/.test(d)) return group(d, [3, 3, 3]); // 412 345 678
    return group(d, [1, 4, 4]); // 2 9876 5432
  }

  // Live mask while typing. A typed country code is kept visible until blur, so digits never vanish.
  function formatPhone(country, raw) {
    const d = digitsOnly(raw);
    if (!d) return '';
    if (country === 'AU') {
      if (d.startsWith('61')) { const rest = d.slice(2).replace(/^0/, '').slice(0, 9); return rest ? '+61 ' + auLocal(rest) : '+61'; }
      return auLocal(d.slice(0, d[0] === '0' || d[0] === '1' ? 10 : 9));
    }
    if (d[0] === '1') { const rest = d.slice(1, 11); return rest ? '+1 ' + nanp(rest) : '+1'; }
    return nanp(d.slice(0, 10));
  }

  // National digits: US/CA 10 digits, AU 10 digits with the trunk 0 (or a 1300/1800 number).
  function nationalDigits(country, raw) {
    let d = digitsOnly(raw);
    if (country === 'AU') {
      if (d.startsWith('61')) d = d.slice(2).replace(/^0/, '');
      if (/^[2-578]\d{8}$/.test(d)) d = '0' + d;
      return d;
    }
    if (d.length === 11 && d[0] === '1') d = d.slice(1);
    return d;
  }

  function isValidPhone(country, raw) {
    const d = nationalDigits(country, raw);
    return country === 'AU' ? /^(0[2-578]\d{8}|1[38]00\d{6})$/.test(d) : /^[2-9]\d{2}[2-9]\d{6}$/.test(d);
  }

  const nationalDisplay = (country, raw) => formatPhone(country, nationalDigits(country, raw));

  function intlPhone(country, raw) {
    const d = nationalDigits(country, raw);
    if (country === 'AU') return '+61 ' + auLocal(d[0] === '0' ? d.slice(1) : d);
    return '+1 ' + nanp(d);
  }

  function isValidEmail(v) {
    v = String(v == null ? '' : v).trim();
    return v.length <= 254 && /^[^\s@]+@([^\s@.]+\.)+[^\s@.]{2,}$/.test(v);
  }

  function isValidName(v) {
    v = cleanText(v);
    return v.length >= 2 && /\p{L}/u.test(v);
  }

  // "sam lee" becomes "Sam Lee". Names typed with any capitals (McDonald, van der Berg) stay as typed.
  function tidyName(v) {
    const t = cleanText(v);
    return t === t.toLowerCase() ? t.replace(/(^|[\s'-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()) : t;
  }

  function firstName(v) {
    const f = cleanText(v).split(' ')[0] || '';
    return f.charAt(0).toUpperCase() + f.slice(1);
  }

  function lerpRange(tiers, x) {
    const last = tiers.length - 1;
    x = Math.max(0, Math.min(last, x));
    const i = Math.min(last, Math.floor(x)), j = Math.min(last, i + 1), f = x - i;
    const top = t => (t[1] == null ? t[0] * 2 : t[1]);
    return [tiers[i][0] + (tiers[j][0] - tiers[i][0]) * f, top(tiers[i]) + (top(tiers[j]) - top(tiers[i])) * f];
  }

  // x is a (possibly fractional) tier index, so the readout can tick between tiers.
  function revenueText(x) {
    const t = Math.round(Math.max(0, Math.min(REVENUE.length - 1, x)));
    const [lo, hi] = lerpRange(REVENUE, x);
    const k = n => '$' + Math.round(n) + 'k';
    if (t === 0) return 'Under ' + k(hi);
    if (t === REVENUE.length - 1) return k(lo) + '+';
    return k(lo) + ' - ' + k(hi);
  }

  function adsText(x) {
    const t = Math.round(Math.max(0, Math.min(ADS.length - 1, x)));
    const [lo, hi] = lerpRange(ADS, x);
    const usd = n => '$' + (Math.round(n / 10) * 10).toLocaleString('en-US');
    if (t === 0) return '$0';
    if (t === 1) return 'Under ' + usd(hi);
    if (t === ADS.length - 1) return usd(lo) + '+';
    return usd(lo) + ' - ' + usd(hi);
  }

  function progressInfo(done) {
    let total = 0, spent = 0;
    Object.keys(WEIGHTS).forEach(k => { total += WEIGHTS[k]; if (done && done[k]) spent += WEIGHTS[k]; });
    return { pct: Math.round((spent / total) * 100), left: total - spent };
  }

  function snapshotReason(top, crew, ads, kind) {
    if (top === 'calls') {
      if (crew === 0) return 'You can\'t answer the phone from a roof. We pick up, book the job and text back every missed call.';
      if (kind === 'urgent') return 'Urgent jobs go to whoever answers first. We answer every call in seconds, day or night.';
      return 'Your crew is busy on the tools. We catch every call so none of that work slips away.';
    }
    if (top === 'maps') {
      return ads === 0
        ? 'No ad budget needed. The top 3 map spots are where locals click first.'
        : 'The top 3 on Google Maps brings in calls you never pay per click for.';
    }
    if (top === 'ai') return 'More locals now ask ChatGPT and Google AI who to call. We make sure it names you.';
    if (ads != null && ads >= 3) return 'You already pay for leads. Automatic follow-ups turn more of those quotes into booked jobs.';
    if (crew != null && crew >= 2) return 'Bigger crews need a steady pipeline. Automatic follow-ups keep the calendar full.';
    return 'Big jobs need a few nudges before a yes. We send them for you so quotes don\'t go cold.';
  }

  // Scores each growth lever from the answers so far and names the top two.
  function growthSnapshot(a) {
    a = a || {};
    const crew = a.employees == null ? null : a.employees;
    const revenue = a.revenue == null ? null : a.revenue;
    const ads = a.ads == null ? null : a.ads;
    const trade = a.trade || null;
    if (crew == null && revenue == null && ads == null && !trade) return null;
    const t = findTrade(trade);
    const kind = t ? t.kind : null;
    const s = { calls: 2, maps: 2, follow: 1, ai: 1 };
    if (crew === 0) s.calls += 3; else if (crew === 1) s.calls += 2; else if (crew === 2) s.calls += 1;
    if (crew != null && crew >= 2) s.follow += 2;
    if (ads === 0) { s.maps += 2; s.ai += 1; } else if (ads === 1) s.maps += 1;
    if (ads != null && ads >= 3) { s.follow += 2; s.calls += 1; }
    if (revenue != null && revenue <= 1) s.maps += 1;
    if (revenue != null && revenue >= 3) s.ai += 1;
    if (revenue != null && revenue >= 4) s.follow += 1;
    if (kind === 'urgent') s.calls += 2;
    if (kind === 'project') { s.follow += 2; s.ai += 1; }
    const rank = FOCUS_ORDER.slice().sort((x, y) => s[y] - s[x] || FOCUS_ORDER.indexOf(x) - FOCUS_ORDER.indexOf(y));
    return { focus: FOCUS[rank[0]] + ' + ' + FOCUS[rank[1]], keys: rank.slice(0, 2), reason: snapshotReason(rank[0], crew, ads, kind) };
  }

  function timestamp(now) {
    let local;
    try {
      local = now.toLocaleString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (zone) local += ' (' + zone + ')';
    } catch (e) {
      local = now.toString();
    }
    return local + '. UTC ' + now.toISOString();
  }

  // Human-readable keys so the lead email is scannable at a glance.
  function buildPayload(d, now, href) {
    const isOther = d.trade === OTHER;
    const typed = cleanText(d.otherTrade);
    const name = tidyName(d.name);
    const email = String(d.email == null ? '' : d.email).trim();
    const country = COUNTRIES[d.country] ? COUNTRIES[d.country].name : String(d.country);
    return {
      _subject: 'New Remotie Tradie Lead: ' + name + ' (' + (isOther ? typed : tradeShort(d.trade)) + ' - ' + country + ')',
      'Full Name': name,
      'Email': email,
      'Country': country,
      'Phone Number': intlPhone(d.country, d.phone),
      'Trade / Service': isOther ? 'Other: ' + typed : d.trade,
      'Employees': d.employees,
      'Monthly Revenue': d.revenue,
      'Monthly Ad Spend': d.ads,
      'Submitted At': timestamp(now),
      'Page URL': href,
      _replyto: email,
      _gotcha: d.gotcha || ''
    };
  }

  const normalizeSearch = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9+]+/g, ' ');

  // Every typed word must match the label or keywords. "Other Trade" always stays available.
  function filterTrades(query) {
    const words = normalizeSearch(query).split(' ').filter(Boolean);
    if (!words.length) return TRADES.slice();
    return TRADES.filter(t => {
      if (t.label === OTHER) return true;
      const hay = normalizeSearch(t.label + ' ' + t.keys);
      return words.every(w => hay.includes(w));
    });
  }

  const CA_ZONES = /^(America\/(Toronto|Montreal|Vancouver|Edmonton|Winnipeg|Regina|Swift_Current|Halifax|Glace_Bay|Moncton|Goose_Bay|St_Johns|Whitehorse|Dawson|Dawson_Creek|Fort_Nelson|Creston|Yellowknife|Inuvik|Cambridge_Bay|Rankin_Inlet|Resolute|Iqaluit|Pangnirtung|Atikokan|Blanc-Sablon|Nipigon|Thunder_Bay|Rainy_River)|Canada\/.+)$/;

  function detectCountry(zone, languages) {
    zone = String(zone || '');
    if (/^Australia\//.test(zone)) return 'AU';
    if (CA_ZONES.test(zone)) return 'CA';
    const langs = (languages || []).join(',');
    if (/-AU\b/i.test(langs)) return 'AU';
    if (/-CA\b/i.test(langs)) return 'CA';
    return 'US';
  }

  /* ---------- Browser wiring ---------- */

  function init() {
    const $ = (sel, root) => (root || document).querySelector(sel);
    const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));
    const html = document.documentElement;
    html.classList.add('js');

    const fontCss = document.getElementById('font-css');
    if (fontCss) fontCss.media = 'all';

    const reduceMq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const reduce = () => reduceMq.matches;
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    $$('[data-year]').forEach(el => { el.textContent = String(new Date().getFullYear()); });

    initReveal();
    if (finePointer && !reduce()) initSpotlight();

    const card = $('#funnel');
    const form = $('#lead-form');
    if (!card || !form) return;

    const steps = $$('.step', form);
    const stepsBox = $('.steps', form);
    const btnBack = $('#btn-back');
    const btnNext = $('#btn-next');
    const btnSubmit = $('#btn-submit');
    const ctaText = $('#cta-text');
    const hint = $('#step-hint');
    const alertBox = $('#submit-alert');
    const alertText = $('#alert-text');
    const privacy = $('#privacy');
    const bar = $('#progress-bar');
    const pctEl = $('#progress-pct');
    const timeEl = $('#progress-time');
    const stepEl = $('#progress-step');
    const gotcha = $('#hp-field');

    const QUIZ = ['employees', 'revenue', 'ads'];
    const KEY = 'remotie-funnel-v1';
    const state = { step: 1, trade: null, other: '', country: 'US', returnTo: 0, sending: false, done: false };
    const touched = { name: false, email: false, phone: false };
    let restoring = false;

    const radios = name => $$('input[name="' + name + '"]', form);
    const checked = name => form.querySelector('input[name="' + name + '"]:checked');
    const indexOf = name => { const c = checked(name); return c ? Number(c.dataset.i) : null; };

    // Exact option text for screen readers (visible labels are shortened).
    $$('.choice input[type="radio"]', form).forEach(r => r.setAttribute('aria-label', r.value));

    /* Spring ticker for the money readouts and the progress percent */
    function ticker(el, format) {
      let x = null, v = 0, target = 0, raf = 0, last = 0;
      function frame(now) {
        const dt = Math.min(0.05, (now - last) / 1000) || 0.016;
        last = now;
        v += (170 * (target - x) - 19 * v) * dt;
        x += v * dt;
        if (Math.abs(target - x) < 0.001 && Math.abs(v) < 0.01) { x = target; raf = 0; } else raf = requestAnimationFrame(frame);
        el.textContent = format(x);
      }
      return function set(t, from) {
        target = t;
        if (x === null) x = from == null ? t : from;
        if (reduce()) { x = t; v = 0; el.textContent = format(t); return; }
        if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
      };
    }

    /* Readouts */
    const readouts = {};
    const crewBox = $('#readout-employees');
    const crewLabel = $('#crew-label');
    const hats = $$('.hats svg', crewBox);
    const crewReact = $('#crew-react');
    readouts.employees = i => {
      crewBox.classList.toggle('is-unset', i == null);
      crewLabel.textContent = i == null ? 'Pick your crew size' : radios('employees')[i].value;
      crewReact.textContent = i == null ? 'Solo or 30+ crew, the plan fits your size.' : CREW_REACT[i];
      hats.forEach((h, j) => h.classList.toggle('on', i != null && j <= i));
    };

    function moneyReadout(boxSel, valueSel, lineSel, format, lines, unsetLine) {
      const box = $(boxSel), value = $(valueSel), line = $(lineSel);
      const segs = $$('.momentum i', box);
      const tick = ticker(value, format);
      return i => {
        const wasUnset = box.classList.contains('is-unset');
        box.classList.toggle('is-unset', i == null);
        segs.forEach((s, j) => s.classList.toggle('on', i != null && j <= i));
        if (i == null) { value.textContent = 'Slide to set'; line.textContent = unsetLine; return; }
        tick(i, wasUnset ? 0 : null);
        line.textContent = lines[i];
      };
    }
    readouts.revenue = moneyReadout('#readout-revenue', '#revenue-value', '#revenue-react', revenueText, REVENUE_REACT, 'Slide or tap a range to see where you stand.');
    readouts.ads = moneyReadout('#readout-ads', '#ads-value', '#ads-feedback', adsText, ADS_FEEDBACK, 'Every answer sharpens your growth plan.');

    /* Sliders: pointer-only visuals. Touch waits for a sideways drag so vertical swipes still scroll. */
    function makeSlider(el, name) {
      const inputs = radios(name), n = inputs.length;
      const track = $('.slider-track', el);
      const ticks = $$('.slider-ticks i', el);
      let drag = null;
      const paint = p => el.style.setProperty('--p', String(Math.round(p * 1000) / 1000));
      function show(i) {
        el.classList.toggle('is-unset', i == null);
        ticks.forEach((t, j) => t.classList.toggle('on', i != null && j <= i));
        if (!(drag && drag.moved)) paint(i == null ? 0 : i / (n - 1));
      }
      function pick(i) {
        const r = inputs[i];
        if (!r || r.checked) return;
        r.checked = true;
        r.dispatchEvent(new Event('change', { bubbles: true }));
        // Haptic tick on Android. Chrome blocks vibrate until the first tap, so check activation first.
        const ua = navigator.userActivation;
        if (drag && drag.moved && navigator.vibrate && ua && ua.hasBeenActive) navigator.vibrate(5);
      }
      const ratio = x => { const r = track.getBoundingClientRect(); return r.width ? Math.min(1, Math.max(0, (x - r.left) / r.width)) : 0; };
      const nearest = x => Math.round(ratio(x) * (n - 1));
      el.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        drag = { id: e.pointerId, x: e.clientX, y: e.clientY, live: e.pointerType === 'mouse', moved: false };
        try { el.setPointerCapture(e.pointerId); } catch (err) { /* capture is optional */ }
        if (drag.live) { e.preventDefault(); pick(nearest(e.clientX)); }
      });
      el.addEventListener('pointermove', e => {
        if (!drag || e.pointerId !== drag.id) return;
        if (!drag.live) {
          const dx = Math.abs(e.clientX - drag.x), dy = Math.abs(e.clientY - drag.y);
          if (dx < 8 || dx <= dy) return;
          drag.live = true;
        }
        if (!drag.moved) { drag.moved = true; el.classList.add('is-dragging'); }
        paint(ratio(e.clientX));
        pick(nearest(e.clientX));
      });
      function end(e, cancelled) {
        if (!drag || e.pointerId !== drag.id) return;
        const tap = !drag.live && !cancelled;
        drag = null;
        el.classList.remove('is-dragging');
        if (tap) pick(nearest(e.clientX));
        show(indexOf(name));
      }
      el.addEventListener('pointerup', e => end(e, false));
      el.addEventListener('pointercancel', e => end(e, true));
      el.addEventListener('lostpointercapture', e => end(e, true));
      return { show };
    }
    const sliders = {};
    QUIZ.forEach(name => {
      const el = $('.slider[data-name="' + name + '"]', form);
      sliders[name] = el ? makeSlider(el, name) : { show() {} };
    });

    /* Auto-advance only after a pointer tap. Arrow keys also fire click on radios. */
    let lastPointerDown = 0;
    let advanceTimer = 0;
    form.addEventListener('pointerdown', e => { if (e.target.closest('.choice')) lastPointerDown = Date.now(); }, true);
    const byPointer = () => Date.now() - lastPointerDown < 900;
    function autoAdvance(from) {
      clearTimeout(advanceTimer);
      advanceTimer = setTimeout(() => { if (state.step === from && !state.done) next(); }, reduce() ? 150 : 420);
    }

    function answered(name) {
      const i = indexOf(name);
      sliders[name].show(i);
      readouts[name](i);
      hint.textContent = '';
      refresh();
    }
    QUIZ.forEach((name, k) => {
      radios(name).forEach(r => {
        r.addEventListener('change', () => answered(name));
        r.addEventListener('click', () => { if (byPointer()) autoAdvance(k + 1); });
      });
    });

    /* Listbox used by the trade search and the country picker */
    function listbox(o) {
      let active = -1;
      const focusEl = o.input || o.list;
      const visible = () => $$('[role="option"]', o.list).filter(li => !li.hidden);
      const isOpen = () => !o.panel.hidden;
      function setActive(i, scroll) {
        const opts = visible();
        $$('[role="option"].is-active', o.list).forEach(li => li.classList.remove('is-active'));
        if (!opts.length) { active = -1; focusEl.removeAttribute('aria-activedescendant'); return; }
        active = ((i % opts.length) + opts.length) % opts.length;
        const li = opts[active];
        li.classList.add('is-active');
        focusEl.setAttribute('aria-activedescendant', li.id);
        if (scroll !== false) li.scrollIntoView({ block: 'nearest' });
      }
      function outside(e) { if (!o.panel.contains(e.target) && !o.trigger.contains(e.target)) close(false); }
      function open(focusInside) {
        if (isOpen()) return;
        o.panel.hidden = false;
        o.trigger.setAttribute('aria-expanded', 'true');
        if (o.onOpen) o.onOpen();
        const opts = visible();
        const sel = opts.findIndex(li => li.getAttribute('aria-selected') === 'true');
        // On touch, a highlighted first row reads as "already picked", so only highlight for keyboard and mouse.
        if (focusInside || sel >= 0) setActive(sel < 0 ? 0 : sel);
        else active = -1;
        if (focusInside) focusEl.focus({ preventScroll: true });
        document.addEventListener('pointerdown', outside, true);
      }
      function close(refocus) {
        if (!isOpen()) return;
        o.panel.hidden = true;
        o.trigger.setAttribute('aria-expanded', 'false');
        focusEl.removeAttribute('aria-activedescendant');
        document.removeEventListener('pointerdown', outside, true);
        if (refocus) o.trigger.focus({ preventScroll: true });
      }
      function pick(li, viaPointer) { const v = li.dataset.value; close(true); o.onPick(v, viaPointer); }
      // detail 0 means keyboard activation: move focus inside. On touch, skip it so the keyboard stays down.
      o.trigger.addEventListener('click', e => { if (isOpen()) close(false); else open(e.detail === 0 || finePointer || !o.input); });
      o.trigger.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(true); }
      });
      focusEl.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
        else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); const li = visible()[active]; if (li) pick(li, false); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
        else if (e.key === 'Tab') close(false);
        else if (!o.input && (e.key === 'Home' || e.key === 'End')) { e.preventDefault(); setActive(e.key === 'Home' ? 0 : -1); }
      });
      o.list.addEventListener('click', e => { const li = e.target.closest('[role="option"]'); if (li) pick(li, true); });
      o.list.addEventListener('pointermove', e => {
        const li = e.target.closest('[role="option"]');
        if (!li) return;
        const i = visible().indexOf(li);
        if (i !== active) setActive(i, false);
      });
      return { setActive, close };
    }

    /* Step 4: trade tiles + searchable list */
    const tiles = radios('trade');
    const tileValues = tiles.map(t => t.value);
    const tradeTrigger = $('#trade-trigger');
    const tradeValue = $('#trade-value');
    const tradePanel = $('#trade-panel');
    const tradeSearch = $('#trade-search');
    const tradeList = $('#trade-list');
    const tradeEmpty = $('#trade-empty');
    const otherWrap = $('#other-wrap');
    const otherInput = $('#other-trade');
    const otherMsg = $('#other-msg');

    TRADES.forEach((t, i) => {
      const li = document.createElement('li');
      li.id = 'trade-opt-' + i;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', 'false');
      li.dataset.value = t.label;
      li.textContent = t.label;
      tradeList.appendChild(li);
    });
    const tradeOptions = $$('[role="option"]', tradeList);

    function filterList(q) {
      const shown = new Set(filterTrades(q).map(t => t.label));
      tradeOptions.forEach(li => { li.hidden = !shown.has(li.dataset.value); });
      const none = cleanText(q) && shown.size === 1;
      tradeEmpty.hidden = !none;
      if (none) tradeEmpty.textContent = 'No match for "' + cleanText(q) + '". Pick Other Trade below and we will use what you typed.';
    }

    function setTrade(label, prefill) {
      state.trade = label;
      tiles.forEach(t => { t.checked = t.value === label; });
      const fromList = !!label && tileValues.indexOf(label) === -1;
      tradeValue.textContent = fromList ? label : 'Search all trades';
      tradeTrigger.classList.toggle('has-value', fromList);
      tradeOptions.forEach(li => li.setAttribute('aria-selected', String(li.dataset.value === label)));
      const isOther = label === OTHER;
      otherWrap.hidden = !isOther;
      if (isOther && prefill && !cleanText(otherInput.value)) { otherInput.value = prefill.slice(0, 60); state.other = otherInput.value; }
      if (!isOther) otherMsg.textContent = '';
      hint.textContent = '';
      refresh();
    }

    tiles.forEach(t => {
      t.addEventListener('change', () => { if (t.checked) setTrade(t.value); });
      t.addEventListener('click', () => { if (byPointer()) autoAdvance(4); });
    });

    const tradeBox = listbox({
      trigger: tradeTrigger,
      panel: tradePanel,
      list: tradeList,
      input: tradeSearch,
      onOpen: () => { tradeSearch.value = ''; filterList(''); },
      onPick: (value, viaPointer) => {
        setTrade(value, value === OTHER ? cleanText(tradeSearch.value) : '');
        if (value === OTHER) setTimeout(() => otherInput.focus(), 40);
        else if (viaPointer) autoAdvance(4);
      }
    });
    tradeSearch.addEventListener('input', () => { filterList(tradeSearch.value); tradeBox.setActive(0); });
    otherInput.addEventListener('input', () => {
      state.other = otherInput.value;
      if (cleanText(otherInput.value).length >= 2) otherMsg.textContent = '';
      refresh();
    });

    /* Step 5: contact fields */
    const phoneEl = $('#phone');
    const phoneGroup = $('.phone-group', form);
    const fields = {
      name: { el: $('#full-name'), ok: v => isValidName(v), msg: () => 'Enter your full name so we know who to ask for.' },
      email: { el: $('#email'), ok: v => isValidEmail(v), msg: () => 'That email doesn\'t look right. Check it for typos.' },
      phone: { el: phoneEl, ok: v => isValidPhone(state.country, v), msg: () => COUNTRIES[state.country].hint }
    };
    const msgs = { name: $('#name-msg'), email: $('#email-msg'), phone: $('#phone-msg') };

    function validate(key) {
      const f = fields[key];
      const ok = f.ok(f.el.value);
      const wrap = key === 'phone' ? phoneGroup : f.el.closest('.field');
      const showErr = touched[key] && !ok;
      wrap.classList.toggle('is-valid', ok);
      wrap.classList.toggle('is-invalid', showErr);
      f.el.setAttribute('aria-invalid', String(showErr));
      const text = showErr ? f.msg() : '';
      if (msgs[key].textContent !== text) msgs[key].textContent = text;
      return ok;
    }

    // Keeps the caret next to the same digit while the mask adds brackets, spaces and dashes.
    function maskPhone() {
      const pos = phoneEl.selectionStart == null ? phoneEl.value.length : phoneEl.selectionStart;
      const before = digitsOnly(phoneEl.value.slice(0, pos)).length;
      const out = formatPhone(state.country, phoneEl.value);
      if (out !== phoneEl.value) phoneEl.value = out;
      let i = 0, seen = 0;
      while (i < out.length && seen < before) { if (/\d/.test(out[i])) seen++; i++; }
      if (document.activeElement === phoneEl) { try { phoneEl.setSelectionRange(i, i); } catch (e) { /* not focusable */ } }
    }

    // Backspace right after a bracket, space or dash removes the digit before it instead of getting stuck.
    phoneEl.addEventListener('beforeinput', e => {
      if (e.inputType !== 'deleteContentBackward') return;
      const s = phoneEl.selectionStart, end = phoneEl.selectionEnd, v = phoneEl.value;
      if (s == null || s !== end || s === 0 || /\d/.test(v[s - 1])) return;
      let j = s - 1;
      while (j > 0 && !/\d/.test(v[j - 1])) j--;
      if (j === 0) return;
      e.preventDefault();
      phoneEl.value = v.slice(0, j - 1) + v.slice(s);
      phoneEl.setSelectionRange(j - 1, j - 1);
      maskPhone();
      validate('phone');
      refresh();
    });

    Object.keys(fields).forEach(key => {
      const el = fields[key].el;
      el.addEventListener('input', () => {
        if (key === 'phone') maskPhone();
        validate(key);
        refresh();
      });
      el.addEventListener('blur', () => {
        if (el.value.trim()) touched[key] = true;
        if (key === 'phone' && isValidPhone(state.country, el.value)) el.value = nationalDisplay(state.country, el.value);
        validate(key);
      });
    });

    const countryTrigger = $('#country-trigger');
    const countryList = $('#country-list');
    const countryFlag = $('#country-flag');
    const countryDial = $('#country-dial');
    function setCountry(code) {
      const c = COUNTRIES[code];
      if (!c) return;
      state.country = code;
      countryFlag.setAttribute('href', '#flag-' + code.toLowerCase());
      countryDial.textContent = c.dial;
      countryTrigger.setAttribute('aria-label', 'Country: ' + c.name + ', ' + c.dial);
      $$('[role="option"]', countryList).forEach(li => li.setAttribute('aria-selected', String(li.dataset.value === code)));
      phoneEl.placeholder = c.placeholder;
      if (phoneEl.value) phoneEl.value = formatPhone(code, phoneEl.value);
      validate('phone');
      refresh();
    }
    listbox({
      trigger: countryTrigger,
      panel: countryList,
      list: countryList,
      onPick: value => { setCountry(value); phoneEl.focus({ preventScroll: true }); }
    });

    /* Recap on step 5 */
    const recapTrade = $('#recap-trade');
    const recapCrew = $('#recap-crew');
    const recapRevenue = $('#recap-revenue');
    function tradeDisplay() {
      if (!state.trade) return 'Trade';
      if (state.trade === OTHER) return cleanText(state.other) || 'Other';
      return tradeShort(state.trade);
    }
    function updateRecap() {
      const crew = checked('employees'), revenue = checked('revenue');
      recapTrade.textContent = tradeDisplay();
      recapCrew.textContent = crew ? crew.value : 'Crew size';
      recapRevenue.textContent = revenue ? revenue.value : 'Revenue';
    }
    $$('[data-goto]', form).forEach(b => b.addEventListener('click', () => {
      state.returnTo = b.hasAttribute('data-return') ? 5 : 0;
      goTo(Number(b.dataset.goto));
    }));

    /* Growth snapshot */
    const snapBox = $('#snapshot');
    const snapFocus = $('#snap-focus');
    const snapWhy = $('#snap-why');
    function updateSnapshot() {
      const s = growthSnapshot({ employees: indexOf('employees'), revenue: indexOf('revenue'), ads: indexOf('ads'), trade: state.trade });
      const focus = s ? s.focus : 'Tap your answers to build it';
      const why = s ? s.reason : 'We will show your biggest growth win as you go.';
      if (snapFocus.textContent === focus && snapWhy.textContent === why) return;
      const changed = snapFocus.textContent !== focus;
      snapFocus.textContent = focus;
      snapWhy.textContent = why;
      if (changed && !reduce()) { snapBox.classList.remove('is-updated'); void snapBox.offsetWidth; snapBox.classList.add('is-updated'); }
    }

    /* Progress */
    const pctTick = ticker(pctEl, x => Math.round(Math.max(0, Math.min(100, x))) + '%');
    const tradeDone = () => !!state.trade && (state.trade !== OTHER || cleanText(state.other).length >= 2);
    function updateProgress() {
      const info = progressInfo({
        employees: indexOf('employees') != null,
        revenue: indexOf('revenue') != null,
        ads: indexOf('ads') != null,
        trade: tradeDone(),
        name: fields.name.ok(fields.name.el.value),
        email: fields.email.ok(fields.email.el.value),
        phone: fields.phone.ok(phoneEl.value)
      });
      bar.style.setProperty('--p', String(info.pct / 100));
      bar.setAttribute('aria-valuenow', String(info.pct));
      bar.setAttribute('aria-valuetext', info.left ? info.pct + '% complete, about ' + info.left + ' seconds left' : '100% complete, ready to send');
      pctTick(info.pct);
      timeEl.textContent = info.left ? info.left + ' seconds left' : 'Ready to send';
      stepEl.textContent = 'Step ' + state.step + ' of 5';
    }

    function refresh() {
      updateSnapshot();
      updateProgress();
      updateRecap();
      // Pin Next to the thumb zone only once they have started, so it never covers the first question.
      card.classList.toggle('is-engaged', state.step > 1 || indexOf('employees') != null);
      save();
    }

    /* Navigation */
    function nudge(n, text) {
      hint.textContent = text;
      const target = $('.choices, .tiles', steps[n - 1]);
      if (target && !reduce()) { target.classList.remove('shake'); void target.offsetWidth; target.classList.add('shake'); }
    }

    function contactValid(show) {
      let first = null;
      ['name', 'email', 'phone'].forEach(k => {
        if (show) touched[k] = true;
        if (!validate(k) && !first) first = fields[k].el;
      });
      if (first && show) first.focus();
      return !first;
    }

    function stepValid(n, show) {
      if (n <= 3) {
        const ok = indexOf(QUIZ[n - 1]) != null;
        if (!ok && show) nudge(n, 'Pick one to keep going.');
        return ok;
      }
      if (n === 4) {
        if (!state.trade) { if (show) nudge(4, 'Pick your trade to keep going.'); return false; }
        if (!tradeDone()) {
          if (show) { otherMsg.textContent = 'Type your trade so we know who we are talking to.'; otherInput.focus(); }
          return false;
        }
        return true;
      }
      return contactValid(show);
    }

    const headerHeight = () => { const h = $('.topbar'); return h ? h.offsetHeight : 0; };
    const stacked = window.matchMedia('(max-width: 999px)');
    // Desktop: only scroll back if the card top went out of view. Phones: park the card under the header
    // so the next question and its controls sit in view above the pinned Next button.
    function keepCardInView() {
      const top = card.getBoundingClientRect().top - headerHeight() - 12;
      if (top < 0 || (stacked.matches && top > 24)) window.scrollBy({ top, behavior: reduce() ? 'auto' : 'smooth' });
    }

    function goTo(n, instant) {
      if (n < 1 || n > 5 || (n === state.step && !instant)) return;
      clearTimeout(advanceTimer);
      state.step = n;
      if (instant) stepsBox.classList.add('no-anim');
      steps.forEach((s, i) => {
        const k = i + 1;
        s.classList.toggle('is-active', k === n);
        s.classList.toggle('is-before', k < n);
        s.inert = k !== n;
      });
      if (instant) { void stepsBox.offsetWidth; stepsBox.classList.remove('no-anim'); }
      btnBack.hidden = n === 1;
      btnNext.hidden = n === 5;
      btnSubmit.hidden = n !== 5;
      privacy.hidden = n !== 5;
      hint.textContent = '';
      if (n !== 5) alertBox.hidden = true;
      updateProgress();
      save();
      if (instant) return;
      const q = $('.q', steps[n - 1]);
      if (q) q.focus({ preventScroll: true });
      keepCardInView();
    }

    function next() {
      if (state.done || state.sending) return;
      if (!stepValid(state.step, true)) return;
      if (state.step === 5) { submit(); return; }
      if (state.returnTo) { const t = state.returnTo; state.returnTo = 0; goTo(t); return; }
      goTo(state.step + 1);
    }

    function back() {
      state.returnTo = 0;
      goTo(state.step - 1);
    }

    btnNext.addEventListener('click', next);
    btnBack.addEventListener('click', back);
    form.addEventListener('submit', e => { e.preventDefault(); next(); });
    form.addEventListener('keydown', e => {
      if (e.key !== 'Enter' || e.isComposing || e.defaultPrevented) return;
      const t = e.target;
      if (t.closest('button, a, [role="combobox"], [role="listbox"]')) return;
      e.preventDefault();
      if (state.step === 5 && t === fields.name.el) { fields.email.el.focus(); return; }
      if (state.step === 5 && t === fields.email.el) { phoneEl.focus(); return; }
      next();
    });

    /* Submit to Formspree */
    function setBusy(on) {
      btnSubmit.disabled = on;
      btnSubmit.setAttribute('aria-busy', String(on));
      btnBack.disabled = on;
      ctaText.textContent = on ? 'Locking in your slot...' : 'Submit & Schedule your slot';
    }

    function errorText(err) {
      if (err && err.name === 'AbortError') return 'The connection timed out. Check your signal and tap the button again. Your answers are still here.';
      if (navigator.onLine === false) return 'You look to be offline. Reconnect and tap the button again. Your answers are still here.';
      if (err && err.status >= 400 && err.status < 500 && err.detail) return 'We could not send that: ' + err.detail + ' Fix it and tap the button again.';
      return 'We could not send your details just now. Tap the button to try again. Your answers are still here.';
    }

    async function submit() {
      if (state.sending || state.done) return;
      for (let n = 1; n <= 4; n++) {
        if (!stepValid(n, false)) { goTo(n); stepValid(n, true); return; }
      }
      if (!stepValid(5, true)) return;
      state.sending = true;
      setBusy(true);
      alertBox.hidden = true;
      const data = {
        name: fields.name.el.value,
        email: fields.email.el.value,
        country: state.country,
        phone: phoneEl.value,
        trade: state.trade,
        otherTrade: state.other,
        employees: checked('employees').value,
        revenue: checked('revenue').value,
        ads: checked('ads').value,
        gotcha: gotcha ? gotcha.value : ''
      };
      const payload = buildPayload(data, new Date(), window.location.href);
      const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = setTimeout(() => { if (ctrl) ctrl.abort(); }, 15000); // weak 4G should fail loudly, not spin forever
      try {
        const res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: ctrl ? ctrl.signal : undefined
        });
        let body = null;
        try { body = await res.json(); } catch (e) { body = null; }
        if (!res.ok) {
          const err = new Error('Formspree responded ' + res.status);
          err.status = res.status;
          if (body && Array.isArray(body.errors)) {
            err.detail = body.errors.map(x => x && (x.field ? x.field + ' ' : '') + (x && x.message ? x.message : '')).filter(Boolean).join('. ');
          } else if (body && body.error) {
            err.detail = String(body.error);
          }
          if (err.detail && !/[.!?]$/.test(err.detail)) err.detail += '.';
          throw err;
        }
        showSuccess(data, payload);
      } catch (err) {
        alertText.textContent = errorText(err);
        alertBox.hidden = false;
      } finally {
        clearTimeout(timer);
        state.sending = false;
        if (!state.done) setBusy(false);
      }
    }
    $('#alert-retry').addEventListener('click', () => submit());

    function burst() {
      const box = $('#burst');
      if (!box) return;
      const colors = ['#FF5E00', '#FF7A29', '#00F078', '#39FF14', '#F8FAFC'];
      for (let i = 0; i < 26; i++) {
        const p = document.createElement('i');
        const angle = (i / 26) * Math.PI * 2 + Math.random() * 0.4;
        const dist = 60 + Math.random() * 70;
        p.style.setProperty('--x', (Math.cos(angle) * dist).toFixed(1) + 'px');
        p.style.setProperty('--y', (Math.sin(angle) * dist).toFixed(1) + 'px');
        p.style.setProperty('--s', (4 + Math.random() * 5).toFixed(1) + 'px');
        p.style.setProperty('--c', colors[i % colors.length]);
        p.style.setProperty('--d', (0.55 + Math.random() * 0.25).toFixed(2) + 's');
        box.appendChild(p);
      }
    }

    function showSuccess(data, payload) {
      state.done = true;
      try { sessionStorage.removeItem(KEY); } catch (e) { /* storage blocked */ }
      const out = {
        first: firstName(data.name),
        trade: payload['Trade / Service'],
        crew: data.employees,
        revenue: data.revenue,
        ads: data.ads,
        name: payload['Full Name'],
        email: payload['Email'],
        phone: payload['Phone Number']
      };
      $$('[data-out]', card).forEach(el => { el.textContent = out[el.dataset.out] || ''; });
      const view = $('#success');
      view.hidden = false;
      void view.offsetWidth; // start from the hidden styles so the morph animates
      card.classList.add('is-done');
      form.inert = true;
      if (!reduce()) burst();
      view.focus({ preventScroll: true });
      keepCardInView();
    }

    /* Magnetic CTA (mouse only) */
    if (finePointer) {
      let rect = null;
      btnSubmit.addEventListener('pointerenter', () => { rect = btnSubmit.getBoundingClientRect(); });
      btnSubmit.addEventListener('pointermove', e => {
        if (!rect || reduce() || btnSubmit.disabled) return;
        const mx = (e.clientX - rect.left) / rect.width - 0.5;
        const my = (e.clientY - rect.top) / rect.height - 0.5;
        btnSubmit.style.setProperty('--mx', (mx * 10).toFixed(1) + 'px');
        btnSubmit.style.setProperty('--my', (my * 6).toFixed(1) + 'px');
      });
      btnSubmit.addEventListener('pointerleave', () => {
        rect = null;
        btnSubmit.style.setProperty('--mx', '0px');
        btnSubmit.style.setProperty('--my', '0px');
      });
    }

    /* Saved progress: steps 1 to 4 only (no personal details), cleared after a successful send */
    function save() {
      if (state.done || restoring) return;
      try {
        sessionStorage.setItem(KEY, JSON.stringify({
          step: state.step,
          employees: indexOf('employees'),
          revenue: indexOf('revenue'),
          ads: indexOf('ads'),
          trade: state.trade,
          other: state.other,
          country: state.country
        }));
      } catch (e) { /* private mode or storage blocked: the form still works */ }
    }

    function restore() {
      let s = null;
      try { s = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) { s = null; }
      if (!s || typeof s !== 'object') return;
      restoring = true;
      QUIZ.forEach(name => {
        const r = Number.isInteger(s[name]) ? radios(name)[s[name]] : null;
        if (r) { r.checked = true; answered(name); }
      });
      if (typeof s.other === 'string') { otherInput.value = s.other.slice(0, 60); state.other = otherInput.value; }
      if (findTrade(s.trade)) setTrade(s.trade);
      if (COUNTRIES[s.country]) setCountry(s.country);
      restoring = false;
      let target = Math.min(5, Math.max(1, Number(s.step) || 1));
      for (let n = 1; n < target; n++) { if (!stepValid(n, false)) { target = n; break; } }
      if (target !== 1) goTo(target, true);
    }

    let zone = '';
    try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { zone = ''; }
    restoring = true;
    setCountry(detectCountry(zone, navigator.languages || [navigator.language]));
    restoring = false;
    restore();
    refresh();
  }

  function initReveal() {
    const items = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
    if (!items.length || !('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => { if (en.isIntersecting) { en.target.classList.remove('is-pending'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -10% 0px' });
    // Only hide what starts below the fold, so nothing on screen ever blinks.
    items.forEach(el => { if (el.getBoundingClientRect().top > window.innerHeight) { el.classList.add('is-pending'); io.observe(el); } });
  }

  function initSpotlight() {
    const spot = document.querySelector('.spot');
    if (!spot) return;
    let x = 0, y = 0, queued = false;
    window.addEventListener('pointermove', e => {
      x = e.clientX;
      y = e.clientY;
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; spot.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)'; });
    }, { passive: true });
    document.documentElement.classList.add('has-spot');
  }

  const api = {
    ENDPOINT, TRADES, COUNTRIES, WEIGHTS,
    formatPhone, nationalDigits, isValidPhone, intlPhone,
    isValidEmail, isValidName, firstName, tidyName,
    revenueText, adsText, progressInfo, growthSnapshot,
    buildPayload, filterTrades, detectCountry
  };
  if (typeof module === 'object' && module.exports) module.exports = api;

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }
})();
