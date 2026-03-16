# Docs Process Notes

## Machine-readable site guidance
- Maintain `docs/llms.txt` as the canonical machine-readable summary for AI crawlers and agents.
- Keep the canonical base URL and priority paths synchronized with the live docs pages.
- Update usage/licensing notes in `docs/llms.txt` whenever policy or legal positioning changes.

## Deployment checklist
- Ensure `docs/llms.txt` is committed and published with the rest of the `docs/` static site.
- Regenerate `docs/sitemap.xml` with `scripts/generate-sitemap.sh` after adding/removing public URLs.
- Verify `docs/robots.txt` still points to the canonical sitemap URL.
