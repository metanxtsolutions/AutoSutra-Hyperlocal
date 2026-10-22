import { z } from "zod";

/**
 * Server-only configuration. Secrets never use the NEXT_PUBLIC_ prefix, so
 * Next.js never bundles them for the browser.
 *
 * Live advertising and live payments are OFF unless explicitly enabled here
 * AND by the matching feature flag in the admin console.
 */

const bool = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((v) => v === "true" || v === "1");

const providerMode = z.enum(["off", "demo", "live"]).default("demo");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1).default("postgres://autosutra:autosutra@localhost:5432/autosutra_dev"),
  AUTH_SECRET: z.string().min(32).default("dev-only-auth-secret-change-me-0123456789abcdef"),
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .default("ZGV2LW9ubHktdG9rZW4ta2V5LTMyLWJ5dGVzLWxvbiE=")
    .refine((v) => Buffer.from(v, "base64").length === 32, "TOKEN_ENCRYPTION_KEY must be 32 bytes, base64 encoded"),
  CRON_SECRET: z.string().default(""),

  EMAIL_DRIVER: z.enum(["outbox"]).default("outbox"),
  EMAIL_FROM: z.string().default("AutoSutra <no-reply@localhost>"),

  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./storage"),
  STORAGE_ENDPOINT: z.string().default(""),
  STORAGE_REGION: z.string().default("auto"),
  STORAGE_BUCKET: z.string().default(""),
  STORAGE_ACCESS_KEY: z.string().default(""),
  STORAGE_SECRET_KEY: z.string().default(""),

  ADS_META_MODE: providerMode,
  META_APP_ID: z.string().default(""),
  META_APP_SECRET: z.string().default(""),
  META_REDIRECT_URI: z.string().default(""),
  META_GRAPH_VERSION: z.string().regex(/^v\d+\.\d+$/).default("v23.0"),
  META_INITIAL_STATUS: z.enum(["PAUSED", "ACTIVE"]).default("PAUSED"),

  ADS_GOOGLE_MODE: providerMode,
  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),
  GOOGLE_REDIRECT_URI: z.string().default(""),
  GOOGLE_ADS_DEVELOPER_TOKEN: z.string().default(""),
  GOOGLE_ADS_LOGIN_CUSTOMER_ID: z.string().default(""),
  GOOGLE_ADS_API_VERSION: z.string().regex(/^v\d+$/).default("v21"),
  GOOGLE_ADS_INITIAL_STATUS: z.enum(["PAUSED", "ENABLED"]).default("PAUSED"),

  PAYMENT_GATEWAY: z.enum(["mock", "razorpay"]).default("mock"),
  PAYMENT_GATEWAY_KEY: z.string().default(""),
  PAYMENT_GATEWAY_SECRET: z.string().default(""),
  PAYMENT_WEBHOOK_SECRET: z.string().default("dev-only-webhook-secret"),
  PAYMENTS_LIVE: bool,

  MAPS_API_KEY: z.string().default(""),
  ERROR_MONITORING_DSN: z.string().default(""),
  REDIS_URL: z.string().default(""),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const env = parsed.data;
  if (env.NODE_ENV === "production") assertProductionSafe(env);
  cached = env;
  return env;
}

/** For tests: override selected values. */
export function setEnvForTests(overrides: Partial<Env>): void {
  cached = { ...getEnv(), ...overrides };
}

export function resetEnvCache(): void {
  cached = null;
}

const DEV_DEFAULTS = {
  AUTH_SECRET: "dev-only-auth-secret-change-me-0123456789abcdef",
  TOKEN_ENCRYPTION_KEY: "ZGV2LW9ubHktdG9rZW4ta2V5LTMyLWJ5dGVzLWxvbiE=",
  PAYMENT_WEBHOOK_SECRET: "dev-only-webhook-secret",
};

function assertProductionSafe(env: Env): void {
  const problems: string[] = [];
  for (const [key, devValue] of Object.entries(DEV_DEFAULTS)) {
    if (env[key as keyof Env] === devValue) problems.push(`${key} must be set to a real secret in production`);
  }
  if (!env.APP_URL.startsWith("https://")) problems.push("APP_URL must use https in production");
  if (!env.CRON_SECRET || env.CRON_SECRET.length < 32) problems.push("CRON_SECRET must be at least 32 characters");
  if (env.PAYMENTS_LIVE && env.PAYMENT_GATEWAY === "mock") problems.push("PAYMENTS_LIVE cannot use the mock gateway");
  if (env.STORAGE_DRIVER === "local") problems.push("STORAGE_DRIVER=local is not suitable for production");
  if (problems.length) throw new Error(`Unsafe production configuration:\n${problems.join("\n")}`);
}
