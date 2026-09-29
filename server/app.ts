import { Hono } from "hono";
import { cors } from "hono/cors";
import { readConfig, type Bindings } from "./config";
import { ApiError } from "./errors";
import { accounts } from "./features/accounts/routes";

const app = new Hono<{ Bindings: Bindings }>();

app.use("*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "no-referrer");
  c.header("X-Request-Id", crypto.randomUUID());
  await next();
});

// Liveness only; it deliberately does not claim that Auth or the database is up.
app.get("/health", (c) => c.json({ status: "ok", service: "notsu-api" }));
app.use("/v1/*", async (c, next) => {
  let config;
  try { config = readConfig(c.env); }
  catch { throw new ApiError(503, "not_configured", "Online services are not configured."); }
  const origin = c.req.header("Origin");
  if (origin && !config.origins.includes(origin)) {
    throw new ApiError(403, "origin_denied", "This origin is not allowed.");
  }
  return cors({ origin: config.origins, allowMethods: ["GET", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Authorization", "Content-Type"], exposeHeaders: ["X-Request-Id"], maxAge: 600 })(c, next);
});
app.route("/v1", accounts);
app.notFound((c) => c.json({ error: { code: "not_found", message: "This endpoint was not found." } }, 404));
app.onError((error, c) => {
  if (error instanceof ApiError) return c.json({ error: { code: error.code, message: error.message } }, error.status);
  // Never log raw Auth errors, request headers, bodies, emails or tokens.
  console.error(JSON.stringify({ event: "api_error", requestId: c.res.headers.get("X-Request-Id") }));
  return c.json({ error: { code: "service_unavailable", message: "Online services are temporarily unavailable. Try again." } }, 503);
});

export default app;
