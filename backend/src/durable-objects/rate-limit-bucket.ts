type RateLimitRequest = {
  limit: number;
  windowSeconds: number;
};

type BucketState = {
  count: number;
  resetAt: number;
};

export class RateLimitBucket {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return Response.json({ error: "method_not_allowed" }, { status: 405 });
    }

    const body = (await request.json()) as RateLimitRequest;
    const limit = Math.max(1, body.limit);
    const windowMs = Math.max(1, body.windowSeconds) * 1000;
    const now = Date.now();

    let bucket = (await this.state.storage.get<BucketState>("bucket")) ?? {
      count: 0,
      resetAt: now + windowMs,
    };

    if (now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
    }

    bucket.count += 1;
    await this.state.storage.put("bucket", bucket);

    const remaining = Math.max(0, limit - bucket.count);
    return Response.json({
      allowed: bucket.count <= limit,
      remaining,
      resetAt: bucket.resetAt,
    });
  }
}
