/**
 * Server URL. EXPO_PUBLIC_API_URL is NOT a secret — just where the API lives.
 * NEVER put AIVANA_API_KEY (or any secret) in an EXPO_PUBLIC_* variable or in mobile code.
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
