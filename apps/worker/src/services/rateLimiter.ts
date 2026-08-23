import Redis from "ioredis";
import { config } from "../config";

// Atomic check-and-reserve across ALL worker instances: either BOTH the
// global ceiling and this lane's ceiling have room (counters incremented,
// TTLs armed) or neither is touched. Keys expire well past the hour window.
const RESERVE_SCRIPT = `
local gk, sk = KEYS[1], KEYS[2]
local glimit, slimit = tonumber(ARGV[1]), tonumber(ARGV[2])
local g = tonumber(redis.call('GET', gk) or '0')
local s = tonumber(redis.call('GET', sk) or '0')
if g >= glimit or s >= slimit then return -1 end
g = redis.call('INCR', gk)
local s2 = redis.call('INCR', sk)
if g == 1 then redis.call('EXPIRE', gk, 7200) end
if s2 == 1 then redis.call('EXPIRE', sk, 7200) end
return s2
`;

let client: Redis | null = null;

function redis(): Redis {
  if (!client) {
    client = new Redis(config.REDIS_URL);
  }
  return client;
}

const HOUR_MS = 3_600_000;

export interface ReserveInput {
  senderId: number;
  campaignHourlyLimit: number;
}

export interface Reservation {
  granted: boolean;
  /** Start of the next hour window when denied; null when granted. */
  retryAtMs: number | null;
}

// Effective lane threshold = min(env fleet brake, env per-sender quota,
// campaign's own requested cap) — see DESIGN.md §6.
export async function reserveSendSlot(
  input: ReserveInput,
): Promise<Reservation> {
  const windowStart = Math.floor(Date.now() / HOUR_MS) * HOUR_MS;
  const senderCap = Math.min(
    config.MAX_EMAILS_PER_HOUR_PER_SENDER,
    input.campaignHourlyLimit,
  );

  const result = await redis().eval(
    RESERVE_SCRIPT,
    2,
    `ratelimit:global:${windowStart}`,
    `ratelimit:sender:${input.senderId}:${windowStart}`,
    String(config.MAX_EMAILS_PER_HOUR),
    String(senderCap),
  );

  if (result === -1 || result === "-1") {
    return { granted: false, retryAtMs: windowStart + HOUR_MS };
  }
  return { granted: true, retryAtMs: null };
}
