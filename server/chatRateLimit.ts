export const DAILY_MESSAGE_LIMIT = 50;
const chatRateLimiter = new Map<string, { count: number; resetAt: number }>();

export function checkChatRateLimit(userId: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = chatRateLimiter.get(userId);

  if (!entry || now > entry.resetAt) {
    chatRateLimiter.set(userId, { count: 1, resetAt: now + 24 * 60 * 60 * 1000 });
    return { allowed: true, remaining: DAILY_MESSAGE_LIMIT - 1 };
  }

  if (entry.count >= DAILY_MESSAGE_LIMIT) {
    return { allowed: false, remaining: 0 };
  }

  entry.count++;
  return { allowed: true, remaining: DAILY_MESSAGE_LIMIT - entry.count };
}

setInterval(() => {
  const now = Date.now();
  const keys = Array.from(chatRateLimiter.keys());
  for (const key of keys) {
    const entry = chatRateLimiter.get(key);
    if (entry && now > entry.resetAt) chatRateLimiter.delete(key);
  }
}, 60 * 60 * 1000);
