# Remotie Growth Funnel

A one-page lead funnel that turns Trade & Home Service Business owners in the United States, Canada and Australia into booked consultation slots for Remotie.

Visitors answer five quick questions (four of them are taps or slider drags) while a live Growth Snapshot diagnoses their business. When they submit, two emails go out at once: a confirmation to the prospect and a lead alert to `info.remotie@gmail.com`. Then the confirmation screen appears.

The page itself is plain HTML, CSS and JavaScript with no build step and nothing to install. Email is sent by one small Vercel function with no dependencies.

## What is in the folder

| File | What it does |
| --- | --- |
| `index.html` | Page content, SEO and social tags, logo, favicons, icon sprite |
| `styles.css` | Colours, fonts, layout, sliders, animations, mobile and reduced-motion rules |
| `app.js` | Form steps, sliders, trade search, phone formats, the Growth Snapshot engine and the submit flow. Its top half is shared with the server function. |
| `api/submit-lead.js` | Vercel function: checks and validates each lead, blocks bots, sends both emails through Resend, falls back to Formspree |
| `assets/` | Web-sized copies of the Remotie logo: header mark, favicons, Apple touch icon, social preview |
| `Remotie Logo.png` | The original full-size logo. Kept as the source file, not deployed. |
| `vercel.json` | Function timeout plus security and cache headers |
| `.vercelignore` | Keeps the docs, tests and full-size logo off the live site |
| `EMAIL_DELIVERABILITY_SETUP.md` | Resend, DNS (SPF, DKIM, DMARC) and inbox testing, step by step |
| `tests/` | Automated checks for the page logic, the Growth Snapshot and the email function |

## How a lead is delivered

1. The browser sends the answers to `/api/submit-lead`.
2. The function checks the request comes from this site, applies rate limits, drops bots (hidden honeypot field, or a form finished in under 2 seconds), and validates every answer against the fixed option lists.
3. It sends both emails through Resend in parallel:
   - **Prospect confirmation** from `Remotie <bookings@getremotie.com>`, Reply-To `info.remotie@gmail.com`, subject `Sam, we received your Remotie request`. It includes their answers, Growth Snapshot and next steps.
   - **Lead alert** from `Remotie Leads <bookings@getremotie.com>` to `info.remotie@gmail.com`, Reply-To the prospect, subject `New Lead: Sam Lee - Plumbing (Australia)`. It includes every field plus the Growth Snapshot. Hitting Reply in Gmail answers the prospect directly.
4. Safety nets, so a lead is never lost:
   - Resend not set up yet: the lead goes to Formspree instead (the prospect gets no confirmation until Resend is ready).
   - The lead alert fails: the function retries once, then fails over to Formspree.
   - The function is missing (opened as a file or on a static-only host): the browser posts straight to Formspree.

**Email needs a one-time setup.** Follow [EMAIL_DELIVERABILITY_SETUP.md](EMAIL_DELIVERABILITY_SETUP.md). Until then, leads still reach the inbox through Formspree.

## Preview it on your computer

Double-click `index.html`. The whole funnel works, and submissions go straight to Formspree in this mode because the email function only runs on Vercel.

Test the real two-email flow on your Vercel URL after the setup guide is done.

## Step 1: put it on GitHub

1. On github.com, create a new empty repository, for example `remotie-growth-funnel`. Choose **Private** (the docs and the function contain your inbox address, and Vercel deploys private repositories without any extra setup). Leave "Add a README" unticked.
2. Open a terminal in this folder and run these one at a time. Replace `<your-github-username>` with your GitHub username.

```
git init
git add .
git commit -m "Remotie growth funnel"
git branch -M main
git remote add origin https://github.com/<your-github-username>/remotie-growth-funnel.git
git push -u origin main
```

Prefer clicking? GitHub Desktop does the same: File > Add local repository > pick this folder > Publish repository.

## Step 2: deploy on Vercel

1. Go to https://vercel.com/new and sign in with GitHub.
2. Find `remotie-growth-funnel` and click **Import**.
3. Framework Preset: **Other**. Leave Build Command, Output Directory and Install Command empty. Root Directory stays `./`.
4. Click **Deploy**. Vercel serves the page and turns `api/submit-lead.js` into a function automatically.
5. Every `git push` to `main` redeploys.

Custom domain (optional): Project > Settings > Domains, add for example `apply.getremotie.com`, then add the DNS record Vercel shows (usually a CNAME to `cname.vercel-dns.com`).

## Step 3: switch on email

Follow [EMAIL_DELIVERABILITY_SETUP.md](EMAIL_DELIVERABILITY_SETUP.md). The short version:

1. Resend account, add `getremotie.com`, copy its DNS records into Cloudflare or Namecheap (MX and SPF on `send`, DKIM on `resend._domainkey`, DMARC on `_dmarc`).
2. Verify the domain in Resend, switch off open and click tracking, create a sending API key.
3. In Vercel add `RESEND_API_KEY`, `SENDER_EMAIL`, `ADMIN_EMAIL` (and optionally `ALLOWED_ORIGIN`), then redeploy.
4. Add the Gmail filter, then test with mail-tester.com and Gmail's "Show original".

## Formspree (safety net)

The form ID is `xdeglzdo`. In the Formspree dashboard keep reCAPTCHA off for this form, and leave "Restrict to domain" off so the function's server-side failover is accepted. Formspree only receives leads when Resend is not set up or fails, unless you set `ENABLE_FORMSPREE_BACKUP=true` to copy every lead there.

## Social preview

The social preview image is `assets/og-image.png`, set as a relative path. WhatsApp, iMessage, Slack and similar apps resolve that. Facebook and LinkedIn need a full address, so once your domain is final, edit two lines in `index.html`:

```
<meta property="og:image" content="https://apply.getremotie.com/assets/og-image.png">
<meta name="twitter:image" content="https://apply.getremotie.com/assets/og-image.png">
```

Use your real domain in place of `apply.getremotie.com`.

## Changing things

- **Words on the page:** `index.html`.
- **Growth Snapshot rules:** near the top of `app.js` (`PILLARS`, `LEVERS`, the weight tables and `pickLever`). Reaction lines live in `CREW_REACT`, `REVENUE_REACT` and `ADS_FEEDBACK`.
- **Trade list:** `TRADES` in `app.js`. The `keys` text holds extra search words and slang such as sparky, chippy and brickie.
- **Answer options:** `OPTIONS` in `app.js` and the matching radio buttons in `index.html` (a test checks they stay identical).
- **Email wording:** `prospectEmail` and `internalEmail` in `api/submit-lead.js`.
- **Colours and fonts:** the `:root` block at the top of `styles.css`.
- **Logo:** regenerate the files in `assets/` from `Remotie Logo.png` if the logo changes. Keep the same file names.

## Security and limits

- `vercel.json` sends a strict Content-Security-Policy. If you add analytics, an ad pixel or a chat widget, add its domains to the matching CSP directives or the browser will block it.
- The page can only be framed by getremotie.com (`frame-ancestors`).
- The function accepts posts only from the site's own domain (plus any `ALLOWED_ORIGIN`), limits each IP to 6 submissions per 10 minutes and each email address to 3 per hour, and escapes everything it puts into an email. The limits live in the function's memory, so they reset when Vercel starts a fresh instance. That is enough for a lead form. A shared store would be the upgrade if abuse ever shows up in the logs.
- Function logs record only delivery codes, never names, emails or phone numbers.
- Answers to the first four questions are saved for the browser tab session so a reload does not lose progress. Contact details are never stored, and the saved answers are cleared once the form is sent.

## Tests

Needs Node.js 18 or newer. Nothing to install, and the tests never touch the network or send email. From this folder run:

```
node --test
```
