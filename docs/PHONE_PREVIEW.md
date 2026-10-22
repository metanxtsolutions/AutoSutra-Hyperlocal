# Phone preview

A hosted demo of AutoSutra that you can open and install on a phone. It runs the real application with demo advertising (nothing is sent to Meta or Google) and no real payments, and shows a "Preview" banner on every page.

The app needs a server and a database, so the phone opens a hosted copy. There are two ways to put it on the home screen:

| Way | Best for | How |
|---|---|---|
| Install from the browser | Android and iPhone, quickest | Open the preview link, then **Install app** (Chrome on Android) or **Share → Add to Home Screen** (Safari on iPhone) |
| Android APK | Android, when you want an app file to share | Download the APK from the repository's GitHub releases and install it |

Both open full screen with the AutoSutra icon. Both always show the latest deployed version, because the app content comes from the server.

## 1. Host the preview (Vercel + Neon, free tiers)

1. **Vercel project** from this GitHub repository (Vercel needs access to the `metanxtsolutions` GitHub account). Framework: Next.js. Region: Mumbai (`bom1`, already set in `vercel.json`).
2. **Database**: in the Vercel project, Storage → Create Database → **Neon** (free plan), connected to the project. This sets `DATABASE_URL`.
3. **Environment variables** (Production environment):

| Variable | Value |
|---|---|
| `APP_STAGE` | `preview` |
| `APP_URL` | `https://<project>.vercel.app` |
| `AUTH_SECRET`, `CRON_SECRET` | `openssl rand -base64 48` (each different) |
| `TOKEN_ENCRYPTION_KEY` | `openssl rand -base64 32` |
| `PAYMENT_WEBHOOK_SECRET` | `openssl rand -hex 32` |
| `STORAGE_DRIVER` | `database` |
| `EMAIL_DRIVER` | `outbox` (or `smtp` with the SMTP settings, see DEPLOYMENT.md) |
| `ADS_META_MODE`, `ADS_GOOGLE_MODE` | `demo` |
| `PAYMENT_GATEWAY` / `PAYMENTS_LIVE` | `mock` / `false` |
| `SEED_DEMO_DATA` | `true` |
| `SEED_PASSWORD` | a private password of 12+ characters for the demo accounts |

4. **Deploy.** The build runs the database migrations, creates the demo accounts and builds the app. The app refuses to start as a preview if live ads or live payments are switched on.

## 2. Sign in on the phone

| Account | Role |
|---|---|
| `owner@demo-motors.local` | Dealer group owner (Demo Motors Group, two Mumbai locations) |
| `sales@demo-motors.local` | Sales user |
| `admin@autosutra.local` | AutoSutra super admin |
| `finance@autosutra.local`, `ops@autosutra.local` | AutoSutra finance and campaign operations |

The password is the `SEED_PASSWORD` you set. AutoSutra staff accounts must set up two-step verification (an authenticator app such as Google Authenticator) before the admin console opens.

New sign-ups work too. Without an email provider, verification emails are not delivered: a staff user can find the link under **Admin → Emails** (message contents are only shown outside production).

## 3. Android APK

The workflow **Android preview APK** (`.github/workflows/android-preview.yml`) builds a small Android app (a Trusted Web Activity) that opens the hosted preview in Chrome, full screen.

1. GitHub → Actions → **Android preview APK** → **Run workflow**. Enter the preview host (for example `autosutra-hyperlocal.vercel.app`) and keep **Publish** ticked.
2. When it finishes, open the repository's **Releases** page on the phone, download `autosutra-preview.apk` from the newest `android-preview-…` pre-release and open it. Android asks once to allow installing apps from your browser.
3. **Full screen without a browser bar**: copy the "Signing SHA-256" from the workflow run summary and set on Vercel `ANDROID_APP_PACKAGE=in.autosutra.app.preview` and `ANDROID_APP_SHA256=<fingerprint>`, then redeploy. Until then the app works but shows a thin address bar.

Without a stored signing key, each build is signed with a new throwaway key, so uninstall the previous preview before installing a newer one and update `ANDROID_APP_SHA256`. For a stable key, add the repository secrets `ANDROID_KEYSTORE_BASE64` (a base64-encoded keystore with alias `autosutra`) and `ANDROID_KEYSTORE_PASSWORD`. Never commit a keystore: this repository is public.

## Preview limits

- Demo advertising only: publications show **Demo**, never Active, and report no metrics.
- Uploads over 4.5 MB fail on Vercel (platform request limit).
- Vercel's Hobby plan runs the cron once a day. Publishing and emails still run immediately after each request; scheduled sync and reports wait for the daily run.
- Connecting real Meta or Google accounts is not part of the preview.
- The preview is reachable by anyone with the link. Keep `SEED_PASSWORD` private and do not enter real customer data.
