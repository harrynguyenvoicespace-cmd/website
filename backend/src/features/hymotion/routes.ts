import type { Hono } from "hono";
import { jsonOk, parseIntegerEnv, readJsonBody } from "../../core/http";
import type { AppBindings } from "../../types";
import { createHyMotionGeneration, HyMotionGenerateSchema, hyMotionStatus, proxyHyMotionAnimation } from "./service";
import { parseSchema } from "../tripo/payload";

export const hyMotionRouteSummary = ["GET /v1/hymotion/status", "POST /v1/hymotion/generate", "GET /v1/hymotion/animations/:filename"];

export const registerHyMotionRoutes = (app: Hono<AppBindings>) => {
  app.get("/v1/hymotion/status", (c) => jsonOk(c, { hymotion: hyMotionStatus(c.env) }));

  app.post("/v1/hymotion/generate", async (c) => {
    const body = await readJsonBody<unknown>(c, parseIntegerEnv(c.env.MAX_JSON_BYTES, 1_048_576, 1));
    const input = parseSchema(HyMotionGenerateSchema, body);
    const result = await createHyMotionGeneration(c.env, input, new URL(c.req.url).origin);
    return jsonOk(c, result, 201);
  });

  app.get("/v1/hymotion/animations/:filename", (c) => proxyHyMotionAnimation(c.env, c.req.param("filename")));
};