import type { Context, Next } from "hono";
import type { AppBindings } from "../types";

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const jsonOk = <T>(
  c: Context<AppBindings>,
  payload: T,
  status = 200,
) => {
  return c.json(
    {
      ok: true,
      request_id: c.get("requestId"),
      ...payload,
    },
    status as never,
  );
};

export const parseIntegerEnv = (
  value: string | undefined,
  fallback: number,
  min = 0,
) => {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < min) {
    return fallback;
  }
  return parsed;
};

export const readJsonBody = async <T>(
  c: Context<AppBindings>,
  maxBytes: number,
): Promise<T> => {
  const contentType = c.req.header("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new HttpError(415, "unsupported_media_type", "Expected application/json");
  }

  const contentLength = Number.parseInt(c.req.header("content-length") ?? "0", 10);
  if (contentLength > maxBytes) {
    throw new HttpError(413, "payload_too_large", `JSON body must be <= ${maxBytes} bytes`);
  }

  try {
    return (await c.req.json()) as T;
  } catch {
    throw new HttpError(400, "invalid_json", "Request body is not valid JSON");
  }
};

export const requestIdMiddleware = async (
  c: Context<AppBindings>,
  next: Next,
) => {
  const requestId = c.req.header("cf-ray") ?? crypto.randomUUID();
  c.set("requestId", requestId);
  await next();
  c.res.headers.set("x-request-id", requestId);
};

export const corsMiddleware = async (c: Context<AppBindings>, next: Next) => {
  const origin = c.req.header("origin") ?? "";
  const allowed = selectAllowedOrigin(origin, c.env.ALLOWED_ORIGINS);

  if (c.req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(allowed),
    });
  }

  await next();
  const headers = corsHeaders(allowed);
  headers.forEach((value, key) => c.res.headers.set(key, value));
};

const corsHeaders = (allowedOrigin: string) => {
  const headers = new Headers();
  if (allowedOrigin) {
    headers.set("access-control-allow-origin", allowedOrigin);
  }
  headers.set("vary", "Origin");
  headers.set("access-control-allow-methods", "GET,POST,OPTIONS");
  headers.set(
    "access-control-allow-headers",
    "authorization,content-type,x-api-key,x-admin-key,x-requested-with",
  );
  headers.set("access-control-max-age", "86400");
  return headers;
};

const selectAllowedOrigin = (origin: string, configured?: string) => {
  const allowed = (configured ?? "*")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (allowed.includes("*")) {
    return "*";
  }

  if (origin && allowed.includes(origin)) {
    return origin;
  }

  return "";
};
