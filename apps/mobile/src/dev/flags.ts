/**
 * Dev tools (app/dev: vitrine and simulations) exist in development builds only. A release build
 * has `__DEV__ === false`, so the routes redirect home and the Ajustes entry is hidden. QA builds
 * can opt in with EXPO_PUBLIC_DEV_TOOLS=true (never in the production profile).
 */
export const DEV_TOOLS_ENABLED = __DEV__ || process.env.EXPO_PUBLIC_DEV_TOOLS === 'true';
