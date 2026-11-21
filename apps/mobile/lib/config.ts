import Constants from 'expo-constants';

/**
 * Server URL. Not a secret, just where the API lives.
 * NEVER put AIVANA_API_KEY (or any secret) in an EXPO_PUBLIC_* variable or in mobile code.
 *
 * Release builds (TestFlight + `eas update`) use app.json → expo.extra.apiUrl. That one committed value is read
 * by both the native build and every OTA update, so a stray local .env can't repoint the demo app.
 * Dev (Expo Go / simulator) uses EXPO_PUBLIC_API_URL (e.g. your LAN IP), else localhost.
 */
const releaseUrl = (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl;
const devUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export const API_URL = (!__DEV__ && releaseUrl ? releaseUrl : devUrl).replace(/\/$/, '');
