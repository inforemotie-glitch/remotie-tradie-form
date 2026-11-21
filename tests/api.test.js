// Run from the project folder with: node --test
// Exercises api/submit-lead.js with fake Resend and Formspree responses. Nothing here touches the network.
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const api = require('../api/submit-lead.js');

globalThis.fetch = () => { throw new Error('network is disabled in tests'); };

const j = (...parts) => parts.join('');
const BANNED = [new RegExp(j('tra', 'die'), 'i'), new RegExp(j('miss', '(ed|ing)?[\\s-]*call'), 'i'), new RegExp('[' + String.fromCharCode(0x2014, 0x2013) + ']')];
const SPAM = [/\bfree\b/i, /guarantee/i, /100%/, /\$\$\$/, /act now/i, /limited time/i, /\burgent/i, /click here/i, /!!/];

let ipSeq = 0;
function makeReq({ method = 'POST', headers = {}, body, raw, preParsed = true } = {}) {
  const req = new EventEmitter();
  req.method = method;
  req.headers = Object.assign({
    host: 'funnel.example',
    origin: 'https://funnel.example',
    'content-type': 'application/json',
    'x-real-ip': '198.51.100.' + (++ipSeq % 250)
  }, headers);
  for (const k of Object.keys(req.headers)) if (req.headers[k] === undefined) delete req.headers[k];
  if (preParsed && body !== undefined) req.body = body; // what Vercel hands the function
  else process.nextTick(() => { if (raw != null) req.emit('data', Buffer.from(raw)); req.emit('end'); });
  return req;
}

function makeRes() {
  const res = { statusCode: 200, headers: {}, body: '', headersSent: false };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.end = b => { res.body = b || ''; res.headersSent = true; };
  return res;
}

const lead = (over = {}) => Object.assign({
  name: 'sam lee', email: 'sam@leeplumbing.com.au', country: 'AU', phone: '0412 345 678', trade: 'Plumbing', otherTrade: '',
  employees: '2 - 5 Crew', revenue: '$25k - $50k / mo', ads: 'Under $1,000 / mo', timezone: 'Australia/Sydney',
  pageUrl: 'https://funnel.example/?utm_source=google', elapsedMs: 31000, _gotcha: ''
}, over);

// plan(kind, attempt) -> { status, json } | Error. kind is "internal", "prospect" or "formspree".
function fakeFetch(plan) {
  const calls = [];
  const attempts = {};
  const fn = async (url, opts) => {
    const body = JSON.parse(opts.body);
    const kind = url.includes('formspree') ? 'formspree' : (body.to[0] === 'info.remotie@gmail.com' ? 'internal' : 'prospect');
    attempts[kind] = (attempts[kind] || 0) + 1;
    calls.push({ kind, url, headers: opts.headers, body });
    const r = plan(kind, attempts[kind]);
    if (r instanceof Error) throw r;
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.json || {} };
  };
  fn.calls = calls;
  return fn;
}
const allOk = () => ({ status: 200, json: { id: 'x' } });

async function run(reqOpts, deps = {}) {
  const res = makeRes();
  const logs = [];
  await api.handle(makeReq(reqOpts), res, Object.assign({ env: { RESEND_API_KEY: 're_test' }, log: e => logs.push(e) }, deps));
  return { status: res.statusCode, json: res.body ? JSON.parse(res.body) : null, headers: res.headers, logs };
}

test.beforeEach(() => api._buckets.clear());

test('a good lead sends both emails, multipart, with the right sender and reply-to', async () => {
  const fetch = fakeFetch(allOk);
  const r = await run({ body: lead() }, { fetch });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { ok: true, confirmation: true });
  assert.equal(fetch.calls.length, 2);
  const internal = fetch.calls.find(c => c.kind === 'internal');
  const prospect = fetch.calls.find(c => c.kind === 'prospect');
  assert.equal(internal.url, 'https://api.resend.com/emails');
  assert.equal(internal.headers.Authorization, 'Bearer re_test');
  assert.equal(internal.body.from, 'Remotie Leads <bookings@getremotie.com>');
  assert.deepEqual(internal.body.to, ['info.remotie@gmail.com']);
  assert.equal(internal.body.reply_to, 'sam@leeplumbing.com.au');
  assert.equal(internal.body.subject, 'New Lead: Sam Lee - Plumbing (Australia)');
  assert.equal(prospect.body.from, 'Remotie <bookings@getremotie.com>');
  assert.deepEqual(prospect.body.to, ['sam@leeplumbing.com.au']);
  assert.equal(prospect.body.reply_to, 'info.remotie@gmail.com');
  assert.equal(prospect.body.subject, 'Sam, we received your Remotie request');
  for (const c of [internal, prospect]) {
    assert.ok(!('replyTo' in c.body), 'REST API field is snake_case reply_to');
    assert.ok(c.body.html.length > 500 && c.body.text.length > 300, 'html and text both present');
    assert.ok(Buffer.byteLength(c.body.html) < 15 * 1024, 'html under 15 KB');
    assert.match(c.headers['Idempotency-Key'], /^remotie-[a-f0-9]{48}$/);
    assert.match(c.body.html, /Organic Map Pack \+ AI Search Capture/);
    assert.match(c.body.text, /Organic Map Pack \+ AI Search Capture/);
    assert.ok(!/<script|<img|<link|<style|javascript:/i.test(c.body.html), 'no scripts, images or external CSS');
    // Spam filters read the words people see, so check the subject, the text version and the HTML with tags removed.
    const visible = [c.body.subject, c.body.text, c.body.html.replace(/<[^>]+>/g, ' ')].join(' ');
    BANNED.forEach(re => assert.ok(!re.test(visible + c.body.html), String(re)));
    SPAM.forEach(re => assert.ok(!re.test(visible), String(re)));
    assert.ok(!/\b[A-Z]{6,}\b/.test(c.body.subject + c.body.text), 'no shouting');
  }
  assert.notEqual(internal.headers['Idempotency-Key'], prospect.headers['Idempotency-Key']);
  assert.match(internal.body.text, /\(Australia\/Sydney\)\. UTC \d{4}-/);
  assert.match(prospect.body.text, /You are receiving this confirmation because you requested a consultation slot on Remotie\./);
  assert.ok(r.logs.every(l => !JSON.stringify(l).includes('sam')), 'logs carry no personal data');
});

test('a failed confirmation still captures the lead', async () => {
  const fetch = fakeFetch(kind => (kind === 'prospect' ? { status: 422, json: { name: 'validation_error' } } : allOk()));
  const r = await run({ body: lead() }, { fetch });
  assert.deepEqual(r.json, { ok: true, confirmation: false });
  assert.equal(fetch.calls.filter(c => c.kind === 'formspree').length, 0);
});

test('a failed lead alert retries once, then fails over to Formspree', async () => {
  const fetch = fakeFetch(kind => (kind === 'internal' ? { status: 503 } : allOk()));
  const r = await run({ body: lead() }, { fetch });
  assert.deepEqual(r.json, { ok: true, confirmation: true });
  assert.equal(fetch.calls.filter(c => c.kind === 'internal').length, 2);
  const fs = fetch.calls.find(c => c.kind === 'formspree');
  assert.equal(fs.url, 'https://formspree.io/f/xdeglzdo');
  assert.equal(fs.body._subject, 'New Lead: Sam Lee - Plumbing (Australia)');
  assert.equal(fs.body['Growth Lever'], 'Organic Map Pack + AI Search Capture');
});

test('a 429 from Resend is retried and a concurrent 409 counts as sent', async () => {
  let fetch = fakeFetch((kind, n) => (kind === 'internal' && n === 1 ? { status: 429 } : allOk()));
  let r = await run({ body: lead() }, { fetch });
  assert.deepEqual(r.json, { ok: true, confirmation: true });
  assert.equal(fetch.calls.filter(c => c.kind === 'internal').length, 2);
  fetch = fakeFetch(() => ({ status: 409, json: { name: 'concurrent_idempotent_requests' } }));
  r = await run({ body: lead() }, { fetch });
  assert.deepEqual(r.json, { ok: true, confirmation: true });
});

test('when nothing can store the lead the server says so', async () => {
  const fetch = fakeFetch(() => ({ status: 500 }));
  const r = await run({ body: lead() }, { fetch });
  assert.equal(r.status, 502);
  assert.equal(r.json.captured, false);
  assert.ok(!/resend|formspree/i.test(r.json.message), 'no provider details reach the browser');
});

test('without a Resend key the lead goes to Formspree', async () => {
  const fetch = fakeFetch(allOk);
  const r = await run({ body: lead() }, { fetch, env: {} });
  assert.deepEqual(r.json, { ok: true, confirmation: false });
  assert.deepEqual(fetch.calls.map(c => c.kind), ['formspree']);
});

test('the optional Formspree backup copies every lead', async () => {
  const fetch = fakeFetch(allOk);
  await run({ body: lead() }, { fetch, env: { RESEND_API_KEY: 're_test', ENABLE_FORMSPREE_BACKUP: 'true' } });
  assert.deepEqual(fetch.calls.map(c => c.kind).sort(), ['formspree', 'internal', 'prospect']);
});

test('bots get a quiet ok and no email', async () => {
  for (const over of [{ _gotcha: 'https://spam' }, { elapsedMs: 400 }, { elapsedMs: 'soon' }]) {
    const fetch = fakeFetch(allOk);
    const r = await run({ body: lead(over) }, { fetch });
    assert.equal(r.status, 200, JSON.stringify(over));
    assert.equal(fetch.calls.length, 0, JSON.stringify(over));
  }
});

test('origin rules never block the site itself and refuse foreign sites', async () => {
  const fetch = fakeFetch(allOk);
  let n = 0;
  const fresh = () => lead({ email: `origin${++n}@example.com` }); // keeps the per-email limit out of this test
  assert.equal((await run({ body: fresh(), headers: { origin: 'https://evil.example' } }, { fetch })).status, 403);
  assert.equal((await run({ body: fresh(), headers: { origin: undefined, referer: 'https://funnel.example/?a=1' } }, { fetch })).status, 200);
  assert.equal((await run({ body: fresh(), headers: { origin: undefined, 'sec-fetch-site': 'same-origin' } }, { fetch })).status, 200);
  assert.equal((await run({ body: fresh(), headers: { origin: undefined } }, { fetch })).status, 403);
  assert.equal((await run({ body: fresh(), headers: { host: 'internal', 'x-forwarded-host': 'funnel.example' } }, { fetch })).status, 200);
  const env = { RESEND_API_KEY: 're_test', ALLOWED_ORIGIN: 'https://getremotie.com, https://www.getremotie.com/' };
  const cross = await run({ body: fresh(), headers: { origin: 'https://www.getremotie.com' } }, { fetch, env });
  assert.equal(cross.status, 200);
  assert.equal(cross.headers['access-control-allow-origin'], 'https://www.getremotie.com');
  const pre = await run({ method: 'OPTIONS', headers: { origin: 'https://getremotie.com' } }, { fetch, env });
  assert.equal(pre.status, 204);
});

test('rate limits per IP and per email address', async () => {
  const fetch = fakeFetch(allOk);
  const statuses = [];
  for (let i = 0; i < 7; i++) statuses.push((await run({ body: lead({ email: `p${i}@example.com` }), headers: { 'x-real-ip': '203.0.113.9' } }, { fetch })).status);
  assert.deepEqual(statuses, [200, 200, 200, 200, 200, 200, 429]);
  api._buckets.clear();
  const byEmail = [];
  for (const email of ['sam@example.com', 'SAM@example.com', 'sam@example.com', 'Sam@Example.com']) {
    byEmail.push((await run({ body: lead({ email }) }, { fetch })).status);
  }
  assert.deepEqual(byEmail, [200, 200, 200, 429]);
});

test('bad requests are refused cleanly', async () => {
  const fetch = fakeFetch(allOk);
  assert.equal((await run({ preParsed: false, raw: '{"name": "x"' }, { fetch })).status, 400);
  const getterReq = makeReq({ preParsed: false, raw: '' });
  Object.defineProperty(getterReq, 'body', { get() { throw new SyntaxError('Unexpected token'); } });
  const res = makeRes();
  await api.handle(getterReq, res, { env: { RESEND_API_KEY: 're_test' }, fetch, log: () => {} });
  assert.equal(res.statusCode, 400, 'Vercel throws from req.body on malformed JSON');
  assert.equal((await run({ preParsed: false, raw: JSON.stringify(lead()) }, { fetch })).status, 200, 'plain Node stream works');
  assert.equal((await run({ preParsed: false, raw: 'x'.repeat(20000) }, { fetch })).status, 413);
  const get = await run({ method: 'GET' }, { fetch });
  assert.equal(get.status, 405);
  assert.equal(get.headers.allow, 'POST, OPTIONS');
  assert.equal((await run({ body: lead(), headers: { 'content-type': 'text/plain' } }, { fetch })).status, 415);
  assert.equal(fetch.calls.length, 2, 'only the one valid stream request sent email');
});

test('invalid fields come back as 422 with the field name', async () => {
  const fetch = fakeFetch(allOk);
  let r = await run({ body: lead({ email: 'sam@leeplumbing' }) }, { fetch });
  assert.equal(r.status, 422);
  assert.deepEqual(r.json.errors.map(e => e.field), ['email']);
  r = await run({ body: lead({ name: '<script>alert(1)</script>' }) }, { fetch });
  assert.deepEqual(r.json.errors.map(e => e.field), ['name']);
  r = await run({ body: lead({ trade: 'Other Trade', otherTrade: 'Visit spam.com' }) }, { fetch });
  assert.deepEqual(r.json.errors.map(e => e.field), ['otherTrade']);
  r = await run({ body: lead({ revenue: '$1M / mo' }) }, { fetch });
  assert.deepEqual(r.json.errors.map(e => e.field), ['revenue']);
  assert.equal(fetch.calls.length, 0);
});

test('typed text is escaped in the HTML email', async () => {
  const fetch = fakeFetch(allOk);
  await run({ body: lead({ trade: 'Other Trade', otherTrade: "Tiles & Grout's" }) }, { fetch });
  const internal = fetch.calls.find(c => c.kind === 'internal');
  assert.match(internal.body.html, /Other: Tiles &amp; Grout&#39;s/);
  assert.match(internal.body.text, /Other: Tiles & Grout's/);
  assert.equal(internal.body.subject, "New Lead: Sam Lee - Tiles & Grout's (Australia)");
});

test('sender names with commas are quoted', () => {
  assert.equal(api.readConfig({ SENDER_EMAIL: 'Remotie, Growth Team <bookings@getremotie.com>' }).fromProspect, '"Remotie, Growth Team" <bookings@getremotie.com>');
  assert.equal(api.readConfig({ SENDER_EMAIL: 'bookings@getremotie.com' }).fromInternal, 'Remotie Leads <bookings@getremotie.com>');
});
