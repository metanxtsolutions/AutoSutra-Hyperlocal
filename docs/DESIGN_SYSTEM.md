# Design system

Tokens live in `src/app/globals.css` (Tailwind 4 `@theme`). Components live in `src/components/ui`. Use tokens and components; avoid one-off colours and spacing.

## Principles

- **Clarity over decoration.** Dealership staff use this between customers; every screen should answer "what is the state and what do I do next".
- **Status is always text plus colour**, never colour alone.
- **Never imply a live result that did not happen.** Demo items use the dashed *Demo* badge; Active is shown only for provider-confirmed status.
- Mobile first for leads and campaign status (sales staff use phones); dense tables are acceptable for finance and admin on desktop and scroll inside their own container on small screens.

## Colour tokens

| Token | Hex | Use |
|---|---|---|
| `ink-950` | `#0a1222` | Headings |
| `ink-900` | `#0f1b31` | Body text, dark buttons, app sidebar |
| `ink-600` / `ink-500` | `#3a4f75` / `#5b6f93` | Secondary text, axis labels |
| `ink-200` / `ink-100` / `ink-50` | `#d7deea` / `#ebeff6` / `#f5f7fb` | Borders, gridlines, page background |
| `brand-500` | `#f59e0b` | Primary action background (with `ink-950` text for contrast) |
| `brand-700` | `#b45309` | Brand text on light backgrounds |
| `road-500` / `road-600` | `#2563eb` / `#1d4ed8` | Links, focus ring, informational badges |
| `ok-700` on `ok-100` | `#15803d` / `#dcfce7` | Success |
| `warn-700` on `warn-100` | `#a16207` / `#fef9c3` | Warning |
| `bad-700` on `bad-100` | `#b91c1c` / `#fee2e2` | Error, destructive actions, required-field marker |

Text colour pairs above meet WCAG AA contrast on their intended background. Focus is a visible 2px `road-500` outline on every interactive element.

Typography uses the system UI font stack (no web-font download). Amounts in tables use tabular figures (`Num`, `tabular-nums`) so columns align; a monospace stack is available for ids.

## Components (`src/components/ui`)

| Component | Notes |
|---|---|
| `Button`, `ButtonLink` | Variants: primary, secondary, dark, ghost, danger. Sizes sm, md, lg (32/40/48px high) |
| `Card`, `CardHeader`, `PageHeader`, `Stat`, `DescriptionList`, `EmptyState`, `Alert` | Page structure, headline numbers, empty and alert states |
| `Badge`, `StatusBadge` | Tones: neutral, info, ok, warn, bad, brand, demo. `StatusBadge` maps campaign, platform, payment and lead statuses to tones and labels in one place |
| `Field`, `Input`, `Textarea`, `Select`, `Checkbox`, `TextField`, `TextAreaField`, `SelectField`, `FormGrid` | Visible labels; error text linked with `aria-describedby` and `aria-invalid`; required marker is visual only (`aria-hidden`) with `required` on the input |
| `ActionForm`, `SubmitButton`, `FieldError` | Wraps server actions: pending state, inline errors, field errors, success notice via toast, optional reset or redirect |
| `Table`, `THead`, `TBody`, `Th`, `Td`, `Num` | Responsive wrapper that scrolls horizontally inside itself |
| `Tabs`, `Modal`, `Toaster`, `PageLoading` | Link-based tabs; `Modal` uses the native `<dialog>` element, so the browser handles focus and Escape |

Brand and illustration components: `src/components/brand.tsx`, `src/components/marketing/illustrations.tsx` (inline SVG, no external images).

## Charts

`src/components/charts/bar-chart.tsx` (inline SVG, no chart library).

- Series colours are assigned by **entity, not rank**: Meta is always slot 1 `#2a78d6`, Google is always slot 2 `#eb6834`. Filtering to one provider keeps its colour.
- Palette validated with a colour-vision checker against the light surface: lightness band, chroma floor, contrast at least 3:1, CVD separation (worst case protanopia ΔE 24.7) and normal-vision separation (ΔE 33.6) all pass.
- Marks: bars at most 24px wide, 4px rounded data ends, 2px surface gap between stacked segments, recessive gridlines (`ink-100`) and axis labels (`ink-500`).
- Every chart has a legend, a hover tooltip with exact values, and a table view; text uses ink tokens, never the series colour.
- One y-axis only. Leads and spend are shown in separate charts, never on a dual axis.
- Status colours (ok, warn, bad) are never used as series colours.

## Maps

Leaflet with a configurable tile provider (`NEXT_PUBLIC_MAP_TILE_URL`). The location being edited is drawn in brand amber; the organisation's other locations are drawn in muted ink, so overlap is visible. Catchments are dashed circles with a light fill; overlap is also reported in text with the distance, never by colour alone.

## Content style

- Plain, specific language. Say what happened and what to do next ("Reconnect Meta to keep publishing").
- Indian number formatting for money (₹1,23,456) and IST dates.
- Do not use the em dash character in any user-facing copy; use commas, full stops, colons or brackets.
