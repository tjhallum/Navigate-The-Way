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
