#!/usr/bin/env bash
set -euo pipefail

python - <<'PY'
from pathlib import Path
import json
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
json_ld_pattern = re.compile(
    r'<script\s+[^>]*type="application/ld\+json"[^>]*>(.*?)</script>',
    re.IGNORECASE | re.DOTALL,
)

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
            continue

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

    expected_url = (
        'https://www.navtheway.com/'
        if html_file.name == 'index.html'
        else f'https://www.navtheway.com/{html_file.stem}'
    )
    if canonical_url and canonical_url != expected_url:
        errors.append(
            f"{html_file}: canonical URL must be the extensionless canonical URL {expected_url}"
        )

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

    json_ld_nodes = []
    for script_index, match in enumerate(json_ld_pattern.finditer(text), start=1):
        duplicate_keys = []

        def reject_duplicate_keys(pairs):
            seen = set()
            result = {}
            for key, value in pairs:
                if key in seen:
                    duplicate_keys.append(key)
                seen.add(key)
                result[key] = value
            return result

        try:
            parsed_json_ld = json.loads(match.group(1), object_pairs_hook=reject_duplicate_keys)
        except json.JSONDecodeError as exc:
            errors.append(f"{html_file}: invalid JSON-LD script {script_index}: {exc.msg}")
            continue

        for key in sorted(set(duplicate_keys)):
            errors.append(
                f'{html_file}: duplicate JSON-LD property "{key}" in script {script_index}'
            )

        if isinstance(parsed_json_ld, dict) and isinstance(parsed_json_ld.get('@graph'), list):
            json_ld_nodes.extend(
                node for node in parsed_json_ld['@graph'] if isinstance(node, dict)
            )
        elif isinstance(parsed_json_ld, dict):
            json_ld_nodes.append(parsed_json_ld)

    articles_by_page_id = {}
    for node in json_ld_nodes:
        node_type = node.get('@type')
        node_types = node_type if isinstance(node_type, list) else [node_type]
        if 'Article' not in node_types:
            continue
        page_ref = node.get('mainEntityOfPage')
        if isinstance(page_ref, dict):
            page_id = page_ref.get('@id')
        elif isinstance(page_ref, str):
            page_id = page_ref
        else:
            page_id = None
        if page_id:
            articles_by_page_id[page_id] = node.get('@id')

    for node in json_ld_nodes:
        node_type = node.get('@type')
        node_types = node_type if isinstance(node_type, list) else [node_type]
        if 'WebPage' not in node_types:
            continue
        page_id = node.get('@id')
        article_id = articles_by_page_id.get(page_id)
        main_entity = node.get('mainEntity')
        if not article_id or not isinstance(main_entity, dict):
            continue
        if main_entity.get('@id') == article_id:
            errors.append(
                f'{html_file}: Article should use mainEntityOfPage without duplicating the inverse WebPage mainEntity link'
            )

if errors:
    print('Metadata validation failed:')
    for err in errors:
        print(f' - {err}')
    sys.exit(1)

print(f"Metadata validation passed for {len(html_files)} files.")
PY
