#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VALIDATOR="$ROOT_DIR/scripts/validate-docs-metadata.sh"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

base_html() {
  local og_url_meta="$1"
  local twitter_meta="$2"
  cat <<HTML
<!doctype html>
<html>
<head>
  <meta name="description" content="Description" />
  <meta property="og:title" content="Title" />
  <meta property="og:description" content="OG Description" />
  ${og_url_meta}
  <meta property="og:image" content="https://www.navtheway.com/image.png" />
  ${twitter_meta}
  <link rel="canonical" href="https://www.navtheway.com/page.html" />
</head>
<body></body>
</html>
HTML
}

run_expect_fail() {
  local case_name="$1"
  local expected="$2"
  local case_dir="$TMP_DIR/$case_name"
  mkdir -p "$case_dir"
  cat > "$case_dir/test.html"

  if DOCS_DIR="$case_dir" "$VALIDATOR" >"$case_dir/out.txt" 2>&1; then
    echo "Expected failure for $case_name but command succeeded"
    cat "$case_dir/out.txt"
    exit 1
  fi

  if ! rg -F "$expected" "$case_dir/out.txt" >/dev/null; then
    echo "Did not find expected error for $case_name: $expected"
    cat "$case_dir/out.txt"
    exit 1
  fi
}


run_expect_fail_only() {
  local case_name="$1"
  local expected_present="$2"
  local expected_absent="$3"
  local case_dir="$TMP_DIR/$case_name"
  mkdir -p "$case_dir"
  cat > "$case_dir/test.html"

  if DOCS_DIR="$case_dir" "$VALIDATOR" >"$case_dir/out.txt" 2>&1; then
    echo "Expected failure for $case_name but command succeeded"
    cat "$case_dir/out.txt"
    exit 1
  fi

  if ! rg -F "$expected_present" "$case_dir/out.txt" >/dev/null; then
    echo "Did not find expected error for $case_name: $expected_present"
    cat "$case_dir/out.txt"
    exit 1
  fi

  if rg -F "$expected_absent" "$case_dir/out.txt" >/dev/null; then
    echo "Found unexpected error for $case_name: $expected_absent"
    cat "$case_dir/out.txt"
    exit 1
  fi
}

run_expect_pass() {
  local case_name="$1"
  local case_dir="$TMP_DIR/$case_name"
  mkdir -p "$case_dir"
  cat > "$case_dir/test.html"

  DOCS_DIR="$case_dir" "$VALIDATOR" >"$case_dir/out.txt" 2>&1
  rg -F 'Metadata validation passed for 1 files.' "$case_dir/out.txt" >/dev/null
}

run_expect_fail "name-og-url" 'missing og:url meta with property="og:url"' <<EOFCASE
$(base_html '' '<meta name="twitter:card" content="summary_large_image" />')
EOFCASE

run_expect_fail_only "name-og-url-wrong-attr" 'og:url meta must use property="og:url" (not name)' 'missing og:url meta with property="og:url"' <<EOFCASE
$(base_html '<meta name="og:url" content="https://www.navtheway.com/page.html" />' '<meta name="twitter:card" content="summary_large_image" />')
EOFCASE

run_expect_fail "property-twitter-card" 'missing twitter:card meta with name="twitter:card"' <<EOFCASE
$(base_html '<meta property="og:url" content="https://www.navtheway.com/page.html" />' '')
EOFCASE

run_expect_fail_only "property-twitter-card-wrong-attr" 'twitter:card meta must use name="twitter:card" (not property)' 'missing twitter:card meta with name="twitter:card"' <<EOFCASE
$(base_html '<meta property="og:url" content="https://www.navtheway.com/page.html" />' '<meta property="twitter:card" content="summary_large_image" />')
EOFCASE

run_expect_pass "correct-attributes" <<EOFCASE
$(base_html '<meta property="og:url" content="https://www.navtheway.com/page.html" />' '<meta name="twitter:card" content="summary_large_image" />')
EOFCASE

run_expect_fail "duplicate-canonical" 'expected exactly one canonical link, found 2' <<EOFCASE
<!doctype html>
<html>
<head>
  <meta name="description" content="Description" />
  <meta property="og:title" content="Title" />
  <meta property="og:description" content="OG Description" />
  <meta property="og:url" content="https://www.navtheway.com/page.html" />
  <meta property="og:image" content="https://www.navtheway.com/image.png" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="canonical" href="https://www.navtheway.com/page.html" />
  <link rel="canonical" href="https://www.navtheway.com/page.html" />
</head>
<body></body>
</html>
EOFCASE


run_expect_fail "duplicate-json-ld-property" 'duplicate JSON-LD property "inLanguage" in script 1' <<EOFCASE
$(base_html '<meta property="og:url" content="https://www.navtheway.com/page.html" />' '<meta name="twitter:card" content="summary_large_image" />')
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "inLanguage": "en",
    "headline": "Page",
    "inLanguage": "en-US"
  }
  </script>
EOFCASE

run_expect_fail "invalid-json-ld" 'invalid JSON-LD script 1' <<EOFCASE
$(base_html '<meta property="og:url" content="https://www.navtheway.com/page.html" />' '<meta name="twitter:card" content="summary_large_image" />')
  <script type="application/ld+json">
  {"@context": "https://schema.org",
  </script>
EOFCASE


run_expect_fail "article-reciprocal-main-entity" 'Article should use mainEntityOfPage without duplicating the inverse WebPage mainEntity link' <<EOFCASE
$(base_html '<meta property="og:url" content="https://www.navtheway.com/page.html" />' '<meta name="twitter:card" content="summary_large_image" />')
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": "https://www.navtheway.com/page.html#webpage",
        "mainEntity": {"@id": "https://www.navtheway.com/page.html#article"}
      },
      {
        "@type": "Article",
        "@id": "https://www.navtheway.com/page.html#article",
        "headline": "Page",
        "mainEntityOfPage": {"@id": "https://www.navtheway.com/page.html#webpage"}
      }
    ]
  }
  </script>
EOFCASE

run_expect_pass "article-main-entity-of-page-only" <<EOFCASE
$(base_html '<meta property="og:url" content="https://www.navtheway.com/page.html" />' '<meta name="twitter:card" content="summary_large_image" />')
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": "https://www.navtheway.com/page.html#webpage"
      },
      {
        "@type": "Article",
        "@id": "https://www.navtheway.com/page.html#article",
        "headline": "Page",
        "mainEntityOfPage": {"@id": "https://www.navtheway.com/page.html#webpage"}
      }
    ]
  }
  </script>
EOFCASE

echo "All metadata validator fixture checks passed."
