import { onlineConfig, onlineEnv } from "./config";

/** True only when this build has a complete, valid online configuration.
 * Kept free of the Supabase SDK so the main bundle can hide online entry
 * points without loading the account client. */
export const onlineAvailable = (() => {
  try { return onlineConfig(onlineEnv()) !== null; } catch { return false; }
})();
