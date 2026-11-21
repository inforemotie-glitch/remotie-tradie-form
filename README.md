# Remotie Tradie Funnel

A one-page lead funnel that turns trade business owners in the United States, Canada and Australia into booked calls for Remotie.

Visitors answer five quick questions (four of them are taps or slider drags), watch a live Growth Snapshot build as they go, then leave their name, email and phone. Every lead is posted to Formspree, which emails it to the Remotie inbox, and the visitor gets an instant confirmation screen.

There is no framework, no build step and nothing to install. The browser reads the files directly, so the page loads fast and deploys as a plain static site.

## What is in the folder

| File | What it does |
| --- | --- |
| `index.html` | Page content, SEO and social tags, inline SVG icons, flags and favicon |
| `styles.css` | Colours, fonts, layout, sliders, animations, mobile and reduced-motion rules |
| `app.js` | Step logic, sliders, trade search, phone formatting, Growth Snapshot, Formspree submit |
| `vercel.json` | Clean URLs plus security and cache headers for Vercel |
| `tests/app.test.js` | Checks for phone formats, validation, snapshot logic and the lead email payload |

## Preview it on your computer

Option 1: double-click `index.html`. The whole funnel works in the browser.

Option 2 (closest to the live site): open a terminal in this folder and run a tiny local server, then open http://localhost:8080

```
python -m http.server 8080
```

Test real submissions from the live Vercel URL rather than from a file on your computer.

## Step 1: put it on GitHub

1. On github.com, create a new empty repository, for example `remotie-tradie-funnel`. Leave "Add a README" unticked because this folder already has one.
2. Open a terminal in this folder and run these commands one at a time. Replace `<your-github-username>` with your GitHub username.

```
git init
git add .
git commit -m "Remotie tradie funnel"
git branch -M main
git remote add origin https://github.com/<your-github-username>/remotie-tradie-funnel.git
git push -u origin main
```

Prefer clicking to typing? GitHub Desktop does the same thing: File > Add local repository > pick this folder > Publish repository.

## Step 2: deploy on Vercel

1. Go to https://vercel.com/new and sign in with GitHub.
2. Find `remotie-tradie-funnel` in the list and click **Import**.
3. Framework Preset: **Other**. Leave Build Command, Output Directory and Install Command empty. Root Directory stays `./`.
4. Click **Deploy**. About 30 seconds later you get a live link such as `https://remotie-tradie-funnel.vercel.app`.
5. From now on, every `git push` to `main` redeploys the site automatically.

### Use your own domain (optional)

In the Vercel project go to Settings > Domains and add a domain such as `apply.getremotie.com`. Vercel shows the DNS record to add at your domain provider (usually a CNAME pointing to `cname.vercel-dns.com`). HTTPS is set up for you.

## Step 3: Formspree checklist

The form sends JSON to `https://formspree.io/f/xdeglzdo`.

1. In the Formspree dashboard, open this form and confirm the notification email goes to the Remotie inbox.
2. Keep reCAPTCHA **off** for this form (Settings > Spam protection). The page submits in the background with JavaScript, which Formspree's reCAPTCHA page cannot handle. A hidden `_gotcha` honeypot field still blocks basic spam bots.
3. Optional: in the form settings, restrict submissions to your live domain.
4. Send one test lead from the live site and check that the email arrives.

Each lead email has the subject `New Remotie Tradie Lead: Name (Trade - Country)` and these fields, in this order:

Full Name, Email, Country, Phone Number (with +1 or +61), Trade / Service, Employees, Monthly Revenue, Monthly Ad Spend, Submitted At, Page URL.

Hit Reply on the email and it goes straight to the lead (the form sends `_replyto`). Page URL keeps any `utm_` tags from your ads, so you can see which campaign each lead came from.

If a send fails (no signal, Formspree down, a rejected field), the visitor sees an orange message and can tap again. Nothing they typed is lost.

## Changing things

- **Words on the page:** `index.html`.
- **Feedback lines and the Growth Snapshot rules:** near the top of `app.js` (`CREW_REACT`, `REVENUE_REACT`, `ADS_FEEDBACK`, `growthSnapshot`).
- **Trade list:** `TRADES` in `app.js`. The `keys` text holds extra search words and slang such as sparky, chippy and brickie.
- **Colours and fonts:** the `:root` block at the top of `styles.css`.
- **Form endpoint:** `ENDPOINT` at the top of `app.js`.

Answers to the first four questions are kept for the browser tab session, so a visitor who switches apps or reloads picks up where they left off. Name, email and phone are never stored, and the saved answers are cleared once the form is sent.

## Security and caching

`vercel.json` sends a strict Content-Security-Policy. If you later add analytics, an ad pixel or a chat widget, add its domains to the matching CSP directives (`script-src`, `connect-src`, `img-src`), or the browser will block it.

The page can only be shown inside an iframe on getremotie.com (`frame-ancestors`), which stops other sites from framing it.

HTML, CSS and JS revalidate on every visit. Vercel answers with a quick "not modified" when nothing changed, and a new deploy shows up instantly with no stale files.

## Tests

Needs Node.js 18 or newer. Nothing to install. From this folder run:

```
node --test
```
