import { log } from "./lib/logger";

export type ScholarlyProvider = "OpenAlex" | "Crossref";
export type ScholarlyAccessSignalKind = "rate_limit" | "quota_exhausted" | "challenge" | "blocked";
export type ScholarlyAccessSignal = {
  kind: ScholarlyAccessSignalKind;
  status?: number;
  detectedAt: number;
};
type ProviderPolicy = {
  host: string;
  timeoutMs: number;
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  maxRetryAfterMs: number;
  minIntervalMs: number;
  maxConcurrency: number;
  failureThreshold: number;
  cooldownMs: number;
};
type CacheEntry = { value: unknown; storedAt: number; expiresAt: number; staleUntil: number };
export type ScholarlyRetrieval = "network" | "cache" | "stale-cache";
export type ScholarlyFetchResult<T> = {
  value: T;
  retrieval: ScholarlyRetrieval;
  retrievedAt: number;
};
type CircuitEntry = { failures: number; openedAt: number; halfOpenInFlight: boolean };
type Job = {
  task: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
};

export type ScholarlyGatewayOptions = {
  now?: () => number;
  random?: () => number;
  fetcher?: typeof fetch;
  cacheTtlMs?: number;
  staleTtlMs?: number;
  maxCacheEntries?: number;
  maxResponseBytes?: number;
  policies?: Partial<Record<ScholarlyProvider, Partial<ProviderPolicy>>>;
};

const DEFAULT_POLICIES: Record<ScholarlyProvider, ProviderPolicy> = {
  OpenAlex: {
    host: "api.openalex.org",
    timeoutMs: 8_000,
    maxAttempts: 2,
    baseDelayMs: 400,
    maxDelayMs: 1_500,
    maxRetryAfterMs: 4_000,
    minIntervalMs: 150,
    maxConcurrency: 2,
    failureThreshold: 3,
    cooldownMs: 30_000,
  },
  Crossref: {
    host: "api.crossref.org",
    timeoutMs: 8_000,
    maxAttempts: 2,
    baseDelayMs: 600,
    maxDelayMs: 2_000,
    maxRetryAfterMs: 4_000,
    // Crossref public-pool list searches are limited to one request per second.
    minIntervalMs: 1_100,
    maxConcurrency: 1,
    failureThreshold: 3,
    cooldownMs: 30_000,
  },
};
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

export class ScholarlyProviderError extends Error {
  readonly provider: ScholarlyProvider;
  readonly code: string;
  readonly status?: number;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
  readonly accessSignal?: ScholarlyAccessSignal;

  constructor(
    provider: ScholarlyProvider,
    code: string,
    options: { status?: number; retryable?: boolean; retryAfterMs?: number; accessSignal?: ScholarlyAccessSignal } = {},
  ) {
    super(`${provider}: ${code}`);
    this.name = "ScholarlyProviderError";
    this.provider = provider;
    this.code = code;
    this.status = options.status;
    this.retryable = options.retryable ?? false;
    this.retryAfterMs = options.retryAfterMs;
    this.accessSignal = options.accessSignal;
  }
}

class ProviderLimiter {
  private active = 0;
  private nextStartAt = 0;
  private queue: Job[] = [];
  private dynamicMinIntervalMs = 0;
  private readonly baseMinIntervalMs: number;
  readonly maxConcurrency: number;
  private readonly now: () => number;

  constructor(baseMinIntervalMs: number, maxConcurrency: number, now: () => number) {
    this.baseMinIntervalMs = baseMinIntervalMs;
    this.maxConcurrency = maxConcurrency;
    this.now = now;
  }

  get minIntervalMs(): number {
    return Math.max(this.baseMinIntervalMs, this.dynamicMinIntervalMs);
  }

  adaptRateLimit(limit: number, intervalMs: number): void {
    if (!Number.isFinite(limit) || limit <= 0 || !Number.isFinite(intervalMs) || intervalMs <= 0) return;
    this.dynamicMinIntervalMs = Math.max(this.dynamicMinIntervalMs, Math.ceil(intervalMs / limit));
  }

  escalate(minIntervalMs: number): void {
    if (!Number.isFinite(minIntervalMs) || minIntervalMs <= 0) return;
    this.dynamicMinIntervalMs = Math.max(this.dynamicMinIntervalMs, Math.ceil(minIntervalMs));
  }

  schedule<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        task: task as () => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this.drain();
    });
  }

  private drain(): void {
    while (this.active < this.maxConcurrency && this.queue.length) {
      const job = this.queue.shift();
      if (!job) return;
      this.active += 1;
      const now = this.now();
      const waitMs = Math.max(0, this.nextStartAt - now);
      this.nextStartAt = Math.max(now, this.nextStartAt) + this.minIntervalMs;
      const execute = async () => {
        try {
          job.resolve(await job.task());
        } catch (error) {
          job.reject(error);
        } finally {
          this.active -= 1;
          this.drain();
        }
      };
      if (waitMs <= 0) void execute();
      else {
        const timer = setTimeout(() => void execute(), waitMs);
        timer.unref?.();
      }
    }
  }
}

function wait(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

function retryAfterMs(headers: Headers, now: number): number | undefined {
  const value = headers.get("Retry-After")?.trim();
  if (!value) return undefined;
  if (/^\d+(?:\.\d+)?$/.test(value)) return Math.ceil(Number(value) * 1000);
  const dateMs = Date.parse(value);
  return Number.isFinite(dateMs) ? Math.max(0, dateMs - now) : undefined;
}

function transientNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error instanceof TypeError || error.name === "AbortError" || error.name === "TimeoutError";
}

const CHALLENGE_PATTERN = /captcha|cf-chl|challenge-platform|just a moment|verify you are human|are you a robot|robot check|unusual traffic|ddos protection|attention required|access denied/i;

function detectAccessSignal(status: number, headers: Headers, contentType: string, body: string): ScholarlyAccessSignalKind | null {
  const mitigation = headers.get("cf-mitigated")?.toLowerCase();
  const explicitChallenge = mitigation === "challenge" || headers.has("x-captcha") || headers.has("x-bot-detection");
  const html = contentType.includes("text/html") || /^\s*<!doctype html|^\s*<html/i.test(body);
  if (explicitChallenge || (html && CHALLENGE_PATTERN.test(body.slice(0, 65_536)))) return "challenge";
  const exhausted = headers.get("X-RateLimit-Remaining") === "0";
  if (status === 429) return exhausted ? "quota_exhausted" : "rate_limit";
  if (status === 401 || status === 403) return "blocked";
  return null;
}

function validContactEmail(value: string | undefined): string | null {
  const email = value?.trim();
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : null;
}

/**
 * Process-local safety layer for the two public scholarly indexes.
 * It never caches failures, never logs query URLs or credentials, and never
 * turns an outage into an empty scholarly result.
 */
export class ScholarlyGateway {
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly fetcher?: typeof fetch;
  private readonly cacheTtlMs: number;
  private readonly staleTtlMs: number;
  private readonly maxCacheEntries: number;
  private readonly maxResponseBytes: number;
  private readonly policies: Record<ScholarlyProvider, ProviderPolicy>;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private readonly circuits = new Map<ScholarlyProvider, CircuitEntry>();
  private readonly limiters = new Map<ScholarlyProvider, ProviderLimiter>();
  private readonly accessSignals = new Map<ScholarlyProvider, { count: number; last?: ScholarlyAccessSignal; pausedUntil: number }>();

  constructor(options: ScholarlyGatewayOptions = {}) {
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    this.fetcher = options.fetcher;
    this.cacheTtlMs = options.cacheTtlMs ?? 5 * 60_000;
    this.staleTtlMs = options.staleTtlMs ?? 6 * 60 * 60_000;
    this.maxCacheEntries = options.maxCacheEntries ?? 100;
    this.maxResponseBytes = options.maxResponseBytes ?? 2_000_000;
    this.policies = {
      OpenAlex: { ...DEFAULT_POLICIES.OpenAlex, ...options.policies?.OpenAlex },
      Crossref: { ...DEFAULT_POLICIES.Crossref, ...options.policies?.Crossref },
    };
    for (const provider of ["OpenAlex", "Crossref"] as const) {
      const policy = this.policies[provider];
      this.circuits.set(provider, { failures: 0, openedAt: 0, halfOpenInFlight: false });
      this.limiters.set(provider, new ProviderLimiter(policy.minIntervalMs, policy.maxConcurrency, this.now));
    }
  }

  async fetchJson<T>(provider: ScholarlyProvider, url: URL, validate: (body: unknown) => T): Promise<T> {
    const result = await this.fetchJsonWithMeta(provider, url, validate);
    return result.value;
  }

  async fetchJsonWithMeta<T>(
    provider: ScholarlyProvider,
    url: URL,
    validate: (body: unknown) => T,
    options: { allowStale?: boolean } = {},
  ): Promise<ScholarlyFetchResult<T>> {
    this.assertAllowedUrl(provider, url);
    const cacheKey = `${provider}:${url.href}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > this.now()) {
      this.cache.delete(cacheKey);
      this.cache.set(cacheKey, cached);
      return { value: cached.value as T, retrieval: "cache", retrievedAt: cached.storedAt };
    }
    if (cached && cached.staleUntil <= this.now()) this.cache.delete(cacheKey);
    const settle = async (promise: Promise<ScholarlyFetchResult<T>>): Promise<ScholarlyFetchResult<T>> => {
      try {
        return await promise;
      } catch (error) {
        // A stale response is explicitly marked and is only available to callers
        // that opt in. It is never presented as a fresh live response.
        if (options.allowStale && cached && cached.staleUntil > this.now()) {
          this.cache.delete(cacheKey);
          this.cache.set(cacheKey, cached);
          return { value: cached.value as T, retrieval: "stale-cache", retrievedAt: cached.storedAt };
        }
        throw error;
      }
    };
    const pending = this.inFlight.get(cacheKey);
    if (pending) return settle(pending as Promise<ScholarlyFetchResult<T>>);

    const request = this.performRequest(provider, url, validate).then((body): ScholarlyFetchResult<T> => {
      this.writeCache(cacheKey, body);
      return { value: body, retrieval: "network", retrievedAt: this.now() };
    }).finally(() => {
      this.inFlight.delete(cacheKey);
    });
    this.inFlight.set(cacheKey, request);
    return settle(request);
  }

  getSafetySnapshot() {
    return {
      cacheEntries: this.cache.size,
      providers: Object.fromEntries((["OpenAlex", "Crossref"] as const).map((provider) => {
        const circuit = this.circuits.get(provider);
        const access = this.accessSignals.get(provider);
        return [provider, {
          failures: circuit?.failures ?? 0,
          circuitOpen: Boolean(circuit?.openedAt),
          halfOpenInFlight: circuit?.halfOpenInFlight ?? false,
          minIntervalMs: this.limiters.get(provider)?.minIntervalMs ?? 0,
          accessSignal: access?.last?.kind ?? null,
          accessPausedUntil: access?.pausedUntil ?? 0,
        }];
      })),
    };
  }

  reset(): void {
    this.cache.clear();
    this.inFlight.clear();
    this.accessSignals.clear();
    for (const provider of ["OpenAlex", "Crossref"] as const) {
      this.circuits.set(provider, { failures: 0, openedAt: 0, halfOpenInFlight: false });
      const policy = this.policies[provider];
      this.limiters.set(provider, new ProviderLimiter(policy.minIntervalMs, policy.maxConcurrency, this.now));
    }
  }

  private assertAllowedUrl(provider: ScholarlyProvider, url: URL): void {
    if (url.protocol !== "https:" || url.hostname !== this.policies[provider].host || url.username || url.password) {
      throw new ScholarlyProviderError(provider, "UNTRUSTED_URL");
    }
  }

  private beforeRequest(provider: ScholarlyProvider): void {
    const access = this.accessSignals.get(provider);
    if (access && access.pausedUntil > this.now() && access.last) {
      throw new ScholarlyProviderError(provider, "ACCESS_PAUSED", {
        status: access.last.status,
        accessSignal: access.last,
      });
    }
    const circuit = this.circuits.get(provider);
    if (!circuit) return;
    if (!circuit.openedAt) return;
    const cooldownMs = this.policies[provider].cooldownMs;
    if (this.now() - circuit.openedAt < cooldownMs || circuit.halfOpenInFlight) {
      throw new ScholarlyProviderError(provider, "CIRCUIT_OPEN");
    }
    circuit.halfOpenInFlight = true;
  }

  private requestSucceeded(provider: ScholarlyProvider): void {
    this.circuits.set(provider, { failures: 0, openedAt: 0, halfOpenInFlight: false });
    this.accessSignals.delete(provider);
  }

  private noteAccessSignal(provider: ScholarlyProvider, error: ScholarlyProviderError): void {
    const signal = error.accessSignal;
    if (!signal) return;
    const previous = this.accessSignals.get(provider);
    const basePauseMs = signal.kind === "rate_limit" ? 30_000
      : signal.kind === "quota_exhausted" ? 15 * 60_000
        : 5 * 60_000;
    const requestedPauseMs = Math.min(24 * 60 * 60_000, error.retryAfterMs ?? 0);
    const pausedUntil = this.now() + Math.max(basePauseMs, requestedPauseMs);
    this.accessSignals.set(provider, {
      count: (previous?.count ?? 0) + 1,
      last: signal,
      pausedUntil: Math.max(previous?.pausedUntil ?? 0, pausedUntil),
    });
    if (signal.kind === "rate_limit") {
      this.limiters.get(provider)?.escalate(Math.max(2_000, error.retryAfterMs ?? 0));
    }
  }

  private requestFailed(provider: ScholarlyProvider): void {
    const circuit = this.circuits.get(provider);
    if (!circuit) return;
    const policy = this.policies[provider];
    if (circuit.halfOpenInFlight) {
      this.circuits.set(provider, { failures: policy.failureThreshold, openedAt: this.now(), halfOpenInFlight: false });
      return;
    }
    const failures = circuit.failures + 1;
    this.circuits.set(provider, {
      failures,
      openedAt: failures >= policy.failureThreshold ? this.now() : 0,
      halfOpenInFlight: false,
    });
  }

  private async performRequest<T>(provider: ScholarlyProvider, url: URL, validate: (body: unknown) => T): Promise<T> {
    this.beforeRequest(provider);
    const policy = this.policies[provider];
    try {
      for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
        try {
          const body = await this.limiters.get(provider)!.schedule(() => this.fetchAttempt(provider, url, validate));
          this.requestSucceeded(provider);
          return body;
        } catch (reason) {
          const error = this.normalizeError(provider, reason);
          this.noteAccessSignal(provider, error);
          if (attempt >= policy.maxAttempts || !error.retryable) throw error;
          const retryAfter = error.retryAfterMs ?? 0;
          if (retryAfter > policy.maxRetryAfterMs) throw error;
          const exponential = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** (attempt - 1));
          const jitter = 0.8 + this.random() * 0.4;
          const delayMs = Math.ceil(Math.max(retryAfter, exponential * jitter));
          log.warn("scholarly provider transient failure; bounded retry", {
            provider,
            attempt,
            status: error.status,
            code: error.code,
            delayMs,
          });
          await wait(delayMs);
        }
      }
      throw new ScholarlyProviderError(provider, "REQUEST_FAILED");
    } catch (error) {
      this.requestFailed(provider);
      throw error;
    }
  }

  private async readBoundedText(provider: ScholarlyProvider, response: Response): Promise<string> {
    if (!response.body) return "";
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let received = 0;
    let text = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > this.maxResponseBytes) {
        void reader.cancel().catch(() => undefined);
        throw new ScholarlyProviderError(provider, "RESPONSE_TOO_LARGE");
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  }

  private async fetchAttempt<T>(provider: ScholarlyProvider, url: URL, validate: (body: unknown) => T): Promise<T> {
    const fetcher = this.fetcher ?? globalThis.fetch;
    if (!fetcher) throw new ScholarlyProviderError(provider, "FETCH_UNAVAILABLE");
    const contact = validContactEmail(process.env.SCHOLARLY_CONTACT_EMAIL);
    const response = await fetcher(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": `SkopeinSignal/1.0 (scholarly metadata client${contact ? `; mailto:${contact}` : ""})`,
      },
      signal: AbortSignal.timeout(this.policies[provider].timeoutMs),
      redirect: "error",
    });
    this.adaptCrossrefRateLimit(provider, response.headers);
    const contentType = response.headers.get("Content-Type")?.toLowerCase() ?? "";
    const declaredLength = Number(response.headers.get("Content-Length"));
    if (Number.isFinite(declaredLength) && declaredLength > this.maxResponseBytes) {
      void response.body?.cancel().catch(() => undefined);
      throw new ScholarlyProviderError(provider, "RESPONSE_TOO_LARGE");
    }
    if (!response.ok) {
      const text = await this.readBoundedText(provider, response);
      const retryAfter = retryAfterMs(response.headers, this.now());
      const signal = detectAccessSignal(response.status, response.headers, contentType, text);
      const detectedAt = this.now();
      const accessSignal = signal ? { kind: signal, status: response.status, detectedAt } : undefined;
      const exhausted = signal === "quota_exhausted";
      throw new ScholarlyProviderError(provider,
        signal === "challenge" ? "ACCESS_CHALLENGE" : signal === "blocked" ? "ACCESS_BLOCKED" : "HTTP_ERROR", {
          status: response.status,
          retryable: signal !== "challenge" && signal !== "blocked" && RETRYABLE_STATUSES.has(response.status) && !exhausted,
          retryAfterMs: retryAfter,
          accessSignal,
        });
    }
    const text = await this.readBoundedText(provider, response);
    if (text.length > this.maxResponseBytes) throw new ScholarlyProviderError(provider, "RESPONSE_TOO_LARGE");
    const signal = detectAccessSignal(response.status, response.headers, contentType, text);
    if (signal) {
      throw new ScholarlyProviderError(provider, signal === "challenge" ? "ACCESS_CHALLENGE" : "ACCESS_BLOCKED", {
        status: response.status,
        accessSignal: { kind: signal, status: response.status, detectedAt: this.now() },
      });
    }
    const normalizedText = text.replace(/^\uFEFF/, "").trimStart();
    const jsonContentType = contentType.includes("application/json") || contentType.includes("+json");
    const recoverableContentType = !contentType || contentType.includes("text/plain") || contentType.includes("application/octet-stream");
    const looksLikeJson = normalizedText.startsWith("{") || normalizedText.startsWith("[");
    // Some official API intermediaries omit or genericize Content-Type. Recover
    // only JSON-looking bodies on the already allowlisted HTTPS host; schema
    // validation and the byte cap still apply before anything can be cached.
    if (!jsonContentType && !(recoverableContentType && looksLikeJson)) {
      throw new ScholarlyProviderError(provider, "INVALID_CONTENT_TYPE");
    }
    let body: unknown;
    try {
      body = JSON.parse(normalizedText);
    } catch {
      throw new ScholarlyProviderError(provider, "INVALID_JSON", { retryable: true });
    }
    try {
      return validate(body);
    } catch {
      throw new ScholarlyProviderError(provider, "INVALID_RESPONSE_SHAPE");
    }
  }

  private adaptCrossrefRateLimit(provider: ScholarlyProvider, headers: Headers): void {
    if (provider !== "Crossref") return;
    const limit = Number(headers.get("X-Rate-Limit-Limit"));
    const match = headers.get("X-Rate-Limit-Interval")?.trim().match(/^(\d+(?:\.\d+)?)s$/i);
    if (match) this.limiters.get(provider)?.adaptRateLimit(limit, Number(match[1]) * 1000);
  }

  private normalizeError(provider: ScholarlyProvider, reason: unknown): ScholarlyProviderError {
    if (reason instanceof ScholarlyProviderError) return reason;
    return new ScholarlyProviderError(provider, transientNetworkError(reason) ? "NETWORK_ERROR" : "REQUEST_FAILED", {
      retryable: transientNetworkError(reason),
    });
  }

  private writeCache(key: string, value: unknown): void {
    if (this.cacheTtlMs <= 0 || this.maxCacheEntries <= 0) return;
    const storedAt = this.now();
    this.cache.delete(key);
    this.cache.set(key, {
      value,
      storedAt,
      expiresAt: storedAt + this.cacheTtlMs,
      staleUntil: storedAt + this.cacheTtlMs + Math.max(0, this.staleTtlMs),
    });
    while (this.cache.size > this.maxCacheEntries) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
  }
}

export const scholarlyGateway = new ScholarlyGateway();
