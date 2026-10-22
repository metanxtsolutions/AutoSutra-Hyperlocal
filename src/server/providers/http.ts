import { ProviderError, type FetchFn } from "./types";

export const defaultFetch: FetchFn = (url, init) =>
  fetch(url, { ...init, signal: AbortSignal.timeout(30_000) } as RequestInit) as unknown as ReturnType<FetchFn>;

export async function readJson(res: Awaited<ReturnType<FetchFn>>): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    throw new ProviderError(`Provider returned HTTP ${res.status} with an unreadable body`, res.status >= 500 ? "transient" : "unknown");
  }
}

export async function guardedFetch(fetchFn: FetchFn, url: string, init?: Parameters<FetchFn>[1]) {
  try {
    return await fetchFn(url, init);
  } catch (e) {
    throw new ProviderError(`Network error contacting provider: ${e instanceof Error ? e.message : String(e)}`, "transient");
  }
}
