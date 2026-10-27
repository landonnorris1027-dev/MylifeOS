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

## 2026-10-27: three-card desktop layout

final result: passed

This entry covers the current layout change only. The 2026-10-19 results above remain historical evidence.

### Target and evidence

- User direction: retain the compact trend card; remove the weekly-target progress card; put the daily and weekly completed-focus distribution cards beside the trend, with their heights set by the trend card.
- Source visual truth: `output/ui-profile-layout-20261027/source-trend-layout.png` (2167 x 682) and `source-distribution-layout.png` (2304 x 1021), copied from the screenshots supplied by the user.
- Rendered implementation: `output/ui-profile-layout-20261027/desktop-1280.png` (1280 x 980) and `desktop-viewport.png` (1707 x 979). Screenshots use CSS scale. Source images and the implementation were inspected together in the same comparison inputs, including readable card typography and legends.
- State: Chinese, light theme, reference date 2026-10-27, daily interval, empty measured-focus data, collapsed details. No illustrative records were inserted into the running app.
- The supplied screenshots have different crops and density from the browser captures. This is an intentional rearrangement, not a claim of identical full-frame pixels. The live pre-change trend dimensions, fonts, padding and radius provide the focused baseline: 375 x 344.375 CSS px, Arial/Segoe UI/CJK fallbacks, 20 px padding, 25 px radius. All remain unchanged after the rearrangement.

### Findings and required fidelity surfaces

- No actionable P0/P1/P2 differences remain against the user's final direction. The intermediate design with a weekly-target card above the distributions was rejected by the user and replaced by the three-card row.
- Typography: trend component and stylesheet are unchanged. Distribution headings, dates, units and legend values remain readable; desktop legends now sit beside the rings.
- Layout: at a 1280 px viewport the card widths are 375 / 376.5 / 376.5 CSS px. At 1707 px they are 375 / 484.5 / 484.5 CSS px. All three card heights are 344.375 CSS px with aligned top and bottom edges. The shared grid row derives its height from the unchanged trend card, without copying a fixed height into the distribution cards.
- Layout of details: the disclosure remains below the trend. When expanded, it spans the grid below the cards; all three cards retain their original heights.
- Color and assets: existing priority tokens, white panels, gray rings and gray desktop surround are retained. Existing live chart/SVG components are reused; no chart is replaced by an image or invented data.
- Copy and data: the weekly-target progress panel is absent. Its date filter is retained above the three cards. Daily/weekly distributions still use measured focus belonging to completed tasks; their computation and rendering component are unchanged.
- Responsive limits: below 1280 px the layout wraps. At 390 px, cards stack and document width does not exceed the viewport. The original narrow-screen trend styling remains in effect. This is browser-renderer verification, not native-device acceptance.

### Validation and capture history

- TypeScript check passed; production frontend build passed with the existing bundle-size advisory.
- Four existing relevant test files passed: 14 tests covering trend rendering, desktop reports, distributions and shared Android storage/UI behavior. An initial sandbox temporary-file ENOENT prevented test collection; assigning the test process a workspace-local TEMP/TMP directory resolved it without test or business-code changes.
- Existing Playwright tab at `http://127.0.0.1:3000/` reused. Day/week switching and details open/close checked; both modes retain 20 columns and equal card heights. Browser console errors: zero. Date changes remain covered by the existing desktop report tests.
- Narrow-screen evidence: `output/ui-profile-layout-20261027/mobile-390.png` (390 x 844). The viewport was restored to 1707 x 979, daily mode and collapsed details after checking.
- Rejected capture: `trend-before.png` was occluded by the sticky header and is not accepted visual evidence. Locator-based captures of the full grid timed out waiting for stability; viewport screenshots above were captured and inspected successfully instead.
- Scope: frontend source and production web build. Installed Windows/Android packages were not rebuilt or installed.

### Implementation checklist

- [x] Remove weekly-target progress panel and retain date navigation.
- [x] Preserve trend dimensions, appearance and interactions.
- [x] Align daily and weekly distribution cards with the trend in one desktop row.
- [x] Verify responsive wrapping, real rendered screenshots, relevant tests and production build.
