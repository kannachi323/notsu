import { describe, expect, it } from "vitest";
import { onlineConfig } from "./config";

const env = { VITE_SUPABASE_URL: "https://auth.example.test", VITE_NOTSU_API_URL: "https://api.example.test", VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test" };
describe("public online configuration", () => {
  it("keeps entirely unconfigured builds offline", () => { expect(onlineConfig({})).toBeNull(); });
  it("accepts HTTPS or explicit local development URLs", () => {
    expect(onlineConfig(env)?.apiUrl).toBe(env.VITE_NOTSU_API_URL);
    expect(onlineConfig({ ...env, VITE_SUPABASE_URL: "http://127.0.0.1:55321" })?.authUrl).toBe("http://127.0.0.1:55321");
  });
  it.each([{ VITE_NOTSU_API_URL: "" }, { VITE_SUPABASE_PUBLISHABLE_KEY: "sb_secret_do_not_embed" },
    { VITE_SUPABASE_PUBLISHABLE_KEY: `e30.${btoa('{"role":"service_role"}')}.signature` },
    { VITE_NOTSU_API_URL: "http://remote.example.test" }, { VITE_NOTSU_API_URL: "https://api.example.test/?token=bad" },
    { VITE_NOTSU_API_URL: "https://user:password@api.example.test" }])("rejects unsafe/incomplete configuration without echoing keys", patch => {
    expect(() => onlineConfig({ ...env, ...patch })).toThrow();
  });
});
