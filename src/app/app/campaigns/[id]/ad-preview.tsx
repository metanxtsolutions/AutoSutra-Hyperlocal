import { Card, CardHeader } from "@/components/ui/card";
import { CALL_TO_ACTIONS } from "@/lib/objectives";
import type { FullCampaign } from "@/server/services/campaigns";

/** Approximate previews of how the copy will appear on each platform. */
export function AdPreview({ full }: { full: FullCampaign }) {
  const cr = full.creative;
  const hasMeta = full.platforms.some((p) => p.platform.provider === "meta");
  const hasGoogle = full.platforms.some((p) => p.platform.provider === "google");
  const image = full.assets.find((a) => a.kind === "image");
  const cta = CALL_TO_ACTIONS.find((c) => c.value === cr?.callToAction)?.label ?? "Learn more";
  let host = "";
  try {
    host = cr?.landingUrl ? new URL(cr.landingUrl).host : "";
  } catch {
    host = "";
  }
  return (
    <>
      {hasMeta && (
        <Card>
          <CardHeader title="Meta preview" />
          <div className="overflow-hidden rounded-lg border border-ink-200 bg-white text-sm">
            <div className="flex items-center gap-2 p-3">
              <div className="h-8 w-8 rounded-full bg-ink-200" aria-hidden />
              <div>
                <div className="font-semibold">{full.dealership.name}</div>
                <div className="text-xs text-ink-500">Sponsored</div>
              </div>
            </div>
            <p className="whitespace-pre-line px-3 pb-3">{cr?.primaryText || <span className="text-ink-400">Primary text</span>}</p>
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/assets/${image.id}`} alt="" className="aspect-[1.91/1] w-full object-cover" />
            ) : (
              <div className="flex aspect-[1.91/1] items-center justify-center bg-ink-100 text-xs text-ink-500">Image (or landing page preview)</div>
            )}
            <div className="flex items-center justify-between gap-3 bg-ink-50 p-3">
              <div className="min-w-0">
                <div className="truncate text-xs uppercase text-ink-500">{host || "your-site.com"}</div>
                <div className="truncate font-semibold">{cr?.headline || <span className="text-ink-400">Headline</span>}</div>
              </div>
              <span className="rounded bg-ink-200 px-3 py-1.5 text-xs font-semibold">{cta}</span>
            </div>
          </div>
        </Card>
      )}
      {hasGoogle && (
        <Card>
          <CardHeader title="Google search preview" />
          <div className="rounded-lg border border-ink-200 bg-white p-3 text-sm">
            <div className="text-xs"><span className="font-semibold">Sponsored</span> · {host || "your-site.com"}</div>
            <div className="mt-1 text-base text-road-600">{(cr?.headlines ?? []).slice(0, 3).join(" | ") || "Headline 1 | Headline 2 | Headline 3"}</div>
            <p className="mt-1 text-ink-700">{(cr?.descriptions ?? []).slice(0, 2).join(" ") || "Description text"}</p>
          </div>
        </Card>
      )}
    </>
  );
}
