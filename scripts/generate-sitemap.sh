#!/usr/bin/env bash
set -euo pipefail

ROOT_URL="https://www.navtheway.com"
DOCS_DIR="docs"
OUTPUT_FILE="${DOCS_DIR}/sitemap.xml"
HOME_PAGE="${DOCS_DIR}/index.html"

lastmod_date() {
  local file_path="$1"
  local git_lastmod

  # Prefer commit history so sitemap dates are stable across fresh checkouts/CI.
  git_lastmod="$(git log -1 --format=%cs -- "${file_path}" 2>/dev/null || true)"
  if [[ -n "${git_lastmod}" ]]; then
    echo "${git_lastmod}"
    return
  fi

  # Fallback for untracked files (or non-git contexts).
  date -u -r "${file_path}" '+%Y-%m-%d'
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

  for machine_doc in "llms.txt" "llms-full.txt"; do
    doc_path="${DOCS_DIR}/${machine_doc}"
    if [[ -f "${doc_path}" ]]; then
      echo '  <url>'
      echo "    <loc>${ROOT_URL}/${machine_doc}</loc>"
      echo "    <lastmod>$(lastmod_date "${doc_path}")</lastmod>"
      echo '  </url>'
    fi
  done

  echo '</urlset>'
} > "${OUTPUT_FILE}"
