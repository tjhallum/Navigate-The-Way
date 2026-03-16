#!/usr/bin/env bash
set -euo pipefail

ROOT_URL="https://www.navtheway.com"
DOCS_DIR="docs"
OUTPUT_FILE="${DOCS_DIR}/sitemap.xml"
HOME_PAGE="${DOCS_DIR}/index.html"

lastmod_date() {
  date -u -r "$1" '+%Y-%m-%d'
}

{
  echo '<?xml version="1.0" encoding="UTF-8"?>'
  echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
  echo '  <url>'
  echo "    <loc>${ROOT_URL}/</loc>"
  echo "    <lastmod>$(lastmod_date "${HOME_PAGE}")</lastmod>"
  echo '  </url>'

  while IFS= read -r page; do
    page_name="$(basename "${page}")"
    [[ "${page_name}" == "index.html" ]] && continue

    echo '  <url>'
    echo "    <loc>${ROOT_URL}/${page_name}</loc>"
    echo "    <lastmod>$(lastmod_date "${page}")</lastmod>"
    echo '  </url>'
  done < <(find "${DOCS_DIR}" -maxdepth 1 -type f -name '*.html' | LC_ALL=C sort)

  echo '</urlset>'
} > "${OUTPUT_FILE}"
