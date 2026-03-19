# Visual QA Checklist — Homepage Hero + Launch Cards + First Body Block (2026-03-16)

## Scope
Homepage visual QA for:
- Hero section
- Launch cards row/block
- First body-content block immediately below launch cards

Target page:
- `docs/index.html`

## Required desktop checkpoints
- [ ] 1920×1080
- [ ] 2560×1440
- [ ] 3840×2160
- [ ] 3440×1440 (ultra-wide class)

## Mobile/Tablet regression checkpoints (must remain unchanged)
- [ ] Mobile: 390×844
- [ ] Tablet: 768×1024 (current tablet checkpoint)

## Acceptance criteria (desktop, using 2560×1440 after screenshot as hierarchy reference)
Use `qa-after-2560x1440.png` as the target reference for relative scale.

- [ ] **Hierarchy is preserved**: main title text remains visibly larger than nav and body copy.
- [ ] **CTA prominence is preserved**: CTA label text is at least as large as nearby body copy and appears visually emphasized by button styling/weight.
- [ ] **Body readability is preserved**: first body-content block text appears smaller than the title, and similar to or slightly smaller than nav/CTA text, while maintaining comfortable line-height.
- [ ] **No over-scaling drift**: body text does not visually approach title size at any desktop checkpoint.
- [ ] **No under-scaling drift**: body text remains clearly legible at 1920×1080 and larger desktop sizes.

## Width token acceptance criteria (desktop scaling, including 3840×2160)
Root width tokens are expected to drive `.page-header`, `.card`, and `.verbatim-content` scaling in lock-step at desktop breakpoints.

- [ ] **Tokenized section widths in use**: at desktop breakpoints, section width comes from `--section-max-readable` and `--section-max-wide-readable` rather than per-component one-off clamps.
- [ ] **Shared scaling behavior**: `.page-header` and `.card` expand/contract together via `--section-max-wide-readable`, while `.verbatim-content` and header paragraph text use `--section-max-readable`.
- [ ] **3840×2160 readability guardrail**: long-form body content remains comfortably readable (no excessively long line length), while header/card containers scale wider than body copy to preserve hierarchy.
- [ ] **No side effects in excluded regions**: `.launch-context`, `.launch-grid`, and `#apg-inline-shell` dimensions remain unchanged after token rollout.

## Desktop capture matrix (before/after)
| Checkpoint | Before | After | Status |
|---|---|---|---|
| 1920×1080 | `qa-before-1920x1080.png` | `qa-after-1920x1080.png` | [ ] |
| 2560×1440 | `qa-before-2560x1440.png` | `qa-after-2560x1440.png` | [ ] |
| 3840×2160 | `qa-before-3840x2160.png` | `qa-after-3840x2160.png` | [ ] |
| 3440×1440 (ultra-wide) | `qa-before-3440x1440-ultrawide.png` | `qa-after-3440x1440-ultrawide.png` | [ ] |

## Regression checks (mobile + tablet)
- [ ] 390×844: hero, launch cards, and first body-content block layout/text hierarchy matches current baseline; no clipping/overflow.
- [ ] 768×1024: hero, launch cards, and first body-content block layout/text hierarchy matches current baseline; no clipping/overflow.

## Notes
- This checklist is designed to be filled while reviewing paired before/after captures from the same page and checkpoints.
- If any acceptance criterion fails, record the exact viewport and section before sign-off.

---

# Visual QA Checklist — Apologist Embed Interaction Modes (2026-03-16)

## Scope
Interaction QA for the Apologist embed behavior on desktop and touch devices.

Target areas:
- `#apg-beacon`
- Launch panel / embed container region

## Desktop checks
- [ ] Initial state allows page scroll while cursor is over embed.
- [ ] Clicking bottom intent zone enters chat mode.
- [ ] Outside click exits mode.
- [ ] Mouseleave delay exits mode without accidental early exits.
- [ ] Esc exits mode.
- [ ] Quick leave-and-return does not flap states.

## Touch checks
- [ ] Tap intent zone activates.
- [ ] Tap outside deactivates.
- [ ] Normal page scrolling remains possible when inactive.

## Regression checks
- [ ] Existing Apologist embed still loads via `#apg-beacon`.
- [ ] No visible banners/labels appear.
- [ ] No layout shifts in launch panel and embed container.

## Notes
- Record device/browser and viewport for each completed check.
- If any check fails, include repro steps and whether failure is consistent or intermittent.
