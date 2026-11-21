'use strict';
/*
  POST /api/submit-lead  (Vercel Node.js function, zero dependencies)

  Sends two emails through the Brevo transactional API the moment a lead submits:
    1. a confirmation to the prospect (reply-to: bookings@getremotie.com, which forwards to the Remotie inbox)
    2. a lead alert to the Remotie inbox (reply-to: the prospect)
  Validation, answer lists and the Growth Snapshot come from ../app.js, so the page and the server never disagree,
  and nothing a visitor types reaches an email unless it passed those checks.

  Environment variables (Vercel > Project > Settings > Environment Variables):
    BREVO_API_KEY            required for email. Without it, leads still reach the inbox through Formspree.
    SENDER_EMAIL             default "Remotie <bookings@getremotie.com>" (a verified Brevo sender on an authenticated domain)
    ADMIN_EMAIL              default "info.remotie@gmail.com" (where lead alerts go)
    REPLY_TO_EMAIL           optional. Reply-To and contact address on the confirmation. Defaults to the sender address,
                             so replies stay on getremotie.com (a gmail.com Reply-To on company mail costs spam-filter points).
    ALLOWED_ORIGIN           optional extra origins allowed to post, comma separated (the site's own host always is)
    ENABLE_FORMSPREE_BACKUP  "true" to also copy every lead to Formspree (expect duplicate notifications)
*/

const crypto = require('node:crypto');
const shared = require('../app.js');

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';
const MIN_FILL_MS = 2000; // a human cannot answer five steps faster than this
const MAX_BODY_BYTES = 16 * 1024;
// Worst case: two Brevo attempts + 0.6 s pause + Formspree failover = 12.6 s, inside the 15 s maxDuration in vercel.json,
// so a hanging provider still ends in a failover or a 502 (which makes the browser post to Formspree itself), never a timeout.
const SEND_TIMEOUT_MS = 4000;
const IP_RULE = { max: 6, windowMs: 10 * 60 * 1000 };
const EMAIL_RULE = { max: 3, windowMs: 60 * 60 * 1000 };

// shortcut: rate limits live in this instance's memory and reset on a cold start.
// Move them to a shared store (Vercel KV or Upstash Redis) if abuse ever shows up in the logs.
const buckets = new Map();

function limited(key, rule, now) {
  const hits = (buckets.get(key) || []).filter(t => now - t < rule.windowMs);
  const blocked = hits.length >= rule.max;
  if (!blocked) hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 2000) {
    for (const [k, v] of buckets) if (!v.some(t => now - t < EMAIL_RULE.windowMs)) buckets.delete(k);
  }
  return blocked;
}

// Brevo takes the sender as { name, email } and builds the From header itself, so names need no quoting here.
function readConfig(env) {
  const sender = String(env.SENDER_EMAIL || 'Remotie <bookings@getremotie.com>').trim();
  const m = sender.match(/^\s*"?([^"<]*?)"?\s*<([^>\s]+)>\s*$/);
  const address = (m ? m[2] : sender).trim();
  const display = ((m && m[1].trim()) || 'Remotie').replace(/["\\]/g, '');
  return {
    apiKey: String(env.BREVO_API_KEY || '').trim(),
    senderProspect: { name: display, email: address },
    senderInternal: { name: 'Remotie Leads', email: address },
    contact: String(env.REPLY_TO_EMAIL || address).trim(),
    admin: String(env.ADMIN_EMAIL || 'info.remotie@gmail.com').trim(),
    allowed: String(env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim().replace(/\/+$/, '').toLowerCase()).filter(Boolean),
    backup: String(env.ENABLE_FORMSPREE_BACKUP || '').trim().toLowerCase() === 'true',
    formspree: shared.FORMSPREE_ENDPOINT
  };
}

/* ---------- Request checks ---------- */

function firstHeader(req, name) {
  const v = req.headers[name];
  return String(Array.isArray(v) ? v[0] : v || '').split(',')[0].trim();
}

// The site's own host is always accepted, whatever ALLOWED_ORIGIN says. Only a foreign origin is refused.
function originCheck(req, cfg) {
  const host = (firstHeader(req, 'x-forwarded-host') || firstHeader(req, 'host')).toLowerCase();
  const sameHost = url => { try { return new URL(url).host.toLowerCase() === host; } catch (e) { return false; } };
  const origin = firstHeader(req, 'origin').replace(/\/+$/, '').toLowerCase();
  if (origin && origin !== 'null') {
    if (sameHost(origin)) return { ok: true, cors: null };
    if (cfg.allowed.includes(origin)) return { ok: true, cors: origin };
    return { ok: false };
  }
  const referer = firstHeader(req, 'referer');
  if (referer && sameHost(referer)) return { ok: true, cors: null };
  if (firstHeader(req, 'sec-fetch-site') === 'same-origin') return { ok: true, cors: null };
  return { ok: false };
}

function clientIp(req) {
  return firstHeader(req, 'x-real-ip') || firstHeader(req, 'x-forwarded-for') || (req.socket && req.socket.remoteAddress) || 'unknown';
}

// Vercel pre-parses JSON into req.body (its getter throws on malformed JSON). Plain Node gives us a stream.
async function readBody(req) {
  let pre;
  try { pre = req.body; } catch (e) { return { error: 'bad_json' }; }
  let raw;
  if (pre !== undefined && pre !== null) {
    if (typeof pre === 'object' && !Buffer.isBuffer(pre)) {
      if (Buffer.byteLength(JSON.stringify(pre)) > MAX_BODY_BYTES) return { error: 'too_large' };
      return Array.isArray(pre) ? { error: 'bad_json' } : { data: pre };
    }
    raw = Buffer.isBuffer(pre) ? pre.toString('utf8') : String(pre);
  } else {
    raw = await new Promise(resolve => {
      const chunks = [];
      let size = 0;
      let done = false;
      const finish = v => { if (!done) { done = true; resolve(v); } };
      req.on('data', c => {
        size += c.length;
        if (size > MAX_BODY_BYTES) finish({ tooLarge: true });
        else chunks.push(c);
      });
      req.on('end', () => finish(Buffer.concat(chunks).toString('utf8')));
      req.on('error', () => finish({ broken: true }));
    });
    if (raw && raw.tooLarge) return { error: 'too_large' };
    if (raw && raw.broken) return { error: 'bad_json' };
  }
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) return { error: 'too_large' };
  try {
    const data = JSON.parse(raw);
    return data && typeof data === 'object' && !Array.isArray(data) ? { data } : { error: 'bad_json' };
  } catch (e) {
    return { error: 'bad_json' };
  }
}

/* ---------- Email templates (light, table-based, inline CSS, html + text) ---------- */

const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const FONT = 'font-family:Arial,Helvetica,sans-serif;';

function page(title, preheader, inner, footer) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f4f6;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:8px;">
<tr><td height="4" bgcolor="#ff5e00" style="height:4px;line-height:4px;font-size:4px;background-color:#ff5e00;border-radius:8px 8px 0 0;">&nbsp;</td></tr>
<tr><td style="padding:22px 28px 0 28px;${FONT}"><p style="margin:0;font-size:22px;line-height:28px;font-weight:bold;color:#0b0d10;">remotie</p></td></tr>
<tr><td style="padding:14px 28px 6px 28px;${FONT}font-size:15px;line-height:24px;color:#1f2937;">
${inner}
</td></tr>
<tr><td style="padding:16px 28px 22px 28px;${FONT}font-size:12px;line-height:18px;color:#6b7280;border-top:1px solid #e5e7eb;">${footer}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

const h2 = text => `<h2 style="margin:22px 0 8px 0;font-size:16px;line-height:22px;color:#0b0d10;">${esc(text)}</h2>`;
const para = html => `<p style="margin:0 0 12px 0;">${html}</p>`;

function rowsTable(rows) {
  const tr = rows.map(([k, v]) => `<tr><td style="padding:8px 12px 8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;vertical-align:top;width:40%;">${esc(k)}</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#111827;font-weight:bold;vertical-align:top;">${v}</td></tr>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;font-size:14px;line-height:20px;">${tr}</table>`;
}

function snapshotRows(s) {
  return [
    ['Primary growth lever', esc(s.lever)],
    ['Recommended Remotie stack', `1. ${esc(s.stackNames[0])}<br>2. ${esc(s.stackNames[1])}`],
    ['Strategic insight', esc(s.insight)]
  ];
}

function prospectEmail(lead, cfg) {
  const first = shared.firstName(lead.name);
  const s = lead.snapshot;
  const subject = first ? `${first}, we received your Remotie request` : 'Your Remotie growth slot request is received';
  const answers = [['Trade', lead.tradeLabel], ['Crew size', lead.employees], ['Monthly revenue', lead.revenue], ['Monthly ad spend', lead.ads]];
  const why = 'You are receiving this confirmation because you requested a consultation slot on Remotie.';

  const text = [
    `Hi ${first},`,
    '',
    'Thanks for requesting a growth slot with Remotie. We have your details, and a member of our team will contact you by phone or email to confirm a time that suits you.',
    '',
    'Your business snapshot',
    ...answers.map(([k, v]) => `- ${k}: ${v}`),
    '',
    'Your Growth Snapshot',
    `- Primary growth lever: ${s.lever}`,
    `- Recommended Remotie stack: 1) ${s.stackNames[0]}, 2) ${s.stackNames[1]}`,
    `- Strategic insight: ${s.insight}`,
    '',
    'What happens next',
    '1. We review your answers before we speak.',
    `2. We contact you on ${lead.phone} or at this email address to confirm your slot.`,
    '3. On the call, we walk you through your custom 360° AI growth plan.',
    '',
    'Questions before then? Reply to this email and it comes straight to our team.',
    '',
    'The Remotie team',
    'https://getremotie.com',
    '',
    '--',
    `${why} Contact us at ${cfg.contact}.`
  ].join('\n');

  const inner = [
    para(`Hi ${esc(first)},`),
    para('Thanks for requesting a growth slot with Remotie. We have your details, and a member of our team will contact you by phone or email to confirm a time that suits you.'),
    h2('Your business snapshot'),
    rowsTable(answers.map(([k, v]) => [k, esc(v)])),
    h2('Your Growth Snapshot'),
    rowsTable(snapshotRows(s)),
    h2('What happens next'),
    `<ol style="margin:0 0 12px 0;padding:0 0 0 20px;"><li style="margin:0 0 6px 0;">We review your answers before we speak.</li><li style="margin:0 0 6px 0;">We contact you on <strong>${esc(lead.phone)}</strong> or at this email address to confirm your slot.</li><li style="margin:0;">On the call, we walk you through your custom 360° AI growth plan.</li></ol>`,
    para('Questions before then? Reply to this email and it comes straight to our team.'),
    para('The Remotie team<br><a href="https://getremotie.com" style="color:#0b6e4f;">getremotie.com</a>')
  ].join('\n');

  const html = page(subject, `Thanks, ${first}. Here is your Growth Snapshot and what happens next.`, inner,
    `${esc(why)} Contact us at ${esc(cfg.contact)} or visit <a href="https://getremotie.com" style="color:#6b7280;">getremotie.com</a>.`);

  return {
    sender: cfg.senderProspect,
    to: [{ email: lead.email, name: lead.name }],
    replyTo: { email: cfg.contact, name: 'Remotie' },
    subject,
    htmlContent: html,
    textContent: text,
    tags: ['lead-confirmation']
  };
}

function internalEmail(lead, meta, cfg) {
  const s = lead.snapshot;
  const subject = shared.leadSubject(lead);
  const first = shared.firstName(lead.name);
  const telHref = 'tel:' + lead.phone.replace(/[^\d+]/g, '');
  const rows = [
    ['Full Name', esc(lead.name)],
    ['Email', `<a href="mailto:${esc(lead.email)}" style="color:#0b6e4f;">${esc(lead.email)}</a>`],
    ['Phone Number', `<a href="${esc(telHref)}" style="color:#0b6e4f;">${esc(lead.phone)}</a>`],
    ['Country', esc(lead.countryName)],
    ['Trade / Service', esc(lead.tradeLabel)],
    ['Employees', esc(lead.employees)],
    ['Monthly Revenue', esc(lead.revenue)],
    ['Monthly Ad Spend', esc(lead.ads)]
  ];

  const text = [
    'New lead from the Remotie growth funnel',
    '',
    `Full Name: ${lead.name}`,
    `Email: ${lead.email}`,
    `Phone Number: ${lead.phone}`,
    `Country: ${lead.countryName}`,
    `Trade / Service: ${lead.tradeLabel}`,
    `Employees: ${lead.employees}`,
    `Monthly Revenue: ${lead.revenue}`,
    `Monthly Ad Spend: ${lead.ads}`,
    '',
    'Growth Snapshot',
    `Primary growth lever: ${s.lever}`,
    `Recommended stack: 1) ${s.stackNames[0]}, 2) ${s.stackNames[1]}`,
    `Strategic insight: ${s.insight}`,
    '',
    `Submitted At: ${meta.submittedAt}`,
    `Page URL: ${meta.pageUrl || 'not provided'}`,
    '',
    `Reply to this email to reach ${first} directly.`
  ].join('\n');

  const inner = [
    para(`<strong>${esc(lead.name)}</strong> just requested a growth slot. Reply to this email to reach ${esc(first)} directly.`),
    h2('Lead details'),
    rowsTable(rows),
    h2('Growth Snapshot'),
    rowsTable(snapshotRows(s)),
    h2('Submission'),
    rowsTable([['Submitted At', esc(meta.submittedAt)], ['Page URL', esc(meta.pageUrl || 'not provided')]])
  ].join('\n');

  const html = page(subject, `${lead.name}, ${lead.tradeShort}, ${lead.countryName}: ${s.lever}`, inner,
    'Sent by the Remotie growth funnel when a visitor submitted the lead form.');

  return {
    sender: cfg.senderInternal,
    to: [{ email: cfg.admin, name: 'Remotie' }],
    replyTo: { email: lead.email, name: lead.name },
    subject,
    htmlContent: html,
    textContent: text,
    tags: ['lead-alert']
  };
}

/* ---------- Delivery ---------- */

const pause = ms => new Promise(r => setTimeout(r, ms));

// The idempotency key is a hash of the exact email content, sent in Brevo's "headers" map:
// a retry of identical content is not sent twice, and changed content always gets a fresh key.
async function brevoSend(fetchImpl, apiKey, email) {
  const content = JSON.stringify(email);
  const payload = Object.assign({}, email, {
    headers: { IdempotencyKey: 'remotie-' + crypto.createHash('sha256').update(content).digest('hex').slice(0, 48) }
  });
  let res;
  try {
    res = await fetchImpl(BREVO_URL, {
      method: 'POST',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS)
    });
  } catch (e) {
    return { ok: false, retryable: true, code: e && e.name === 'TimeoutError' ? 'brevo_timeout' : 'brevo_network' };
  }
  if (res.ok) return { ok: true, code: 'brevo_' + res.status };
  let errCode = '';
  try { const j = await res.json(); errCode = j && typeof j.code === 'string' ? j.code.slice(0, 48) : ''; } catch (e) { errCode = ''; }
  // An idempotency conflict means an earlier attempt with the same content already went out.
  if (/duplicate_request|idempot/i.test(errCode)) return { ok: true, code: 'brevo_' + res.status + '_already_sent' };
  // 401 usually means a wrong key, or Brevo's "authorised IPs" blocking is on (Vercel IPs change). See the setup guide.
  return { ok: false, retryable: res.status === 429 || res.status >= 500, code: 'brevo_' + res.status + (errCode ? ':' + errCode : '') };
}

async function postFormspree(fetchImpl, url, payload) {
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS)
    });
    return { ok: res.ok, code: 'formspree_' + res.status };
  } catch (e) {
    return { ok: false, code: e && e.name === 'TimeoutError' ? 'formspree_timeout' : 'formspree_network' };
  }
}

async function deliver(lead, meta, cfg, fetchImpl) {
  const formspreePayload = shared.buildFormspreePayload(lead, meta);
  if (!cfg.apiKey) {
    // Brevo not set up yet: the lead still reaches the inbox through Formspree.
    const fs = await postFormspree(fetchImpl, cfg.formspree, formspreePayload);
    return { captured: fs.ok, confirmation: false, codes: ['brevo_not_configured', fs.code] };
  }
  const internalMail = internalEmail(lead, meta, cfg);
  const prospectMail = prospectEmail(lead, cfg);
  const internalTask = (async () => {
    let r = await brevoSend(fetchImpl, cfg.apiKey, internalMail);
    if (!r.ok && r.retryable) { await pause(600); r = await brevoSend(fetchImpl, cfg.apiKey, internalMail); }
    return r;
  })();
  const [internal, prospect, backup] = await Promise.all([
    internalTask,
    brevoSend(fetchImpl, cfg.apiKey, prospectMail),
    cfg.backup ? postFormspree(fetchImpl, cfg.formspree, formspreePayload) : Promise.resolve(null)
  ]);
  const codes = ['internal:' + internal.code, 'prospect:' + prospect.code];
  if (backup) codes.push('backup:' + backup.code);
  let captured = internal.ok || Boolean(backup && backup.ok);
  if (!captured) {
    // The lead alert failed: fail over to Formspree so the lead is never lost.
    const failover = await postFormspree(fetchImpl, cfg.formspree, formspreePayload);
    codes.push('failover:' + failover.code);
    captured = failover.ok;
  }
  return { captured, confirmation: prospect.ok, codes };
}

/* ---------- Handler ---------- */

function send(res, status, body, extra) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (extra) Object.keys(extra).forEach(k => res.setHeader(k, extra[k]));
  res.end(JSON.stringify(body));
}

const GENERIC = 'We could not send your details just now. Please try again.';

async function handle(req, res, deps) {
  deps = deps || {};
  const cfg = readConfig(deps.env || process.env);
  const fetchImpl = deps.fetch || globalThis.fetch;
  const now = typeof deps.now === 'function' ? deps.now() : Date.now();
  const log = deps.log || (entry => console.log(JSON.stringify(entry)));

  const origin = originCheck(req, cfg);
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
  if (!origin.ok) return send(res, 403, { ok: false, error: 'forbidden_origin', message: 'This form only accepts submissions from the Remotie site.' });
  if (!/^application\/json\b/i.test(firstHeader(req, 'content-type'))) return send(res, 415, { ok: false, error: 'unsupported_media_type' }, cors);
  if (limited('ip:' + clientIp(req), IP_RULE, now)) return send(res, 429, { ok: false, error: 'rate_limited', message: 'Too many attempts. Please wait a few minutes.' }, cors);

  const parsed = await readBody(req);
  if (parsed.error === 'too_large') return send(res, 413, { ok: false, error: 'too_large' }, cors);
  if (parsed.error) return send(res, 400, { ok: false, error: 'bad_json' }, cors);
  const body = parsed.data;

  // Bots: a filled honeypot or an instant submit gets a quiet "ok" and no email, so they learn nothing.
  const elapsed = Number(body.elapsedMs);
  if (String(body._gotcha || '') !== '' || !Number.isFinite(elapsed) || elapsed < MIN_FILL_MS) {
    log({ evt: 'lead_dropped', reason: String(body._gotcha || '') !== '' ? 'honeypot' : 'too_fast' });
    return send(res, 200, { ok: true, confirmation: false }, cors);
  }

  const { lead, errors } = shared.normalizeLead(body);
  if (!lead) return send(res, 422, { ok: false, error: 'validation', errors }, cors);
  if (limited('email:' + lead.email.toLowerCase(), EMAIL_RULE, now)) {
    return send(res, 429, { ok: false, error: 'rate_limited', message: 'This email address was used several times recently. Please try again later.' }, cors);
  }

  const pageUrl = typeof body.pageUrl === 'string' && /^https?:\/\/[^\s]{1,480}$/i.test(body.pageUrl) ? body.pageUrl : '';
  const meta = { submittedAt: shared.timestamp(new Date(now), typeof body.timezone === 'string' ? body.timezone.slice(0, 64) : ''), pageUrl };
  const result = await deliver(lead, meta, cfg, fetchImpl);
  log({ evt: 'lead', captured: result.captured, confirmation: result.confirmation, codes: result.codes }); // codes only, never personal data

  if (!result.captured) return send(res, 502, { ok: false, error: 'delivery_failed', captured: false, message: GENERIC }, cors);
  return send(res, 200, { ok: true, confirmation: result.confirmation }, cors);
}

module.exports = (req, res) => handle(req, res).catch(() => {
  if (!res.headersSent) send(res, 500, { ok: false, error: 'server_error', message: GENERIC });
});
module.exports.handle = handle;
module.exports.prospectEmail = prospectEmail;
module.exports.internalEmail = internalEmail;
module.exports.readConfig = readConfig;
module.exports._buckets = buckets;
