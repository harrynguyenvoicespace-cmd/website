import type { Hono } from "hono";
import { HttpError, jsonOk, parseIntegerEnv } from "../../core/http";
import { adminOnly } from "../../core/security";
import type { AppBindings } from "../../types";
import { createRobloxModelAsset, getRobloxAssetOperation, robloxOpenCloudStatus } from "./open-cloud";
import { robloxValidationMetadata, validateRobloxModelFile } from "./validation";

export const robloxRouteSummary = [
  "GET /v1/roblox/open-cloud/status",
  "GET /v1/roblox/avatar-validation/rules",
  "POST /v1/roblox/avatar-validation/check",
  "POST /v1/roblox/assets/models",
  "GET /v1/roblox/assets/operations/:operationId",
];

export const registerRobloxRoutes = (app: Hono<AppBindings>) => {
  app.get("/v1/roblox/open-cloud/status", adminOnly, (c) => jsonOk(c, { roblox: robloxOpenCloudStatus(c.env) }));
  app.get("/v1/roblox/avatar-validation/rules", (c) => jsonOk(c, { roblox: robloxValidationMetadata(c.env) }));

  app.post("/v1/roblox/avatar-validation/check", async (c) => {
    const maxUploadBytes = parseIntegerEnv(c.env.ROBLOX_MAX_MODEL_BYTES, 20 * 1024 * 1024, 1);
    const contentLength = Number.parseInt(c.req.header("content-length") ?? "0", 10);
    if (contentLength > maxUploadBytes + 16 * 1024) {
      throw new HttpError(413, "roblox_model_too_large", `Roblox model validation upload must be <= ${maxUploadBytes} bytes`);
    }
    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "missing_file", "multipart/form-data field 'file' is required");
    const result = await validateRobloxModelFile(c.env, {
      file,
      assetType: String(form.get("assetType") ?? "accessory"),
      rulesJson: String(form.get("rulesJson") ?? ""),
    });
    return jsonOk(c, { roblox: result });
  });

  app.post("/v1/roblox/assets/models", adminOnly, async (c) => {
    const maxUploadBytes = parseIntegerEnv(c.env.ROBLOX_MAX_MODEL_BYTES, 20 * 1024 * 1024, 1);
    const contentLength = Number.parseInt(c.req.header("content-length") ?? "0", 10);
    if (contentLength > maxUploadBytes + 4096) {
      throw new HttpError(413, "roblox_model_too_large", `Roblox model upload must be <= ${maxUploadBytes} bytes`);
    }
    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "missing_file", "multipart/form-data field 'file' is required");
    const dryRun = String(form.get("dryRun") ?? "").toLowerCase() === "true";
    const result = await createRobloxModelAsset(c.env, {
      file,
      displayName: String(form.get("displayName") ?? ""),
      description: String(form.get("description") ?? ""),
      dryRun,
    });
    return jsonOk(c, { roblox: result }, dryRun ? 200 : 202);
  });

  app.get("/v1/roblox/assets/operations/:operationId", adminOnly, async (c) => {
    const operationId = c.req.param("operationId");
    if (!operationId) throw new HttpError(400, "missing_operation_id", "operationId is required");
    const result = await getRobloxAssetOperation(c.env, operationId);
    return jsonOk(c, { roblox: result });
  });
};