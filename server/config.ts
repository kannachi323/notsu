import type { MapBucket } from "./features/maps/data/media";

export interface Bindings {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  // Server-only: narrow account-deletion and validated map-publication adapters.
  SUPABASE_SECRET_KEY?: string;
  MAP_MEDIA?: MapBucket;
  ALLOWED_ORIGINS: string;
}

export function readConfig(env: Bindings) {
  const url = new URL(env.SUPABASE_URL);
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
      url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Invalid service configuration.");
  }
  const key = env.SUPABASE_PUBLISHABLE_KEY;
  let publicKey = typeof key === "string" && /^sb_publishable_[A-Za-z0-9_-]+$/.test(key);
  // The local CLI still supplies a legacy anon JWT. Never accept a service-role key.
  if (!publicKey && typeof key === "string" && key.split(".").length === 3) {
    try {
      const payload = key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      publicKey = JSON.parse(atob(payload)).role === "anon";
    } catch { /* Invalid configuration fails closed. */ }
  }
  if (!publicKey) throw new Error("Use a publishable or anon key, never a privileged key.");
  const origins = env.ALLOWED_ORIGINS.split(",").map((v) => v.trim()).filter(Boolean);
  if (origins.length === 0 || origins.some((origin) => {
    if (origin === "tauri://localhost") return false;
    try {
      const parsed = new URL(origin);
      return parsed.origin !== origin ||
        (parsed.protocol !== "https:" && !(parsed.protocol === "http:" &&
          ["127.0.0.1", "localhost", "tauri.localhost"].includes(parsed.hostname)));
    } catch { return true; }
  })) throw new Error("Configure exact allowed origins.");
  return { url: url.origin, key, origins };
}
