#!/usr/bin/env node
/** Build the self-contained playable HTML file. No network or bundler required. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
export const prototypeRoot = resolve(here, '..');
// Kept outside dist/ so the standalone deliverable survives workspace snapshots.
export const outputPath = join(prototypeRoot, 'Wildrune.html');
export const legacyOutputPath = join(prototypeRoot, 'dist', 'index.html');

// Load order matters: every module attaches to window.WR; game.js boots last.
export const SOURCE_ORDER = [
  'data.js',
  'inventory.js',
  'combat.js',
  'progression.js',
  'ai.js',
  'world.js',
  'art.js',
  'audio.js',
  'ui.js',
  'game.js'
];

export function build({ quiet = false } = {}) {
  const shell = readFileSync(join(prototypeRoot, 'shell.html'), 'utf8');
  const vendor = readFileSync(join(prototypeRoot, 'vendor', 'three.min.js'), 'utf8');
  const sources = SOURCE_ORDER.map(name => {
    const code = readFileSync(join(prototypeRoot, 'src', name), 'utf8');
    // Compile-check without executing browser globals.
    new Script(code, { filename: name });
    return `/* ---- ${name} ---- */\n${code}`;
  });
  new Script(vendor, { filename: 'three.min.js' });

  for (const token of ['{{VENDOR}}', '{{GAME}}']) {
    if (shell.split(token).length !== 2) throw new Error(`Expected exactly one ${token} in shell.html`);
  }
  // Function replacers avoid interpreting $ sequences inside minified JavaScript.
  let html = shell.replace('{{VENDOR}}', () => vendor).replace('{{GAME}}', () => sources.join('\n\n'));
  if (/\{\{(?:VENDOR|GAME)\}\}/.test(html)) throw new Error('Unreplaced build token');

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, html);
  // Keep dist/index.html in sync for older links, but do not require it for delivery.
  try { mkdirSync(dirname(legacyOutputPath), { recursive: true }); writeFileSync(legacyOutputPath, html); } catch {}
  if (!quiet) console.log(`Built ${outputPath} (${(Buffer.byteLength(html) / 1024).toFixed(1)} KiB, fully offline)`);
  return { outputPath, bytes: Buffer.byteLength(html), modules: SOURCE_ORDER.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) build();
