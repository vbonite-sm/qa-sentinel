# QA Sentinel HTML Report — UI Revamp Design

**Date:** 2026-03-26
**Status:** Approved
**Scope:** `src/generators/html-generator.ts`, `src/generators/card-generator.ts`

---

## Problem Statement

The HTML report has three compounding issues that undermine its credibility with both developer and non-technical stakeholder audiences:

1. **Visual identity**: Emoji icons throughout, neon-green default palette, system font stack — looks unpolished and generic.
2. **Information architecture**: The Overview is a flat dev-centric scroll with no executive summary zone. A PM or QA lead cannot assess suite health in under 10 seconds.
3. **Light mode**: Tokens fail WCAG AA contrast ratios, cards have no depth, structure is invisible.

---

## Approach: Full Visual + IA Redesign

Pure presentation layer. Zero changes to report logic, data collection, types, or tests.

**Files changed:**
- `src/generators/html-generator.ts` — CSS variables, HTML template, icon helper, Overview layout, sidebar hierarchy
- `src/generators/card-generator.ts` — test card left-border strip, emoji removal

**Files untouched:**
- All analyzers, collectors, types, utilities
- Trace viewer, gallery, comparison generators (color token changes flow through automatically)
- Python bridge

---

## Section 1: Brand Identity & Design System

### Logo Mark
Inline SVG shield/sentinel mark. Geometric hexagonal shield with a subtle diagonal guard line. Renders at any size, respects `currentColor`. Paired with **QA Sentinel** wordmark in Inter Bold. Replaces the absent brand identity in the current report.

### Typography

| Role | Font | Notes |
|------|------|-------|
| UI, headings, body | **Inter** | Clean professional — used by Linear, Vercel, Notion |
| Code, test names, stack traces | **JetBrains Mono** | Best-in-class mono; distinct `0Ol1I`, ligatures |

Both loaded via a single Google Fonts `<link>` with `preconnect` optimization. Replaces the current system font stack.

### Color Token System — Default Dark ("Sentinel" theme)

| Token | Current | Proposed | Tailwind ref |
|-------|---------|----------|--------------|
| `--bg-primary` | `#0a0a0f` | `#0F172A` | slate-900 |
| `--bg-secondary` | `#12121a` | `#1E293B` | slate-800 |
| `--bg-card` | `#1a1a24` | `#1E293B` | slate-800 |
| `--bg-card-hover` | `#22222e` | `#243349` | slate-800 lit |
| `--bg-sidebar` | `#0d0d14` | `#0B1120` | slate-950 |
| `--border-subtle` | `#2a2a3a` | `#334155` | slate-700 |
| `--border-glow` | `#3b3b4f` | `#475569` | slate-600 |
| `--text-primary` | `#f0f0f5` | `#F1F5F9` | slate-100 |
| `--text-secondary` | `#8888a0` | `#94A3B8` | slate-400 |
| `--text-muted` | `#5a5a70` | `#64748B` | slate-500 |
| `--accent-green` | `#00ff88` (neon) | `#10B981` | emerald-500 |
| `--accent-green-dim` | `#00cc6a` | `#059669` | emerald-600 |
| `--accent-red` | `#ff4466` | `#EF4444` | red-500 |
| `--accent-red-dim` | `#cc3355` | `#DC2626` | red-600 |
| `--accent-yellow` | `#ffcc00` | `#F59E0B` | amber-500 |
| `--accent-yellow-dim` | `#ccaa00` | `#D97706` | amber-600 |
| `--accent-blue` | `#00aaff` | `#3B82F6` | blue-500 |
| `--accent-blue-dim` | `#0088cc` | `#2563EB` | blue-600 |
| `--accent-purple` | `#aa66ff` | `#8B5CF6` | violet-500 |
| `--accent-orange` | `#ff8844` | `#F97316` | orange-500 |

### Color Token System — Light Theme

| Token | Current | Proposed | Tailwind ref |
|-------|---------|----------|--------------|
| `--bg-primary` | `#f5f5f7` | `#F8FAFC` | slate-50 |
| `--bg-secondary` | `#ffffff` | `#F1F5F9` | slate-100 |
| `--bg-card` | `#ffffff` | `#FFFFFF` | white |
| `--bg-card-hover` | `#f0f0f2` | `#F8FAFC` | slate-50 |
| `--bg-sidebar` | `#fafafa` | `#F1F5F9` | slate-100 |
| `--border-subtle` | `#e0e0e5` | `#CBD5E1` | slate-300 |
| `--border-glow` | `#d0d0d8` | `#94A3B8` | slate-400 |
| `--text-primary` | `#1a1a1f` | `#0F172A` | slate-900 |
| `--text-secondary` | `#5a5a6e` | `#475569` | slate-600 (7.2:1 WCAG AA) |
| `--text-muted` | `#8a8a9a` | `#64748B` | slate-500 (4.6:1 WCAG AA) |
| `--accent-green` | `#00aa55` | `#059669` | emerald-600 |
| `--accent-red` | `#dd3344` | `#DC2626` | red-600 |
| `--accent-yellow` | `#cc9900` | `#D97706` | amber-600 |
| `--accent-blue` | `#0077cc` | `#2563EB` | blue-600 |

Light mode cards get a shadow to restore depth (replaces invisible border):
```css
.card, .test-list-item {
  box-shadow: 0 1px 3px rgba(15,23,42,0.06), 0 1px 2px rgba(15,23,42,0.04);
}
```

### Curated Theme Set (9 themes)

| Key | Name | Replaces | Notes |
|-----|------|----------|-------|
| `sentinel` | Sentinel | dark | New default — slate professional dark |
| `light` | Light | light | Refined with WCAG-compliant tokens |
| `ocean` | Ocean | ocean | Retained — strong deep blue |
| `dracula` | Dracula | dracula | Retained — most-used dev theme globally |
| `nord` | Nord | cyberpunk | `#2E3440` bg + frost blue accents |
| `sunset` | Sunset | sunset | Retained — warm amber editorial |
| `rose` | Rose | rose | Retained — popular with mixed teams |
| `sage` | Sage | forest | Refined muted olive-green |
| `midnight` | Midnight | *(new)* | Deep navy-violet, late-night dark |

Cyberpunk is removed. Nord and Midnight are added.

---

## Section 2: Icon System

### Problem
Every interactive element uses OS-rendered emoji. Rendering is inconsistent across platforms, size/color cannot be controlled, and the aesthetic is inappropriate for a professional tool.

### Solution: Lucide Icons (inline SVG)

A `generateIcons()` helper function returns a typed map of `name → svgString`. Every emoji reference in the template is replaced with `${icons.name}`. No external HTTP requests — all SVG is inlined in the generated HTML output.

**Icon mapping:**

| Element | Lucide icon name |
|---------|-----------------|
| Sidebar toggle | `panel-left` |
| Search | `search` |
| Export | `download` |
| JSON export | `file-json` |
| CSV export | `file-spreadsheet` |
| PDF export | `file-text` |
| Summary card export | `clipboard-list` |
| Overview nav | `layout-dashboard` |
| Tests nav | `flask-conical` |
| Trends nav | `trending-up` |
| Comparison nav | `git-compare` |
| Gallery nav | `images` |
| Theme: dark | `moon` |
| Theme: light | `sun` |
| Theme: system | `monitor` |
| Theme: ocean | `waves` |
| Theme: dracula | `ghost` |
| Theme: sunset | `sunset` |
| Theme: rose | `flower-2` |
| Theme: sage | `leaf` |
| Theme: nord | `snowflake` |
| Theme: midnight | `star` |
| Duration | `clock` |
| File | `file-code-2` |
| Clear filters | `x` |
| Passed | `check-circle-2` |
| Failed | `x-circle` |
| Flaky | `alert-triangle` |
| Skipped | `minus-circle` |
| Empty state: no results | `search-x` |
| Empty state: select test | `test-tube-2` |
| Quarantined | `shield-off` |
| New failure | `alert-circle` |
| Fixed | `check-check` |
| Regression | `arrow-down-right` |

---

## Section 3: Information Architecture

### Overview — Two-Zone Layout

The current Overview is a flat developer-centric scroll. The redesign splits it into two distinct zones.

**Zone 1 — Executive Summary** (stakeholder-readable in 10 seconds)

- **Health Score**: A composite number (0–100) derived from pass rate, stability grade distribution, and flakiness rate — already computable from existing data. Plain-English verdict: "Healthy / At Risk / Critical".
- **Pass Rate**: Large prominent number with delta vs previous run (from `comparison` data).
- **Run Duration**: Total duration with test count.
- **Quality Gate badge**: Prominent pass/fail badge when `qualityGateResult` is present.
- **Trend indicator**: Arrow + "Improving / Stable / Degrading" based on history.

Layout: horizontal card row, large numbers, minimal labels. Readable without knowing what a "flakiness score" is.

**Zone 2 — Developer Detail** (below Zone 1, unchanged in content)

- Stat chips row: Failed / Flaky / Slow / New / Skipped (clickable, filter-linked)
- Failure clusters panel + Stability breakdown bar chart (side by side on wide screens)
- Trend chart (last 10 runs)
- Quality gate rule breakdown (when present)
- Quarantine summary (when present)

### Sidebar Hierarchy

**Changes:**
1. Progress ring (80×80 SVG) replaced by a **horizontal progress bar** with pass rate % and test count on one line. Frees ~100px of vertical space.
2. Navigation section gets `12px` top padding and `NAVIGATE` section label styled as `10px uppercase tracking-widest text-muted`.
3. Filter chips get `gap: 6px`, `padding: 3px 10px`, and a filled active state: `background: var(--accent-blue); color: white; border-color: transparent`.
4. File tree items get a `3px left border` colored by status (green/red/gray) instead of a `📄` emoji prefix.

### Tests View

Three targeted changes only:

1. **Test list items**: `3px left border` in status color replaces the status dot/emoji.
2. **Detail panel placeholder**: Branded empty state with the sentinel SVG mark + "Select a test to view details" in `text-muted`.
3. **Tab bar**: Underline-style active indicator replaces pill button style — cleaner inside a bordered panel.

---

## Section 4: Cross-Mode Polish

### Global fixes

| Issue | Fix |
|-------|-----|
| `<title>` hardcoded as `"Smart Test Report"` | Use `reportTitle` variable (already computed) |
| `⌘K` shortcut displayed on Windows | Platform-detect at runtime: `navigator.platform.includes('Mac') ? '⌘K' : 'Ctrl+K'` |
| Z-index collisions between topbar and dropdowns | Establish scale: topbar `20`, dropdowns `30`, modals `50`, toasts `60` |
| Filter chip active state uses border only | Filled background: `background: var(--accent-blue); color: white` |
| `body { overflow: hidden }` breaks mobile scroll | Move to `.main-content { overflow-y: auto }` |
| Theme dropdown items use emoji | Lucide SVG icons per theme (see icon map above) |

---

## Non-Goals

- No changes to report data logic, analyzers, collectors
- No changes to trace viewer, gallery, or comparison generators
- No new runtime dependencies (Google Fonts `<link>` is the only addition)
- No behavior changes — filtering, search, navigation all work identically

---

## Acceptance Criteria

- [ ] All emoji replaced with Lucide SVG icons across `html-generator.ts` and `card-generator.ts`
- [ ] `<title>` reflects `reportTitle`
- [ ] Default dark theme uses new slate-based tokens (no neon green)
- [ ] Light mode passes WCAG AA for `--text-secondary` and `--text-muted`
- [ ] Light mode cards have `box-shadow` depth
- [ ] Overview Zone 1 (executive summary) renders above Zone 2
- [ ] Health Score computed and displayed in Zone 1
- [ ] Sidebar shows horizontal progress bar (no SVG ring)
- [ ] Filter chips have filled active state
- [ ] File tree items have colored left border (no emoji prefix)
- [ ] Test list items have colored left border strip
- [ ] Tab bar uses underline active style
- [ ] Cyberpunk theme removed; Nord and Midnight themes added
- [ ] Inter + JetBrains Mono loaded via Google Fonts `<link>`
- [ ] Z-index scale established (20/30/50/60)
- [ ] `⌘K` / `Ctrl+K` platform-detected at runtime
- [ ] All existing vitest tests still pass
- [ ] No changes outside `html-generator.ts` and `card-generator.ts`
