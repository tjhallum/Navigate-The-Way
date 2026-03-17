# Docs Process Notes

## Machine-readable site guidance
- Maintain `docs/llms.txt` as the canonical machine-readable summary for AI crawlers and agents.
- Keep the canonical base URL and priority paths synchronized with the live docs pages.
- Update usage/licensing notes in `docs/llms.txt` whenever policy or legal positioning changes.

## Deployment checklist
- Ensure `docs/llms.txt` is committed and published with the rest of the `docs/` static site.
- Regenerate `docs/sitemap.xml` with `scripts/generate-sitemap.sh` after adding/removing public URLs.
- Verify `docs/robots.txt` still points to the canonical sitemap URL.

## Typography QA checklist

### Viewport matrix
Use this matrix for manual and computed-style checks before sign-off.

| Class | Viewport width (px) | Purpose |
| --- | ---: | --- |
| Mobile | 375 | Small-phone baseline verification |
| Mobile | 430 | Large-phone verification |
| Mobile/Tablet | 768 | Tablet portrait / breakpoint crossover |
| Desktop | 1024 | Small desktop/laptop baseline |
| Desktop | 1440 | Standard desktop verification |
| Desktop | 1920 | Full HD readability verification |
| Desktop | 2560 | QHD readability verification |
| Desktop | 3840 | Ultra-wide/4K readability target verification |

### Pass criteria (must all pass)
- **Mobile font-lock requirement:** at 375px, 430px, and 768px, computed font sizes for body copy, small/supporting text, headings, and CTA labels are **unchanged from the current production baseline**.
- **Desktop continuity requirement:** at 1024px, 1440px, 1920px, and 2560px, typography scales consistently with no clipping/overflow regressions and no hierarchy inversions (e.g., body appearing larger than intended heading levels).
- **3840 readability requirement:** at 3840px, the computed sizes for **body text, small text, H1, and key CTA copy** reach the target readability band of **~150% relative to the provided screenshot baseline**.
- **Accessibility sanity check:** text remains readable and semantically ordered after scaling (heading hierarchy and emphasis remain clear).

### 3840-specific acceptance details
For each tested page at 3840px:
- Capture computed values for body, small text, H1, and primary CTA copy.
- Compare against the provided screenshot baseline values and verify each targeted element is approximately 1.5x (about 150%).
- Confirm line wrapping and spacing remain intentional (no awkward single-word wraps in key headings/CTAs caused by scaling).

### Page coverage checklist (`docs/*.html` files that load `styles.css`)
- [ ] `docs/index.html`
- [ ] `docs/creator.html`
- [ ] `docs/meet-ntw.html`
- [ ] `docs/system-prompt.html`
- [ ] `docs/citing-ntw.html`
- [ ] `docs/caution-points.html`
- [ ] `docs/faqs.html`
- [ ] `docs/feedback.html`

## Section-width guardrail (desktop)
- Keep `.page-header`, `.card`, `.card.verbatim-content`, and `.verbatim-content` at `width: 100%; max-width: 100%` for desktop breakpoints (>=1024px) so they scale with `main`/`.page-shell`.
- Do **not** add desktop `max-width` caps (especially `ch`-based caps) back to those selectors; doing so reintroduces the narrow-column regression seen on high-resolution displays.
- If readability limits are needed, apply them to inner text elements (`p`, `li`, etc.) only—not to section containers.
- During visual QA, compare non-launch sections against the launch-panel and Apologist embed widths on `docs/index.html`; widths should feel proportionally aligned across desktop pages.

