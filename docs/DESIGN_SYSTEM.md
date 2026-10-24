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
| `ink-900` | `#0f1b31` | Body text, dark buttons, filter "Apply" |
| `ink-600` / `ink-500` | `#3a4f75` / `#5b6f93` | Secondary text, axis labels |
| `ink-200` / `ink-100` / `ink-50` | `#d7deea` / `#ebeff6` / `#f5f7fb` | Borders, gridlines, page background |
| `road-600` / `road-700` | `#1d4ed8` / `#1e40af` | Primary buttons (white text), links, active navigation, progress bars |
| `road-500` / `road-100` / `road-50` | `#2563eb` / `#dbeafe` / `#eff6ff` | Focus border and ring, active navigation background, icon tiles |
| `brand-500` | `#f59e0b` | Logo and marketing highlights only (used sparingly) |
| `brand-700` | `#b45309` | Brand text on light backgrounds, "Managed by AutoSutra" badge |
| `ok-700` on `ok-50` | `#15803d` / `#f0fdf4` | Success |
| `warn-700` on `warn-50` | `#a16207` / `#fefce8` | Warning |
| `bad-700` on `bad-50` | `#b91c1c` / `#fef2f2` | Error, destructive actions, required-field marker, unread count |
| `ok-500`, `warn-500`, `bad-500` | | Status dots inside badges only, always next to a text label |

Text colour pairs above meet WCAG AA contrast on their intended background. Focus is a visible 2px `road-500` outline on every interactive element; form controls add a 4px `road-100` ring.

Surfaces: white cards with a 1px `ink-200` border, `--radius-card` (12px) corners and the soft `--shadow-card`; menus and sheets use `--shadow-pop`. The page background is `ink-50`.

Typography is Inter (variable font, self-hosted through `@fontsource-variable/inter`, so no request goes to a font CDN), with the system UI stack as fallback. Page titles are 22 to 24px semibold, card titles 15px semibold, labels 13px. Amounts in tables use tabular figures (`Num`, `tabular-nums`) so columns align; a monospace stack is available for ids.

Icons come from `lucide-react`, 16 to 18px, `ink-400` when idle. Icons are decorative (`aria-hidden`) and always sit next to a text label.

## App shell (`src/components/app`)

- **Desktop**: a fixed 248px white sidebar (logo, organisation switcher, grouped navigation with icons and count badges, account menu at the bottom) and a sticky top bar showing the current section and page, with the notifications bell.
- **Phone**: a top bar (logo, organisation name, bell, account) and a bottom tab bar with the four main areas plus **More**, which opens a sheet with every section and the account links. Page content leaves room for the tab bar and the safe area.
- Navigation is described on the server (`src/server/nav.ts`: label, section, icon name, `mobile` flag, badge) and filtered by the user's permissions; `nav-icons.tsx` maps icon names to components.

## Components (`src/components/ui`)

| Component | Notes |
|---|---|
| `Button`, `ButtonLink` | Variants: primary, secondary, dark, ghost, danger. Sizes sm, md, lg (32/40/48px high) |
| `Card`, `CardHeader`, `PageHeader`, `Stat`, `DescriptionList`, `EmptyState`, `Alert` | Page structure, headline numbers, empty and alert states |
| `Badge`, `StatusBadge` | Tones: neutral, info, ok, warn, bad, brand, demo. `StatusBadge` maps campaign, platform, payment and lead statuses to tones and labels in one place |
| `Field`, `Input`, `Textarea`, `Select`, `Checkbox`, `TextField`, `TextAreaField`, `SelectField`, `FormGrid` | Visible labels; error text linked with `aria-describedby` and `aria-invalid`; required marker is visual only (`aria-hidden`) with `required` on the input |
| `ActionForm`, `SubmitButton`, `FieldError` | Wraps server actions: pending state, inline errors, field errors, success notice via toast, optional reset or redirect |
| `Table`, `THead`, `TBody`, `Th`, `Td`, `Num` | Responsive wrapper that scrolls horizontally inside itself. Key lists (campaigns, leads) switch to stacked cards below the `md` breakpoint |
| `FilterBar`, `FilterSearch`, `FilterSelect`, `FilterInput` | GET filter toolbar for list pages: two-column grid on phones, one row on wider screens, "Clear" once a filter is set |
| `Tabs`, `Modal`, `Toaster`, `PageLoading` | Link-based tabs; `Modal` uses the native `<dialog>` element, so the browser handles focus and Escape |

App components: `BuilderSteps` (campaign builder progress: seven steps, visitable in any order once the draft exists), `report-view.tsx` (KPI tiles, enquiry funnel, spend and enquiry charts, platform cards and tables shared by the dashboard and reports).

Brand and illustration components: `src/components/brand.tsx`, `src/components/marketing/illustrations.tsx` (inline SVG, no external images).

## Charts

`src/components/charts/bar-chart.tsx` (inline SVG, no chart library). Series colours live in `src/components/charts/colors.ts`, outside the client chart module, so server components read the real values.

- Series colours are assigned by **entity, not rank**: Meta is always slot 1 `#2a78d6`, Google is always slot 2 `#eb6834`. Filtering to one provider keeps its colour.
- Palette validated with a colour-vision checker against the light surface: lightness band, chroma floor, contrast at least 3:1, CVD separation (worst case protanopia ΔE 24.7) and normal-vision separation (ΔE 33.6) all pass.
- Marks: bars at most 24px wide, 4px rounded data ends, 2px surface gap between stacked segments, recessive gridlines (`ink-100`) and axis labels (`ink-500`).
- Every chart has a legend, a hover tooltip with exact values, and a table view; text uses ink tokens, never the series colour.
- One y-axis only. Leads and spend are shown in separate charts, never on a dual axis.
- Status colours (ok, warn, bad) are never used as series colours.
- The enquiry funnel is a labelled bar list in `road-600`: every stage shows its count and its rate from the previous stage as text, so bar length is never the only cue. Cost figures show "–" until provider-reported spend exists, rather than ₹0.

## Maps

Leaflet with a configurable tile provider (`NEXT_PUBLIC_MAP_TILE_URL`). The location being edited is drawn in brand amber; the organisation's other locations are drawn in muted ink, so overlap is visible. Catchments are dashed circles with a light fill; overlap is also reported in text with the distance, never by colour alone.

## Content style

- Plain, specific language. Say what happened and what to do next ("Reconnect Meta to keep publishing").
- Indian number formatting for money (₹1,23,456) and IST dates.
- Do not use the em dash character in any user-facing copy; use commas, full stops, colons or brackets.
