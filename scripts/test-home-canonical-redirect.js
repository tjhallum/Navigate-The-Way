#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('docs/index.html', 'utf8');
const match = html.match(/<head>\s*<script>([\s\S]*?)<\/script>/i);

assert(match, 'docs/index.html must start <head> with the canonical home redirect script');

const redirectScript = match[1];
assert(
  redirectScript.includes('GitHub Pages serves the homepage at /index'),
  'canonical redirect script should explain why /index is redirected'
);

function runRedirect(pathname, search = '', hash = '') {
  let replacedWith = null;
  const context = {
    window: {
      location: {
        pathname,
        search,
        hash,
        replace(target) {
          replacedWith = target;
        },
      },
    },
  };

  vm.runInNewContext(redirectScript, context, { timeout: 1000 });
  return replacedWith;
}

assert.equal(runRedirect('/index'), '/');
assert.equal(runRedirect('/index.html'), '/');
assert.equal(runRedirect('/index/'), '/');
assert.equal(runRedirect('/index', '?utm_source=gsc', '#top'), '/?utm_source=gsc#top');
assert.equal(runRedirect('/'), null);
assert.equal(runRedirect('/christian-ai'), null);

console.log('Home canonical redirect checks passed.');
