# HALO QRH (Adults) – Android app

A small native Android app (Kotlin, one screen) that bundles the whole website, built from `Index.html`,
so it works with **no signal**. Nothing is downloaded at run time and nothing is collected.

- Package name: `org.emevidence.haloqrh`
- Minimum Android 8.0 (API 26); targets Android 16 (API 36)
- Version name and number come from the booklet version (v2.9 → `2.9`, version code `20900`). To re-release
  without changing the booklet, bump `haloAppRevision` in `gradle.properties`.
- Tapping **Download the PDF** saves `HALO-QRH-Adults-v2.9.pdf` to Downloads and opens it.
- Guideline links and email open in the phone's own browser or mail app.
- The screen stays on while the app is open.

## Building

GitHub Actions builds it on every change (workflow **Android app**); download `app-debug.apk` from the run's
Artifacts to install on a phone (allow "install unknown apps").

Locally (needs Node 22, JDK 17+ and the Android SDK):

```sh
npm ci && npm run build          # in the repository root: builds dist/
cd android && ./gradlew assembleDebug bundleRelease
```

## Publishing on Google Play (things only the account owner can do)

1. **Developer account.** Register at <https://play.google.com/console> (one-off US$25 fee, identity
   verification). Personal accounts created after Nov 2023 must run a **closed test with at least 12 testers
   for 14 days** before production. An organisation account (needs a D-U-N-S number) skips that.
2. **Upload key.** Create one once and keep it safe (if it is lost, Google can reset it, but it is a hassle):
   `keytool -genkeypair -v -keystore upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000`
3. **GitHub secrets** (repository → Settings → Secrets and variables → Actions):
   `HALO_KEYSTORE_BASE64` (output of `base64 -w0 upload.jks`), `HALO_KEYSTORE_PASSWORD`, `HALO_KEY_ALIAS`
   (`upload`), `HALO_KEY_PASSWORD`. The next workflow run then produces a signed `app-release.aab`.
4. **Play Console listing.** Create the app, opt in to Play App Signing, upload the `.aab`, and complete:
   store listing (title, short and full description, icon 512×512, at least 2 phone screenshots, feature
   graphic 1024×500), content rating questionnaire, target audience (adults), data safety form (the app
   collects and shares no data), and the privacy policy URL (https://emevidence.org/privacy.html can be used
   if it covers the app). Health apps may also need the health declaration.
