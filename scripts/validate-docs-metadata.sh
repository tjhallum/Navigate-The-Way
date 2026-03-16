#!/usr/bin/env bash
set -euo pipefail

python - <<'PY'
from pathlib import Path
import re
import sys

required_tokens = [
    ('description', 'name="description"'),
    ('og:title', 'property="og:title"'),
    ('og:description', 'property="og:description"'),
    ('og:url', 'property="og:url"'),
    ('og:image', 'property="og:image"'),
    ('twitter:card', 'name="twitter:card"'),
    ('canonical', 'rel="canonical"'),
    ('json-ld', 'application/ld+json'),
]

meta_pattern = re.compile(r'<meta\s+[^>]*?>', re.IGNORECASE)
attr_pattern = re.compile(r'([:\w-]+)\s*=\s*"([^"]*)"', re.IGNORECASE)
canonical_pattern = re.compile(r'<link\s+[^>]*rel="canonical"[^>]*>', re.IGNORECASE)

errors = []
html_files = sorted(Path('docs').glob('*.html'))

for html_file in html_files:
    text = html_file.read_text(encoding='utf-8')

    metas = {}
    for match in meta_pattern.finditer(text):
        attrs = {k.lower(): v.strip() for k, v in attr_pattern.findall(match.group(0))}
        key_attr = attrs.get('name') or attrs.get('property')
        if key_attr and 'content' in attrs:
            metas[key_attr.lower()] = attrs['content']

    for label, attr, key in required_meta:
        value = metas.get(key)
        if not value:
            errors.append(f"{html_file}: missing {label}")

    canonical_match = canonical_pattern.search(text)
    if not canonical_match:
        errors.append(f"{html_file}: missing canonical link")
        canonical_url = None
    else:
        attrs = {k.lower(): v.strip() for k, v in attr_pattern.findall(canonical_match.group(0))}
        canonical_url = attrs.get('href')
        if not canonical_url:
            errors.append(f"{html_file}: canonical link missing href")

    og_url = metas.get('og:url')

    for label, url in [('canonical', canonical_url), ('og:url', og_url), ('og:image', metas.get('og:image'))]:
        if url and not url.startswith('https://'):
            errors.append(f"{html_file}: {label} must be an absolute https URL")

    if canonical_url and og_url and canonical_url != og_url:
        errors.append(f"{html_file}: canonical URL must exactly match og:url")

    for label, url in [('canonical', canonical_url), ('og:url', og_url)]:
        if not url:
            continue
        if url != 'https://www.navtheway.com/' and url.endswith('/'):
            errors.append(f"{html_file}: {label} must not use a trailing slash for non-home pages")

if errors:
    print('Metadata validation failed:')
    for err in errors:
        print(f' - {err}')
    sys.exit(1)

print(f"Metadata validation passed for {len(html_files)} files.")
PY
