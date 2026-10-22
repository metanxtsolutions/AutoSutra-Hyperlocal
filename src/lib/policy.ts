/**
 * Lightweight pre-publication copy checks. These do not replace Meta or Google
 * policy review; they catch common problems in automotive ads before submission.
 */

export interface PolicyFinding {
  severity: "blocker" | "warning";
  message: string;
}

const BLOCKERS: [RegExp, string][] = [
  [/guaranteed\s+(loan|finance|approval)/i, "Do not promise guaranteed finance or loan approval."],
  [/100\s*%\s*(loan|finance|approval)/i, "Do not promise 100% finance or approval."],
  [/\b(free\s+car|free\s+bike|free\s+scooter)\b/i, "\"Free vehicle\" claims are not allowed."],
  [/\b(are you|you are)\s+(in debt|bankrupt|divorced|pregnant|disabled)\b/i, "Ads must not imply personal attributes of the viewer."],
  [/\b(your|you're)\s+(religion|caste|health condition)\b/i, "Ads must not reference sensitive personal characteristics."],
];

const WARNINGS: [RegExp, string][] = [
  [/\b(lowest|cheapest|best)\s+(price|deal|rate)s?\b/i, "Superlative price claims need evidence and may be rejected."],
  [/\b(no\.?\s*1|number one|#1)\b/i, "\"Number one\" claims need substantiation."],
  [/\bzero\s+(down|downpayment|down payment|interest)\b/i, "Zero down payment or zero interest claims need the finance partner's approval and a disclaimer."],
  [/\bemi\b|\binterest rate\b|\b\d+(\.\d+)?\s*%\s*(p\.?a\.?|interest)/i, "Finance terms need approval and a disclaimer naming the lender."],
  [/!!+|[A-Z]{12,}/, "Excessive capitalisation or punctuation is often rejected by ad platforms."],
  [/\{[a-z_]+\}/i, "Template placeholder not filled in."],
];

export function checkCopy(...texts: (string | null | undefined)[]): PolicyFinding[] {
  const text = texts.filter(Boolean).join("\n");
  const out: PolicyFinding[] = [];
  for (const [re, msg] of BLOCKERS) if (re.test(text)) out.push({ severity: "blocker", message: msg });
  for (const [re, msg] of WARNINGS) if (re.test(text)) out.push({ severity: "warning", message: msg });
  return out;
}

export function hasUnfilledPlaceholder(...texts: (string | null | undefined)[]): boolean {
  return texts.some((t) => !!t && /\{[a-z_]+\}/i.test(t));
}
