import { z } from "zod";
import { HttpError } from "../../core/http";
import type { RuntimeEnv } from "../../types";

const HYMOTION_FORMATS = ["bvh", "glb", "gltf", "fbx", "rbxm", "rbxmx"] as const;

export const HyMotionGenerateSchema = z
  .object({
    prompt: z.string().trim().min(1).max(500),
    duration: z.number().min(0.5).max(12).optional(),
    cfg_scale: z.number().min(1).max(10).optional(),
    seed: z.number().int().optional(),
    format: z.enum(HYMOTION_FORMATS).default("rbxm"),
    zero_root_xz: z.boolean().optional(),
    scale: z.number().min(0.001).max(1000).optional(),
    loop: z.boolean().optional(),
  })
  .passthrough();

export type HyMotionGenerateInput = z.infer<typeof HyMotionGenerateSchema>;

export const hyMotionStatus = (env: RuntimeEnv) => {
  const baseUrl = configuredBaseUrl(env);
  return {
    configured: !!baseUrl,
    base_url: baseUrl || undefined,
    api_key_configured: !!env.HYMOTION_API_KEY?.trim(),
    formats: HYMOTION_FORMATS,
  };
};

export const createHyMotionGeneration = async (
  env: RuntimeEnv,
  input: HyMotionGenerateInput,
  publicOrigin: string,
) => {
  const baseUrl = requireBaseUrl(env);
  const response = await fetchHyMotion(`${baseUrl}/generate`, "hymotion_unreachable", {
    method: "POST",
    headers: upstreamHeaders(env, "application/json"),
    body: JSON.stringify(compactHyMotionPayload(input)),
  });

  const payload = await parseUpstreamJson(response, "hymotion_generate_failed");
  const rawDownloadUrl = typeof payload.download_url === "string" ? payload.download_url : "";
  const filename = animationFilename(rawDownloadUrl, baseUrl);
  const proxiedUrl = filename ? `${publicOrigin}/hymotion/animations/${encodeURIComponent(filename)}` : "";
  const downloadUrl = proxiedUrl || absolutizeUrl(rawDownloadUrl, baseUrl);
  const format = String(payload.format || input.format || "rbxm").toLowerCase();

  const output: Record<string, unknown> = {
    id: payload.id,
    prompt: payload.prompt,
    rewritten_prompt: payload.rewritten_prompt,
    format,
    duration: payload.duration,
    fps: payload.fps,
    num_frames: payload.num_frames,
    generation_time: payload.generation_time,
  };

  if (downloadUrl) {
    output.download_url = downloadUrl;
    output.animation_url = downloadUrl;
    output[`${format}_url`] = downloadUrl;
  }

  return {
    task_id: payload.id,
    data: {
      ...payload,
      download_url: downloadUrl || payload.download_url,
    },
    output,
  };
};

export const proxyHyMotionAnimation = async (env: RuntimeEnv, filename: string) => {
  const baseUrl = requireBaseUrl(env);
  const safeName = sanitizeAnimationFilename(filename);
  const response = await fetchHyMotion(
    `${baseUrl}/animations/${encodeURIComponent(safeName)}`,
    "hymotion_download_unreachable",
    {
      headers: upstreamHeaders(env, "*/*"),
    },
  );

  if (!response.ok || !response.body) {
    const payload = await parseMaybeJson(response);
    throw new HttpError(
      response.status >= 400 ? response.status : 502,
      "hymotion_download_failed",
      upstreamMessage(payload, "Could not download HyMotion animation"),
      payload,
    );
  }

  const headers = new Headers();
  const contentLength = response.headers.get("content-length");
  if (contentLength) headers.set("content-length", contentLength);
  headers.set("content-type", mediaTypeFor(safeName));
  headers.set("content-disposition", `attachment; filename="${safeName.replace(/"/g, "")}"`);
  headers.set("cache-control", "private, max-age=60");

  return new Response(response.body, {
    status: 200,
    headers,
  });
};

const configuredBaseUrl = (env: RuntimeEnv) =>
  (env.HYMOTION_BASE_URL || env.MODAL_HYMOTION_BASE_URL || "").trim().replace(/\/$/, "");

const requireBaseUrl = (env: RuntimeEnv) => {
  const baseUrl = configuredBaseUrl(env);
  if (!baseUrl) {
    throw new HttpError(
      503,
      "hymotion_not_configured",
      "HYMOTION_BASE_URL is missing. Set it to a deployed HyMotion API URL or set MODAL_HYMOTION_BASE_URL to a reachable remote URL.",
    );
  }
  return baseUrl;
};

const upstreamHeaders = (env: RuntimeEnv, accept: string) => {
  const headers = new Headers({ accept });
  if (accept === "application/json") {
    headers.set("content-type", "application/json");
  }

  const apiKey = env.HYMOTION_API_KEY?.trim();
  if (apiKey) {
    headers.set("authorization", `Bearer ${apiKey}`);
    headers.set("x-api-key", apiKey);
  }

  return headers;
};

const fetchHyMotion = async (url: string, code: string, init: RequestInit) => {
  try {
    return await fetch(url, init);
  } catch (error) {
    throw new HttpError(
      502,
      code,
      "Could not reach HyMotion service. Set HYMOTION_BASE_URL or MODAL_HYMOTION_BASE_URL to a reachable remote URL.",
      error instanceof Error ? error.message : String(error),
    );
  }
};

const compactHyMotionPayload = (input: HyMotionGenerateInput): Record<string, unknown> => {
  const payload: Record<string, unknown> = { ...input };
  Object.entries(payload).forEach(([key, value]) => {
    if (value === undefined || value === "") {
      delete payload[key];
    }
  });
  payload.format = String(payload.format || "rbxm").toLowerCase();
  return payload;
};

const parseUpstreamJson = async (response: Response, code: string) => {
  const payload = await parseMaybeJson(response);
  if (!response.ok) {
    throw new HttpError(
      response.status >= 400 ? response.status : 502,
      code,
      upstreamMessage(payload, "HyMotion request failed"),
      payload,
    );
  }
  if (!payload || typeof payload !== "object") {
    throw new HttpError(502, "hymotion_invalid_response", "HyMotion did not return JSON");
  }
  return payload as Record<string, unknown>;
};

const parseMaybeJson = async (response: Response) => {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text.slice(0, 2000) };
  }
};

const upstreamMessage = (payload: unknown, fallback: string) => {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const detail = record.detail ?? record.message ?? record.error ?? record.raw;
    if (typeof detail === "string" && detail.trim()) return detail;
  }
  return fallback;
};

const absolutizeUrl = (value: string, baseUrl: string) => {
  if (!value) return "";
  try {
    return new URL(value, `${baseUrl}/`).toString();
  } catch {
    return value;
  }
};

const animationFilename = (value: string, baseUrl: string) => {
  if (!value) return "";
  try {
    const url = new URL(value, `${baseUrl}/`);
    const name = url.pathname.split("/").pop() || "";
    return isAnimationFilename(name) ? name : "";
  } catch {
    const name = value.split(/[\\/]/).pop() || "";
    return isAnimationFilename(name) ? name : "";
  }
};

const sanitizeAnimationFilename = (filename: string) => {
  const safeName = filename.split(/[\\/]/).pop() || "";
  if (!isAnimationFilename(safeName)) {
    throw new HttpError(400, "invalid_hymotion_filename", "Invalid HyMotion animation filename");
  }
  return safeName;
};

const isAnimationFilename = (filename: string) =>
  /^[A-Za-z0-9._-]+\.(bvh|glb|gltf|fbx|rbxm|rbxmx)$/i.test(filename);

const mediaTypeFor = (filename: string) => {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "bvh") return "text/plain; charset=utf-8";
  if (ext === "glb") return "model/gltf-binary";
  if (ext === "gltf") return "model/gltf+json";
  if (ext === "rbxmx") return "application/xml; charset=utf-8";
  return "application/octet-stream";
};
