# Remotie Growth Funnel

A one-page lead funnel that turns Trade & Home Service Business owners in the United States, Canada and Australia into booked consultation slots for Remotie.

Visitors answer five quick questions (four of them are taps or slider drags) while a live Growth Snapshot diagnoses their business. When they submit, two emails go out at once: a confirmation to the prospect and a lead alert to `info.remotie@gmail.com`. Then the confirmation screen appears.

The page itself is plain HTML, CSS and JavaScript with no build step and nothing to install. Email is sent by one small Vercel function with no dependencies.

Page views, form starts and leads are also reported to Meta, from the browser (Meta Pixel) and from the server (Conversions API), with matching event IDs so Meta counts each once. See [META_PIXEL_CAPI_SETUP.md](META_PIXEL_CAPI_SETUP.md).

## What is in the folder

| File | What it does |
| --- | --- |
| `index.html` | Page content, SEO and social tags, logo, favicons, icon sprite |
| `styles.css` | Colours, fonts, layout, sliders, animations, mobile and reduced-motion rules |
| `app.js` | Form steps, sliders, trade search, phone formats, the Growth Snapshot engine, the submit flow and the Meta event hooks. Its top half is shared with the server function. |
| `meta-pixel.js` | Meta Pixel base code (dataset `1757698228867001`) and the PageView. A file rather than inline code because the CSP blocks inline scripts. |
| `api/submit-lead.js` | Vercel function: checks and validates each lead, blocks bots, sends both emails through Brevo, falls back to Formspree, reports the lead to Meta |
| `api/meta-capi.js` | Vercel function: the server copy of PageView and ViewContent for Meta. It refuses every other event. |
| `api/_lib/meta-capi.js` | Shared Meta helper: hashing, user data and the Graph API call. The underscore keeps it from becoming a public function. |
| `assets/` | Web-sized copies of the Remotie logo: header mark, favicons, Apple touch icon, social preview |
| `Remotie Logo.png` | The original full-size logo. Kept as the source file, not deployed. |
| `vercel.json` | Function timeout plus security and cache headers |
| `.vercelignore` | Keeps the docs, tests, env files and full-size logo off the live site |
| `.gitignore` | Keeps `.env` files (real keys) out of Git |
| `.env.example` | Every environment variable name, with placeholders only |
| `EMAIL_DELIVERABILITY_SETUP.md` | Brevo setup, DNS (Brevo code, DKIM, DMARC) and inbox testing, step by step |
| `META_PIXEL_CAPI_SETUP.md` | Meta token setup, live verification in Events Manager, log codes |
| `tests/` | Automated checks for the page logic, the Growth Snapshot and the email function |

## How a lead is delivered

1. The browser sends the answers to `/api/submit-lead`.
2. The function checks the request comes from this site, applies rate limits, drops bots (a form finished in under 2 seconds, or a link in the hidden bot-trap field), and validates every answer against the fixed option lists. Any other value in the bot-trap, which is usually browser autofill, still arrives as a lead alert marked "Check:", without a confirmation email or a Meta event, so a real lead is never lost.
3. It sends both emails through the Brevo transactional API in parallel (plain `fetch`, no packages):
   - **Prospect confirmation** from `Remotie <bookings@getremotie.com>`, Reply-To `bookings@getremotie.com` (which forwards to `info.remotie@gmail.com`), subject `Sam, we received your Remotie request`. It includes their answers, Growth Snapshot and next steps.
   - **Lead alert** from `Remotie Leads <bookings@getremotie.com>` to `info.remotie@gmail.com`, Reply-To the prospect, subject `New Lead: Sam Lee - Plumbing (Australia)`. It includes every field plus the Growth Snapshot. Hitting Reply in Gmail answers the prospect directly.
4. In parallel it reports the lead to Meta (Conversions API `Lead`, contact details SHA-256 hashed). Meta trouble is only logged: it never fails or blocks a lead.
5. Safety nets, so a lead is never lost:
   - Brevo not set up yet: the lead goes to Formspree instead (the prospect gets no confirmation until Brevo is ready).
   - Every lead is also copied to Formspree, so its dashboard keeps a record even if an email is lost after Brevo accepts it.
   - The lead alert fails: the function retries once, and the Formspree copy (or a failover post) still captures the lead.
   - The function is missing, crashes or refuses the lead (or the page is opened as a file): the browser posts straight to Formspree.

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

1. In Brevo, turn off IP blocking for API keys (Settings > Security > Authorised IPs). Vercel's IP addresses change, so blocking would stop every email.
2. Authenticate `getremotie.com` in Brevo: copy the Brevo code, the two DKIM records and DMARC into Cloudflare or Namecheap (SPF and MX are not needed).
3. Confirm `bookings@getremotie.com` is a verified sender, switch off open and click tracking for transactional emails, and create an API key.
4. In Vercel add `BREVO_API_KEY`, `SENDER_EMAIL` and `ADMIN_EMAIL` (and optionally `ALLOWED_ORIGIN`), then redeploy.
5. Add the Gmail filter, then test with mail-tester.com and Gmail's "Show original".

## Step 4: switch on Meta tracking

The Pixel works as soon as the site is live. For the server half, follow [META_PIXEL_CAPI_SETUP.md](META_PIXEL_CAPI_SETUP.md). The short version: add `META_ACCESS_TOKEN` in Vercel (never in a file), redeploy, then confirm every event shows as **Deduplicated** in Meta Events Manager > Test Events.

## Formspree (safety net)

The form ID is `xdeglzdo`. In the Formspree dashboard keep reCAPTCHA off for this form, and leave "Restrict to domain" off so the function's server-side posts are accepted. Every lead is copied there, so each lead also triggers a Formspree notification. Look in Formspree's **Spam** tab too: submissions it flags as spam never trigger a notification. Set `ENABLE_FORMSPREE_BACKUP=false` in Vercel to stop the copies; Formspree then only receives leads when Brevo is not set up or fails.

## Health check

Open `https://<your-site>/api/submit-lead?check=1` (for example `https://get-quotes.getremotie.com/api/submit-lead?check=1`). It asks Brevo, Formspree and the deployment whether a lead can get through and lists any problem in plain words, with the fix:

- whether Brevo accepts the key from Vercel's IP address, whether transactional email is on, whether the sender is verified and the domain authenticated
- whether Brevo has put the Remotie inbox on its blocked list, and what happened to the last lead alert and confirmation
- whether the Formspree form is live, and whether the Meta files are deployed
- the last few submissions this server handled, as codes only, and which code version is live

It is read-only: it never sends an email and never shows a key, the inbox address or anyone's details. It allows 10 checks per 10 minutes.

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

- `vercel.json` sends a strict Content-Security-Policy. It already allows the Meta Pixel (`connect.facebook.net`, `www.facebook.com`). If you add other analytics, another ad pixel or a chat widget, add its domains to the matching CSP directives or the browser will block it. Inline scripts stay blocked, so new scripts go in their own file.
- The page can only be framed by getremotie.com (`frame-ancestors`).
- The function accepts posts only from the site's own domain (plus any `ALLOWED_ORIGIN`), limits each IP to 6 submissions per 10 minutes and each email address to 3 per hour, and escapes everything it puts into an email. The limits live in the function's memory, so they reset when Vercel starts a fresh instance. That is enough for a lead form. A shared store would be the upgrade if abuse ever shows up in the logs.
- Function logs record only delivery codes and Meta event IDs, never names, emails or phone numbers.
- The Meta Pixel sets the `_fbp` and `_fbc` cookies. Contact details reach Meta only as SHA-256 hashes, and only for a submitted lead.
- Answers to the first four questions are saved for the browser tab session so a reload does not lose progress. Contact details are never stored, and the saved answers are cleared once the form is sent.

## Tests

Needs Node.js 18 or newer. Nothing to install, and the tests never touch the network or send email. From this folder run:

```
node --test
```
