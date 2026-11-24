# Meta Pixel and Conversions API setup

The funnel reports three events to Meta dataset `1757698228867001`. Each one is sent twice with the same event ID: once by the browser (Meta Pixel) and once by the server (Conversions API). Meta keeps one copy, and the server copy still arrives when an ad blocker stops the Pixel.

| Event | When | Browser (Pixel) | Server (Conversions API) |
| --- | --- | --- | --- |
| `PageView` | Every page load | `meta-pixel.js` | `/api/meta-capi`, posted by `app.js` once the page has loaded |
| `ViewContent` | The first answer or tap on Next, once per visit | `app.js` | `/api/meta-capi` |
| `Lead` | A submission that passed every check | `app.js`, only after `/api/submit-lead` accepted it | `/api/submit-lead`, with hashed email, phone, first and last name and country |

Bot submissions (honeypot filled, or sent in under 2 seconds) and invalid forms never reach Meta. A Meta outage or a missing token never blocks a lead or its emails: the function logs it and carries on.

## 1. Add the environment variables in Vercel

In Vercel open the project, then **Settings > Environment Variables**:

| Name | Value | Required |
| --- | --- | --- |
| `META_ACCESS_TOKEN` | Your Conversions API access token (it starts with `EAA`) | Yes. Without it, server events are skipped and the Vercel logs say so. |
| `META_DATASET_ID` | `1757698228867001` | Optional. Already the default. |
| `META_TEST_EVENT_CODE` | The `TEST...` code from Events Manager > Test Events | Only while you verify (step 3). Delete it afterwards. |
| `META_API_VERSION` | `v26.0` | Optional. Already the default. See "API version" below. |

Tick **Production** (and **Preview** if you test on preview links), save, then go to **Deployments**, open the menu on the latest deployment and click **Redeploy**. New variables only take effect after a redeploy.

Paste the token into Vercel only. Not into any file in this folder, not into `vercel.json`, a commit, an email or a chat.

To confirm the Meta files are live, open `https://<your-site>/api/submit-lead?check=1`. Under `meta` it shows whether the server helper and the `/api/meta-capi` endpoint are deployed and whether the token is set.

## 2. Check the Pixel (Meta Pixel Helper)

1. Install the **Meta Pixel Helper** extension for Chrome.
2. Open the live site (your Vercel address or custom domain) with any ad blocker paused for it.
3. Click the extension. You want a green tick for Pixel ID `1757698228867001`, exactly one `PageView`, and no warning about the Pixel being initialized more than once.
4. Answer the first question. A `ViewContent` appears.
5. If the extension shows nothing, open the browser's DevTools console and look for a "Content Security Policy" error. `vercel.json` allows `connect.facebook.net` and `www.facebook.com`. Keep both if you ever edit the policy.

## 3. Check browser and server events together (Test Events)

1. In **Meta Events Manager > Data Sources**, open dataset `1757698228867001`, then the **Test Events** tab.
2. Copy the test code it shows (`TEST` followed by numbers), add it in Vercel as `META_TEST_EVENT_CODE`, and redeploy.
3. Under **Test browser events**, enter your live address and click **Open website**. That tab now reports to the Test Events screen.
4. In that tab, answer the questions and submit a test lead with an email address and phone number you can check. Take a few seconds over it, as a person would.
5. Back in Test Events, within a minute you should see:
   - `PageView` from **Browser** and **Server**, marked **Deduplicated**
   - `ViewContent` from **Browser** and **Server**, marked **Deduplicated**
   - `Lead` from **Browser** and **Server**, marked **Deduplicated**. Open the server `Lead`: its customer information lists Email, Phone, First Name, Last Name, Country, External ID, IP address, User agent and Browser ID (fbp). Click ID (fbc) also appears when the visit came from a Meta ad click.
6. Check that both emails from the test lead arrived as before: the confirmation in your test inbox and the lead alert in the Remotie inbox (`ADMIN_EMAIL`), both in Primary.
7. Delete `META_TEST_EVENT_CODE` in Vercel and redeploy. The test code is for verification only.

## 4. Vercel logs

Open the project, then **Logs**, and search for `meta_capi`. Each event writes one line with its name, event ID and result. It never contains a name, email, phone number, hash or the token. A healthy line looks like:

`{"evt":"meta_capi","event_name":"Lead","event_id":"lead_...","ok":true,"status":200,"events_received":1,"fbtrace_id":"..."}`

| What the log shows | What it means | Fix |
| --- | --- | --- |
| `"skipped":"META_ACCESS_TOKEN not configured"` | No token in Vercel | Do step 1, then redeploy |
| `"error":"meta_190"` | Meta refused the token (wrong, expired or revoked) | Generate a new token (see below), update `META_ACCESS_TOKEN`, redeploy |
| `"error":"meta_2635"` | The API version is retired | Set `META_API_VERSION` to the current version (see below) and redeploy |
| Any other `"error":"meta_..."` | Meta refused the event. The `message` says why | Often a mistyped `META_DATASET_ID`, or a token made for another dataset |
| `"error":"timeout"` or `"error":"network"` | Meta was slow or down | Nothing to do. Leads and emails are not affected |
| `"skipped":"no_user_agent"` | A request with no browser behind it, usually a bot | Nothing to do |
| No `Lead` line after a test lead | The submission was dropped as a bot or failed validation | Submit again normally, taking a few seconds |

## Keep the token secret

- The access token lets anyone send events into your dataset. It belongs only in Vercel's environment variables. The server reads it there, and it never reaches the browser.
- `.gitignore` keeps `.env` files out of Git, and `.vercelignore` keeps them off the live site. `.env.example` lists the names only.
- If the token was ever pasted anywhere else (a file, a commit, an email, a chat, a screenshot), treat it as exposed. In **Events Manager**, open the dataset, then **Settings > Conversions API > Generate access token**. Put the new token in Vercel, redeploy, and stop using the old one.

## API version

Meta retires API versions on a schedule. The default here is `v26.0`, the newest version on Meta's versions page in November 2026. `v21.0`, named in the original brief, is already retired for Marketing API calls and leaves the Graph API on January 21, 2027.

When the logs show `meta_2635`, or Meta emails you about a retiring version, set `META_API_VERSION` to the newest version listed at https://developers.facebook.com/docs/graph-api/changelog/versions and redeploy. No code change is needed.

## Privacy

The Pixel sets the `_fbp` cookie, plus `_fbc` after a Meta ad click (the page sets `_fbc` itself when the Pixel is blocked). Email, phone, name and country go to Meta only as SHA-256 hashes, and only for a submitted lead. Mention the Meta Pixel and Conversions API in your privacy policy.
