import { HttpError } from "../../core/http";
import type { RuntimeEnv, TripoResponse, TripoTask } from "../../types";

const FINAL_STATUSES = new Set(["success", "failed", "banned", "expired", "cancelled", "unknown"]);

type WaitUntilContext = {
  waitUntil(promise: Promise<unknown>): void;
};

export class TripoClient {
  private readonly baseUrl: string;

  constructor(private readonly env: RuntimeEnv) {
    this.baseUrl = (env.TRIPO_BASE_URL ?? "https://openapi.tripo3d.ai/v3").replace(/\/$/, "");
  }

  createTask(payload: Record<string, unknown>) {
    const { type: _type, ...body } = payload;
    return this.request<{ task_id: string }>(taskPath(payload), {
      method: "POST",
      json: compactTaskPayload(body),
      retryPostRateLimit: true,
    });
  }

  createOperation<T = { task_id: string }>(path: string, payload: Record<string, unknown>) {
    return this.request<T>(path, {
      method: "POST",
      json: compactTaskPayload(payload),
      retryPostRateLimit: true,
    });
  }

  getTask(taskId: string, request: Request, ctx: WaitUntilContext) {
    return this.cachedRequest<TripoTask>(`/tasks/${encodeURIComponent(taskId)}`, request, ctx);
  }

  getBalance() {
    return this.request<{ balance: number; frozen: number }>("/account/balance", {
      method: "GET",
    });
  }

  getUsage() {
    return this.request<unknown[]>("/account/usage", {
      method: "GET",
    });
  }

  batchTasks(payload: { task_ids: string[] }) {
    return this.request<unknown[]>("/tasks/list", {
      method: "POST",
      json: payload,
      retryPostRateLimit: true,
    });
  }

  createUploadCredentials() {
    return this.request<Record<string, unknown>>("/files/upload-credentials", {
      method: "POST",
      retryPostRateLimit: true,
    });
  }

  uploadDirect(formData: FormData) {
    return this.request<{ image_token?: string; file_token?: string }>("/files", {
      method: "POST",
      body: formData,
      retryPostRateLimit: true,
    });
  }

  private async cachedRequest<T>(
    path: string,
    request: Request,
    ctx: WaitUntilContext,
  ): Promise<TripoResponse<T>> {
    const url = new URL(request.url);
    const cacheKey = new Request(`${url.origin}/__tripo_cache${path}`, {
      method: "GET",
      headers: { accept: "application/json" },
    });

    const cached = await caches.default.match(cacheKey);
    if (cached) {
      return (await cached.json()) as TripoResponse<T>;
    }

    const data = await this.request<T>(path, { method: "GET" });
    const task = data.data as TripoTask | undefined;
    const isFinal = !!task?.status && FINAL_STATUSES.has(task.status);
    const ttlSeconds = Number.parseInt(
      isFinal ? this.env.FINAL_TASK_CACHE_SECONDS ?? "30" : this.env.TASK_STATUS_CACHE_SECONDS ?? "2",
      10,
    );

    if (ttlSeconds > 0) {
      const cacheResponse = Response.json(data, {
        headers: {
          "cache-control": `public, max-age=${ttlSeconds}`,
        },
      });
      ctx.waitUntil(caches.default.put(cacheKey, cacheResponse));
    }

    return data;
  }

  private async request<T>(
    path: string,
    options: {
      method: "GET" | "POST";
      json?: Record<string, unknown>;
      body?: BodyInit;
      retryPostRateLimit?: boolean;
    },
  ): Promise<TripoResponse<T>> {
    const url = `${this.baseUrl}${path}`;
    const apiKey = this.env.TRIPO_API_KEY?.trim();
    if (!apiKey) {
      throw new HttpError(503, "tripo_key_not_configured", "TRIPO_API_KEY is missing.");
    }
    const headers = new Headers({
      authorization: `Bearer ${apiKey}`,
    });

    let body = options.body;
    if (options.json) {
      headers.set("content-type", "application/json");
      body = JSON.stringify(options.json);
    }

    const maxAttempts = options.method === "GET" || options.retryPostRateLimit ? 3 : 1;
    let lastError: unknown;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25_000);

      try {
        const response = await fetch(url, {
          method: options.method,
          headers,
          body,
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (shouldRetry(response, options.method, attempt, maxAttempts)) {
          await sleep(retryDelayMs(response, attempt));
          continue;
        }

        return await parseTripoResponse<T>(response);
      } catch (error) {
        clearTimeout(timeout);
        lastError = error;
        if (options.method !== "GET" || attempt === maxAttempts - 1) {
          break;
        }
        await sleep(200 * 2 ** attempt + randomJitterMs(100));
      }
    }

    if (lastError instanceof HttpError) {
      throw lastError;
    }
    throw new HttpError(502, "tripo_network_error", "Could not reach Tripo upstream", String(lastError));
  }
}

export const compactTaskPayload = (input: Record<string, unknown>) => {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== null) {
      output[key] = value;
    }
  }
  return output;
};

const taskPath = (payload: Record<string, unknown>) => {
  switch (payload.type) {
    case "text_to_model":
      return "/generation/text-to-model";
    case "image_to_model":
      return "/generation/image-to-model";
    case "multiview_to_model":
      return "/generation/multiview-to-model";
    case "image_to_splat":
      return "/generation/image-to-splat";
    case "image_to_image":
      return "/generation/image-to-image";
    case "text_to_image":
    case "generate_image":
      return "/generation/text-to-image";
    case "generate_multiview_image":
      return "/generation/image-to-multiview";
    case "edit_multiview_image":
      return "/generation/edit-multiview";
    case "texture_model":
      return "/models/texture";
    case "convert_model":
      return "/models/convert";
    case "import_model":
      return "/models/import";
    case "mesh_segmentation":
      return "/mesh/segment";
    case "mesh_completion":
      return "/mesh/complete";
    case "highpoly_to_lowpoly":
      return "/mesh/decimate";
    case "animate_prerigcheck":
      return "/animations/rig-check";
    case "animate_rig":
      return "/animations/rig";
    case "animate_retarget":
      return "/animations/retarget";
    default:
      return "/tasks";
  }
};

export const normalizeCompress = (value: unknown) => {
  if (value === true || value === "geometry") {
    return "geometry";
  }
  return undefined;
};

const parseTripoResponse = async <T>(response: Response): Promise<TripoResponse<T>> => {
  const text = await response.text();
  let payload: TripoResponse<T>;
  try {
    payload = text ? (JSON.parse(text) as TripoResponse<T>) : {};
  } catch {
    throw new HttpError(response.ok ? 502 : response.status, "tripo_invalid_json", "Tripo returned invalid JSON", {
      status: response.status,
      body: text.slice(0, 500),
    });
  }

  if (!response.ok) {
    throw new HttpError(
      response.status,
      String(payload.code ?? "tripo_error"),
      payload.message ?? response.statusText,
      payload.suggestion ? { suggestion: payload.suggestion } : payload,
    );
  }

  if (payload.code && payload.code !== 0) {
    throw new HttpError(502, String(payload.code), payload.message ?? "Tripo API error", payload);
  }

  return payload;
};

const shouldRetry = (response: Response, method: "GET" | "POST", attempt: number, maxAttempts: number) => {
  if (attempt >= maxAttempts - 1) {
    return false;
  }
  if (response.status === 429) {
    return true;
  }
  return method === "GET" && response.status >= 500;
};

const retryDelayMs = (response: Response, attempt: number) => {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number.parseInt(retryAfter, 10);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.min(seconds * 1000, 10_000);
    }
  }
  return Math.min(250 * 2 ** attempt + randomJitterMs(100), 5_000);
};

const randomJitterMs = (maxExclusive: number) => {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0] % Math.max(1, maxExclusive);
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
