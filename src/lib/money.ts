/** Money helpers. All amounts are integer paise; never use floats for money. */

export class MoneyError extends Error {}

export function parseRupees(input: string | null | undefined): number {
  const cleaned = String(input ?? "").replace(/[,₹\s]/g, "");
  if (!cleaned) throw new MoneyError("Amount is required");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) throw new MoneyError("Enter an amount in rupees with at most 2 decimal places");
  const [rupees, fraction = ""] = cleaned.split(".");
  const paise = Number(rupees) * 100 + Number((fraction + "00").slice(0, 2));
  if (!Number.isSafeInteger(paise)) throw new MoneyError("Amount is too large");
  return paise;
}

export function parseOptionalRupees(input: string | null | undefined): number | null {
  const cleaned = String(input ?? "").trim();
  return cleaned ? parseRupees(cleaned) : null;
}

/** Convert a provider-reported major-unit decimal string ("123.45") to paise without float error. */
export function decimalStringToPaise(value: string | number): number {
  const s = String(value).trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new MoneyError(`Not a decimal amount: ${s}`);
  const negative = s.startsWith("-");
  const [whole, frac = ""] = s.replace("-", "").split(".");
  let paise = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  if (Number(frac.charAt(2) || "0") >= 5) paise += 1; // round half up on the third decimal
  return negative ? -paise : paise;
}

/** Google Ads reports money in micros (1,000,000 per currency unit). */
export function microsToPaise(micros: number | string): number {
  return Math.round(Number(micros) / 10_000);
}

export function paiseToMicros(paise: number): number {
  return paise * 10_000;
}

export function formatINR(paise: number | null | undefined, opts: { decimals?: boolean } = {}): string {
  if (paise === null || paise === undefined) return "–";
  const negative = paise < 0;
  const abs = Math.abs(Math.trunc(paise));
  const rupees = Math.floor(abs / 100);
  const p = abs % 100;
  const s = String(rupees);
  let grouped = s;
  if (s.length > 3) {
    const head = s.slice(0, -3);
    const tail = s.slice(-3);
    grouped = head.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + tail;
  }
  const decimals = opts.decimals ?? true;
  return `${negative ? "-" : ""}₹${grouped}${decimals ? "." + String(p).padStart(2, "0") : ""}`;
}

export function rupeesInput(paise: number | null | undefined): string {
  if (paise === null || paise === undefined) return "";
  return (paise / 100).toFixed(2).replace(/\.00$/, "");
}

/** Basis-point percentage of an amount, rounded half up. */
export function bps(amount: number, rateBps: number): number {
  return Math.floor((amount * rateBps + 5_000) / 10_000);
}
