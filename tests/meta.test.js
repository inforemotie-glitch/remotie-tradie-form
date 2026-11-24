// Run from the project folder with: node --test
// Meta Pixel + Conversions API: hashing, the Graph API call, both endpoints and the page wiring. Nothing touches the network.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const capi = require('../api/_lib/meta-capi.js');
const beacon = require('../api/meta-capi.js');
const submit = require('../api/submit-lead.js');

globalThis.fetch = () => { throw new Error('network is disabled in tests'); };

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const sha = v => crypto.createHash('sha256').update(v, 'utf8').digest('hex');
const TOKEN = 'meta-test-token';
const ENV = { BREVO_API_KEY: 'brevo-test-key', META_ACCESS_TOKEN: TOKEN };
const UA = 'Mozilla/5.0 (Test) Chrome/130';
const META_OK = { status: 200, json: { events_received: 1, messages: [], fbtrace_id: 'AbC123xyz' } };

let ipSeq = 0;
function makeReq({ method = 'POST', headers = {}, body } = {}) {
  const req = new EventEmitter();
  req.method = method;
  req.headers = Object.assign({
    host: 'funnel.example',
    origin: 'https://funnel.example',
    'content-type': 'application/json',
    'user-agent': UA,
    'x-forwarded-for': '203.0.113.' + (++ipSeq % 250)
  }, headers);
  for (const k of Object.keys(req.headers)) if (req.headers[k] === undefined) delete req.headers[k];
  if (body !== undefined) req.body = body;
  else process.nextTick(() => req.emit('end'));
  return req;
}

function makeRes() {
  const res = { statusCode: 200, headers: {}, body: '', headersSent: false };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.end = b => { res.body = b || ''; res.headersSent = true; };
  return res;
}

async function run(handler, reqOpts, deps) {
  const res = makeRes();
  const logs = [];
  await handler.handle(makeReq(reqOpts), res, Object.assign({ log: e => logs.push(e) }, deps));
  return { status: res.statusCode, json: res.body ? JSON.parse(res.body) : null, logs };
}

// Graph API calls get metaReply (a response, or an Error to throw). Brevo and Formspree always accept.
function fakeFetch(metaReply) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, body: JSON.parse(opts.body), signal: opts.signal });
    if (!url.startsWith('https://graph.facebook.com/')) return { ok: true, status: 201, json: async () => ({ messageId: '<qa@test>' }) };
    if (metaReply instanceof Error) throw metaReply;
    return { ok: metaReply.status >= 200 && metaReply.status < 300, status: metaReply.status, json: async () => metaReply.json };
  };
  fn.meta = () => calls.filter(c => c.url.startsWith('https://graph.facebook.com/'));
  fn.brevo = () => calls.filter(c => c.url.includes('brevo'));
  return fn;
}

const lead = (over = {}) => Object.assign({
  name: 'sam lee', email: 'sam@leeplumbing.com.au', country: 'AU', phone: '0412 345 678', trade: 'Plumbing', otherTrade: '',
  employees: '2 - 5 Crew', revenue: '$25k - $50k / mo', ads: 'Under $1,000 / mo', timezone: 'Australia/Sydney',
  pageUrl: 'https://funnel.example/?utm_source=meta', elapsedMs: 31000, _gotcha: '',
  meta_event_id: 'lead_0f8e6a52-1c3b-4d7e-9a10-2b3c4d5e6f70', meta_fbp: 'fb.1.1700000000000.1234567890', meta_fbc: null,
  event_source_url: 'https://funnel.example/?utm_source=meta'
}, over);

test.beforeEach(() => submit._buckets.clear());

test('customer details are normalized and hashed the way Meta specifies', () => {
  assert.equal(capi.sha256('test@example.com'), '973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b');
  assert.equal(capi.sha256(''), undefined);
  assert.deepEqual(capi.normalizeEmail('  Sam@LeePlumbing.com.AU '), [sha('sam@leeplumbing.com.au')]);
  const ph = (p, c) => capi.normalizePhone(p, c)[0];
  assert.equal(ph('+1 (415) 555-0123', 'US'), sha('14155550123'));
  assert.equal(ph('(604) 555-0187', 'CA'), sha('16045550187'), '10 digits get the 1');
  assert.equal(ph('0412 345 678', 'AU'), sha('61412345678'), 'AU mobile: trunk 0 dropped, 61 added');
  assert.equal(ph('+61 412 345 678', 'AU'), sha('61412345678'));
  assert.equal(ph('+61 (0) 412 345 678', 'AU'), sha('61412345678'), 'trunk 0 after +61');
  assert.equal(ph('+61 2 9876 5432', 'AU'), sha('61298765432'), 'AU landline');
  assert.equal(capi.normalizePhone('', 'AU'), undefined);
  assert.deepEqual(capi.splitAndNormalizeName('  sam   lee '), { fn: [sha('sam')], ln: [sha('lee')] });
  assert.deepEqual(capi.splitAndNormalizeName("José O'Brien-Núñez"), { fn: [sha('josé')], ln: [sha('obriennúñez')] }, 'accents kept, punctuation gone');
  assert.deepEqual(capi.splitAndNormalizeName('José Lee').fn, [sha('josé')], 'decomposed accents hash the same');
  assert.deepEqual(capi.splitAndNormalizeName('J. Smith Jr.'), { fn: [sha('j')], ln: [sha('smith')] }, 'suffix skipped');
  assert.deepEqual(capi.splitAndNormalizeName('Cher'), { fn: [sha('cher')], ln: undefined });
  assert.deepEqual(capi.normalizeCountry('United States'), [sha('us')]);
  assert.deepEqual(capi.normalizeCountry('AU'), [sha('au')]);
  assert.equal(capi.normalizeCountry('New Zealand'), undefined);
});

test('user_data keeps IP, user agent, fbp and fbc raw and drops anything malformed', () => {
  const req = makeReq({ headers: { 'x-forwarded-for': '198.51.100.7, 10.0.0.1' } });
  const ud = capi.buildUserData({ req, email: 'sam@x.com', phone: '+1 415 555 0123', country: 'US', name: 'Sam Lee', fbp: 'fb.1.1700000000000.1234567890', fbc: 'fb.1.1700000000000.IwAR1x_y-Z' });
  assert.equal(ud.client_ip_address, '198.51.100.7', 'first address in x-forwarded-for');
  assert.equal(ud.client_user_agent, UA);
  assert.equal(ud.fbp, 'fb.1.1700000000000.1234567890');
  assert.equal(ud.fbc, 'fb.1.1700000000000.IwAR1x_y-Z');
  ['em', 'ph', 'fn', 'ln', 'country', 'external_id'].forEach(k => assert.match(ud[k][0], /^[a-f0-9]{64}$/, k));
  assert.deepEqual(ud.external_id, ud.em, 'external_id is the hashed email');
  const viaCloudflare = capi.buildUserData({ req: makeReq({ headers: { 'cf-connecting-ip': '2001:db8::7', 'x-forwarded-for': '172.70.1.1' } }) });
  assert.equal(viaCloudflare.client_ip_address, '2001:db8::7', 'behind Cloudflare the visitor, not Cloudflare');
  const bare = capi.buildUserData({ req: makeReq({ headers: { 'x-forwarded-for': 'unknown', 'user-agent': undefined } }), fbp: 'junk', fbc: 'fb.nope' });
  assert.deepEqual(bare, {}, 'nothing invalid is sent');
});

test('the Graph API call uses Meta\'s format, honours the settings and never throws', async () => {
  const logs = [];
  const log = e => logs.push(e);
  const params = { event_name: 'PageView', event_id: 'pv_12345678', event_source_url: 'https://funnel.example/', user_data: { client_user_agent: UA } };
  let r = await capi.sendMetaCapiEvent(params, { env: {}, log });
  assert.deepEqual(r, { ok: false, skipped: true, reason: 'META_ACCESS_TOKEN not configured' });
  assert.equal(logs[0].level, 'warn');
  r = await capi.sendMetaCapiEvent(Object.assign({}, params, { user_data: {} }), { env: ENV, fetch: fakeFetch(META_OK), log });
  assert.equal(r.skipped, true, 'no user agent, no call');

  let fetch = fakeFetch(META_OK);
  r = await capi.sendMetaCapiEvent(params, { env: ENV, fetch, log });
  assert.deepEqual(r, { ok: true, status: 200, events_received: 1, fbtrace_id: 'AbC123xyz' });
  assert.equal(fetch.meta()[0].url, `https://graph.facebook.com/v26.0/1757698228867001/events?access_token=${TOKEN}`);
  assert.ok(fetch.meta()[0].signal instanceof AbortSignal, 'a timeout guards every call');
  assert.ok(!('test_event_code' in fetch.meta()[0].body));

  fetch = fakeFetch(META_OK);
  await capi.sendMetaCapiEvent(params, { env: Object.assign({ META_TEST_EVENT_CODE: 'TEST123', META_DATASET_ID: '42', META_API_VERSION: 'v27.0' }, ENV), fetch, log });
  assert.equal(fetch.meta()[0].url, `https://graph.facebook.com/v27.0/42/events?access_token=${TOKEN}`);
  assert.equal(fetch.meta()[0].body.test_event_code, 'TEST123');

  const outcomes = [
    [new Error('getaddrinfo ENOTFOUND'), 'network'],
    [Object.assign(new Error('aborted'), { name: 'TimeoutError' }), 'timeout'],
    [{ status: 400, json: { error: { message: '(#2635) You are calling a deprecated version of the Ads API.', code: 2635, fbtrace_id: 'T9' } } }, 'meta_2635'],
    [{ status: 400, json: { error: { message: 'Invalid parameter', code: 100, error_subcode: 33 } } }, 'meta_100_33'],
    [{ status: 502, json: null }, 'http_502']
  ];
  for (const [reply, code] of outcomes) {
    r = await capi.sendMetaCapiEvent(params, { env: ENV, fetch: fakeFetch(reply), log });
    assert.equal(r.ok, false, code);
    assert.equal(r.error, code);
  }
  assert.ok(!JSON.stringify(logs).includes(TOKEN), 'the token never reaches a log line');
});

test('a valid lead goes to Meta once, beside both emails, with the browser event ID and hashed details', async () => {
  const fetch = fakeFetch(META_OK);
  const r = await run(submit, { body: lead() }, { env: ENV, fetch });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { ok: true, confirmation: true });
  assert.equal(fetch.brevo().length, 2, 'both emails still go out');
  assert.equal(fetch.meta().length, 1);
  const ev = fetch.meta()[0].body.data[0];
  assert.equal(ev.event_name, 'Lead');
  assert.equal(ev.event_id, 'lead_0f8e6a52-1c3b-4d7e-9a10-2b3c4d5e6f70', 'same ID as the browser Pixel');
  assert.equal(ev.action_source, 'website');
  assert.ok(Number.isInteger(ev.event_time) && Math.abs(ev.event_time - Date.now() / 1000) < 10, 'unix seconds');
  assert.equal(ev.event_source_url, 'https://funnel.example/?utm_source=meta');
  const ud = ev.user_data;
  assert.deepEqual(ud.em, [sha('sam@leeplumbing.com.au')]);
  assert.deepEqual(ud.ph, [sha('61412345678')]);
  assert.deepEqual(ud.fn, [sha('sam')]);
  assert.deepEqual(ud.ln, [sha('lee')]);
  assert.deepEqual(ud.country, [sha('au')]);
  assert.deepEqual(ud.external_id, ud.em);
  assert.equal(ud.client_user_agent, UA);
  assert.match(ud.client_ip_address, /^203\.0\.113\.\d+$/);
  assert.equal(ud.fbp, 'fb.1.1700000000000.1234567890');
  assert.ok(!('fbc' in ud), 'no click ID unless the visit came from an ad');
  assert.deepEqual(ev.custom_data, {
    content_name: 'Remotie 360 AI Growth Slot', content_category: 'Plumbing', status: 'submitted', country: 'AU',
    employees: '2 - 5 Crew', monthly_revenue: '$25k - $50k / mo', monthly_ad_spend: 'Under $1,000 / mo'
  });
  const metaLog = r.logs.find(l => l.evt === 'meta_capi');
  assert.deepEqual([metaLog.event_name, metaLog.ok, metaLog.events_received, metaLog.fbtrace_id], ['Lead', true, 1, 'AbC123xyz']);
  const all = JSON.stringify(r.logs);
  assert.ok(!all.includes(TOKEN) && !all.includes('sam') && !all.includes(ud.em[0]), 'logs carry no token, personal data or hashes');
});

test('Meta trouble never changes the lead, its emails or the reply', async () => {
  const replies = [new Error('getaddrinfo ENOTFOUND'), Object.assign(new Error('aborted'), { name: 'TimeoutError' }), { status: 500, json: { error: { message: 'down', code: 2 } } }];
  for (let i = 0; i < replies.length; i++) {
    const fetch = fakeFetch(replies[i]);
    const r = await run(submit, { body: lead({ email: `meta${i}@example.com` }) }, { env: ENV, fetch });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, { ok: true, confirmation: true });
    assert.equal(fetch.brevo().length, 2);
    assert.equal(r.logs.find(l => l.evt === 'lead').captured, true);
  }
  // No token at all: the lead flows exactly as before, and the log says why Meta was skipped.
  const fetch = fakeFetch(META_OK);
  const r = await run(submit, { body: lead({ email: 'notoken@example.com' }) }, { env: { BREVO_API_KEY: 'brevo-test-key' }, fetch });
  assert.deepEqual(r.json, { ok: true, confirmation: true });
  assert.equal(fetch.meta().length, 0);
  assert.equal(r.logs.find(l => l.evt === 'meta_capi').skipped, 'META_ACCESS_TOKEN not configured');
});

test('bots and invalid leads never reach Meta', async () => {
  for (const over of [{ _gotcha: 'https://spam' }, { _gotcha: 'Sam Lee' }, { elapsedMs: 400 }, { email: 'sam@leeplumbing' }, { revenue: '$1M / mo' }]) {
    const fetch = fakeFetch(META_OK);
    await run(submit, { body: lead(over) }, { env: ENV, fetch });
    assert.equal(fetch.meta().length, 0, JSON.stringify(over));
  }
});

test('a lead without a usable browser event ID or URL still reaches Meta with safe server values', async () => {
  const bad = [undefined, '<script>', 'short', 'x'.repeat(101)];
  for (let i = 0; i < bad.length; i++) {
    const fetch = fakeFetch(META_OK);
    await run(submit, { body: lead({ meta_event_id: bad[i], email: `id${i}@example.com`, event_source_url: 'javascript:alert(1)', meta_fbp: 'fb.not-a-cookie' }) }, { env: ENV, fetch });
    const ev = fetch.meta()[0].body.data[0];
    assert.match(ev.event_id, /^lead_[0-9a-f-]{36}$/, String(bad[i]));
    assert.equal(ev.event_source_url, 'https://funnel.example/?utm_source=meta', 'falls back to the checked page URL');
    assert.ok(!('fbp' in ev.user_data));
  }
});

test('long Meta ad landing URLs (fbclid plus utm tags) still reach Meta from both endpoints', async () => {
  const longUrl = 'https://funnel.example/?fbclid=IwZXh0bgNhZW0BMABhZGlk' + 'A'.repeat(220) + '_aem_' + 'b'.repeat(120) +
    '&utm_source=facebook&utm_medium=paid&utm_campaign=' + 'c'.repeat(150) + '&utm_content=' + 'd'.repeat(150);
  assert.ok(longUrl.length > 650);
  const fetch = fakeFetch(META_OK);
  const pv = await run(beacon, { body: { event_name: 'PageView', event_id: 'pv_0f8e6a52-1c3b', event_source_url: longUrl } }, { env: ENV, fetch });
  assert.equal(pv.status, 200);
  const r = await run(submit, { body: lead({ pageUrl: longUrl, event_source_url: longUrl, email: 'long@example.com' }) }, { env: ENV, fetch });
  assert.deepEqual(r.json, { ok: true, confirmation: true });
  assert.deepEqual(fetch.meta().map(c => c.body.data[0].event_source_url), [longUrl, longUrl]);
  assert.equal(capi.httpUrl('https://x.example/' + 'a'.repeat(2048)), '', 'absurd lengths are still refused');
});

test('/api/meta-capi forwards only PageView and ViewContent from the site itself', async () => {
  const fetch = fakeFetch(META_OK);
  const view = {
    event_name: 'ViewContent', event_id: 'vc_0f8e6a52-1c3b-4d7e', event_source_url: 'https://funnel.example/?fbclid=IwAR1',
    fbp: 'fb.1.1700000000000.42', fbc: 'fb.1.1700000000000.IwAR1',
    custom_data: { content_name: 'Remotie Qualification Funnel', content_category: 'Trade & Home Service Lead Funnel', value: 9999, currency: 'USD' }
  };
  const r = await run(beacon, { body: view }, { env: ENV, fetch });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { ok: true });
  const ev = fetch.meta()[0].body.data[0];
  assert.equal(ev.event_name, 'ViewContent');
  assert.equal(ev.event_id, view.event_id);
  assert.deepEqual(ev.custom_data, { content_name: 'Remotie Qualification Funnel', content_category: 'Trade & Home Service Lead Funnel' }, 'extra fields are dropped');
  assert.deepEqual(Object.keys(ev.user_data).sort(), ['client_ip_address', 'client_user_agent', 'fbc', 'fbp']);
  const pv = { event_name: 'PageView', event_id: 'pv_0f8e6a52-1c3b', event_source_url: 'https://funnel.example/' };
  assert.equal((await run(beacon, { body: pv }, { env: ENV, fetch })).status, 200);
  assert.ok(!('custom_data' in fetch.meta()[1].body.data[0]));

  const refused = [
    [{ body: Object.assign({}, view, { event_name: 'Lead' }) }, 400],
    [{ body: Object.assign({}, view, { event_name: 'Purchase' }) }, 400],
    [{ body: Object.assign({}, view, { event_id: 'bad id!' }) }, 400],
    [{ body: Object.assign({}, view, { event_source_url: 'javascript:alert(1)' }) }, 400],
    [{ body: view, headers: { origin: 'https://evil.example' } }, 403],
    [{ body: view, headers: { 'content-type': 'text/plain' } }, 415],
    [{ method: 'GET' }, 405]
  ];
  for (const [opts, status] of refused) assert.equal((await run(beacon, opts, { env: ENV, fetch })).status, status, JSON.stringify(opts).slice(0, 90));
  assert.equal(fetch.meta().length, 2, 'refused requests never reach Meta');

  const statuses = [];
  for (let i = 0; i < 41; i++) statuses.push((await run(beacon, { body: pv, headers: { 'x-real-ip': '198.51.100.77' } }, { env: {} })).status);
  assert.equal(statuses.filter(s => s === 200).length, 40, 'normal reloads are never throttled');
  assert.equal(statuses[40], 429, 'floods are');
});

test('the page loads the Pixel once, before app.js, and the CSP allows it without inline code', () => {
  const html = read('index.html');
  const pixelJs = read('meta-pixel.js');
  const app = read('app.js');
  assert.ok(html.includes('<script src="meta-pixel.js" defer></script>'));
  assert.ok(html.indexOf('src="meta-pixel.js"') < html.indexOf('src="app.js"'), 'the PageView event ID exists before app.js runs');
  assert.ok(!/fbq\(/.test(html), 'no inline Pixel code: the CSP would block it');
  assert.ok(html.includes('<noscript><img src="https://www.facebook.com/tr?id=1757698228867001&amp;ev=PageView&amp;noscript=1"'));
  assert.equal((pixelJs + app).match(/fbq\('init'/g).length, 1, 'init exactly once');
  assert.ok(pixelJs.includes("fbq('init', '1757698228867001');"));
  assert.ok(pixelJs.includes("fbq('track', 'PageView', {}, { eventID: id });"), 'PageView carries the shared event ID');
  assert.ok(pixelJs.includes('window.__REMOTIE_PV_EVENT_ID__ = id;'));
  assert.ok(app.includes("pixel('ViewContent', data, id);") && app.includes("serverEvent('ViewContent', id, data);"), 'ViewContent: one ID for both');
  assert.ok(app.includes('data.meta_event_id);'), 'Lead: the browser uses the ID it sent to the server');
  const csp = JSON.parse(read('vercel.json')).headers[0].headers.find(h => h.key === 'Content-Security-Policy').value;
  const directive = name => csp.split(';').map(s => s.trim()).find(s => s.startsWith(name + ' ')) || '';
  assert.match(directive('script-src'), /https:\/\/connect\.facebook\.net/);
  assert.match(directive('img-src'), /https:\/\/www\.facebook\.com/);
  assert.match(directive('connect-src'), /https:\/\/www\.facebook\.com/);
  assert.ok(!/unsafe-inline|unsafe-eval/.test(directive('script-src')), 'script-src stays strict');
});

test('no project file contains a live key prefix', () => {
  const j = (...parts) => parts.join('');
  const prefixes = [j('EAA', 'lMtp'), j('xkey', 'sib-'), j('xsmtp', 'sib-')]; // built from pieces so this file passes too
  const skip = /(^|[\\/])(\.git|node_modules|\.vercel)([\\/]|$)/;
  const files = fs.readdirSync(ROOT, { recursive: true }).map(String)
    .filter(f => !skip.test(f) && (/\.(js|json|html|css|md)$/.test(f) || /(^|[\\/])\.(gitignore|vercelignore|env\.example)$/.test(f)));
  assert.ok(files.length >= 15, files.join());
  files.forEach(f => {
    const text = read(f);
    prefixes.forEach(p => assert.ok(!text.includes(p), `${f} contains a key prefix`));
  });
});
