# DESIGN — Lex

> Visual contract for Lex. Every Qualia agent reads this before any frontend work.

## 1. Direction (committed)

```
Aesthetic direction:  editorial · legal-letterhead · luxury-restraint
Color strategy:       Restrained — single warm accent on near-paper neutrals
Scene sentence:       A Cyprus lawyer at 9pm in a quiet office, lamp on,
                      glancing at a tabular column of invoices to decide
                      which client needs a reminder tomorrow morning.
Differentiation:      Reads like a well-designed legal letterhead, not a SaaS dashboard.
```

This is the brief in four lines. Every choice below flows from it. Lex does NOT look like Clio, does NOT look like iJustice, does NOT look like a chat product. Lex looks like a serif-headed engagement letter from a serious firm — but it's an app.

## 2. Color (OKLCH only)

> Light theme is default (lawyers print things; ink-on-paper is the mental model).
> A dark theme will be defined later — out of scope for the demo.
> No `#hex`. No `rgb()`. No `hsl()`. No pure `#000` or `#fff`.

### Tokens (light — default)

```css
:root {
  /* Surfaces — warm ink-on-paper neutrals, tinted toward terracotta (the Cyprus warm accent) */
  --bg:        oklch(0.985 0.004 60);   /* page paper */
  --bg-2:      oklch(0.965 0.006 60);   /* raised surface (header bar, sidebar) */
  --surface:   oklch(0.945 0.008 60);   /* card */
  --surface-2: oklch(0.920 0.010 60);   /* card-on-card (rare — depth max 2) */

  /* Text — warm near-black, never pure black */
  --text:      oklch(0.18 0.012 50);    /* body */
  --muted:     oklch(0.45 0.012 50);    /* secondary */
  --dim:       oklch(0.62 0.010 50);    /* tertiary, captions */

  /* Lines */
  --line:      oklch(0.86 0.010 60);
  --line-soft: oklch(0.92 0.008 60);

  /* Accent — terracotta (warm, dignified, distinctly Mediterranean) */
  --accent:     oklch(0.55 0.150 35);   /* primary CTA, brand */
  --accent-2:   oklch(0.48 0.155 35);   /* hover */
  --accent-bg:  oklch(0.55 0.150 35 / 0.10);  /* tinted bg */

  /* Trust ledger — distinct from revenue (deeper sage-olive, NEVER terracotta) */
  --trust:      oklch(0.45 0.060 145);
  --trust-bg:   oklch(0.45 0.060 145 / 0.08);

  /* Semantic */
  --ok:    oklch(0.55 0.130 150);   /* paid */
  --warn:  oklch(0.65 0.140 75);    /* due-soon */
  --kill:  oklch(0.52 0.180 25);    /* overdue */
}
```

### Accent rules

- Accent ≤10% surface coverage. Restrained strategy means the page is mostly paper, with terracotta used for one CTA per view, the active nav item, and overdue badges.
- Accent must be sharp — not a desaturated pastel.
- Trust-ledger color is **never used outside the trust ledger context.** Mixing the two semantics is a hard-block.

### Contrast verification (must hold)

```
text on bg          — 13.4:1 (AA)
muted on bg         — 6.9:1 (AA)
accent on bg        — 5.1:1 (AA)
text on accent      — 6.0:1 (AA)   for buttons
trust on bg         — 6.4:1 (AA)
```

## 3. Typography

```
Display:  Crimson Pro   — 600 / 700 — section titles, invoice headers, hero
Body:     Söhne (or Inter Display as fallback during dev) — 400 / 500 / 600
Mono:     Söhne Mono    — 400 / 500 — invoice numbers, amounts, line items
```

**Banned:** Inter (UI body), Roboto, Arial, system-ui, Space Grotesk, Helvetica.
(Söhne is the body face — Söhne, NOT Inter. If Söhne license unavailable, use **Inter Tight** as a temporary substitute, never plain Inter.)

Crimson Pro on a legal product gives the letterhead feeling without going full Garamond serif-museum. It's a working serif, not a decorative one.

### Scale

| Token | Size | Line height | Letter spacing | Use |
|---|---|---|---|---|
| display | clamp(2.2rem, 4.5vw, 3.6rem) | 1.04 | -0.025em | invoice header, hero metric |
| h1 | clamp(1.6rem, 3vw, 2.2rem) | 1.12 | -0.018em | page title |
| h2 | clamp(1.25rem, 2.2vw, 1.6rem) | 1.2 | -0.012em | section |
| h3 | 1.0rem | 1.3 | -0.008em | card title, table caption |
| body | 0.94rem | 1.55 | 0 | paragraphs, form labels |
| small | 0.82rem | 1.5 | 0 | meta, helper text |
| caption | 0.7rem | 1.4 | +0.08em | uppercase labels (STATUS, VAT, TOTAL) |

### Numerals (mandatory)

```css
.tabular { font-feature-settings: "tnum" 1, "lnum" 1; }
```

Apply to **every** column of money, every invoice number, every date column, the trust-ledger balance. The numbers are the product (Principle 1).

### Body line length

```css
.prose { max-width: 65ch; }
```

## 4. Spacing

8px grid, fluid at the page-padding level.

```css
:root {
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --space-12: 48px;
  --space-16: 64px;
  --space-24: 96px;

  --pad-x:        clamp(1rem, 4vw, 3rem);     /* horizontal page padding */
  --pad-section:  clamp(1.5rem, 5vw, 4rem);   /* vertical section padding */
  --pad-card:     1rem 1.25rem;                /* card interior */
  --gap-stack:    0.875rem;
  --gap-grid:     1rem;
}
```

Tables are tight (compact density — lawyers want rows per screen). Cards are generous. Empty states are very generous.

## 5. Components

### Buttons (3 variants)

```css
.btn-primary   { background: var(--accent); color: var(--bg); padding: 0.55rem 1rem; border-radius: 4px; font-weight: 500; }
.btn-secondary { background: var(--bg); border: 1px solid var(--line); color: var(--text); padding: 0.55rem 1rem; border-radius: 4px; }
.btn-ghost     { background: transparent; color: var(--muted); padding: 0.45rem 0.75rem; border-radius: 4px; }
.btn-danger    { background: var(--kill); color: oklch(0.985 0.004 60); }
```

Border-radius is small (4px) — invoices and legal documents don't have pill-shaped buttons.

### Inputs

- Visible labels above the field; placeholder only for example values
- Focus ring: 2px offset, `--accent` color
- Error: red inline text under field + `aria-describedby`

### Cards

```css
.card { background: var(--surface); border: 1px solid var(--line); border-radius: 6px; padding: var(--pad-card); }
```

Container depth max 2. No card-on-card-on-card.

### Tables (the main UI for invoices, clients, cases, trust ledger)

- Tabular numerals on numeric columns (mandatory)
- Right-align numbers, left-align text, center-align status badges
- Sticky header
- Sort indicator on hover (chevron), persistent + colored on active
- Row hover: `--surface` background (subtle)
- Row click: navigate to detail (no popover)
- Status pills: `ok` / `warn` / `kill` semantics with uppercase caption-style text

### Invoice document (PDF render)

This is the artifact lawyers send to clients. It must look like a serious firm's letterhead.

- Serif display (Crimson Pro) for the firm name + invoice number
- Söhne body for line items
- Söhne Mono for amounts
- VAT line itemized
- Footer with tax ID, VAT registration, IBAN, page x/y
- Bilingual layout option: two-column GR + EN side by side OR single-language

### Trust ledger view

- **Visually distinct from revenue views.** Trust uses `--trust` (sage-olive) accent.
- Banner at top: "Trust ledger — Client funds. Not lawyer revenue."
- Cannot be exported in the same PDF as a revenue summary.

## 6. Depth & elevation

3 levels max, OKLCH-tinted toward terracotta hue.

```css
:root {
  --elev-1: 0 1px 2px oklch(0.18 0.020 50 / 0.06);
  --elev-2: 0 4px 12px oklch(0.18 0.020 50 / 0.10);
  --elev-3: 0 12px 32px oklch(0.18 0.020 50 / 0.16);
}
```

Use elevation semantically. `elev-1` for hovered rows in tables. `elev-2` for popovers and the command bar. `elev-3` for modals.

## 7. Motion

```css
:root {
  --ease-out-quart: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-out-expo:  cubic-bezier(0.16, 1, 0.3, 1);
  --ease-out-std:   cubic-bezier(0, 0, 0.2, 1);

  --d-instant:  100ms;
  --d-quick:    150ms;
  --d-default:  200ms;
  --d-section:  300ms;
  --d-feature:  500ms;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

Animate only `transform` and `opacity`. No bounce, no elastic. Lawyers don't want playful motion in a financial tool.

## 8. Iconography

```
Family:  Lucide
Stroke:  1.5px
Size:    16px (table actions), 20px (sidebar nav, default), 24px (empty states, hero)
```

ONE family. No mixing with Heroicons or Phosphor anywhere.

## 9. Responsive

Mobile-first. Tested at 375 / 768 / 1280.

```
Breakpoints:
  sm:  640px
  md:  768px
  lg:  1024px
  xl:  1280px

Touch targets:   44×44px minimum
Tables on mobile: card view (each row becomes a card with key/value pairs)
Sidebar:         drawer on mobile, persistent on lg+
Command bar:     full width on mobile, centered modal on lg+
```

## 10. Anti-pattern checklist (mandatory before commit)

- [ ] No `#000` or `#fff` (only OKLCH)
- [ ] No banned fonts (Inter as body, Roboto, Arial, system-ui, Space Grotesk, Helvetica)
- [ ] No purple-blue gradients
- [ ] No glassmorphism
- [ ] No gradient text
- [ ] No identical card grids of 3
- [ ] No "Get Started" / "Learn More"
- [ ] No em dashes in copy (use — only in this design doc itself, NOT in UI strings)
- [ ] No `max-w-7xl` or hardcoded width caps
- [ ] No modal as first thought
- [ ] Container depth ≤ 2
- [ ] Lucide is the only icon family
- [ ] `prefers-reduced-motion` respected
- [ ] Touch targets ≥ 44×44px
- [ ] WCAG AA contrast verified
- [ ] Tabular numerals on every money column
- [ ] Trust ledger visually distinct from revenue views
- [ ] No pill-shaped buttons (radius ≤ 6px)

`bin/slop-detect.mjs` runs a subset of this automatically.
