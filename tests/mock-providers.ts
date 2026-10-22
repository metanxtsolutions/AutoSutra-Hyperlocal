import type { FetchFn } from "@/server/providers/types";

export interface Call {
  method: string;
  url: string;
  body: string;
}

type Responder = (call: Call) => { status?: number; body: unknown } | undefined;

/** A tiny programmable stand-in for the Meta Graph API and Google Ads API. */
export function mockProviders() {
  const calls: Call[] = [];
  const rules: { match: RegExp; method?: string; respond: Responder; times?: number }[] = [];
  let seq = 1000;
  const fetchFn: FetchFn = async (url, init) => {
    const call: Call = { method: init?.method ?? "GET", url, body: typeof init?.body === "string" ? init.body : String(init?.body ?? "") };
    calls.push(call);
    for (const r of rules) {
      if ((r.method && r.method !== call.method) || !r.match.test(url)) continue;
      if (r.times !== undefined) {
        if (r.times <= 0) continue;
        r.times--;
      }
      const out = r.respond(call);
      if (!out) continue;
      return { status: out.status ?? 200, headers: { get: () => null }, json: async () => out.body, text: async () => JSON.stringify(out.body) };
    }
    return { status: 404, headers: { get: () => null }, json: async () => ({ error: { message: `No mock for ${call.method} ${url}`, code: 100 } }), text: async () => "" };
  };
  return {
    fetchFn,
    calls,
    nextId: () => String(++seq),
    on(match: RegExp, respond: Responder, opts: { method?: string; times?: number } = {}) {
      rules.unshift({ match, respond, ...opts });
      return this;
    },
    count(match: RegExp, method?: string) {
      return calls.filter((c) => match.test(c.url) && (!method || c.method === method)).length;
    },
  };
}

/** Default happy-path Meta API. */
export function metaHappyPath(m: ReturnType<typeof mockProviders>, effective = "PENDING_REVIEW") {
  m.on(/\/act_\d+\/campaigns$/, () => ({ body: { id: m.nextId() } }), { method: "POST" });
  m.on(/\/act_\d+\/adcreatives$/, () => ({ body: { id: m.nextId() } }), { method: "POST" });
  m.on(/\/act_\d+\/adsets$/, () => ({ body: { id: m.nextId() } }), { method: "POST" });
  m.on(/\/act_\d+\/ads$/, () => ({ body: { id: m.nextId() } }), { method: "POST" });
  m.on(/\/v\d+\.\d+\/\?ids=/, (c) => {
    const ids = decodeURIComponent(new URL(c.url).searchParams.get("ids") ?? "").split(",");
    return { body: Object.fromEntries(ids.map((id) => [id, { effective_status: effective }])) };
  }, { method: "GET" });
  return m;
}
