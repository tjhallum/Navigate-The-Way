#!/usr/bin/env bash
set -euo pipefail

ROOT_URL="https://www.navtheway.com"
DOCS_DIR="docs"
OUTPUT_FILE="${DOCS_DIR}/sitemap.xml"

{
  echo '<?xml version="1.0" encoding="UTF-8"?>'
  echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
  echo '  <url>'
  echo "    <loc>${ROOT_URL}/</loc>"
  echo '  </url>'

  while IFS= read -r page; do
    page_name="$(basename "${page}")"
    [[ "${page_name}" == "index.html" ]] && continue

    echo '  <url>'
    echo "    <loc>${ROOT_URL}/${page_name}</loc>"
    echo '  </url>'
  done < <(find "${DOCS_DIR}" -maxdepth 1 -type f -name '*.html' | sort)

  echo '</urlset>'
} > "${OUTPUT_FILE}"
