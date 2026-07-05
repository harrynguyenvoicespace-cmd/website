import { Hono } from "hono";
import { HttpError, corsMiddleware, jsonOk, requestIdMiddleware } from "./core/http";
import { authMiddleware, rateLimitMiddleware } from "./core/security";
import { RateLimitBucket } from "./durable-objects/rate-limit-bucket";
import { aiAgentRouteSummary, registerAiAgentRoutes } from "./features/ai-agent/routes";
import { hyMotionRouteSummary, registerHyMotionRoutes } from "./features/hymotion/routes";
import { hyMotionStatus } from "./features/hymotion/service";
import { registerRobloxRoutes, robloxRouteSummary } from "./features/roblox/routes";
import { registerTripoRoutes, tripoRouteSummary } from "./features/tripo/routes";
import type { AppBindings } from "./types";

export { RateLimitBucket };

const app = new Hono<AppBindings>();

app.use("*", requestIdMiddleware);
app.use("*", corsMiddleware);
app.use("/v1/*", authMiddleware);
app.use("/v1/*", rateLimitMiddleware);

app.get("/", (c) =>
  jsonOk(c, {
    service: "tripo-cloudflare-api",
    upstream: c.env.TRIPO_BASE_URL ?? "https://openapi.tripo3d.ai/v3",
    routes: {
      health: "GET /health",
      tripo: tripoRouteSummary,
      roblox: robloxRouteSummary,
      hymotion: hyMotionRouteSummary,
      ai: aiAgentRouteSummary,
    },
  }),
);

app.get("/health", (c) =>
  jsonOk(c, {
    status: "ok",
    tripo_key_configured: !!c.env.TRIPO_API_KEY?.trim(),
    client_keys_configured: !!c.env.CLIENT_API_KEYS?.trim(),
    hymotion_configured: hyMotionStatus(c.env).configured,
    timestamp: new Date().toISOString(),
  }),
);

registerTripoRoutes(app);
registerRobloxRoutes(app);
registerHyMotionRoutes(app);
registerAiAgentRoutes(app);

app.notFound((c) => {
  return c.json({ ok: false, request_id: c.get("requestId"), error: { code: "not_found", message: "Route not found" } }, 404);
});

app.onError((error, c) => {
  if (error instanceof HttpError) {
    return c.json(
      { ok: false, request_id: c.get("requestId"), error: { code: error.code, message: error.message, details: error.details } },
      error.status as never,
    );
  }

  console.error(JSON.stringify({ event: "worker_error", message: error instanceof Error ? error.message : String(error) }));
  return c.json(
    { ok: false, request_id: c.get("requestId"), error: { code: "internal_error", message: "Unexpected server error" } },
    500,
  );
});

export default app;