'use strict';
/*
  Meta Conversions API (CAPI) helper, shared by api/submit-lead.js (Lead) and api/meta-capi.js (PageView, ViewContent).
  The underscore in "_lib" stops Vercel from turning this folder into a public function.

  Email, phone, name and country are normalized and SHA-256 hashed the way Meta specifies before they leave the server.
  IP address, user agent, fbp and fbc go unhashed, as Meta requires.
  sendMetaCapiEvent never throws: a missing token, a timeout or a Meta error is logged and returned, so it can never
  block a lead or its emails.

  Environment variables (Vercel > Project > Settings > Environment Variables):
    META_ACCESS_TOKEN     required to send. Without it every event is skipped with a warning in the logs.
    META_DATASET_ID       default 1757698228867001 (the Pixel / dataset ID, public by design)
    META_API_VERSION      default v26.0. Meta retires versions on a schedule, see META_PIXEL_CAPI_SETUP.md.
    META_TEST_EVENT_CODE  optional. Shows server events in Events Manager > Test Events while you verify. Remove it after.
*/

const crypto = require('node:crypto');
const net = require('node:net');

const DEFAULT_DATASET_ID = '1757698228867001';
const DEFAULT_API_VERSION = 'v26.0';
const TIMEOUT_MS = 4500; // runs beside the emails, so a slow Meta adds at most this to a submit, and never fails it
const COUNTRIES = { us: 'us', 'united states': 'us', ca: 'ca', canada: 'ca', au: 'au', australia: 'au' };
const NAME_SUFFIX = /^(jr|sr|ii|iii|iv)$/;

/* ---------- Normalize and hash (Meta's customer information parameters) ---------- */

function sha256(value) {
  const v = value == null ? '' : String(value);
  return v ? crypto.createHash('sha256').update(v, 'utf8').digest('hex') : undefined;
}
const hashed = v => { const h = sha256(v); return h ? [h] : undefined; };

const normalizeEmail = email => hashed(String(email || '').trim().toLowerCase());

// Digits with the country code and no "+": US/CA 1XXXXXXXXXX, AU 61XXXXXXXXX (the trunk 0 is dropped).
function normalizePhone(phone, countryCode) {
  let d = String(phone || '').replace(/\D/g, '');
  if (!d) return undefined;
  const cc = String(countryCode || '').trim().toUpperCase();
  if (cc === 'US' || cc === 'CA') {
    if (d.length === 10) d = '1' + d;
  } else if (cc === 'AU') {
    if (d.startsWith('610')) d = '61' + d.slice(3); // typed as +61 (0) 4xx
    else if (d.startsWith('0')) d = '61' + d.slice(1);
    else if (!d.startsWith('61')) d = '61' + d;
  }
  return hashed(d);
}

// Lowercase letters only, accents kept as UTF-8: "O'Brien-Lee" becomes "obrienlee", "José" stays "josé".
const cleanName = s => s.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{M}]/gu, '');

// First word is the first name. The last word (skipping Jr, Sr, II, III, IV) is the last name. One word: no last name.
function splitAndNormalizeName(fullName) {
  const words = String(fullName || '').trim().split(/\s+/).map(cleanName).filter(Boolean);
  while (words.length > 2 && NAME_SUFFIX.test(words[words.length - 1])) words.pop();
  return { fn: hashed(words[0]), ln: words.length > 1 ? hashed(words[words.length - 1]) : undefined };
}

// ISO 3166-1 alpha-2, lowercase. Accepts the code or the name the funnel uses.
const normalizeCountry = country => hashed(COUNTRIES[String(country || '').trim().toLowerCase()]);

/* ---------- Request fields (never hashed) ---------- */

const header = (req, name) => {
  const v = req && req.headers ? req.headers[name] : '';
  return String(Array.isArray(v) ? v[0] : v || '');
};

// Behind Cloudflare, cf-connecting-ip is the visitor (Vercel's x-forwarded-for would be Cloudflare's own address).
// Without Cloudflare, Vercel sets x-forwarded-for to the visitor. Only a well-formed IP is sent.
function clientIp(req) {
  const ip = header(req, 'cf-connecting-ip').trim() || header(req, 'x-forwarded-for').split(',')[0].trim() ||
    header(req, 'x-real-ip').trim() || (req && req.socket && req.socket.remoteAddress) || '';
  return net.isIP(ip) ? ip : undefined;
}

// _fbp and _fbc cookie values look like fb.1.1700000000000.<value>. Anything else is dropped.
const metaCookie = v => (typeof v === 'string' && /^fb\.\d\.\d+\.\S{1,500}$/.test(v) ? v : undefined);

const isEventId = v => typeof v === 'string' && /^[\w-]{8,100}$/.test(v);
// Up to 2048 characters: Meta ad landing pages (long fbclid plus utm tags) often pass 500, and losing them loses ad clicks.
const httpUrl = v => (typeof v === 'string' && v.length <= 2048 && /^https?:\/\/\S+$/i.test(v) ? v : '');

// user_data for one event. Hashed: em, ph, fn, ln, country, external_id. As-is: IP, user agent, fbp, fbc.
function buildUserData(o) {
  o = o || {};
  const name = splitAndNormalizeName(o.name);
  const em = normalizeEmail(o.email);
  const ud = {
    em,
    ph: normalizePhone(o.phone, o.country),
    fn: name.fn,
    ln: name.ln,
    country: normalizeCountry(o.country),
    external_id: em,
    client_ip_address: clientIp(o.req),
    client_user_agent: header(o.req, 'user-agent') || undefined,
    fbp: metaCookie(o.fbp),
    fbc: metaCookie(o.fbc)
  };
  Object.keys(ud).forEach(k => { if (ud[k] === undefined) delete ud[k]; });
  return ud;
}

/* ---------- Send ---------- */

// Posts one event to the Graph API and logs one line: event name and ID, the outcome and Meta's trace ID.
// It never logs the URL (the token rides in its query string), hashes or anything a visitor typed.
async function sendMetaCapiEvent(params, deps) {
  deps = deps || {};
  const p = params || {};
  const env = deps.env || process.env;
  const fetchImpl = deps.fetch || globalThis.fetch;
  const log = deps.log || (entry => console.log(JSON.stringify(entry)));
  const note = extra => log(Object.assign({ evt: 'meta_capi', event_name: p.event_name, event_id: p.event_id }, extra));

  const accessToken = String(env.META_ACCESS_TOKEN || '').trim();
  if (!accessToken) {
    note({ level: 'warn', skipped: 'META_ACCESS_TOKEN not configured' });
    return { ok: false, skipped: true, reason: 'META_ACCESS_TOKEN not configured' };
  }
  const userData = p.user_data || {};
  if (!userData.client_user_agent) { // Meta rejects website events without one, and browsers always send it
    note({ level: 'warn', skipped: 'no_user_agent' });
    return { ok: false, skipped: true, reason: 'no user agent' };
  }

  const datasetId = String(env.META_DATASET_ID || DEFAULT_DATASET_ID).trim();
  const apiVersion = String(env.META_API_VERSION || DEFAULT_API_VERSION).trim();
  const testEventCode = String(env.META_TEST_EVENT_CODE || '').trim();
  const body = {
    data: [{
      event_name: p.event_name,
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'website',
      event_id: p.event_id,
      event_source_url: p.event_source_url,
      user_data: userData,
      custom_data: p.custom_data
    }]
  };
  if (testEventCode) body.test_event_code = testEventCode;

  let result;
  try {
    const res = await fetchImpl(`https://graph.facebook.com/${apiVersion}/${datasetId}/events?access_token=${encodeURIComponent(accessToken)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    let j = null;
    try { j = await res.json(); } catch (e) { j = null; }
    const err = j && j.error;
    result = { ok: res.ok && !err, status: res.status };
    if (j && j.events_received != null) result.events_received = j.events_received;
    const trace = (j && j.fbtrace_id) || (err && err.fbtrace_id);
    if (trace) result.fbtrace_id = String(trace);
    // meta_<code>_<subcode>, for example meta_190 (bad token) or meta_2635 (retired API version).
    if (err) {
      result.error = 'meta_' + err.code + (err.error_subcode ? '_' + err.error_subcode : '');
      result.message = String(err.message || '').slice(0, 200);
    } else if (!res.ok) {
      result.error = 'http_' + res.status;
    }
  } catch (e) {
    result = { ok: false, error: e && e.name === 'TimeoutError' ? 'timeout' : 'network' };
  }
  note(result);
  return result;
}

module.exports = {
  sendMetaCapiEvent, buildUserData, isEventId, httpUrl,
  sha256, normalizeEmail, normalizePhone, splitAndNormalizeName, normalizeCountry
};
