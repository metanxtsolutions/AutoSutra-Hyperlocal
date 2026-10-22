import type { AdsAdapter, MetricsResult, Provider, PublishContext, PublishSpec, Refs, StatusResult } from "./types";

/**
 * Demo adapter for development and for organisations without provider access.
 * It sends nothing to Meta or Google, never reports Active, and never invents
 * performance data: metrics are always empty.
 */
export class DemoAdapter implements AdsAdapter {
  readonly mode = "demo" as const;
  constructor(readonly provider: Provider) {}

  async publish(spec: PublishSpec, refs: Refs, ctx: PublishContext): Promise<StatusResult> {
    refs.demo_reference = `demo-${this.provider}-${spec.campaignId.slice(0, 8)}`;
    await ctx.persistRefs(refs);
    return { status: "demo", raw: "DEMO_NOT_SENT", detail: `Demo mode: nothing was sent to ${this.provider === "meta" ? "Meta" : "Google Ads"}.` };
  }

  async fetchStatus(refs: Refs): Promise<StatusResult> {
    return refs.demo_paused === "1"
      ? { status: "paused", raw: "DEMO_PAUSED", detail: "Demo mode" }
      : { status: "demo", raw: "DEMO_NOT_SENT", detail: "Demo mode" };
  }

  async fetchMetrics(): Promise<MetricsResult> {
    return { rows: [], attributionNote: "Demo mode: no data is reported." };
  }

  async setPaused(refs: Refs, paused: boolean): Promise<StatusResult> {
    refs.demo_paused = paused ? "1" : "0";
    return this.fetchStatus(refs);
  }
}
