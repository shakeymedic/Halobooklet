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
   collects and shares no data), and the privacy policy URL (https://emevidence.org/privacy.html, which has a
   section on the apps). See [Play Console answers](#play-console-answers) below.

## Play Console answers

Prepared from what the app actually does (checked 12 October 2026). Jake must confirm them before submitting,
because the developer is responsible for their accuracy.

- **Data safety:** "Does your app collect or share any of the required user data types?" **No.** The app has no
  accounts, no analytics and no network calls of its own; links open in the phone's browser, which the form
  does not count. Saving the PDF stays on the device.
- **Account deletion:** not applicable (no accounts).
- **Permissions:** none.
- **Ads:** none. **App access:** all functionality is available without special access.
- **Target audience:** 18 and over (healthcare professionals). **Content rating:** answer the questionnaire; the
  procedures include drawings of surgical procedures, so answer any question about medical or graphic
  content honestly.
- **Health apps declaration:** Medical, **Medical reference and education**. It is a cognitive aid and teaching
  resource, not a medical device; Jake should confirm he is happy with that position.
- **Testing:** a personal developer account created after 13 November 2023 must run a closed test with at least
  12 testers, opted in for 14 days in a row, before production is unlocked.
- **Target API level:** Google Play needs API 36 for new apps and updates from 31 August 2026. The app targets 36.
- **16 KB page size:** not affected; the app has no native code.
- **Play Integrity API:** not used, and not needed. It protects requests from an app to its own server, and this
  app has no server. Play App Signing (step 4) is still worth turning on.
