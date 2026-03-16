#!/usr/bin/env bash
set -euo pipefail

python - <<'PY'
from pathlib import Path
import os
import re
import sys

required_meta = [
    ('description', 'name', 'description'),
    ('og:title', 'property', 'og:title'),
    ('og:description', 'property', 'og:description'),
    ('og:url', 'property', 'og:url'),
    ('og:image', 'property', 'og:image'),
    ('twitter:card', 'name', 'twitter:card'),
]

meta_pattern = re.compile(r'<meta\s+[^>]*?>', re.IGNORECASE)
attr_pattern = re.compile(r'([:\w-]+)\s*=\s*"([^"]*)"', re.IGNORECASE)
canonical_pattern = re.compile(r'<link\s+[^>]*rel="canonical"[^>]*>', re.IGNORECASE)

errors = []
docs_dir = Path(os.environ.get('DOCS_DIR', 'docs'))
html_files = sorted(docs_dir.glob('*.html'))

for html_file in html_files:
    text = html_file.read_text(encoding='utf-8')

    metas_by_attr = {'name': {}, 'property': {}}
    for match in meta_pattern.finditer(text):
        attrs = {k.lower(): v.strip() for k, v in attr_pattern.findall(match.group(0))}
        if 'content' in attrs and 'name' in attrs:
            metas_by_attr['name'][attrs['name'].lower()] = attrs['content']
        if 'content' in attrs and 'property' in attrs:
            metas_by_attr['property'][attrs['property'].lower()] = attrs['content']

    for label, attr, key in required_meta:
        wrong_attr = 'property' if attr == 'name' else 'name'
        if key in metas_by_attr[wrong_attr]:
            errors.append(
                f"{html_file}: {label} meta must use {attr}=\"{key}\" (not {wrong_attr})"
            )

        value = metas_by_attr[attr].get(key)
        if not value:
            errors.append(f"{html_file}: missing {label} meta with {attr}=\"{key}\"")

    canonical_matches = list(canonical_pattern.finditer(text))
    canonical_count = len(canonical_matches)
    if canonical_count == 0:
        errors.append(f"{html_file}: missing canonical link")
        canonical_url = None
    elif canonical_count > 1:
        errors.append(f"{html_file}: expected exactly one canonical link, found {canonical_count}")
        canonical_url = None
    else:
        attrs = {k.lower(): v.strip() for k, v in attr_pattern.findall(canonical_matches[0].group(0))}
        canonical_url = attrs.get('href')
        if not canonical_url:
            errors.append(f"{html_file}: canonical link missing href")

    og_url = metas_by_attr['property'].get('og:url')
    og_image = metas_by_attr['property'].get('og:image')

    for label, url in [('canonical', canonical_url), ('og:url', og_url), ('og:image', og_image)]:
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
