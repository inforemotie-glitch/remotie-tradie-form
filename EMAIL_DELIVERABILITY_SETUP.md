# Email Deliverability Setup (Resend + getremotie.com)

Every form submission sends two emails from `api/submit-lead.js`:

| Email | From | To | Reply-To | Subject |
| --- | --- | --- | --- | --- |
| Prospect confirmation | `Remotie <bookings@getremotie.com>` | the prospect | `info.remotie@gmail.com` | `Sam, we received your Remotie request` |
| Lead alert | `Remotie Leads <bookings@getremotie.com>` | `info.remotie@gmail.com` | the prospect | `New Lead: Sam Lee - Plumbing (Australia)` |

The code side is already done: both emails go out as HTML plus plain text, light and table-based (about 5 to 6 KB), with no images, scripts, tracking pixels or link shorteners, conversational subjects, no spam-trigger words, a clear "why you received this" footer and a correct Reply-To. What is left is proving to Gmail, Outlook and Apple Mail that `getremotie.com` really sent them. That is what SPF, DKIM and DMARC do.

An honest note before you start: no sender can guarantee the inbox. Authentication plus clean content gives you the best possible odds, and the Gmail filter in step 6 makes the lead alerts land in your Primary inbox every time. Plan on 15 to 30 minutes of clicking. DNS changes usually show up within minutes but can take up to 48 hours.

Until this is finished, nothing is lost: if Resend is not set up, every lead still reaches `info.remotie@gmail.com` through Formspree. Only the prospect confirmation waits for this setup.

## 1. Create a Resend account and add your domain

1. Sign up at https://resend.com. The free plan covers a lead funnel's volume (check https://resend.com/pricing for the current limits).
2. Go to **Domains > Add Domain** and enter `getremotie.com`. Pick the region closest to most of your customers, for example `us-east-1`.
3. Resend now shows the exact DNS records for your domain. Keep this page open. The DKIM value is unique to your account, so always copy it from the dashboard.

Optional: Resend suggests sending from a subdomain such as `updates.getremotie.com`, which keeps any email reputation issues away from your main domain. If you choose that, verify `updates.getremotie.com` instead and set `SENDER_EMAIL` to `Remotie <bookings@updates.getremotie.com>` in step 5. Everything else in this guide stays the same.

## 2. Add the DNS records

These are the records Resend asks for. The region part of the MX value matches the region you picked.

| Type | Name / Host | Value | Priority |
| --- | --- | --- | --- |
| MX | `send` | `feedback-smtp.us-east-1.amazonses.com` (copy yours from Resend) | 10 |
| TXT | `send` | `v=spf1 include:amazonses.com ~all` | |
| TXT | `resend._domainkey` | `p=MIGfMA0GCSq...` (long DKIM key, copy it exactly from Resend) | |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@getremotie.com; adkim=r; aspf=r;` | |

### Why this does not break your existing email

- **SPF** for Resend lives on `send.getremotie.com`, not on `getremotie.com`. Your root SPF record (for example Google Workspace) stays exactly as it is. A hostname must only ever have one `v=spf1` record, so never add a second one to the root.
- **MX**: the new MX record is only for `send.getremotie.com` and handles bounce reports. Do not touch the MX records on the root domain.
- **DMARC**: if `_dmarc.getremotie.com` already has a record, edit it instead of adding a second one.

### Cloudflare

1. Open the `getremotie.com` zone, then **DNS > Records > Add record**.
2. Add each row from the table. In the Name field type only `send`, `resend._domainkey` or `_dmarc`. Cloudflare adds the domain for you.
3. Set **Proxy status** to **DNS only** (grey cloud) for every one of these records.

### Namecheap

1. Go to **Domain List > Manage > Advanced DNS**.
2. Under **Host Records**, add the TXT rows with Host `send`, `resend._domainkey` and `_dmarc`.
3. The MX record is added under **Mail Settings**. If your domain currently uses Namecheap Email Forwarding or Private Email on the root, check with Namecheap support before switching Mail Settings to Custom MX, because that switch can change how mail to the root domain is handled. If the root has no mail service on Namecheap, choose Custom MX and add host `send`, the value from Resend and priority 10.

### DMARC, step by step

1. **Start in monitoring mode** with `p=none` (the record in the table). Nothing gets blocked while you confirm everything passes.
2. After one or two weeks of DMARC passes (step 7), tighten to quarantine:
   `v=DMARC1; p=quarantine; rua=mailto:dmarc@getremotie.com; adkim=r; aspf=r;`
3. Optional later: `p=reject` once you are sure every service that sends as `getremotie.com` passes.

**Use relaxed alignment (`aspf=r`), not strict.** Resend's return path is `send.getremotie.com`. Under strict SPF alignment (`aspf=s`) that subdomain does not match `getremotie.com`, so SPF alignment shows as failed. DMARC still passes because DKIM is signed as `getremotie.com`, but relaxed alignment keeps both checks green. Strict DKIM alignment (`adkim=s`) is safe with Resend if you prefer it.

**About `rua` reports:** DMARC reports are only sent to an outside domain if that domain publishes permission to receive them. A gmail.com address cannot do that, so reports sent to `info.remotie@gmail.com` usually never arrive. Use a mailbox on `getremotie.com` (as in the table) or a DMARC report service. If you have neither, you can leave the `rua=` part out. It only controls reports, not delivery.

## 3. Verify the domain and switch off tracking

1. Back in Resend, click **Verify DNS Records**. Wait until the domain shows **Verified**. DKIM can take a little longer than the others.
2. In the domain's settings, make sure **Open Tracking** and **Click Tracking** are **off**. Tracking adds invisible pixels and rewritten links, which hurt inbox placement.

## 4. Create the API key

1. Go to **API Keys > Create API Key**.
2. Permission: **Sending access**. Domain: `getremotie.com`.
3. Copy the key (it starts with `re_`). Resend only shows it once.

## 5. Add the environment variables in Vercel

In Vercel open the project, then **Settings > Environment Variables**, and add:

| Name | Value | Required |
| --- | --- | --- |
| `RESEND_API_KEY` | the `re_...` key from step 4 | Yes |
| `SENDER_EMAIL` | `Remotie <bookings@getremotie.com>` | Yes (must be on the verified domain) |
| `ADMIN_EMAIL` | `info.remotie@gmail.com` | Yes |
| `ALLOWED_ORIGIN` | your live address, for example `https://apply.getremotie.com` | Optional. The site's own domain always works. Add other sites only if they should be allowed to post, comma separated. |
| `ENABLE_FORMSPREE_BACKUP` | leave unset | Optional. `true` also copies every lead to Formspree, so you get two notifications per lead. |

Tick **Production** (and **Preview** if you test on preview links), save, then go to **Deployments**, open the menu on the latest deployment and click **Redeploy**. New variables only take effect after a redeploy.

`bookings@getremotie.com` does not need a real mailbox. It only sends. Replies to the confirmation email go to `ADMIN_EMAIL` through the Reply-To header.

## 6. Make the lead alerts land in Primary every time

In the `info.remotie@gmail.com` inbox:

1. Search for `from:bookings@getremotie.com`.
2. Click the filter icon in the search bar, then **Create filter**.
3. Tick **Never send it to Spam** and **Categorize as: Primary**. Optionally tick **Star it**.
4. Click **Create filter**.

This is the one placement you can fully control, so every lead alert lands where you will see it.

## 7. Test the live setup

1. **mail-tester.com (prospect confirmation):** open https://www.mail-tester.com, copy the one-time address it shows, then submit the live form with that address in the email field and real-looking details. Click **Then check your score**. Aim for 9 or 10 out of 10. This scores the confirmation email only, because the lead alert goes to your own inbox.
2. **Gmail headers (both emails):** submit once more with a Gmail address you can read. Open the confirmation, click the three dots, then **Show original**. Check that **SPF: PASS**, **DKIM: PASS** and **DMARC: PASS** are listed. Do the same on the lead alert in `info.remotie@gmail.com`.
3. **Resend dashboard:** **Emails** should list both messages as **Delivered**.
4. **Vercel logs:** open the project, then **Logs**, and look for a line with `"evt":"lead"`. You want `"captured":true` and `"confirmation":true`. The logs never contain names, emails or phone numbers.

## Troubleshooting

| What you see | What it means | Fix |
| --- | --- | --- |
| Log shows `resend_403` | The sending domain is not verified, or `SENDER_EMAIL` is on a different domain | Finish step 3, and make `SENDER_EMAIL` match the verified domain |
| Log shows `resend_401` | The API key is missing or wrong | Re-copy the key into `RESEND_API_KEY` and redeploy |
| Log shows `resend_not_configured` | `RESEND_API_KEY` is not set | Leads are arriving through Formspree. Add the key and redeploy |
| `"confirmation":false` but the lead alert arrived | The prospect's address rejected the email or Resend refused it | Check Resend's **Emails** page for that message |
| Lead alerts arrive from Formspree instead of Resend | Resend failed, so the function failed over to Formspree | Check the log code for the reason |
| Gmail shows `DMARC: FAIL` | The DKIM record is wrong or not live yet | Re-copy the DKIM value exactly, wait, and verify again |
| Confirmation lands in Promotions | Gmail's own sorting | Rare for single transactional emails. Asking prospects to reply or save the address helps |

## About the Formspree safety net

The function only uses Formspree when Resend is not configured or the lead alert fails. In Formspree's form settings:

- Keep **reCAPTCHA off** for this form. The page and the function submit with code, which reCAPTCHA cannot handle.
- If you switch on **Restrict to domain**, Formspree may refuse the function's server-side failover posts. Leave it off, or test the failover once with a temporarily wrong `RESEND_API_KEY` and confirm the lead still arrives.
