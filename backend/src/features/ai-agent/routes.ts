import type { Hono } from "hono";
import { jsonOk, parseIntegerEnv, readJsonBody } from "../../core/http";
import type { AppBindings } from "../../types";
import { AgentRequestSchema, createAiAgentResponse } from "./service";
import { parseSchema } from "../tripo/payload";

export const aiAgentRouteSummary = ["POST /v1/ai/agent"];

export const registerAiAgentRoutes = (app: Hono<AppBindings>) => {
  app.post("/v1/ai/agent", async (c) => {
    const body = await readJsonBody<unknown>(c, parseIntegerEnv(c.env.MAX_JSON_BYTES, 1_048_576, 1));
    const input = parseSchema(AgentRequestSchema, body);
    const agent = await createAiAgentResponse(c.env, input);
    return jsonOk(c, agent);
  });
};