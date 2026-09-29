export interface OnlineConfig { authUrl: string; apiUrl: string; key: string }

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
