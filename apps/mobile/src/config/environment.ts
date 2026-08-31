const expoPublicEnvironment = process.env as Record<string, string | undefined>;
const configuredBaseUrl = expoPublicEnvironment.EXPO_PUBLIC_API_BASE_URL?.trim();
const apiBaseUrl = configuredBaseUrl === undefined || configuredBaseUrl.length === 0
  ? null
  : configuredBaseUrl.replace(/\/$/, '');

export const mobileEnvironment = {
  apiBaseUrl,
  apiConfigured: apiBaseUrl !== null,
} as const;
