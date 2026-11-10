'use strict';

// Scenario registry (Node only; the RSC/browser bundles import scenarios directly).
// Discovers `<id>.scenario.js`, validates the authoring contract (see SCENARIOS.md).
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const BENEFITS = ['high', 'low', 'none'];
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const STEPS = ['click', 'fill', 'expectText', 'expectCount'];
const FORBIDDEN = [
  [/Date\.now|new Date\(|performance\.now|Math\.random|crypto\.random/, 'non-deterministic API'],
  [/\bfetch\s*\(|XMLHttpRequest|WebSocket|require\(['"](https?|net|fs|child_process)['"]\)|from ['"](https?|net|fs|child_process|node:[a-z]+)['"]/, 'network/IO'],
];

function lint(file, src, errors) {
  const name = path.basename(file);
  for (const [re, what] of FORBIDDEN) {
    const m = re.exec(src);
    if (m) errors.push(name + ': forbidden ' + what + ' (' + m[0] + ')');
  }
  const re = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(src))) {
    if (!m[1].startsWith('.') && m[1] !== 'react') {
      errors.push(name + ': import of "' + m[1] + '" is not allowed (only "react" and relative imports)');
    }
  }
}

function validate(mod, id, errors) {
  const e = msg => errors.push(id + ': ' + msg);
  if (mod.id !== id) e('export `id` must equal the file name prefix "' + id + '"');
  if (!KEBAB.test(id)) e('id must be kebab-case');
  for (const k of ['title', 'category', 'description']) {
    if (typeof mod[k] !== 'string' || !mod[k]) e('missing string export `' + k + '`');
  }
  if (!BENEFITS.includes(mod.expectedBenefit)) {
    e('`expectedBenefit` must be one of ' + BENEFITS.join('|'));
  }
  if (typeof mod.Root !== 'function') e('missing named export `Root` (server component)');
  if (mod.sizes !== undefined && (mod.sizes === null || typeof mod.sizes !== 'object' || !('smoke' in mod.sizes) || !('full' in mod.sizes))) {
    e('`sizes` must be {smoke, full}');
  }
  if (mod.interact !== undefined) {
    if (!Array.isArray(mod.interact)) e('`interact` must be an array of steps');
    else {
      mod.interact.forEach((s, i) => {
        const keys = STEPS.filter(k => s && k in s);
        if (keys.length !== 1) e('interact[' + i + '] needs exactly one of ' + STEPS.join('|'));
        else if (keys[0] === 'fill' && typeof s.value !== 'string') e('interact[' + i + '] fill needs `value`');
        else if (keys[0] === 'expectText' && (typeof s.expectText.selector !== 'string' || typeof s.expectText.text !== 'string')) e('interact[' + i + '] expectText needs {selector, text}');
        else if (keys[0] === 'expectCount' && (typeof s.expectCount.selector !== 'string' || s.expectCount.count === undefined)) e('interact[' + i + '] expectCount needs {selector, count}');
      });
    }
  }
  if (mod.knownFailure !== undefined && (typeof mod.knownFailure.error !== 'string' || !mod.knownFailure.error)) {
    e('`knownFailure` must be {error: <verbatim message>, variants?: [..]}');
  }
}

function load(only) {
  const errors = [];
  const files = fs.readdirSync(DIR).sort();
  const scenarios = [];
  const allIds = files.filter(f => f.endsWith('.scenario.js')).map(f => f.slice(0, -'.scenario.js'.length));
  if (only && only.length) {
    const missing = only.filter(id => !allIds.includes(id));
    if (missing.length) throw new Error('Unknown scenario id(s): ' + missing.join(', '));
  }
  const ids = only && only.length ? allIds.filter(id => only.includes(id)) : allIds;
  for (const f of files) {
    if (!f.endsWith('.js') || f === 'index.js') continue;
    if (only && only.length && !ids.some(id => f.startsWith(id + '.'))) continue;
    const file = path.join(DIR, f);
    const src = fs.readFileSync(file, 'utf8');
    const isClient = /^\s*['"]use client['"]/.test(src);
    if (isClient && !f.endsWith('.client.js')) errors.push(f + ': files with \'use client\' must be named *.client.js');
    if (f.endsWith('.client.js')) {
      if (!isClient) errors.push(f + ': *.client.js must start with \'use client\'');
      if (!allIds.some(id => f.startsWith(id + '.'))) errors.push(f + ': name must start with "<scenario-id>."');
    }
    if (f.endsWith('.scenario.js') && isClient) errors.push(f + ': scenario roots must be server modules');
    lint(file, src, errors);
  }
  if (errors.length) throw new Error('Scenario contract violations:\n  ' + errors.join('\n  '));
  for (const id of ids) {
    const file = path.join(DIR, id + '.scenario.js');
    let mod;
    try {
      mod = require(file);
    } catch (e) {
      errors.push(id + ': cannot load: ' + String(e.message).split('\n')[0]);
      continue;
    }
    validate(mod, id, errors);
    scenarios.push({
      id,
      file,
      title: mod.title,
      category: mod.category,
      description: mod.description,
      expectedBenefit: mod.expectedBenefit,
      sizes: mod.sizes || {smoke: 5, full: 50},
      interact: mod.interact || [],
      knownFailure: mod.knownFailure || null,
    });
  }
  if (errors.length) {
    throw new Error('Scenario contract violations:\n  ' + errors.join('\n  '));
  }
  return scenarios;
}

// only: array of ids (or empty/undefined for all).
function select(only) {
  return load(only);
}

module.exports = {select, DIR};
