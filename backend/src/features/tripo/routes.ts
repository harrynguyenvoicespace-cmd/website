import type { Context, Hono } from "hono";
import { HttpError, jsonOk, parseIntegerEnv, readJsonBody } from "../../core/http";
import { adminOnly, assertDownloadUrlAllowed, enforceTripoKey, sha256Hex } from "../../core/security";
import type { AppBindings } from "../../types";
import { TripoClient } from "./client";
import {
  BatchTasksSchema,
  ConvertModelSchema,
  ImageToImageSchema,
  ImageToModelSchema,
  ImportModelSchema,
  InputOnlySchema,
  MeshCompleteSchema,
  MeshDecimateSchema,
  MeshSegmentSchema,
  MultiviewToModelSchema,
  RawTaskSchema,
  RetargetAnimationSchema,
  RigCheckSchema,
  RigModelSchema,
  TextToImageSchema,
  TextToModelSchema,
  TextureModelSchema,
} from "./schemas";
import {
  assertSupportedUpload,
  buildImageToModelPayload,
  buildTextToModelPayload,
  copyHeader,
  isUploadFile,
  normalizeModelAlias,
  parseSchema,
} from "./payload";

export const tripoRouteSummary = {
  generation: [
    "POST /v1/tripo/generation/text-to-model",
    "POST /v1/tripo/generation/image-to-model",
    "POST /v1/tripo/generation/multiview-to-model",
    "POST /v1/tripo/generation/image-to-splat",
    "POST /v1/tripo/generation/text-to-image",
    "POST /v1/tripo/generation/image-to-image",
    "POST /v1/tripo/generation/image-to-multiview",
    "POST /v1/tripo/generation/edit-multiview",
  ],
  models: ["POST /v1/tripo/models/texture", "POST /v1/tripo/models/convert", "POST /v1/tripo/models/import"],
  mesh: ["POST /v1/tripo/mesh/segment", "POST /v1/tripo/mesh/complete", "POST /v1/tripo/mesh/decimate"],
  animations: ["POST /v1/tripo/animations/rig-check", "POST /v1/tripo/animations/rig", "POST /v1/tripo/animations/retarget"],
  common: [
    "GET /v1/tripo/tasks/:taskId",
    "POST /v1/tripo/tasks/list",
    "POST /v1/tripo/tasks",
    "POST /v1/tripo/files",
    "POST /v1/tripo/files/upload-credentials",
    "GET /v1/tripo/account/balance",
    "GET /v1/tripo/account/usage",
    "GET /v1/tripo/download?url=...",
  ],
  legacy_aliases: ["POST /v1/tripo/text-to-model", "POST /v1/tripo/image-to-model", "POST /v1/tripo/upload", "POST /v1/tripo/upload/sts-token", "GET /v1/tripo/balance"],
};

type AppContext = Context<AppBindings>;

export const registerTripoRoutes = (app: Hono<AppBindings>) => {
  const textToModel = (c: AppContext) => createJsonOperation(c, TextToModelSchema, "/generation/text-to-model", buildTextToModelPayload);
  app.post("/v1/tripo/generation/text-to-model", textToModel);
  app.post("/v1/tripo/text-to-model", textToModel);

  const imageToModel = (c: AppContext) => createJsonOperation(c, ImageToModelSchema, "/generation/image-to-model", buildImageToModelPayload);
  app.post("/v1/tripo/generation/image-to-model", imageToModel);
  app.post("/v1/tripo/image-to-model", imageToModel);

  app.post("/v1/tripo/generation/multiview-to-model", (c) => createJsonOperation(c, MultiviewToModelSchema, "/generation/multiview-to-model"));
  app.post("/v1/tripo/generation/image-to-splat", (c) => createJsonOperation(c, InputOnlySchema, "/generation/image-to-splat"));
  app.post("/v1/tripo/generation/text-to-image", (c) => createJsonOperation(c, TextToImageSchema, "/generation/text-to-image"));
  app.post("/v1/tripo/generation/image-to-image", (c) => createJsonOperation(c, ImageToImageSchema, "/generation/image-to-image"));
  app.post("/v1/tripo/generation/image-to-multiview", (c) => createJsonOperation(c, InputOnlySchema, "/generation/image-to-multiview"));
  app.post("/v1/tripo/generation/edit-multiview", (c) => createJsonOperation(c, InputOnlySchema, "/generation/edit-multiview"));

  app.post("/v1/tripo/models/texture", (c) => createJsonOperation(c, TextureModelSchema, "/models/texture"));
  app.post("/v1/tripo/models/convert", (c) => createJsonOperation(c, ConvertModelSchema, "/models/convert"));
  app.post("/v1/tripo/models/import", (c) => createJsonOperation(c, ImportModelSchema, "/models/import"));
  app.post("/v1/tripo/mesh/segment", (c) => createJsonOperation(c, MeshSegmentSchema, "/mesh/segment"));
  app.post("/v1/tripo/mesh/complete", (c) => createJsonOperation(c, MeshCompleteSchema, "/mesh/complete"));
  app.post("/v1/tripo/mesh/decimate", (c) => createJsonOperation(c, MeshDecimateSchema, "/mesh/decimate"));
  app.post("/v1/tripo/animations/rig-check", (c) => createJsonOperation(c, RigCheckSchema, "/animations/rig-check"));
  app.post("/v1/tripo/animations/rig", (c) => createJsonOperation(c, RigModelSchema, "/animations/rig"));
  app.post("/v1/tripo/animations/retarget", (c) => createJsonOperation(c, RetargetAnimationSchema, "/animations/retarget"));

  app.post("/v1/tripo/tasks", async (c) => {
    enforceTripoKey(c.env);
    const body = await readJsonBody<unknown>(c, parseIntegerEnv(c.env.MAX_JSON_BYTES, 1_048_576, 1));
    const input = parseSchema(RawTaskSchema, body);
    const tripo = await new TripoClient(c.env).createTask(normalizeModelAlias(input));
    return jsonOk(c, { task_id: tripo.data?.task_id, data: tripo.data, tripo }, 202);
  });

  app.post("/v1/tripo/tasks/list", async (c) => {
    enforceTripoKey(c.env);
    const body = await readJsonBody<unknown>(c, parseIntegerEnv(c.env.MAX_JSON_BYTES, 1_048_576, 1));
    const input = parseSchema(BatchTasksSchema, body);
    const tripo = await new TripoClient(c.env).batchTasks(input);
    return jsonOk(c, { data: tripo.data, tripo });
  });

  app.get("/v1/tripo/tasks/:taskId", async (c) => {
    enforceTripoKey(c.env);
    const taskId = c.req.param("taskId").trim();
    if (!taskId) throw new HttpError(400, "missing_task_id", "taskId is required");
    const tripo = await new TripoClient(c.env).getTask(taskId, c.req.raw, c.executionCtx);
    return jsonOk(c, { data: tripo.data, tripo });
  });

  app.post("/v1/tripo/files/upload-credentials", async (c) => {
    enforceTripoKey(c.env);
    const tripo = await new TripoClient(c.env).createUploadCredentials();
    return jsonOk(c, { data: tripo.data, tripo }, 201);
  });
  app.post("/v1/tripo/upload/sts-token", async (c) => {
    enforceTripoKey(c.env);
    const tripo = await new TripoClient(c.env).createUploadCredentials();
    return jsonOk(c, { data: tripo.data, tripo }, 201);
  });
  app.post("/v1/tripo/files", filesUpload);
  app.post("/v1/tripo/upload", filesUpload);

  app.get("/v1/tripo/account/balance", adminOnly, async (c) => {
    enforceTripoKey(c.env);
    const tripo = await new TripoClient(c.env).getBalance();
    return jsonOk(c, { data: tripo.data, tripo });
  });
  app.get("/v1/tripo/balance", adminOnly, async (c) => {
    enforceTripoKey(c.env);
    const tripo = await new TripoClient(c.env).getBalance();
    return jsonOk(c, { data: tripo.data, tripo });
  });
  app.get("/v1/tripo/account/usage", adminOnly, async (c) => {
    enforceTripoKey(c.env);
    const tripo = await new TripoClient(c.env).getUsage();
    return jsonOk(c, { data: tripo.data, tripo });
  });

  app.get("/v1/tripo/download", async (c) => {
    const rawUrl = c.req.query("url");
    if (!rawUrl) throw new HttpError(400, "missing_url", "url query parameter is required");
    const url = assertDownloadUrlAllowed(rawUrl, c.env);
    const cacheTtl = parseIntegerEnv(c.env.DOWNLOAD_CACHE_SECONDS, 60, 0);
    const cacheKey = new Request(`${new URL(c.req.url).origin}/__download_cache/${await sha256Hex(url.toString())}`);
    const cached = cacheTtl > 0 ? await caches.default.match(cacheKey) : undefined;
    if (cached) {
      const response = new Response(cached.body, cached);
      response.headers.set("x-cache", "HIT");
      return response;
    }
    const upstream = await fetch(url.toString(), { headers: { accept: c.req.header("accept") ?? "*/*" } });
    if (!upstream.ok || !upstream.body) throw new HttpError(upstream.status >= 400 ? upstream.status : 502, "download_failed", "Could not download file");
    const headers = new Headers();
    copyHeader(upstream.headers, headers, "content-type");
    copyHeader(upstream.headers, headers, "content-length");
    copyHeader(upstream.headers, headers, "content-disposition");
    headers.set("cache-control", `public, max-age=${cacheTtl}`);
    headers.set("x-cache", "MISS");
    const response = new Response(upstream.body, { status: 200, headers });
    if (cacheTtl > 0) c.executionCtx.waitUntil(caches.default.put(cacheKey, response.clone()));
    return response;
  });
};

const filesUpload = async (c: AppContext) => {
  enforceTripoKey(c.env);
  const maxUploadBytes = parseIntegerEnv(c.env.MAX_UPLOAD_BYTES, 157_286_400, 1);
  const contentLength = Number.parseInt(c.req.header("content-length") ?? "0", 10);
  if (contentLength > maxUploadBytes) throw new HttpError(413, "upload_too_large", `Upload must be <= ${maxUploadBytes} bytes`);
  const form = await c.req.formData();
  const file = form.get("file");
  if (!isUploadFile(file)) throw new HttpError(400, "missing_file", "multipart/form-data field 'file' is required");
  if (file.size > maxUploadBytes) throw new HttpError(413, "upload_too_large", `Upload must be <= ${maxUploadBytes} bytes`);
  assertSupportedUpload(file);
  const upstreamForm = new FormData();
  upstreamForm.append("file", file, file.name || "tripo-upload.bin");
  const tripo = await new TripoClient(c.env).uploadDirect(upstreamForm);
  const token = tripo.data?.file_token ?? tripo.data?.image_token;
  return jsonOk(c, { file_token: token, image_token: token, data: tripo.data, tripo }, 201);
};

const createJsonOperation = async (
  c: AppContext,
  schema: Parameters<typeof parseSchema>[0],
  upstreamPath: string,
  buildPayload: (input: Record<string, unknown>) => Record<string, unknown> = normalizeModelAlias,
) => {
  enforceTripoKey(c.env);
  const body = await readJsonBody<unknown>(c, parseIntegerEnv(c.env.MAX_JSON_BYTES, 1_048_576, 1));
  const input = parseSchema(schema, body) as Record<string, unknown>;
  const payload = buildPayload(input);
  const tripo = await new TripoClient(c.env).createOperation(upstreamPath, payload);
  return jsonOk(c, { task_id: tripo.data?.task_id, data: tripo.data, tripo }, 202);
};