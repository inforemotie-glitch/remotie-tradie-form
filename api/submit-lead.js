'use strict';
/*
  POST /api/submit-lead  (Vercel Node.js function, zero dependencies)

  Sends two emails through the Brevo transactional API the moment a lead submits:
    1. a confirmation to the prospect (reply-to: bookings@getremotie.com, which forwards to the Remotie inbox)
    2. a lead alert to the Remotie inbox (reply-to: the prospect)
  Beside them it reports the lead to Meta (Conversions API "Lead", see _lib/meta-capi.js). The emails alone decide
  the response: a Meta outage or a missing token is only logged, so it can never fail or block a lead.
  Validation, answer lists and the Growth Snapshot come from ../app.js, so the page and the server never disagree,
  and nothing a visitor types reaches an email unless it passed those checks.

  Environment variables (Vercel > Project > Settings > Environment Variables):
    BREVO_API_KEY            required for email. Without it, leads still reach the inbox through Formspree.
    SENDER_EMAIL             default "Remotie <bookings@getremotie.com>" (a verified Brevo sender on an authenticated domain)
    ADMIN_EMAIL              default "info.remotie@gmail.com" (where lead alerts go)
    REPLY_TO_EMAIL           optional. Reply-To and contact address on the confirmation. Defaults to the sender address,
                             so replies stay on getremotie.com (a gmail.com Reply-To on company mail costs spam-filter points).
    ALLOWED_ORIGIN           optional extra origins allowed to post, comma separated (the site's own host always is)
    ENABLE_FORMSPREE_BACKUP  on by default: every lead is also copied to Formspree, so it holds a record of every lead
                             even if an email is lost later. "false" turns the copy off (Formspree is then only a failover).
    META_*                   Meta Conversions API settings, see _lib/meta-capi.js and META_PIXEL_CAPI_SETUP.md

  Health check: open /api/submit-lead?check=1 in a browser. It asks Brevo, Formspree and this deployment whether
  everything is in place and shows the last few outcomes. Read-only: it never sends an email or shows a key or address.
*/

const crypto = require('node:crypto');
const shared = require('../app.js');

// Meta is optional: if its helper is missing from an upload or broken, leads and emails still go out (?check=1 says so).
let capi = null;
try { capi = require('./_lib/meta-capi.js'); } catch (e) { capi = null; }

const VERSION = '2026-11-25'; // shown by ?check=1, so you can see which code is live
const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';
const MIN_FILL_MS = shared.MIN_FILL_MS || 2000; // a human cannot answer five steps faster than this (the page uses it too)
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

// The last few outcomes this instance handled (event codes and times only), shown by ?check=1 so a test can be traced.
const recent = [];
function remember(now, entry) {
  recent.unshift(Object.assign({ at: new Date(now).toISOString() }, entry));
  if (recent.length > 5) recent.length = 5;
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
    backup: String(env.ENABLE_FORMSPREE_BACKUP || '').trim().toLowerCase() !== 'false',
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

// The site sits behind Cloudflare, so Vercel's own headers carry Cloudflare's address. cf-connecting-ip is the visitor's.
function clientIp(req) {
  return firstHeader(req, 'cf-connecting-ip') || firstHeader(req, 'x-real-ip') || firstHeader(req, 'x-forwarded-for') ||
    (req.socket && req.socket.remoteAddress) || 'unknown';
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

// The idempotency key hashes this submission's ID with the exact email content, sent in Brevo's "headers" map:
// a retry of the same submission is not sent twice, while a new submission always gets a fresh key, even with
// identical answers (without the ID, a repeat test with the same details got no confirmation at all).
async function brevoSend(fetchImpl, apiKey, email, submissionId) {
  const content = JSON.stringify(email);
  const payload = Object.assign({}, email, {
    headers: { IdempotencyKey: 'remotie-' + crypto.createHash('sha256').update(String(submissionId || '') + content).digest('hex').slice(0, 48) }
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
    let r = await brevoSend(fetchImpl, cfg.apiKey, internalMail, meta.submissionId);
    if (!r.ok && r.retryable) { await pause(600); r = await brevoSend(fetchImpl, cfg.apiKey, internalMail, meta.submissionId); }
    return r;
  })();
  const [internal, prospect, backup] = await Promise.all([
    internalTask,
    brevoSend(fetchImpl, cfg.apiKey, prospectMail, meta.submissionId),
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

/* ---------- Meta Conversions API ---------- */

// The server half of the Lead. It reuses the browser Pixel's event ID, so Meta counts one lead, and hashes the
// validated lead, never the raw body. Async, so even a coding slip inside becomes a rejection that allSettled absorbs.
async function metaLead(req, body, lead, pageUrl, deps) {
  if (!capi) {
    deps.log({ evt: 'meta_capi', level: 'warn', event_name: 'Lead', skipped: 'api/_lib/meta-capi.js missing' });
    return { ok: false, skipped: true };
  }
  return capi.sendMetaCapiEvent({
    event_name: 'Lead',
    event_id: capi.isEventId(body.meta_event_id) ? body.meta_event_id : 'lead_' + crypto.randomUUID(),
    event_source_url: capi.httpUrl(body.event_source_url) || pageUrl,
    user_data: capi.buildUserData({ req, email: lead.email, phone: lead.phone, country: lead.country, name: lead.name, fbp: body.meta_fbp, fbc: body.meta_fbc }),
    custom_data: {
      content_name: 'Remotie 360 AI Growth Slot',
      content_category: lead.trade,
      status: 'submitted',
      country: lead.country,
      employees: lead.employees,
      monthly_revenue: lead.revenue,
      monthly_ad_spend: lead.ads
    }
  }, deps);
}

/* ---------- Health check: GET /api/submit-lead?check=1 ---------- */
// Read-only: asks Brevo, Formspree and this deployment whether a lead can get through, in plain words.
// It sends no email, and never shows a key, the inbox address or anyone's details (addresses in reasons become [email]).

const CHECK_RULE = { max: 10, windowMs: 10 * 60 * 1000 };
const CHECK_ALL_RULE = { max: 30, windowMs: 10 * 60 * 1000 }; // site-wide cap: each check makes five Brevo calls
const BAD_EVENTS = ['blocked', 'hardBounces', 'softBounces', 'invalid', 'error', 'spam', 'deferred', 'unsubscribed'];
const redact = s => String(s || '').replace(/\S+@\S+/g, '[email]').slice(0, 200);

async function getJson(fetchImpl, url, init) {
  try {
    const res = await fetchImpl(url, Object.assign({ signal: AbortSignal.timeout(SEND_TIMEOUT_MS) }, init));
    let body = null;
    try { body = await res.json(); } catch (e) { body = null; }
    return { status: res.status, body: body && typeof body === 'object' ? body : {} };
  } catch (e) {
    return { status: 0, body: {} };
  }
}

async function healthCheck(req, cfg, env, fetchImpl) {
  const problems = [];
  const brevo = path => getJson(fetchImpl, 'https://api.brevo.com/v3' + path, { headers: { 'api-key': cfg.apiKey, 'Accept': 'application/json' } });
  const host = firstHeader(req, 'x-forwarded-host') || firstHeader(req, 'host');
  const none = Promise.resolve(null);
  const [account, senders, domains, blocked, events, formspree, metaRoute] = await Promise.all([
    cfg.apiKey ? brevo('/account') : none,
    cfg.apiKey ? brevo('/senders') : none,
    cfg.apiKey ? brevo('/senders/domains') : none,
    cfg.apiKey ? brevo('/smtp/blockedContacts?limit=100&sort=desc') : none,
    cfg.apiKey ? brevo('/smtp/statistics/events?limit=100&days=30&sort=desc') : none,
    // An empty post is refused with "EMPTY" by a live form and never creates a submission.
    getJson(fetchImpl, cfg.formspree, { method: 'POST', headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }, body: '{}' }),
    host ? getJson(fetchImpl, 'https://' + host + '/api/meta-capi', {}) : none
  ]);

  const email = { sender: cfg.senderProspect.email, alert_inbox: env.ADMIN_EMAIL ? 'set in Vercel' : 'default' };
  if (!cfg.apiKey) {
    email.brevo = 'BREVO_API_KEY is not set';
    problems.push('BREVO_API_KEY is missing in Vercel, so no email is sent (leads only reach Formspree). Add it and redeploy.');
  } else if (account.status !== 200) {
    const msg = redact(account.body.message);
    email.brevo = 'key refused (' + (account.status || 'no answer') + (msg ? ': ' + msg : '') + ')';
    problems.push(account.status === 401 && /\bip\b/i.test(msg)
      ? 'Brevo blocks Vercel\'s IP address. In Brevo open Settings > Security > Authorised IPs and turn blocking off.'
      : account.status === 0 ? 'Brevo did not answer. Open this check again in a minute.'
        : 'Brevo refused BREVO_API_KEY. Create a new API key in Brevo (SMTP & API > API keys), paste it into Vercel and redeploy.');
  } else {
    email.brevo = 'key accepted';
    const a = account.body;
    if (a.relay && a.relay.enabled === false) problems.push('Transactional email is switched off on this Brevo account. Ask Brevo support to activate transactional (SMTP) sending.');
    email.plan = (Array.isArray(a.plan) ? a.plan : []).map(p => [p.type, p.creditsType, p.credits].filter(v => v != null).join(' '));
    // Each verdict needs its own call to have answered. If one did not, say so instead of reporting "fine".
    const read = (r, key, what) => {
      const empty = Object.keys(r.body).length === 0 || r.body.count === 0; // Brevo answers {} when there is nothing to list
      if (r.status === 200 && (Array.isArray(r.body[key]) || empty)) return r.body[key] || [];
      const why = r.status !== 200 ? (r.status ? 'HTTP ' + r.status : 'no answer') + (r.body.message ? ': ' + redact(r.body.message) : '') : 'unexpected answer';
      problems.push(`Could not read ${what} from Brevo (${why}). Check it in the Brevo dashboard.`);
      return null;
    };
    const sendersList = read(senders, 'senders', 'the senders');
    if (!sendersList) email.sender_status = 'could not check';
    else {
      const s = sendersList.find(x => String(x.email).toLowerCase() === cfg.senderProspect.email.toLowerCase());
      email.sender_status = s ? (s.active ? 'verified and active' : 'added but not active') : 'not in Brevo';
      if (!s || !s.active) problems.push(`Brevo has no active sender ${cfg.senderProspect.email}. Add and verify it in Brevo under Senders.`);
    }
    const domain = (cfg.senderProspect.email.split('@')[1] || '').toLowerCase();
    const domainsList = read(domains, 'domains', 'the domains');
    if (!domainsList) email.domain_status = 'could not check';
    else {
      const d = domainsList.find(x => String(x.domain_name).toLowerCase() === domain);
      email.domain_status = d ? (d.authenticated ? 'authenticated' : 'added, not authenticated') : 'not in Brevo';
      if (!d || !d.authenticated) problems.push(`The domain ${domain} is not authenticated in Brevo, so mail can be refused or land in spam. Authenticate it in Brevo under Domains.`);
    }
    const blockedList = read(blocked, 'contacts', 'the blocked contacts list');
    if (!blockedList) email.alert_inbox_blocked = 'could not check';
    else {
      const b = blockedList.find(c => String(c.email).toLowerCase() === cfg.admin.toLowerCase());
      email.alert_inbox_blocked = b ? 'YES (' + ((b.reason && b.reason.code) || 'unknown reason') + ')' : 'no';
      if (b) problems.push('Brevo has the Remotie inbox on its blocked list, so every lead alert is accepted and then dropped. Unblock it in Brevo (Transactional > Blocked contacts), then submit a test lead.');
    }
    const evs = read(events, 'events', 'recent delivery events');
    [['lead-alert', 'last_lead_alert'], ['lead-confirmation', 'last_confirmation']].forEach(([tag, key]) => {
      if (!evs) { email[key] = 'could not check'; return; }
      const e = evs.find(x => x && x.tag === tag);
      email[key] = e ? [e.event, e.date, e.reason && redact(e.reason)].filter(Boolean).join(' | ') : 'none in the last 30 days';
      if (e && BAD_EVENTS.includes(e.event)) problems.push(`Brevo reports the last ${tag} as "${e.event}"${e.reason ? ' (' + redact(e.reason) + ')' : ''}. Open Brevo > Transactional > Logs for the details.`);
    });
  }

  const formOk = formspree.status === 400 && (formspree.body.errors || []).some(e => e && e.code === 'EMPTY');
  const formId = cfg.formspree.split('/').pop();
  if (!formOk) problems.push(`Formspree form ${formId} did not answer as expected (${formspree.status || 'no answer'}). Check that it exists and is enabled in the Formspree dashboard.`);

  const meta = {
    server_helper: capi ? 'loaded' : 'missing',
    page_events_endpoint: !metaRoute ? 'unknown' : metaRoute.status === 405 ? 'deployed' : 'missing (HTTP ' + (metaRoute.status || 'no answer') + ')',
    access_token: String(env.META_ACCESS_TOKEN || '').trim() ? 'set' : 'not set',
    test_event_code: String(env.META_TEST_EVENT_CODE || '').trim() ? 'set (delete it after testing)' : 'not set'
  };
  if (!capi) problems.push('Meta: api/_lib/meta-capi.js is missing from the deployment. Upload it (leads and emails work without it).');
  if (metaRoute && metaRoute.status !== 405) problems.push('Meta: api/meta-capi.js is not deployed, so page views and form starts never reach Meta from the server. Upload it into the api folder.');

  return {
    ok: problems.length === 0,
    version: VERSION,
    problems,
    email,
    formspree: { form: formOk ? formId + ' is live' : formId + ' did not answer as expected', copy_of_every_lead: cfg.backup ? 'on' : 'off' },
    meta,
    recent_submissions_on_this_server: recent
  };
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
  const env = deps.env || process.env;
  const cfg = readConfig(env);
  const fetchImpl = deps.fetch || globalThis.fetch;
  const now = typeof deps.now === 'function' ? deps.now() : Date.now();
  const log = deps.log || (entry => console.log(JSON.stringify(entry)));
  const note = entry => { log(entry); remember(now, entry); }; // codes only, never personal data

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
  if (req.method === 'GET' && /[?&]check=1(&|$)/.test(String(req.url || ''))) {
    if (limited('check:' + clientIp(req), CHECK_RULE, now) || limited('check:all', CHECK_ALL_RULE, now)) return send(res, 429, { ok: false, error: 'rate_limited' });
    const report = await healthCheck(req, cfg, env, fetchImpl);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex');
    return res.end(JSON.stringify(report, null, 2));
  }
  if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'method_not_allowed' }, { 'Allow': 'POST, OPTIONS' });
  if (!origin.ok) return send(res, 403, { ok: false, error: 'forbidden_origin', message: 'This form only accepts submissions from the Remotie site.' });
  if (!/^application\/json\b/i.test(firstHeader(req, 'content-type'))) return send(res, 415, { ok: false, error: 'unsupported_media_type' }, cors);
  if (limited('ip:' + clientIp(req), IP_RULE, now)) {
    note({ evt: 'rate_limited', by: 'ip' });
    return send(res, 429, { ok: false, error: 'rate_limited', message: 'Too many attempts. Please wait a few minutes.' }, cors);
  }

  const parsed = await readBody(req);
  if (parsed.error === 'too_large') return send(res, 413, { ok: false, error: 'too_large' }, cors);
  if (parsed.error) return send(res, 400, { ok: false, error: 'bad_json' }, cors);
  const body = parsed.data;

  // Bots: a filled honeypot or an instant submit gets a quiet "ok" and no email, so they learn nothing.
  const elapsed = Number(body.elapsedMs);
  if (String(body._gotcha || '') !== '' || !Number.isFinite(elapsed) || elapsed < MIN_FILL_MS) {
    note({ evt: 'lead_dropped', reason: String(body._gotcha || '') !== '' ? 'honeypot' : 'too_fast' });
    return send(res, 200, { ok: true, confirmation: false }, cors);
  }

  const { lead, errors } = shared.normalizeLead(body);
  if (!lead) {
    note({ evt: 'lead_invalid', fields: errors.map(e => e.field) });
    return send(res, 422, { ok: false, error: 'validation', errors }, cors);
  }
  if (limited('email:' + lead.email.toLowerCase(), EMAIL_RULE, now)) {
    note({ evt: 'rate_limited', by: 'email' });
    return send(res, 429, { ok: false, error: 'rate_limited', message: 'This email address was used several times recently. Please try again later.' }, cors);
  }

  const pageUrl = typeof body.pageUrl === 'string' && /^https?:\/\/[^\s]{1,480}$/i.test(body.pageUrl) ? body.pageUrl : '';
  // The page sends one ID per visit and reuses it on retries, which makes it the right seed for Brevo's idempotency key.
  const submissionId = typeof body.meta_event_id === 'string' && /^[\w-]{8,100}$/.test(body.meta_event_id) ? body.meta_event_id : String(now);
  const meta = { submittedAt: shared.timestamp(new Date(now), typeof body.timezone === 'string' ? body.timezone.slice(0, 64) : ''), pageUrl, submissionId };
  // Only a lead that passed every check above reaches Meta. It runs beside the emails, and only the emails decide the reply.
  const [delivery] = await Promise.allSettled([
    deliver(lead, meta, cfg, fetchImpl),
    metaLead(req, body, lead, pageUrl, { env, fetch: fetchImpl, log })
  ]);
  if (delivery.status === 'rejected') throw delivery.reason; // same 500 path as before
  const result = delivery.value;
  note({ evt: 'lead', captured: result.captured, confirmation: result.confirmation, codes: result.codes });

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
module.exports._recent = recent;
// Request helpers reused by api/meta-capi.js, so both endpoints apply the same origin, body and rate rules.
Object.assign(module.exports, { originCheck, firstHeader, clientIp, limited, readBody, send });
