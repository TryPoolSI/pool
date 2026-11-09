# Pool mobile

Expo (React Native) iOS app for Pool. It lives beside the Next.js web app and
shares the same Supabase project.

## Run in the iOS Simulator

```bash
cp .env.example .env.local   # fill in the Supabase URL and publishable key
npm install
npm run ios
```

## Ship to TestFlight

Needs a paid Apple Developer account and an Expo account.

1. Create the app in App Store Connect with bundle ID `com.jacobkurry.pool`.
2. Add the Supabase values to EAS (`.env.local` is not uploaded to cloud builds):

   ```bash
   npx eas-cli@latest env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL --value <url> --visibility plaintext
   npx eas-cli@latest env:create --environment production --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value <key> --visibility plaintext
   ```

3. Build and submit:

   ```bash
   npx testflight
   ```

Build numbers increment automatically (`appVersionSource: remote` in `eas.json`).
