#!/usr/bin/env bash
set -euo pipefail

python - <<'PY'
from pathlib import Path
import sys

required_tokens = [
    ('description', 'name="description"'),
    ('og:title', 'property="og:title"'),
    ('og:description', 'property="og:description"'),
    ('og:url', 'property="og:url"'),
    ('og:image', 'property="og:image"'),
    ('twitter:card', 'name="twitter:card"'),
]

errors = []
html_files = sorted(Path('docs').glob('*.html'))
for html_file in html_files:
    text = html_file.read_text(encoding='utf-8').lower()
    for label, token in required_tokens:
        if token not in text:
            errors.append(f"{html_file}: missing {label}")

if errors:
    print('Metadata validation failed:')
    for err in errors:
        print(f' - {err}')
    sys.exit(1)

print(f"Metadata validation passed for {len(html_files)} files.")
PY
