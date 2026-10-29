export interface OnlineConfig { authUrl: string; apiUrl: string; key: string }

/** Only these three variables reach the bundle; passing import.meta.env whole would inline every VITE_ value. */
export const onlineEnv = () => ({
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_NOTSU_API_URL: import.meta.env.VITE_NOTSU_API_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
});

/** Build-time guard: refuse any VITE_ value that looks like a privileged key. */
export function assertNoPrivilegedKeys(env: Record<string, unknown>) {
  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith("VITE_") || typeof value !== "string") continue;
    let serviceRole = false;
    if (value.split(".").length === 3) {
      try { serviceRole = JSON.parse(atob(value.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).role === "service_role"; } catch { /* Not a JWT. */ }
    }
    if (/^sb_secret_/.test(value) || serviceRole) throw new Error(`${name} contains a privileged key. Never expose it to frontend builds.`);
  }
}

export function onlineConfig(env: Record<string, unknown>): OnlineConfig | null {
  const values = [env.VITE_SUPABASE_URL, env.VITE_NOTSU_API_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY];
  if (values.every(value => value === undefined || value === "")) return null;
  if (values.some(value => typeof value !== "string" || !value)) throw new Error("Incomplete online configuration.");
  const [authUrl, apiUrl, key] = values as string[];
  for (const value of [authUrl, apiUrl]) {
    const url = new URL(value);
    if ((url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname))) ||
        url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("Invalid online service URL.");
  }
  let publishable = /^sb_publishable_[A-Za-z0-9_-]+$/.test(key);
  if (!publishable && key.split(".").length === 3) {
    try { publishable = JSON.parse(atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).role === "anon"; }
    catch { /* Reject malformed keys without logging their contents. */ }
  }
  if (!publishable) throw new Error("Online clients require a publishable or anon key. Never embed a privileged key.");
  return { authUrl: new URL(authUrl).origin, apiUrl: new URL(apiUrl).origin, key };
}
