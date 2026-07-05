import type { Context, Next } from "hono";
import { HttpError, parseIntegerEnv } from "./http";
import type { AppBindings, RuntimeEnv } from "../types";

const encoder = new TextEncoder();

export const authMiddleware = async (c: Context<AppBindings>, next: Next) => {
  const configuredKeys = parseSecretList(c.env.CLIENT_API_KEYS);
  const providedKey = readBearer(c.req.header("authorization")) ?? c.req.header("x-api-key");

  if (configuredKeys.length === 0) {
    throw new HttpError(503, "client_keys_not_configured", "CLIENT_API_KEYS must be configured as a Cloudflare secret.");
  }

  if (!providedKey || !configuredKeys.some((key) => safeEqual(key, providedKey))) {
    throw new HttpError(401, "unauthorized", "Missing or invalid client API key");
  }

  c.set("clientId", await sha256Hex(providedKey));

  const adminKeys = parseSecretList(c.env.ADMIN_API_KEYS);
  const adminKey = c.req.header("x-admin-key");
  c.set("isAdmin", adminKeys.length > 0 && !!adminKey && adminKeys.some((key) => safeEqual(key, adminKey)));

  await next();
};

export const adminOnly = async (c: Context<AppBindings>, next: Next) => {
  if (parseSecretList(c.env.ADMIN_API_KEYS).length === 0) {
    throw new HttpError(503, "admin_keys_not_configured", "ADMIN_API_KEYS must be configured as a Cloudflare secret.");
  }

  if (!c.get("isAdmin")) {
    throw new HttpError(403, "forbidden", "Admin key required for this endpoint");
  }
  await next();
};

export const rateLimitMiddleware = async (c: Context<AppBindings>, next: Next) => {
  const limit = parseIntegerEnv(c.env.RATE_LIMIT_REQUESTS, 60, 1);
  const windowSeconds = parseIntegerEnv(c.env.RATE_LIMIT_WINDOW_SECONDS, 60, 1);
  const clientId = c.get("clientId");
  const bucketId = c.env.RATE_LIMITER.idFromName(`rl:${clientId}`);
  const stub = c.env.RATE_LIMITER.get(bucketId);

  const result = await stub.fetch("https://rate-limit.internal/check", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ limit, windowSeconds }),
  });

  const data = (await result.json()) as { allowed: boolean; remaining: number; resetAt: number };

  c.res.headers.set("x-ratelimit-limit", String(limit));
  c.res.headers.set("x-ratelimit-remaining", String(Math.max(0, data.remaining)));
  c.res.headers.set("x-ratelimit-reset", String(Math.ceil(data.resetAt / 1000)));

  if (!data.allowed) {
    const retryAfter = Math.max(1, Math.ceil((data.resetAt - Date.now()) / 1000));
    c.res.headers.set("retry-after", String(retryAfter));
    throw new HttpError(429, "rate_limited", "Too many requests. Please retry later.");
  }

  await next();
};

export const enforceTripoKey = (env: RuntimeEnv) => {
  const key = env.TRIPO_API_KEY?.trim();
  const isValidPrefix = key?.startsWith("tsk_") || key?.startsWith("tcli_");

  if (!key || !isValidPrefix) {
    throw new HttpError(503, "tripo_key_not_configured", "TRIPO_API_KEY is missing or invalid. It must start with tcli_ or tsk_.");
  }
};

export const assertDownloadUrlAllowed = (rawUrl: string, env: RuntimeEnv) => {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new HttpError(400, "invalid_download_url", "Download url is not valid");
  }

  if (url.protocol !== "https:") {
    throw new HttpError(400, "invalid_download_url", "Only https download urls are allowed");
  }

  const allowlist = (env.DOWNLOAD_HOST_ALLOWLIST ?? "amazonaws.com,tripo3d.ai,tripo3d.com")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);

  const hostname = url.hostname.toLowerCase();
  const allowed = allowlist.some((host) => hostname === host || hostname.endsWith(`.${host}`));
  if (!allowed) {
    throw new HttpError(400, "download_host_not_allowed", "Download host is not allowlisted");
  }

  return url;
};

export const sha256Hex = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const parseSecretList = (value?: string) =>
  (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const readBearer = (authorization?: string) => {
  if (!authorization) return undefined;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1];
};

const safeEqual = (a: string, b: string) => {
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  const max = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;
  for (let index = 0; index < max; index += 1) {
    diff |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return diff === 0;
};