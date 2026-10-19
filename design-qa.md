# Personal statistics: compact stacked bars

final result: passed

Date: 2026-10-19. Branch: `codex/fluid-interactions`.

## Visual truth and implementation

- User reference: Bencho's light stacked-bars component and the supplied screenshot.
- Source: [reference card](docs/profile-stacked-bars/reference.png), [reference hover](docs/profile-stacked-bars/reference-hover.png), [live source](https://bencho.dev/?c=stacked-bars&theme=light).
- Implementation: [20 days](docs/profile-stacked-bars/day.png), [20 weeks](docs/profile-stacked-bars/week.png), [hover](docs/profile-stacked-bars/hover.png), [full context](docs/profile-stacked-bars/desktop.png).
- Combined comparison input: [default and hover comparison](docs/profile-stacked-bars/comparison.png), also available as [HTML](docs/profile-stacked-bars/comparison.html).
- Both reference and implementation were captured in a 1440 × 1000 CSS viewport at device scale factor 1. The rendered reference measures 375 × 344.375 CSS px; the implementation measures exactly 375 × 344.375 CSS px. Both element screenshots round to 375 × 345 raster px. Comparison HTML uses those same dimensions, without cropping or scaling.
- State: light theme, daily interval, no selection; then hovered column. Source and demo values intentionally differ: visits are replaced with actual focus minutes and priority categories. Twenty weeks is a functional extension explicitly requested by the user.
- Focused comparison: each element capture contains only the card, so type, margins, column spacing, baseline, rounded corners, and tooltip remain readable. Full-page screenshots separately verify the integration.

## Findings and comparison history

1. Initial implementation: blocked, P1. A wide seven-day chart, visible grid, and separate horizontal deviation chart did not meet the user's clarified request for a compact copy. Replaced with a 375 px card, 20 daily/weekly buckets, no visible axis or default legend, and downward red deficit bars. Final evidence: `day.png`, `week.png`, `comparison.png`.
2. Integration: blocked, P2. White card edges disappeared on the surrounding white surface. Added the reference's quiet gray surrounding surface on desktop while preserving the compact card dimensions. Final evidence: `desktop.png`.
3. Hover evidence: the first capture caught the opening opacity animation. Recaptured stable states with screenshot animations disabled; implemented source-style surrounding-column dimming, a selected-column outline, and a right-aligned floating tooltip. Final evidence: `reference-hover.png`, `hover.png`, `comparison.png`.
4. Final comparison: no actionable P0/P1/P2 findings. Residual P3: the source uses Inter/Maison Neue font families; the app uses system Arial/Segoe UI/CJK fallbacks. Chinese replacement text and different numbers naturally change glyph widths. This is a close layout/style recreation, not a claim of identical pixels for different content.

## Required fidelity surfaces

- Fonts and typography: title at 17.5 px, 37.5 px total, 16 px unit/subtitle, and 14 px endpoints. Matched line boxes and alignment against the reference; Chinese and English fit. System-font glyph differences are the P3 above.
- Spacing and layout: matched 20 px padding, 42.5 px heading, 40 px interval control, total baseline, 158.75 px plot, 7.5 px column gaps, 25 px radius, and sparse endpoints. Narrow viewports reduce the horizontal gap without introducing page overflow.
- Colors/tokens: the user's final mapping is P1 purple `#9d7bf5`, P2 blue `#5b8def`, P3 light blue `#9ab8db`, and temporary tasks yellow `#f2c46d`; deficits use `#e5484d`. Other priority legends in the statistics view use the same tokens. The stack order remains visually purple → blue → light blue → yellow, now corresponding to P1 → P2 → P3 → temporary.
- Image quality/assets: this is a live quantitative chart, with no raster imagery or decorative assets to replace. Native DOM bars are driven by data. Source captures are evidence only and are not shipped as the chart.
- Copy/content: visits become measured focus minutes. Day/Week becomes 日/周 with 近 20 日/近 20 周 subtitles. Legends, source definitions, and tables remain available in a collapsed disclosure. Only actual measured focus contributes to colored bars; estimates remain separate.

## Data and interaction validation

- Exactly 20 local calendar days including the reference date; exactly 20 Monday-based weeks, with the last week ending on the reference date.
- Each period's deficit is `max(plannedSeconds − measuredSeconds, 0)`. Weekly deficits use weekly totals. Example: planned 1,242 min, measured 1,135 min, deficit 107 min.
- Both sides of zero use the same time scale. No minimum bar height; zero values remain zero. Session snapshots, manual tasks, orphaned sessions, and cross-midnight task-date attribution are preserved.
- Browser: day/week toggles, hover, ArrowRight/End/Escape, date change, details, Chinese/English, empty history, and reduced motion passed. At widths 375 and 320 px, document width equals viewport width. Business storage before/after interactions is identical. Fresh browser verification reports zero console/page errors.
- Evidence: [verification.json](docs/profile-stacked-bars/verification.json). Replay script stays in the existing ignored UI-validation folder, `output/playwright/ui-motion/profile-stacked-bars/verify-profile.js`; demo data was created only in an isolated browser profile.
- Full suite: 43 files / 296 tests passed. After the final tooltip adjustment: 4 relevant files / 17 tests passed. TypeScript check and final production build passed. The build retains its existing bundle-size advisory.
- Scope: browser renderer verification. Installed Electron/Android packages were not rebuilt or installed.

## Implementation checklist

- [x] Compact reference layout and colors
- [x] 20-day / 20-week aggregation
- [x] Red downward shortfall bars
- [x] Hover and keyboard interaction
- [x] Empty / bilingual / narrow / reduced-motion states
- [x] Data integrity, tests, type check, and production build
- [x] Combined visual comparison and preserved evidence

## Follow-up: task and habit palette

Unified the planner and statistics around four root tokens in `src/index.css`, updated to the user's final mapping: P1 `#9d7bf5`, P2 `#5b8def`, P3 `#9ab8db`, temporary tasks `#f2c46d`. Task labels, completed task fills, habit selection/configuration accents, scheduling accents, and focus indicators now use that same palette. Related soft backgrounds/borders/text follow the new hue assignments. Generic success messages retain their semantic green.

Browser-computed colors match exactly between all four completed task blocks, their pending-task labels/dots, and the statistics segments. All three selected habit options also match after their color transition settles. Task titles and metadata use `#202124`; contrast ratios against P1/P2/P3/temporary fills are respectively 5.05, 4.98, 7.86, and 9.88. Validation did not alter business records.

Evidence: [task blocks](docs/profile-stacked-bars/task-colors.png), [habit configuration](docs/profile-stacked-bars/habit-colors.png), [palette verification](docs/profile-stacked-bars/palette-verification.json). Eight related test files / 29 tests passed; TypeScript and production build passed. Browser runtime errors: zero. Day/week/hover/comparison captures were refreshed for this mapping. These follow-up captures also use isolated demo data.

## Pre-merge validation

On 2026-10-19, `npm run verify:release` passed on the final source: TypeScript, 43 test files / 296 tests, the production frontend build, Electron main-process compilation, and the Electron type check. The production build retains its existing bundle-size advisory. An initial sandbox run failed on temporary-file access (`ENOENT` / `EPERM`); the same command passed outside the sandbox without source changes. Windows packaging and native regression remain covered by the pull request's Windows candidate workflow.

The first Windows candidate run built the package, then stopped at an outdated packaged-regression assertion for `Weekly review` and the former seven-day controls. Those assertions now exercise `Period review`, Day/Week switching, and exactly 20 columns in each mode; the remaining native regression checks are preserved.
