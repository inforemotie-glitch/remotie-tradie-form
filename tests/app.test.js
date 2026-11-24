// Run from the project folder with: node --test
// Covers the shared logic that decides what the page shows and what lands in both inboxes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const app = require('../app.js');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const decode = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

// Banned copy, built from fragments so this file never contains the words it bans.
const j = (...parts) => parts.join('');
const BANNED = [
  new RegExp(j('tra', 'die'), 'i'),
  new RegExp(j('miss', '(ed|ing)?[\\s-]*call'), 'i'),
  new RegExp(j('un', 'answered'), 'i'),
  new RegExp(j('voice', 'mail'), 'i'),
  new RegExp(j('rings?', ' out'), 'i'),
  new RegExp(j('never', ' miss'), 'i'),
  new RegExp('[' + String.fromCharCode(0x2014, 0x2013) + ']'),
  new RegExp(['&m' + 'dash;', '&n' + 'dash;', '&#82' + '12;', '&#82' + '11;'].join('|'), 'i')
];
const BUZZ = new RegExp('\\b(' + [j('del', 've'), j('un', 'leash'), j('ele', 'vat\\w*'), j('syn', 'erg\\w*'), j('revolu', 'tioni[sz]\\w*'),
  j('tap', 'estry'), j('game[- ]?', 'changer'), j('cutting[- ]', 'edge'), j('seam', 'less\\w*'), j('lever', 'ag\\w*'),
  j('super', 'charg\\w*'), j('em', 'power\\w*'), j('stream', 'lin\\w*')].join('|') + ')\\b', 'i');
const SPAM = [/\bfree\b/i, /guarantee/i, /100%/, /\$\$\$/, /act now/i, /limited time/i, /\burgent/i, /click here/i, /!!/];
const clean = (label, text) => {
  BANNED.forEach(re => assert.ok(!re.test(text), `${label} matches ${re}: ${text.slice(0, 120)}`));
  assert.ok(!BUZZ.test(text), `${label} has a buzzword`);
};

test('US and Canadian numbers format as you type', () => {
  assert.equal(app.formatPhone('US', '415'), '(415');
  assert.equal(app.formatPhone('US', '4155'), '(415) 5');
  assert.equal(app.formatPhone('US', '4155550123'), '(415) 555-0123');
  assert.equal(app.formatPhone('US', '41555501239999'), '(415) 555-0123');
  assert.equal(app.formatPhone('CA', '+1 604 555 0187'), '+1 (604) 555-0187');
  assert.equal(app.formatPhone('US', ''), '');
});

test('US and Canadian numbers follow NANP rules', () => {
  assert.ok(app.isValidPhone('US', '(415) 555-0123'));
  assert.ok(app.isValidPhone('US', '+1 415 555 0123'));
  assert.ok(app.isValidPhone('CA', '1-604-555-0187'));
  assert.ok(!app.isValidPhone('US', '(155) 555-0123'), 'area code cannot start with 1');
  assert.ok(!app.isValidPhone('US', '(415) 155-0123'), 'exchange cannot start with 1');
  assert.ok(!app.isValidPhone('CA', '604555018'), 'too short');
  assert.equal(app.intlPhone('CA', '6045550187'), '+1 (604) 555-0187');
});

test('Australian numbers format, validate and convert to +61', () => {
  assert.equal(app.formatPhone('AU', '0412345678'), '0412 345 678');
  assert.equal(app.formatPhone('AU', '0298765432'), '02 9876 5432');
  assert.equal(app.formatPhone('AU', '1300123456'), '1300 123 456');
  assert.equal(app.formatPhone('AU', '+61 412 345 678'), '+61 412 345 678');
  assert.ok(app.isValidPhone('AU', '412 345 678'), 'missing trunk 0 is fine');
  assert.ok(app.isValidPhone('AU', '+61 (0) 412 345 678'));
  assert.ok(app.isValidPhone('AU', '1300 123 456'));
  assert.ok(!app.isValidPhone('AU', '0612 345 678'), '06 is not an Australian prefix');
  assert.equal(app.intlPhone('AU', '0412 345 678'), '+61 412 345 678');
  assert.equal(app.intlPhone('AU', '02 9876 5432'), '+61 2 9876 5432');
});

test('email, name and other-trade checks block header and link injection', () => {
  assert.ok(app.isValidEmail('sam@leeplumbing.com.au'));
  assert.ok(app.isValidEmail('  jo.smith+leads@gmail.com '));
  ['sam@leeplumbing', 'sam@@x.com', 'sam lee@x.com', 'a..b@x.com', '.a@x.com', 'x@-bad.com', 'a@b.c', 'x@y.com\r\nBcc: z@q.com', '"quoted"@x.com']
    .forEach(e => assert.ok(!app.isValidEmail(e), e));
  assert.ok(app.isValidName('Sam Lee'));
  assert.ok(app.isValidName("José O'Brien-Núñez"));
  ['1', 'Sam2', '<b>Sam</b>', 'cheapmeds.com', 'Visit www.x', 'http://x'].forEach(n => assert.ok(!app.isValidName(n), n));
  assert.ok(app.isValidName('J. Smith Jr.'));
  assert.equal(app.tidyName('sam\r\nlee'), 'Sam Lee', 'line breaks never survive into a header');
  assert.equal(app.tidyName("sam o'brien-lee"), "Sam O'Brien-Lee");
  assert.equal(app.tidyName('Jan van der Berg'), 'Jan van der Berg');
  assert.equal(app.firstName('  sam   lee '), 'Sam');
  assert.ok(app.isValidOtherTrade('chimney sweep'));
  assert.ok(app.isValidOtherTrade('Tiles & Grout'));
  ['x', 'Visit spam.com now', 'https://x.io', 'www.cheap', '<script>'].forEach(t => assert.ok(!app.isValidOtherTrade(t), t));
});

test('readouts match the option labels when the slider rests on a tier', () => {
  assert.equal(app.revenueText(0), 'Under $10k');
  assert.equal(app.revenueText(2), '$25k - $50k');
  assert.equal(app.revenueText(5), '$250k+');
  assert.equal(app.adsText(0), '$0');
  assert.equal(app.adsText(1), 'Under $1,000');
  assert.equal(app.adsText(3), '$3,000 - $7,500');
  assert.equal(app.adsText(5), '$15,000+');
  assert.equal(app.revenueText(-0.3), 'Under $10k', 'spring overshoot is clamped');
});

test('progress adds up to the promised 45 seconds', () => {
  assert.deepEqual(app.progressInfo({}), { pct: 0, left: 45 });
  const all = Object.fromEntries(Object.keys(app.WEIGHTS).map(k => [k, true]));
  assert.deepEqual(app.progressInfo(all), { pct: 100, left: 0 });
});

test('Growth Snapshot follows the strategic branches', () => {
  assert.equal(app.growthSnapshot({}), null);
  const solo = app.growthSnapshot({ employees: 0, revenue: 1, ads: 0, trade: 'Plumbing' });
  assert.equal(solo.lever, 'Organic Map Pack + AI Search Capture');
  assert.deepEqual(solo.stack.slice(0, 2), ['gbp', 'aeo']);
  assert.match(solo.insight, /zero-ad-waste/);
  assert.match(solo.insight, /emergency and commercial jobs/);
  const paid = app.growthSnapshot({ employees: 2, revenue: 3, ads: 3, trade: 'Roofing' });
  assert.equal(paid.lever, 'Ad-to-Profit Attribution Overhaul');
  assert.deepEqual(paid.stack.slice(0, 2), ['profit', 'ops']);
  assert.match(paid.insight, /storm and replacement jobs/);
  const big = app.growthSnapshot({ employees: 4, revenue: 5, ads: 1, trade: 'HVAC (Heating, Ventilation & Air Conditioning)' });
  assert.equal(big.lever, 'Multi-Crew Demand Engine');
  assert.match(big.insight, /zip code or postcode/);
  assert.match(big.insight, /seasonal service and install jobs/);
  const lawn = app.growthSnapshot({ employees: 1, revenue: 4, ads: 2, trade: 'Landscaping & Lawn Care' });
  assert.equal(lawn.lever, 'Database Reactivation & High-Ticket Expansion');
  const build = app.growthSnapshot({ employees: 2, revenue: 2, ads: 2, trade: 'Carpentry / Carpenter' });
  assert.equal(build.lever, 'Faster Quotes, Nonstop Deal Flow');
  assert.deepEqual(build.stack.slice(0, 2), ['ops', 'profit'], 'paid traffic moves profit tracking up');
  assert.match(build.insight, /^High-value projects are won on speed/);
});

test('changing any single answer changes the diagnosis', () => {
  const view = s => [s.lever, s.stack.join(), s.insight].join('|');
  const pairs = [
    [{ employees: 1, revenue: 4, ads: 2, trade: 'Plumbing' }, { employees: 3 }],
    [{ employees: 3, revenue: 2, ads: 1, trade: 'Plumbing' }, { revenue: 4 }],
    [{ employees: 0, revenue: 1, ads: 0, trade: 'Plumbing' }, { ads: 4 }],
    [{ employees: 0, revenue: 1, ads: 0, trade: 'Plumbing' }, { trade: 'Roofing' }]
  ];
  pairs.forEach(([base, change]) => {
    const before = view(app.growthSnapshot(base));
    const after = view(app.growthSnapshot(Object.assign({}, base, change)));
    assert.notEqual(before, after, JSON.stringify(change));
  });
});

test('every answer combination gives a complete, on-brand diagnosis', () => {
  const crews = [null, 0, 1, 2, 3, 4], revs = [null, 0, 1, 2, 3, 4, 5], ads = [null, 0, 1, 2, 3, 4, 5];
  const trades = [null].concat(app.TRADES.map(t => t.label));
  let count = 0;
  for (const e of crews) for (const r of revs) for (const a of ads) for (const t of trades) {
    const s = app.growthSnapshot({ employees: e, revenue: r, ads: a, trade: t });
    if (e == null && r == null && a == null && t == null) { assert.equal(s, null); continue; }
    assert.ok(s && s.lever && s.insight.length > 40, 'empty diagnosis');
    assert.equal(new Set(s.stack).size, 4, 'stack ranks all four pillars once');
    const text = [s.lever, s.insight].concat(s.stackNames).join(' ');
    clean('snapshot', text);
    SPAM.forEach(re => assert.ok(!re.test(text), `spam trigger ${re} in ${text}`));
    count++;
  }
  assert.ok(count > 10000, 'covered ' + count + ' combinations');
});

test('reaction lines stay on brand', () => {
  app.CREW_REACT.concat(app.REVENUE_REACT, app.ADS_FEEDBACK).forEach(line => {
    clean('reaction', line);
    SPAM.forEach(re => assert.ok(!re.test(line), line));
  });
});

test('one validator decides what can be submitted', () => {
  const good = { name: 'sam lee', email: 'sam@leeplumbing.com.au', country: 'AU', phone: '0412345678', trade: 'Plumbing', employees: '2 - 5 Crew', revenue: '$25k - $50k / mo', ads: 'Under $1,000 / mo' };
  const { lead, errors } = app.normalizeLead(good);
  assert.equal(errors.length, 0);
  assert.equal(lead.name, 'Sam Lee');
  assert.equal(lead.phone, '+61 412 345 678');
  assert.equal(lead.countryName, 'Australia');
  assert.equal(lead.snapshot.lever, 'Organic Map Pack + AI Search Capture');
  assert.equal(app.leadSubject(lead), 'New Lead: Sam Lee - Plumbing (Australia)');
  const bad = app.normalizeLead({ name: 'x1', email: 'a@b', country: 'NZ', trade: 'Nope', employees: '?' });
  assert.deepEqual(bad.errors.map(e => e.field).sort(), ['ads', 'country', 'email', 'employees', 'name', 'revenue', 'trade']);
  assert.equal(app.normalizeLead(null).lead, null);
  const other = app.normalizeLead(Object.assign({}, good, { trade: 'Other Trade', otherTrade: ' chimney  sweep ' })).lead;
  assert.equal(other.tradeLabel, 'Other: chimney sweep');
  assert.equal(app.leadSubject(other), 'New Lead: Sam Lee - chimney sweep (Australia)');
});

test('Formspree payload keeps readable keys in the agreed order', () => {
  const { lead } = app.normalizeLead({ name: 'Sam Lee', email: 'sam@leeplumbing.com.au', country: 'AU', phone: '0412345678', trade: 'Plumbing', employees: '2 - 5 Crew', revenue: '$25k - $50k / mo', ads: 'Under $1,000 / mo' });
  const p = app.buildFormspreePayload(lead, { submittedAt: app.timestamp(new Date('2026-11-21T03:32:00Z'), 'Australia/Sydney'), pageUrl: 'https://example.com/?utm_source=google', gotcha: '' });
  assert.deepEqual(Object.keys(p), ['_subject', 'Full Name', 'Email', 'Country', 'Phone Number', 'Trade / Service', 'Employees', 'Monthly Revenue',
    'Monthly Ad Spend', 'Growth Lever', 'Recommended Stack', 'Strategic Insight', 'Submitted At', 'Page URL', '_replyto', '_gotcha']);
  assert.equal(p['Recommended Stack'], 'Google Business Profile Optimization + AEO/GEO - Generative Search Authority');
  assert.match(p['Submitted At'], /\(Australia\/Sydney\)\. UTC 2026-11-21T03:32:00\.000Z$/);
  assert.match(app.timestamp(new Date('2026-11-21T03:32:00Z'), 'Not/AZone'), /\(UTC\)/);
});

test('trade search understands slang and always offers Other', () => {
  const labels = q => app.filterTrades(q).map(t => t.label);
  assert.ok(labels('sparky').includes('Electrician / Electrical'));
  assert.ok(labels('chippy').includes('Carpentry / Carpenter'));
  assert.ok(labels('air con').includes('HVAC (Heating, Ventilation & Air Conditioning)'));
  assert.ok(labels('plúmbing').includes('Plumbing'), 'accents are ignored');
  assert.deepEqual(labels('beekeeper'), ['Other Trade']);
  assert.equal(app.filterTrades('').length, app.TRADES.length);
});

test('every trade the brief requires is in the list', () => {
  const required = ['Carpentry / Carpenter', 'Electrician / Electrical', 'HVAC (Heating, Ventilation & Air Conditioning)',
    'Roofing', 'Refrigeration', 'Plumbing', 'Landscaping & Lawn Care', 'Painting & Decorating', 'Concrete & Paving',
    'Bricklaying & Masonry', 'Tiling & Flooring', 'Solar Installation', 'Fencing & Decking', 'Plastering & Drywall',
    'Pest Control', 'Excavation & Earthmoving', 'Garage Door Services', 'Tree Services / Arborist',
    'Pool Building & Maintenance', 'General Contracting & Remodeling', 'Other Trade'];
  const labels = app.TRADES.map(t => t.label);
  required.forEach(r => assert.ok(labels.includes(r), r));
});

test('country is preselected from the time zone, then the language', () => {
  assert.equal(app.detectCountry('Australia/Sydney', ['en-US']), 'AU');
  assert.equal(app.detectCountry('America/Toronto', ['en-US']), 'CA');
  assert.equal(app.detectCountry('America/Chicago', ['en-US']), 'US');
  assert.equal(app.detectCountry('', ['en-AU']), 'AU');
  assert.equal(app.detectCountry(undefined, undefined), 'US');
});

test('page radios use exactly the labels the server accepts', () => {
  const html = read('index.html');
  ['employees', 'revenue', 'ads'].forEach(name => {
    const values = [...html.matchAll(new RegExp(`name="${name}" value="([^"]+)"`, 'g'))].map(m => decode(m[1]));
    assert.deepEqual(values, app.OPTIONS[name], name);
  });
  const tiles = [...html.matchAll(/name="trade" value="([^"]+)"/g)].map(m => decode(m[1]));
  assert.equal(tiles.length, 6);
  tiles.forEach(t => assert.ok(app.TRADES.some(x => x.label === t), t));
});

test('the four capability tiles carry the exact headlines', () => {
  const titles = [...read('index.html').matchAll(/class="outcome-title">([^<]+)</g)].map(m => decode(m[1]));
  assert.deepEqual(titles, ['AI Engineered 360° Solutions', 'Profit-First Marketing Engine', 'Google Business Profile Optimization', 'AEO/GEO - Generative Search Authority']);
});

test('tile copy stays short and plain: at most 2 sentences and 16 to 24 words each', () => {
  const bodies = [...read('index.html').matchAll(/class="outcome-text">([^<]+)</g)].map(m => decode(m[1]));
  assert.equal(bodies.length, 4);
  bodies.forEach(b => {
    const words = b.split(/\s+/).length;
    const sentences = b.split(/[.!?](?:\s|$)/).filter(s => s.trim()).length;
    assert.ok(words >= 16 && words <= 24, `${words} words: ${b}`);
    assert.ok(sentences <= 2, `${sentences} sentences: ${b}`);
  });
});

test('hero uses the exact approved copy', () => {
  const html = read('index.html');
  assert.match(html, /<h1 id="hero-title">Your Competitors Are Winning the Jobs You Should Be Getting\.<\/h1>/);
  assert.ok(html.includes('<p class="lede">The next generation of successful trade businesses is using smarter marketing and AI to respond faster, capture more leads and convert more customers. Don\'t let your competitors get there first.</p>'));
});

test('no shipped file contains banned copy', () => {
  const files = ['index.html', 'styles.css', 'app.js', 'meta-pixel.js', 'api/submit-lead.js', 'api/meta-capi.js', 'api/_lib/meta-capi.js',
    'vercel.json', 'README.md', 'EMAIL_DELIVERABILITY_SETUP.md', 'META_PIXEL_CAPI_SETUP.md'];
  files.forEach(f => clean(f, read(f)));
});
