# Email Deliverability Setup (Brevo + getremotie.com)

Every form submission sends two emails from `api/submit-lead.js` through the Brevo transactional API:

| Email | From | To | Reply-To | Subject |
| --- | --- | --- | --- | --- |
| Prospect confirmation | `Remotie <bookings@getremotie.com>` | the prospect | `bookings@getremotie.com` (forwards to `info.remotie@gmail.com`) | `Sam, we received your Remotie request` |
| Lead alert | `Remotie Leads <bookings@getremotie.com>` | `info.remotie@gmail.com` | the prospect | `New Lead: Sam Lee - Plumbing (Australia)` |

The code side is already done. Both emails go out as HTML plus plain text, light and table-based (about 5 to 6 KB), with no images, scripts or link shorteners, conversational subjects, no spam-trigger words and a clear "why you received this" footer. The confirmation keeps its Reply-To and contact address on `getremotie.com`, because spam filters (including the one mail-tester uses) take points off company mail with a gmail.com Reply-To.

What is left is account setup. Brevo must prove to Gmail, Outlook and Apple Mail that `getremotie.com` really sent these emails.

An honest note before you start: no sender can guarantee the Primary inbox for people outside your own mailbox. Domain authentication, clean content and switching off tracking give the best possible odds. The Gmail filter in step 7 makes your own lead alerts land in Primary every time.

Until this is finished, nothing is lost: if Brevo is not set up or refuses a send, every lead still reaches `info.remotie@gmail.com` through Formspree. Only the prospect confirmation waits for this setup.

## 1. Allow API calls from Vercel (do this first)

Brevo can block API calls that come from IP addresses it has not seen before. Vercel's servers change IP addresses, so with blocking on, every email would fail with "unrecognised IP address".

1. In Brevo, open **Settings > Security > Authorised IPs**.
2. Click **Deactivate** for API keys, so calls are not blocked by IP address. Your API key still protects the account.

If you skip this step, the Vercel logs show `brevo_401:unauthorized` and leads arrive only through Formspree.

## 2. Authenticate getremotie.com

1. Open **Settings > Senders, Domains, IPs > Domains** and open `getremotie.com` (add it if it is not listed).
2. Brevo shows the exact DNS records for your domain. Copy the values from there, because the codes are unique to your account.

| Record | Type | Name / Host | Value |
| --- | --- | --- | --- |
| Brevo code | TXT | `@` (or `getremotie.com`) | `brevo-code:...` (copy from Brevo) |
| DKIM 1 | CNAME | `brevo1._domainkey` | copy from Brevo |
| DKIM 2 | CNAME | `brevo2._domainkey` | copy from Brevo |
| DMARC | TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:bookings@getremotie.com; adkim=r; aspf=r;` |

Some accounts show a single DKIM record of TXT type (usually named `mail._domainkey`) instead of the two CNAME records. Add whichever Brevo shows. The CNAME pair uses a stronger 2048-bit key and is Brevo's current default.

**SPF and MX are not needed.** Brevo only asks for them when you use a dedicated IP. Leave your existing root records alone, including the MX records that forward `bookings@getremotie.com` to Gmail.

**Only one DMARC record.** If `_dmarc.getremotie.com` already exists, edit it instead of adding a second one.

### Cloudflare

1. Open the `getremotie.com` zone, then **DNS > Records > Add record**.
2. Add each row. In the Name field type only `@`, `brevo1._domainkey`, `brevo2._domainkey` or `_dmarc`. Cloudflare adds the domain for you.
3. Set **Proxy status** to **DNS only** (grey cloud) for every one of these records, and leave CNAME flattening off for them. Brevo cannot see a proxied or flattened DKIM record.

### Namecheap

1. Go to **Domain List > Manage > Advanced DNS**.
2. Under **Host Records**, add the TXT and CNAME rows. Host values are `@`, `brevo1._domainkey`, `brevo2._domainkey` and `_dmarc`.

### Finish

In Brevo, click **Authenticate this email domain**. DNS changes usually show up within minutes but can take up to 48 hours. Wait until the domain shows as authenticated.

### DMARC, step by step

1. **Start in monitoring mode** with `p=none` (the record in the table), so nothing is blocked while you confirm everything passes.
2. After one or two weeks of DMARC passes (step 8), tighten to quarantine:
   `v=DMARC1; p=quarantine; rua=mailto:bookings@getremotie.com; adkim=r; aspf=r;`
3. Optional later: `p=reject`, once every service that sends as `getremotie.com` passes.

**Why DMARC passes with Brevo:** Brevo signs every email with DKIM as `getremotie.com`, which lines up with the From address, so DMARC passes on DKIM. SPF passes on Brevo's own bounce domain, which does not line up with `getremotie.com`. That is normal, and it is why relaxed SPF alignment (`aspf=r`) is the right setting. Strict DKIM alignment (`adkim=s`) also works with Brevo if you prefer it.

**About `rua` reports:** Brevo flags a DMARC record without a `rua` tag. The record above sends the daily reports to `bookings@getremotie.com`, which already forwards to your Gmail, so no new mailbox is needed. To keep them out of your inbox, create a Gmail filter for `subject:"Report domain: getremotie.com"` with **Skip the Inbox** and a label such as `DMARC`. If Brevo offers its own report address, that works too. Do not put a gmail.com address in the record: report senders only deliver to outside domains that publish permission to receive them, so a gmail.com address usually gets nothing.

## 3. Check the sender

`bookings@getremotie.com` must appear as a verified sender under **Settings > Senders, Domains, IPs > Senders**. It already forwards to `info.remotie@gmail.com`, so Brevo's verification email and any replies to the confirmation land in your Gmail.

## 4. Switch off tracking for transactional emails

Tracking pixels and rewritten links hurt inbox placement and are not needed here.

1. Open the transactional email settings. Depending on your Brevo version this is **Settings > Automations > Transactional emails > Tracking** or **Transactional > Settings > Tracking**.
2. Turn **Open tracking** and **Click tracking** off. If your account only offers anonymous tracking, turn tracking off where the option is available.

## 5. Create the API key

1. Open **Settings > SMTP & API > API keys** and click **Generate a new API key**.
2. Name it `remotie-funnel` and copy it. It starts with `xkeysib-` and Brevo only shows it once.

## 6. Add the environment variables in Vercel

In Vercel open the project, then **Settings > Environment Variables**:

| Name | Value | Required |
| --- | --- | --- |
| `BREVO_API_KEY` | the `xkeysib-...` key from step 5 | Yes |
| `SENDER_EMAIL` | `Remotie <bookings@getremotie.com>` | Yes (must be the verified sender) |
| `ADMIN_EMAIL` | `info.remotie@gmail.com` | Yes (where lead alerts go) |
| `REPLY_TO_EMAIL` | leave unset | Optional. Defaults to the sender address, which forwards to your Gmail. |
| `ALLOWED_ORIGIN` | your live address, for example `https://apply.getremotie.com` | Optional. The site's own domain always works. Add other sites only if they should be allowed to post, comma separated. |
| `ENABLE_FORMSPREE_BACKUP` | leave unset | Optional. `true` also copies every lead to Formspree, so you get two notifications per lead. |

If an old `RESEND_API_KEY` variable exists from the previous setup, delete it. Tick **Production** (and **Preview** if you test on preview links), save, then go to **Deployments**, open the menu on the latest deployment and click **Redeploy**. New variables only take effect after a redeploy.

## 7. Make the lead alerts land in Primary every time

In the `info.remotie@gmail.com` inbox:

1. Search for `from:bookings@getremotie.com`.
2. Click the filter icon in the search bar, then **Create filter**.
3. Tick **Never send it to Spam** and **Categorize as: Primary**. Optionally tick **Star it**.
4. Click **Create filter**.

This is the one placement you can fully control, so every lead alert lands where you will see it.

## 8. Test the live setup

1. **mail-tester.com (prospect confirmation):** open https://www.mail-tester.com, copy the one-time address it shows, then submit the live form with that address in the email field and real-looking details. Click **Then check your score**. Aim for 9 or 10 out of 10. This scores the confirmation only, because the lead alert goes to your own inbox.
2. **Gmail headers (both emails):** submit once more with a Gmail address you can read. Open the confirmation, click the three dots, then **Show original**. Check for **DKIM: PASS** with `getremotie.com` and **DMARC: PASS**. SPF shows PASS for Brevo's own domain, which is expected. Do the same on the lead alert in `info.remotie@gmail.com`.
3. **Brevo logs:** open **Transactional > Logs** (or **Real-time**). Both emails should show as **Delivered**, tagged `lead-confirmation` and `lead-alert`.
4. **Vercel logs:** open the project, then **Logs**, and look for a line with `"evt":"lead"`. You want `"captured":true` and `"confirmation":true`. The logs never contain names, emails or phone numbers.

## Troubleshooting

| What the Vercel log shows | What it means | Fix |
| --- | --- | --- |
| `brevo_not_configured` | `BREVO_API_KEY` is not set | Leads are arriving through Formspree. Add the key and redeploy |
| `brevo_401:unauthorized` | Wrong key, or Brevo is blocking Vercel's IP address | Re-copy the key, and redo step 1 |
| `brevo_400:invalid_parameter` | The sender is not verified, the domain is not authenticated, or `SENDER_EMAIL` is mistyped | Finish steps 2 and 3, and check `SENDER_EMAIL` |
| `brevo_402` | Your Brevo plan is out of sending credits | Check your plan. Each lead uses two sends |
| `brevo_429` | Too many sends too fast | The function retries once automatically. Check your plan's limits if it repeats |
| A code ending in `:permission_denied` | Brevo has not switched on transactional sending for your account yet (common on new accounts) | Contact Brevo support and ask them to activate transactional (SMTP) sending |
| Any other `brevo_` code | Brevo refused the send. The text after the colon is Brevo's own error code | Open **Transactional > Logs** in Brevo and check your account status |
| `"confirmation":false` but the alert arrived | Brevo refused only the prospect's address (for example a typo or a blocked address) | Check that message in Brevo's transactional logs |
| Lead alerts come from Formspree instead of Brevo | Brevo failed, so the function failed over to Formspree | The code after `internal:` in the log says why |
| Gmail shows `DMARC: FAIL` | The DKIM records are wrong, proxied, or not live yet | Re-copy them exactly, set DNS only, wait, and authenticate again |

## About the Formspree safety net

The function only uses Formspree when Brevo is not configured or the lead alert fails. In Formspree's form settings:

- Keep **reCAPTCHA off** for this form. The page and the function submit with code, which reCAPTCHA cannot handle.
- If you switch on **Restrict to domain**, Formspree may refuse the function's server-side failover posts. Leave it off, or test the failover once with a temporarily wrong `BREVO_API_KEY` and confirm the lead still arrives.
