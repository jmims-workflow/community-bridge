import type { Request, Response, NextFunction } from "express";

// Simple sliding-window limiter, in-memory. Fine for a single instance.
// For multi-instance deployments, move this to Redis (INCR + EXPIRE) instead.

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

const WINDOW_MS = 60_000; // 1 minute window
const MAX_REQUESTS_PER_WINDOW = 12; // generous for real use, tight enough to block scripted abuse

export function rateLimit(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip ?? "unknown";
  const now = Date.now();
  const bucket = buckets.get(ip);

  if (!bucket || now - bucket.windowStart > WINDOW_MS) {
    buckets.set(ip, { count: 1, windowStart: now });
    next();
    return;
  }

  if (bucket.count >= MAX_REQUESTS_PER_WINDOW) {
    res.status(429).json({
      error: "Too many requests. Please wait a minute before searching again.",
    });
    return;
  }

  bucket.count += 1;
  next();
}

// Periodic cleanup so the map doesn't grow forever on a long-running process.
setInterval(() => {
  const now = Date.now();
  for (const [ip, bucket] of buckets.entries()) {
    if (now - bucket.windowStart > WINDOW_MS * 5) buckets.delete(ip);
  }
}, WINDOW_MS * 5).unref();
