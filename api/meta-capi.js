'use strict';
/*
  POST /api/meta-capi  (Vercel Node.js function, zero dependencies)

  The server half of the page's PageView and ViewContent events (Meta Conversions API). app.js posts the same
  event ID the browser Pixel used, so Meta keeps one copy of each, and still gets it when an ad blocker stops the Pixel.
  Lead is refused here on purpose: only /api/submit-lead sends it, after a lead passes every check.
  Same origin, body and rate rules as /api/submit-lead. Settings: see _lib/meta-capi.js.
*/

const capi = require('./_lib/meta-capi.js');
const { readConfig, originCheck, firstHeader, clientIp, limited, readBody, send } = require('./submit-lead.js');

const EVENTS = ['PageView', 'ViewContent'];
const BEACON_RULE = { max: 40, windowMs: 10 * 60 * 1000 }; // a page load sends one or two, so this only stops floods

async function handle(req, res, deps) {
  deps = deps || {};
  const env = deps.env || process.env;
  const now = typeof deps.now === 'function' ? deps.now() : Date.now();
  const origin = originCheck(req, readConfig(env));
  const cors = origin.cors ? { 'Access-Control-Allow-Origin': origin.cors, 'Vary': 'Origin' } : null;

  if (req.method === 'OPTIONS') {
    if (!origin.ok) return send(res, 403, { ok: false, error: 'forbidden_origin' });
    res.statusCode = 204;
    if (cors) Object.keys(cors).forEach(k => res.setHeader(k, cors[k]));
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
    res.setHeader('Access-Control-Max-Age', '600');
    return res.end();
  }
  if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'method_not_allowed' }, { 'Allow': 'POST, OPTIONS' });
  if (!origin.ok) return send(res, 403, { ok: false, error: 'forbidden_origin' });
  if (!/^application\/json\b/i.test(firstHeader(req, 'content-type'))) return send(res, 415, { ok: false, error: 'unsupported_media_type' }, cors);
  if (limited('beacon:' + clientIp(req), BEACON_RULE, now)) return send(res, 429, { ok: false, error: 'rate_limited' }, cors);

  const parsed = await readBody(req);
  if (parsed.error) return send(res, parsed.error === 'too_large' ? 413 : 400, { ok: false, error: parsed.error }, cors);
  const b = parsed.data;
  if (!EVENTS.includes(b.event_name)) return send(res, 400, { ok: false, error: 'event_not_allowed' }, cors);
  const url = capi.httpUrl(b.event_source_url);
  if (!capi.isEventId(b.event_id) || !url) return send(res, 400, { ok: false, error: 'bad_event' }, cors);

  // Only the two labels the page sends, as short strings. Anything else a caller adds is dropped.
  const cd = b.custom_data && typeof b.custom_data === 'object' ? b.custom_data : {};
  const custom = {};
  ['content_name', 'content_category'].forEach(k => { if (typeof cd[k] === 'string' && cd[k].length <= 100) custom[k] = cd[k]; });

  await capi.sendMetaCapiEvent({
    event_name: b.event_name,
    event_id: b.event_id,
    event_source_url: url,
    user_data: capi.buildUserData({ req, fbp: b.fbp, fbc: b.fbc }),
    custom_data: Object.keys(custom).length ? custom : undefined
  }, { env, fetch: deps.fetch, log: deps.log });
  return send(res, 200, { ok: true }, cors);
}

module.exports = (req, res) => handle(req, res).catch(() => {
  if (!res.headersSent) send(res, 500, { ok: false, error: 'server_error' });
});
module.exports.handle = handle;
