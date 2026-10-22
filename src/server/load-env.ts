import nextEnv from "@next/env";

/** Load .env, .env.local etc. the same way Next.js does, for scripts and the worker. */
nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
