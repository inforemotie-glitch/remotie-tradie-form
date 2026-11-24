/*
  Remotie lead funnel for Trade & Home Service Businesses.
  Plain browser script: no build step, no dependencies.
  The pure helpers at the top are shared: tests/ and api/submit-lead.js require this file,
  so keep that part free of window and document. The DOM wiring in init() only runs in a browser.
*/
(function () {
  'use strict';

  const API_ENDPOINT = '/api/submit-lead';
  const FORMSPREE_ENDPOINT = 'https://formspree.io/f/xdeglzdo';
  const OTHER = 'Other Trade';
  const MIN_FILL_MS = 2000; // a human cannot answer five steps faster than this. The server treats faster submits as bots.

  // label: exact value sent to Remotie. short: tiles, recap and email subject.
  // vertical: what the trade earns most from, which flavours the Growth Snapshot insight.
  // keys: extra search words, including US, Canadian and Australian slang.
  const TRADES = [
    { label: 'Appliance Repair', vertical: 'emergency', keys: 'appliance washer dryer oven dishwasher fridge repair' },
    { label: 'Bricklaying & Masonry', short: 'Bricklaying', vertical: 'project', keys: 'brickie bricklayer brick mason masonry stone block retaining wall' },
    { label: 'Cabinetry & Joinery', short: 'Cabinetry', vertical: 'project', keys: 'cabinet cabinets cabinet maker joiner joinery kitchens' },
    { label: 'Carpentry / Carpenter', short: 'Carpentry', vertical: 'project', keys: 'carpenter chippy chippie framing framer trim finish carpentry' },
    { label: 'Concrete & Paving', short: 'Concrete', vertical: 'project', keys: 'concreter concrete paving pavers driveway driveways asphalt slab' },
    { label: 'Demolition', vertical: 'project', keys: 'demo demolition strip out' },
    { label: 'Electrician / Electrical', short: 'Electrical', vertical: 'emergency', keys: 'electrician sparky sparkie electrical wiring power lighting ev charger' },
    { label: 'Excavation & Earthmoving', short: 'Excavation', vertical: 'project', keys: 'excavator excavation earthmoving digger bobcat site prep grading' },
    { label: 'Fencing & Decking', short: 'Fencing', vertical: 'project', keys: 'fencer fencing fence fences decking deck decks pergola gates' },
    { label: 'Foundation Repair', vertical: 'project', keys: 'foundation foundations underpinning restumping slab repair' },
    { label: 'Garage Door Services', short: 'Garage Doors', vertical: 'emergency', keys: 'garage door doors opener openers roller' },
    { label: 'General Contracting & Remodeling', short: 'General Contracting', vertical: 'project', keys: 'builder builders building general contractor gc remodeling remodelling remodel renovation renovations reno construction' },
    { label: 'Glass & Glazing', short: 'Glazing', vertical: 'emergency', keys: 'glazier glass glazing windows window shower screens' },
    { label: 'Gutter Installation & Cleaning', short: 'Gutters', vertical: 'recurring', keys: 'gutter gutters guttering downpipes downspouts leaf guard' },
    { label: 'Handyman Services', short: 'Handyman', vertical: 'recurring', keys: 'handyman handy man odd jobs maintenance property maintenance' },
    { label: 'HVAC (Heating, Ventilation & Air Conditioning)', short: 'HVAC', vertical: 'hvac', keys: 'hvac heating cooling air conditioning aircon air con ac furnace heat pump ducting ducted ventilation' },
    { label: 'Insulation', vertical: 'project', keys: 'insulation insulate spray foam batts' },
    { label: 'Irrigation & Sprinklers', short: 'Irrigation', vertical: 'recurring', keys: 'irrigation sprinkler sprinklers reticulation retic' },
    { label: 'Landscaping & Lawn Care', short: 'Landscaping', vertical: 'recurring', keys: 'landscaper landscaping gardener gardening lawn lawns mowing yard hardscape turf' },
    { label: 'Locksmith', vertical: 'emergency', keys: 'locksmith locks keys lockout' },
    { label: 'Painting & Decorating', short: 'Painting', vertical: 'project', keys: 'painter painters painting decorator decorating' },
    { label: 'Pest Control', vertical: 'recurring', keys: 'pest pests exterminator termites rodents bugs' },
    { label: 'Plastering & Drywall', short: 'Plastering', vertical: 'project', keys: 'plasterer plaster drywall gyprock sheetrock render rendering' },
    { label: 'Plumbing', vertical: 'emergency', keys: 'plumber plumbers plumbing drains gas fitter gasfitter gasfitting hot water leak leaks blocked' },
    { label: 'Pool Building & Maintenance', short: 'Pools', vertical: 'recurring', keys: 'pool pools spa spas pool builder pool service pool cleaning' },
    { label: 'Pressure Washing & Exterior Cleaning', short: 'Pressure Washing', vertical: 'recurring', keys: 'pressure washing power washing soft wash exterior cleaning window cleaning' },
    { label: 'Refrigeration', vertical: 'hvac', keys: 'refrigeration fridgie cool room cold room commercial fridge freezer' },
    { label: 'Roofing', vertical: 'roof', keys: 'roofer roofers roof roofing shingles metal roof reroof re-roof' },
    { label: 'Siding & Cladding', short: 'Siding', vertical: 'roof', keys: 'siding cladding exterior' },
    { label: 'Solar Installation', short: 'Solar', vertical: 'project', keys: 'solar panels battery batteries installer pv' },
    { label: 'Tiling & Flooring', short: 'Tiling', vertical: 'project', keys: 'tiler tilers tiling tiles flooring floors timber floors carpet vinyl laminate' },
    { label: 'Tree Services / Arborist', short: 'Tree Services', vertical: 'general', keys: 'arborist tree trees lopping removal stump grinding' },
    { label: 'Water Damage & Restoration', short: 'Restoration', vertical: 'emergency', keys: 'water damage restoration flood mould mold' },
    { label: 'Waterproofing', vertical: 'project', keys: 'waterproofing waterproofer membrane' },
    { label: 'Welding & Fabrication', short: 'Welding', vertical: 'project', keys: 'welder welding fabrication fabricator steel' },
    { label: OTHER, short: 'Other', vertical: 'general', keys: 'other something else not listed' }
  ];

  // Exact answer labels. The radio buttons in index.html use the same strings (a test checks they match).
  const OPTIONS = {
    employees: ['Just Me (Solo Operator)', '2 - 5 Crew', '6 - 15 Crew', '16 - 30 Crew', '30+ Crew'],
    revenue: ['Under $10k / mo', '$10k - $25k / mo', '$25k - $50k / mo', '$50k - $100k / mo', '$100k - $250k / mo', '$250k+ / mo'],
    ads: ['$0 (Word of Mouth Only)', 'Under $1,000 / mo', '$1,000 - $3,000 / mo', '$3,000 - $7,500 / mo', '$7,500 - $15,000 / mo', '$15,000+ / mo']
  };

  const COUNTRIES = {
    US: { name: 'United States', dial: '+1', placeholder: '(555) 123-4567', hint: 'Enter a 10-digit number, like (415) 555-0123.' },
    CA: { name: 'Canada', dial: '+1', placeholder: '(555) 123-4567', hint: 'Enter a 10-digit number, like (604) 555-0187.' },
    AU: { name: 'Australia', dial: '+61', placeholder: '0412 345 678', hint: 'Enter a mobile or landline, like 0412 345 678.' }
  };

  const REVENUE = [[0, 10], [10, 25], [25, 50], [50, 100], [100, 250], [250, null]]; // $k per month
  const ADS = [[0, 0], [0, 1000], [1000, 3000], [3000, 7500], [7500, 15000], [15000, null]]; // $ per month

  const CREW_REACT = [
    'Running solo, your time is the limit. Systems have to do the selling for you.',
    'Small crew, big workload. A predictable pipeline keeps everyone on paid work.',
    'A crew this size needs a full calendar every week, not just in peak season.',
    'Big crew. Idle days get expensive fast, so demand has to be steady.',
    'Serious operation. Margin per job and multi-area demand matter most now.'
  ];

  const REVENUE_REACT = [
    'Room to grow fast. A steady flow of local jobs changes everything here.',
    'Solid base. You are ready for a more predictable flow of jobs.',
    'Strong numbers. Time to plug the gaps that leak revenue.',
    'Busy operation. The right systems keep margins healthy as you grow.',
    'Big operation. Protecting margin and pipeline is the priority now.',
    'Market leader territory. We help you stay on top.'
  ];

  const ADS_FEEDBACK = [
    'Good news. Google Maps and AI search can build steady demand without paying for ads.',
    'Lean spend. We make every dollar traceable to a booked job before scaling anything.',
    'We track cost per booked job so more of that spend turns into signed work.',
    'We help plug the leaks so every ad dollar turns into booked jobs.',
    'At this spend, cost per booked job is the number that matters. We make it visible.',
    'Big budget. Profit tracking shows which channels earn, so you scale only those.'
  ];

  // Seconds each answer takes. They add up to the 45 seconds promised on the page.
  const WEIGHTS = { employees: 6, revenue: 6, ads: 6, trade: 6, name: 7, email: 8, phone: 6 };

  /* ---------- Growth Snapshot engine ---------- */

  // The four Remotie pillars, in display order.
  const PILLARS = {
    ops: { name: 'AI Engineered 360° Solutions', short: 'AI Solutions' },
    profit: { name: 'Profit-First Marketing Engine', short: 'Profit Engine' },
    gbp: { name: 'Google Business Profile Optimization', short: 'Google Maps' },
    aeo: { name: 'AEO/GEO - Generative Search Authority', short: 'AI Search' }
  };
  const PILLAR_ORDER = ['ops', 'profit', 'gbp', 'aeo'];

  // The work each trade vertical earns most from, used to flavour the insight line.
  const VERTICAL_JOBS = {
    hvac: 'seasonal service and install jobs',
    roof: 'storm and replacement jobs',
    emergency: 'emergency and commercial jobs',
    project: 'high-value projects',
    recurring: 'repeat service jobs',
    general: 'high-margin local jobs'
  };

  const capitalise = s => s.charAt(0).toUpperCase() + s.slice(1);

  // Each lever names the two pillars that move revenue fastest for that situation.
  const LEVERS = {
    organic: {
      name: 'Organic Map Pack + AI Search Capture',
      stack: ['gbp', 'aeo'],
      insight: jobs => `Turn Google Maps and AI search into a zero-ad-waste demand engine for ${jobs}, while AI handles quoting and reviews.`
    },
    adProfit: {
      name: 'Ad-to-Profit Attribution Overhaul',
      stack: ['profit', 'ops'],
      insight: jobs => `You already pay for traffic. Profit tracking finds the leaks, and automated estimate follow-up turns more clicks into signed ${jobs}.`
    },
    quote: {
      name: 'Faster Quotes, Nonstop Deal Flow',
      stack: ['ops', 'gbp'],
      insight: jobs => `${capitalise(jobs)} are won on speed. AI sends every estimate fast and follows up until the customer says yes or no.`
    },
    multiCrew: {
      name: 'Multi-Crew Demand Engine',
      stack: ['gbp', 'aeo'],
      insight: jobs => `Own the Map Pack and AI answers in every zip code or postcode you serve, while 360° AI solutions keep each crew booked with ${jobs} at a higher average job value.`
    },
    reactivation: {
      name: 'Database Reactivation & High-Ticket Expansion',
      stack: ['ops', 'aeo'],
      insight: jobs => `Your past customers are your cheapest revenue. AI reactivation and higher-ticket offers lift what you earn from ${jobs} without more ad spend.`
    }
  };

  // How strongly each answer points at each pillar. Indexes follow OPTIONS.
  const CREW_WEIGHT = [{ ops: 2, gbp: 1 }, { ops: 2, gbp: 1 }, { ops: 2, profit: 1 }, { gbp: 2, aeo: 1, ops: 1 }, { gbp: 2, aeo: 2, ops: 1 }];
  const REVENUE_WEIGHT = [{ gbp: 2, aeo: 1 }, { gbp: 2, ops: 1 }, { ops: 1, profit: 1 }, { profit: 1, ops: 1, aeo: 1 }, { aeo: 2, ops: 1 }, { aeo: 2, ops: 1, profit: 1 }];
  const ADS_WEIGHT = [{ gbp: 3, aeo: 2 }, { gbp: 2, aeo: 1 }, { profit: 2, ops: 1 }, { profit: 3, ops: 1 }, { profit: 4, ops: 1 }, { profit: 5, ops: 1 }];
  const VERTICAL_WEIGHT = { hvac: { ops: 1, gbp: 1 }, roof: { gbp: 1, profit: 1 }, emergency: { gbp: 2 }, project: { ops: 2, aeo: 1 }, recurring: { ops: 2 }, general: {} };

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

  // RFC 5322 "atext" local part and a dotted hostname. No spaces, quotes or line breaks can reach an email header.
  const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]{1,64}@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;

  function isValidEmail(v) {
    v = String(v == null ? '' : v).trim();
    if (v.length > 254 || !EMAIL_RE.test(v)) return false;
    const local = v.split('@')[0];
    return local[0] !== '.' && local[local.length - 1] !== '.' && local.indexOf('..') === -1;
  }

  // Letters (any language), spaces, apostrophes, dots and hyphens. No digits and no "word.word",
  // so a name can never smuggle a link or domain into the confirmation email ("J. Smith" is fine).
  function isValidName(v) {
    v = cleanText(v);
    return v.length >= 2 && v.length <= 80 && /^[\p{L}\p{M}][\p{L}\p{M}'’. -]*$/u.test(v) && !/\p{L}\.\p{L}/u.test(v);
  }

  // Free text for "Other Trade": short, plain words only, no web addresses.
  function isValidOtherTrade(v) {
    v = cleanText(v);
    return v.length >= 2 && v.length <= 60 &&
      /^[\p{L}\p{N}][\p{L}\p{M}\p{N} &'’.,()\/+-]*$/u.test(v) &&
      !/https?:|www\.|\.[a-z]{2,}(?:\/|$|\s)/i.test(v);
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

  const valid = (v, max) => Number.isInteger(v) && v >= 0 && v <= max;

  function pillarScores(crew, revenue, ads, vertical) {
    const s = { ops: 2, profit: 1, gbp: 2, aeo: 1 };
    const add = w => { Object.keys(w || {}).forEach(k => { s[k] += w[k]; }); };
    if (crew != null) add(CREW_WEIGHT[crew]);
    if (revenue != null) add(REVENUE_WEIGHT[revenue]);
    if (ads != null) add(ADS_WEIGHT[ads]);
    if (vertical) add(VERTICAL_WEIGHT[vertical]);
    return s;
  }

  const byScore = scores => (a, b) => scores[b] - scores[a] || PILLAR_ORDER.indexOf(a) - PILLAR_ORDER.indexOf(b);

  // Named situations first (they match how owners actually describe their business), then the strongest pillar.
  function pickLever(crew, revenue, ads, vertical, scores) {
    const has = v => v != null;
    if (has(crew) && has(revenue) && crew >= 3 && revenue >= 4) return 'multiCrew';
    if (has(ads) && has(revenue) && ads >= 3 && revenue >= 2 && revenue <= 3) return 'adProfit';
    if (has(ads) && has(crew) && ads <= 1 && crew <= 1) return 'organic';
    if (has(ads) && ads >= 3) return 'adProfit';
    if (has(revenue) && revenue >= 4) return 'reactivation';
    if (vertical === 'project' || vertical === 'roof') return 'quote';
    if (crew === 2) return 'quote';
    if (vertical === 'recurring') return 'reactivation';
    if (has(ads) && ads <= 1) return 'organic';
    const top = PILLAR_ORDER.slice().sort(byScore(scores))[0];
    return { ops: 'quote', profit: 'adProfit', gbp: 'organic', aeo: 'organic' }[top];
  }

  // Inputs are option indexes (0-based, see OPTIONS) plus the trade label. Missing answers are null.
  // Returns null until at least one answer exists.
  function growthSnapshot(a) {
    a = a || {};
    const crew = valid(a.employees, OPTIONS.employees.length - 1) ? a.employees : null;
    const revenue = valid(a.revenue, OPTIONS.revenue.length - 1) ? a.revenue : null;
    const ads = valid(a.ads, OPTIONS.ads.length - 1) ? a.ads : null;
    const trade = findTrade(a.trade);
    const signals = [crew, revenue, ads].filter(v => v != null).length + (trade ? 1 : 0);
    if (!signals) return null;
    const vertical = trade ? trade.vertical : null;
    const scores = pillarScores(crew, revenue, ads, vertical);
    const leverKey = pickLever(crew, revenue, ads, vertical, scores);
    const lead = LEVERS[leverKey].stack.slice();
    if (leverKey === 'quote' && ads != null && ads >= 2) lead[1] = 'profit'; // paid traffic: tracking beats more Maps work
    const stack = lead.concat(PILLAR_ORDER.filter(k => lead.indexOf(k) === -1).sort(byScore(scores)));
    return {
      leverKey,
      lever: LEVERS[leverKey].name,
      stack,
      stackNames: stack.map(k => PILLARS[k].name),
      insight: LEVERS[leverKey].insight(VERTICAL_JOBS[vertical || 'general']),
      signals
    };
  }

  // Local time in the visitor's zone (invalid zones fall back to UTC), plus the exact UTC instant.
  function timestamp(now, zone) {
    let tz = 'UTC';
    try { if (zone) tz = new Intl.DateTimeFormat('en-US', { timeZone: String(zone) }).resolvedOptions().timeZone; } catch (e) { tz = 'UTC'; }
    let local;
    try {
      local = now.toLocaleString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short', timeZone: tz }) + ' (' + tz + ')';
    } catch (e) {
      local = now.toUTCString();
    }
    return local + '. UTC ' + now.toISOString();
  }

  // The one validator for a submission. The browser uses it before sending, the server uses it as the authority.
  // Answers must match the fixed option lists exactly, so nothing free-form reaches an email except name and "Other" trade.
  function normalizeLead(raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    const str = v => (typeof v === 'string' ? v : '');
    const errors = [];
    const name = tidyName(str(raw.name));
    if (!isValidName(name)) errors.push({ field: 'name', message: 'Enter your full name using letters only.' });
    const email = str(raw.email).trim();
    if (!isValidEmail(email)) errors.push({ field: 'email', message: 'Enter a valid email address.' });
    const country = str(raw.country);
    if (!Object.prototype.hasOwnProperty.call(COUNTRIES, country)) errors.push({ field: 'country', message: 'Pick United States, Canada or Australia.' });
    else if (!isValidPhone(country, str(raw.phone))) errors.push({ field: 'phone', message: COUNTRIES[country].hint });
    const pick = key => {
      const i = OPTIONS[key].indexOf(str(raw[key]));
      if (i < 0) errors.push({ field: key, message: 'Pick one of the listed answers.' });
      return i;
    };
    const ei = pick('employees'), ri = pick('revenue'), ai = pick('ads');
    const trade = str(raw.trade);
    const otherTrade = cleanText(str(raw.otherTrade));
    if (!findTrade(trade)) errors.push({ field: 'trade', message: 'Pick your trade from the list.' });
    else if (trade === OTHER && !isValidOtherTrade(otherTrade)) errors.push({ field: 'otherTrade', message: 'Type your trade in a few plain words.' });
    if (errors.length) return { lead: null, errors };
    const isOther = trade === OTHER;
    return {
      errors,
      lead: {
        name,
        email,
        country,
        countryName: COUNTRIES[country].name,
        phone: intlPhone(country, str(raw.phone)),
        trade,
        tradeLabel: isOther ? 'Other: ' + otherTrade : trade,
        tradeShort: isOther ? otherTrade : tradeShort(trade),
        employees: OPTIONS.employees[ei],
        revenue: OPTIONS.revenue[ri],
        ads: OPTIONS.ads[ai],
        snapshot: growthSnapshot({ employees: ei, revenue: ri, ads: ai, trade })
      }
    };
  }

  const leadSubject = lead => `New Lead: ${lead.name} - ${lead.tradeShort} (${lead.countryName})`;

  // Human-readable keys so a Formspree email is scannable at a glance (backup and failover path).
  function buildFormspreePayload(lead, meta) {
    meta = meta || {};
    const s = lead.snapshot;
    return {
      _subject: leadSubject(lead),
      'Full Name': lead.name,
      'Email': lead.email,
      'Country': lead.countryName,
      'Phone Number': lead.phone,
      'Trade / Service': lead.tradeLabel,
      'Employees': lead.employees,
      'Monthly Revenue': lead.revenue,
      'Monthly Ad Spend': lead.ads,
      'Growth Lever': s.lever,
      'Recommended Stack': s.stackNames.slice(0, 2).join(' + '),
      'Strategic Insight': s.insight,
      'Submitted At': meta.submittedAt || '',
      'Page URL': meta.pageUrl || '',
      _replyto: lead.email,
      _gotcha: meta.gotcha || ''
    };
  }

  const normalizeSearch = s => String(s || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9+]+/g, ' ');

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
    trackPageView();

    // Both Google Fonts stylesheets load as media="print" so they never block first paint; switch them on now.
    $$('link[data-swap]').forEach(l => { l.media = 'all'; });

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
      if (isValidOtherTrade(otherInput.value)) otherMsg.textContent = '';
      refresh();
    });

    /* Step 5: contact fields */
    const phoneEl = $('#phone');
    const phoneGroup = $('.phone-group', form);
    const fields = {
      name: { el: $('#full-name'), ok: v => isValidName(v), msg: () => 'Enter your full name using letters only, like Sam Lee.' },
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

    /* Growth snapshot: lever, ranked pillar stack and insight, recomputed on every answer */
    const snapBox = $('#snapshot');
    const snapLever = $('#snap-lever');
    const snapWhy = $('#snap-why');
    const snapCount = $('#snap-count');
    const snapDots = $$('#snap-signals i');
    const stackItems = $$('#snap-stack [data-pillar]');
    let lastSnap = '';
    function updateSnapshot() {
      const s = growthSnapshot({ employees: indexOf('employees'), revenue: indexOf('revenue'), ads: indexOf('ads'), trade: state.trade });
      const signals = s ? s.signals : 0;
      snapDots.forEach((d, j) => d.classList.toggle('on', j < signals));
      snapCount.textContent = signals + '/4';
      const lever = s ? s.lever : 'Builds as you answer';
      const why = s ? s.insight : 'Four quick signals: crew size, revenue, ad spend and trade. Each one sharpens your plan.';
      const top = s ? s.stack.slice(0, 2) : [];
      stackItems.forEach((li, i) => {
        const rank = top.indexOf(li.dataset.pillar) + 1;
        li.classList.toggle('is-top', rank > 0);
        li.style.order = String(s ? s.stack.indexOf(li.dataset.pillar) : i); // priority 1 always reads first
        $('.rank', li).textContent = rank > 0 ? String(rank) : '';
        $('.pr', li).textContent = rank > 0 ? 'Priority ' + rank + ': ' : '';
      });
      const key = lever + '|' + why + '|' + top.join();
      if (key === lastSnap) return;
      const first = !lastSnap;
      lastSnap = key;
      snapLever.textContent = lever;
      snapWhy.textContent = why;
      // A short neon pulse shows the engine re-reading the business after each answer.
      if (!first && !reduce()) { snapBox.classList.remove('is-updated'); void snapBox.offsetWidth; snapBox.classList.add('is-updated'); }
    }

    /* Progress */
    const pctTick = ticker(pctEl, x => Math.round(Math.max(0, Math.min(100, x))) + '%');
    const tradeDone = () => !!state.trade && (state.trade !== OTHER || isValidOtherTrade(state.other));
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
          if (show) { otherMsg.textContent = 'Type your trade in a few plain words, like "chimney sweep".'; otherInput.focus(); }
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
      trackViewContent(); // a restored visit can advance without any change event
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

    /* Meta events from the form (helpers are below init). ViewContent: the first real interaction, once per page.
       Only user actions count: restore() and init set answers from code and never fire change. */
    let viewContentSent = false;
    function trackViewContent() {
      if (viewContentSent) return;
      viewContentSent = true;
      const id = generateEventId('vc');
      const data = { content_name: 'Remotie Qualification Funnel', content_category: 'Trade & Home Service Lead Funnel' };
      pixel('ViewContent', data, id);
      serverEvent('ViewContent', id, data);
    }
    form.addEventListener('change', trackViewContent);

    // Browser half of the Lead. The server half goes out from /api/submit-lead with the same event ID. It fires only
    // after the server accepted the lead, and only if the payload passes the server's bot rules: bots get the same quiet 200.
    let leadEventId = '';
    let leadSent = false;
    function trackLead(data) {
      if (leadSent || data._gotcha !== '' || !(data.elapsedMs >= MIN_FILL_MS)) return;
      leadSent = true;
      pixel('Lead', { content_name: 'Remotie 360 AI Growth Slot', content_category: data.trade, status: 'submitted', country: data.country }, data.meta_event_id);
    }

    /* Submit: our server function sends both emails. Formspree is only a safety net. */
    const loadedAt = Date.now();

    function setBusy(on) {
      btnSubmit.disabled = on;
      btnSubmit.setAttribute('aria-busy', String(on));
      btnBack.disabled = on;
      ctaText.textContent = on ? 'Locking in your slot...' : 'Submit & Schedule your slot';
    }

    function errorText(err) {
      if (err && err.name === 'AbortError') return 'The connection timed out before we heard back. Check your signal and tap the button again. Your answers are still here.';
      if (navigator.onLine === false) return 'You look to be offline. Reconnect and tap the button again. Your answers are still here.';
      return 'We could not send your details just now. Tap the button to try again. Your answers are still here.';
    }

    function collect() {
      const pick = name => { const c = checked(name); return c ? c.value : ''; };
      let tz = '';
      try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { tz = ''; }
      const ids = metaIds();
      leadEventId = leadEventId || generateEventId('lead'); // one per page: every retry of this lead reuses it
      return {
        name: fields.name.el.value,
        email: fields.email.el.value,
        country: state.country,
        phone: phoneEl.value,
        trade: state.trade || '',
        otherTrade: state.other,
        employees: pick('employees'),
        revenue: pick('revenue'),
        ads: pick('ads'),
        timezone: tz,
        pageUrl: window.location.href,
        elapsedMs: Date.now() - loadedAt,
        _gotcha: gotcha ? gotcha.value : '',
        meta_event_id: leadEventId,
        meta_fbp: ids.fbp,
        meta_fbc: ids.fbc,
        event_source_url: window.location.href
      };
    }

    async function postJson(url, payload, ms) {
      const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = setTimeout(() => { if (ctrl) ctrl.abort(); }, ms); // weak 4G should fail loudly, not spin forever
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: ctrl ? ctrl.signal : undefined
        });
        let body = null;
        try { body = await res.json(); } catch (e) { body = null; }
        return { status: res.status, ok: res.ok, body };
      } finally {
        clearTimeout(timer);
      }
    }

    // Straight from the browser to Formspree, so a lead is never lost when the server function is missing
    // (static preview, file://) or tells us it could not store the lead anywhere.
    async function viaFormspree(data) {
      const lead = normalizeLead(data).lead;
      if (!lead) return false;
      const payload = buildFormspreePayload(lead, { submittedAt: timestamp(new Date(), data.timezone), pageUrl: data.pageUrl, gotcha: data._gotcha });
      try { return (await postJson(FORMSPREE_ENDPOINT, payload, 15000)).ok; } catch (e) { return false; }
    }

    // Server field errors land on the matching input so the fix is obvious.
    function applyServerErrors(errors) {
      let first = null;
      errors.forEach(e => {
        const key = e && e.field;
        if (!fields[key]) return;
        touched[key] = true;
        const wrap = key === 'phone' ? phoneGroup : fields[key].el.closest('.field');
        wrap.classList.remove('is-valid');
        wrap.classList.add('is-invalid');
        fields[key].el.setAttribute('aria-invalid', 'true');
        msgs[key].textContent = String(e.message || '');
        if (!first) first = fields[key].el;
      });
      if (first) { first.focus(); return 'Check the highlighted details, then tap the button again.'; }
      return 'Some answers did not come through. Go back a step, check them, then tap the button again.';
    }

    async function deliver(data) {
      const viaBackup = async () => ((await viaFormspree(data)) ? { ok: true, confirmation: false } : { ok: false, message: errorText(null) });
      if (window.location.protocol === 'file:') return viaBackup();
      // A network error or timeout throws here. The lead may or may not have arrived, so we ask for a retry instead of double-sending.
      const r = await postJson(API_ENDPOINT, data, 20000);
      if (r.ok && r.body && r.body.ok) return { ok: true, confirmation: r.body.confirmation === true, viaApi: true };
      if (r.status === 422 && r.body && Array.isArray(r.body.errors)) return { ok: false, message: applyServerErrors(r.body.errors) };
      if (r.status === 429) return { ok: false, message: 'Too many attempts from this connection. Wait a few minutes, then tap the button again.' };
      // Any other answer (missing function, crash, refused request, 502 "not captured") means the server did not store
      // the lead, so Formspree takes it straight from the browser instead of the lead being lost.
      return viaBackup();
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
      const data = collect();
      let result;
      try {
        result = await deliver(data);
      } catch (err) {
        result = { ok: false, message: errorText(err) };
      }
      state.sending = false;
      if (result.ok) { if (result.viaApi) trackLead(data); showSuccess(data, result.confirmation); return; }
      alertText.textContent = result.message;
      alertBox.hidden = false;
      setBusy(false);
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

    function showSuccess(data, confirmation) {
      state.done = true;
      try { sessionStorage.removeItem(KEY); } catch (e) { /* storage blocked */ }
      const lead = normalizeLead(data).lead;
      const out = lead ? {
        first: firstName(lead.name),
        trade: lead.tradeLabel,
        crew: lead.employees,
        revenue: lead.revenue,
        ads: lead.ads,
        lever: lead.snapshot.lever,
        name: lead.name,
        email: lead.email,
        phone: lead.phone
      } : { first: firstName(data.name), email: data.email };
      $$('[data-out]', card).forEach(el => { el.textContent = out[el.dataset.out] || ''; });
      $('#success-mailnote').hidden = !confirmation;
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

  /* ---------- Meta Pixel + Conversions API (browser half) ---------- */
  // Each event fires in the Pixel and is also posted to our server with the same event ID, so Meta keeps one copy
  // and still hears about it when an ad blocker stops the Pixel. Tracking can never break the form: every call is
  // guarded and its errors are swallowed.

  const META_ENDPOINT = '/api/meta-capi';
  const FBC_KEY = 'remotie-fbc';

  function generateEventId(prefix) {
    const c = window.crypto;
    if (c && typeof c.randomUUID === 'function') return prefix + '_' + c.randomUUID();
    const hex = () => Math.random().toString(16).slice(2, 10);
    return prefix + '_' + Date.now() + '_' + hex() + hex();
  }

  function readCookie(name) {
    const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
    return m ? m[1] : null;
  }

  // The Pixel normally sets _fbc. When it is missing (Pixel blocked or still loading) and the visit came from a Meta ad,
  // build it from ?fbclid= in Meta's format and keep it for 90 days, so the ad click is still credited.
  function metaClickId() {
    let fbc = readCookie('_fbc');
    if (!fbc) { try { fbc = sessionStorage.getItem(FBC_KEY); } catch (e) { fbc = null; } }
    if (fbc) return fbc;
    const fbclid = new URLSearchParams(window.location.search).get('fbclid');
    if (!fbclid || !/^[\w-]{1,500}$/.test(fbclid)) return null; // the strict check also keeps the cookie write safe
    fbc = 'fb.1.' + Date.now() + '.' + fbclid;
    try { sessionStorage.setItem(FBC_KEY, fbc); } catch (e) { /* storage blocked */ }
    document.cookie = '_fbc=' + fbc + '; path=/; max-age=7776000; SameSite=Lax' + (window.location.protocol === 'https:' ? '; Secure' : '');
    return fbc;
  }

  function metaIds() {
    try { return { fbp: readCookie('_fbp'), fbc: metaClickId() }; } catch (e) { return { fbp: null, fbc: null }; }
  }

  function pixel(name, params, eventId) {
    try { if (typeof window.fbq === 'function') window.fbq('track', name, params, { eventID: eventId }); } catch (e) { /* Pixel blocked or broken */ }
  }

  // keepalive lets the post finish even when the visitor is leaving the page.
  function serverEvent(name, eventId, customData) {
    if (window.location.protocol === 'file:') return;
    try {
      const ids = metaIds();
      fetch(META_ENDPOINT, {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_name: name, event_id: eventId, event_source_url: window.location.href, fbp: ids.fbp, fbc: ids.fbc, custom_data: customData })
      }).catch(() => {});
    } catch (e) { /* tracking must never break the page */ }
  }

  // Server copy of the PageView that meta-pixel.js fired, with its event ID (a fresh one if that script was blocked).
  // Sent on load, when the Pixel has usually set _fbp, or as the visitor leaves if that comes first.
  function trackPageView() {
    const id = window.__REMOTIE_PV_EVENT_ID__ || generateEventId('pv');
    let sent = false;
    const go = () => { if (!sent) { sent = true; serverEvent('PageView', id); } };
    if (document.readyState === 'complete') go();
    else { window.addEventListener('load', go); window.addEventListener('pagehide', go); }
  }

  const api = {
    API_ENDPOINT, FORMSPREE_ENDPOINT, OTHER, MIN_FILL_MS, TRADES, OPTIONS, COUNTRIES, WEIGHTS, PILLARS, LEVERS,
    CREW_REACT, REVENUE_REACT, ADS_FEEDBACK,
    formatPhone, nationalDigits, isValidPhone, intlPhone,
    isValidEmail, isValidName, isValidOtherTrade, cleanText, firstName, tidyName, tradeShort,
    revenueText, adsText, progressInfo, growthSnapshot,
    normalizeLead, leadSubject, buildFormspreePayload, timestamp, filterTrades, detectCountry
  };
  if (typeof module === 'object' && module.exports) module.exports = api;

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }
})();
