# Design system and wireframes

## Principles

Calm, credible and fast: a navy and white base that reads as institutional, teal for actions and progress, generous whitespace, no stock-photo clutter. Every screen works in Arabic (RTL) and English (LTR) from the same markup, in light and dark mode, at 320 px wide and up.

## Tokens

Defined as HSL CSS variables in `src/app/globals.css` and mapped to Tailwind colours in `tailwind.config.ts`.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--primary` | navy `220 62% 22%` | light blue `210 70% 76%` | Brand, primary buttons, headings |
| `--accent` | teal `175 84% 26%` | teal `172 66% 50%` | Calls to action, links, progress, focus ring |
| `--background` / `--card` | white | navy `222 50% 8%` / `222 45% 11%` | Surfaces |
| `--muted` / `--muted-foreground` | `214 32% 95%` / `218 20% 36%` | `222 35% 16%` / `215 20% 72%` | Secondary text, table headers, chips |
| `--success`, `--warning`, `--destructive` | green, amber, red | lighter equivalents | Status badges and alerts |

Text on `--primary` and `--accent` is white in light mode; each foreground/background pair used for body text is chosen to meet WCAG AA (4.5:1). Status is never conveyed by colour alone: badges always carry the status label.

Typography uses the platform UI font (`Inter`/`Segoe UI`/system) for Latin and `Noto Kufi Arabic`/`Segoe UI`/Tahoma for Arabic, set per locale on `<body>`; no web-font download is required, which keeps first paint fast on mobile networks.

## RTL rules

The `<html>` element carries `lang` and `dir` from the locale segment. Components use logical utilities only — `ms-*`/`me-*`, `ps-*`/`pe-*`, `start-*`/`end-*`, `text-start`/`text-end`, `border-s` — so nothing needs mirroring by hand. Directional icons (send arrow, disclosure chevron) flip with `rtl:` variants. Numbers use Latin digits in both languages (`ar-SA-u-nu-latn`) because prices, order references and phone numbers are copied between systems; dates use the Gregorian calendar with month names in the active language. Fields that hold Latin-only data (slug, phone, codes) set `dir="ltr"` explicitly.

## Components

All in `src/components/ui/`, shadcn-style: `Button` (primary, accent, outline, ghost, destructive, link × sm/md/lg), `Input`/`Textarea`/`Select`, `Field` (label + hint + error wired with `aria-describedby`), `Card`, `Badge` (tone per order status), `Alert` (`role="alert"` for errors, `status` otherwise), `Table` (horizontal scroll on narrow screens), `SubmitButton` (pending state from `useFormStatus`).

Domain components: `OrderWizard`, `EstimateView`, `FileUploader`, `ChatPanel`, `RevisionForm`, `StatusBadge`, and the admin `ActionForm`, which surfaces database refusals inline.

## Accessibility checklist built in

Skip link to `#main`; visible focus ring on every interactive element; form errors announced via `role="alert"`; chat log is `role="log"` with `aria-live="polite"`; step navigation marks the current step with `aria-current="step"`; tabs in the workspace are links with `aria-current="page"` so they work without JavaScript; `prefers-reduced-motion` disables transitions; every icon-only button has an `aria-label`.

## Wireframes

### Home (mobile first; desktop widens the grid)

```
┌───────────────────────────────────────────┐
│ [RD] ResearchDesk Pro      ع  ◐  Sign in  │
│ Services Pricing FAQ Resources About …    │
├───────────────────────────────────────────┤
│ NAVY HERO                                 │
│ Rigorous research support, in Arabic and  │
│ English                                   │
│ [ Start an order ]  ( See pricing )       │
├───────────────────────────────────────────┤
│ 🔒 Private by design │ ✓ Transparent │ 💬 │
├───────────────────────────────────────────┤
│ How it works  1 Describe 2 Quote 3 Pay 4 … │
├───────────────────────────────────────────┤
│ ▌Academic integrity comes first           │
└───────────────────────────────────────────┘
```

### Order wizard

```
┌─────────────────────────────── ┬───────────────┐
│ (1 Service)(2 Details)(3 Scope)│ Estimate      │
│ (4 Deadline)(5 Files)(6 Review)│ Base   600.00 │
│                                │ Level ×1.15   │
│ ┌ service card ┐┌ service card ┐ Turnaround ×1.4│
│ └──────────────┘└──────────────┘ ───────────── │
│                                │ Total 966.00  │
│ [Back] (Save draft) [Next]     │ estimate only │
└────────────────────────────────┴───────────────┘
```

### Order workspace

```
RD-2026-000123                      [In progress]
Survey analysis for nursing study
Overview | Messages | Files | Quote & payment | Revisions | Timeline
┌──────────────────────────┐ ┌──────────────────────────┐
│ Questions from the owner │ │ Requirements             │
│ Q: Which software?       │ │ Deadline  12 Nov 18:00   │
│ [answer……] [Send]        │ │ Language  Arabic         │
└──────────────────────────┘ └──────────────────────────┘
```

### Admin dashboard

```
┌ New 3 ┐┌ Waiting 1 ┐┌ To quote 2 ┐┌ Unpaid 4 ┐┌ WIP 6 ┐
┌ Revisions 1 ┐┌ Overdue 0 ┐┌ Refunds 1 ┐┌ Unread 5 ┐
┌ SAR · 30d ──────────────┐ ┌ USD · 30d ──────────────┐
│ revenue, AOV, conversion │ │ …                        │
└──────────────────────────┘ └──────────────────────────┘
┌ Needs attention (table) ──────────┐ ┌ Integrations ─────┐
│ ref  title  status  deadline      │ │ Moyasar: unverified│
└───────────────────────────────────┘ └───────────────────┘
```
