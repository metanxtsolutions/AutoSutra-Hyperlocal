/**
 * Validated categorical slots (slot 1 blue, slot 2 orange; see docs/DESIGN_SYSTEM.md).
 * Kept outside the client chart module so server components read real values,
 * not a client reference.
 */
export const SERIES_COLORS = { slot1: "#2a78d6", slot2: "#eb6834" } as const;
