interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

const CLEANUP_INTERVAL_MS = 5 * 60_000;
let lastCleanup = Date.now();

function cleanupExpired(now: number) {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, bucket] of Array.from(buckets.entries())) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function resetRateLimitStore() {
  buckets.clear();
}

export function resetRateLimit(identifier: string, scope: string) {
  const key = `${scope}:${identifier}`;
  buckets.delete(key);
}

export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();

  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  const cfConnectingIp = request.headers.get("cf-connecting-ip");
  if (cfConnectingIp) return cfConnectingIp.trim();

  return "unknown";
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
  limit: number;
  remaining: number;
  resetAt: number;
}

export function checkRateLimit(
  identifier: string,
  scope: string,
  { limit, windowMs }: { limit: number; windowMs: number },
): RateLimitResult {
  const now = Date.now();
  cleanupExpired(now);

  const key = `${scope}:${identifier}`;
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    const resetAt = now + windowMs;
    if (buckets.size >= 10000 && !bucket) {
      for (const [expiredKey, value] of Array.from(buckets.entries())) if (value.resetAt <= now) buckets.delete(expiredKey);
      if (buckets.size >= 10000) return { allowed: false, retryAfterSeconds: 60, limit, remaining: 0, resetAt: now + 60000 };
    }
    buckets.set(key, { count: 1, resetAt });
    return {
      allowed: true,
      retryAfterSeconds: 0,
      limit,
      remaining: Math.max(0, limit - 1),
      resetAt,
    };
  }

  if (bucket.count >= limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    return {
      allowed: false,
      retryAfterSeconds,
      limit,
      remaining: 0,
      resetAt: bucket.resetAt,
    };
  }

  bucket.count += 1;
  return {
    allowed: true,
    retryAfterSeconds: 0,
    limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
  };
}

export function rateLimitResponse(
  input: number | RateLimitResult,
  customMessage?: string,
) {
  const retryAfterSeconds = typeof input === "number" ? input : input.retryAfterSeconds;
  const message = customMessage ?? "Muitas tentativas. Aguarde um momento e tente novamente.";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Retry-After": String(retryAfterSeconds),
  };

  if (typeof input === "object") {
    headers["X-RateLimit-Limit"] = String(input.limit);
    headers["X-RateLimit-Remaining"] = String(input.remaining);
    headers["X-RateLimit-Reset"] = String(Math.ceil(input.resetAt / 1000));
  }

  return new Response(
    JSON.stringify({
      error: message,
      message,
      retryAfterSeconds,
    }),
    {
      status: 429,
      headers,
    },
  );
}
