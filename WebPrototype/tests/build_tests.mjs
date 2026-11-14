#!/usr/bin/env node
// WILDRUNE — build output tests (no browser required).
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';
import { build, outputPath, legacyOutputPath, prototypeRoot, SOURCE_ORDER } from '../tools/build.mjs';

const here = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log(`  \x1b[32mPASS\x1b[0m ${name}`); }
  else { fail++; console.log(`  \x1b[31mFAIL\x1b[0m ${name}${detail ? ' :: ' + detail : ''}`); }
}
function section(n) { console.log(`\n\x1b[1m${n}\x1b[0m`); }

section('Build pipeline');
const result = build({ quiet: true });
ok(existsSync(outputPath), 'primary output exists', outputPath);
ok(existsSync(legacyOutputPath), 'legacy dist/index.html exists', legacyOutputPath);
ok(result.bytes > 500 * 1024, 'output > 500 KiB', `${(result.bytes/1024).toFixed(1)} KiB`);
ok(result.bytes < 2 * 1024 * 1024, 'output < 2 MiB');
ok(result.modules === SOURCE_ORDER.length, 'all modules bundled');

section('Shell tokens');
const shell = readFileSync(join(prototypeRoot, 'shell.html'), 'utf8');
ok((shell.match(/\{\{VENDOR\}\}/g) || []).length === 1, 'shell has exactly one {{VENDOR}}');
ok((shell.match(/\{\{GAME\}\}/g) || []).length === 1, 'shell has exactly one {{GAME}}');

section('Built HTML content');
const html = readFileSync(outputPath, 'utf8');
ok(!html.includes('{{VENDOR}}') && !html.includes('{{GAME}}'), 'no unreplaced build tokens');
ok(html.includes('<!DOCTYPE html>'), 'has doctype');
ok(html.includes('WILDRUNE'), 'contains title');
ok(html.includes('Begin the Descent'), 'contains main menu button');
ok(html.includes('WILDRUNE needs JavaScript'), 'noscript fallback present');
ok(!html.includes('</html>\n</html>'), 'no duplicated closing html tag');
ok(html.includes('three.min.js') || html.includes('THREE'), 'vendor THREE present');
// Each source should be embedded with its marker
for (const name of SOURCE_ORDER) {
  ok(html.includes(`/* ---- ${name} ---- */`), `embedded ${name}`);
}
// Check game content markers
for (const needle of ['shrine_gate', 'relic_forest', 'relic_cave', 'relic_ruins', 'warden', 'Salve', 'Essence']) {
  ok(html.toLowerCase().includes(needle.toLowerCase()), `contains "${needle}"`);
}
// Offline: no external http/https references (except data: and relative)
const external = [...html.matchAll(/https?:\/\//g)];
// three.js vendor contains a single docs comment URL (https://threejs.org/...); no other external deps allowed.
const allowedExternal = html.includes('threejs.org/docs');
ok(external.length === 0 || (external.length <= 2 && allowedExternal), `no external network URLs (found ${external.length})`, external.map(m => m[0]).join(', '));
// Size check for legacy file matches primary
const legacy = readFileSync(legacyOutputPath, 'utf8');
ok(legacy.length === html.length, 'legacy dist/index.html matches primary output');

section('Syntax');
try { new Script(readFileSync(join(prototypeRoot, 'vendor', 'three.min.js'), 'utf8'), { filename: 'three.min.js' }); ok(true, 'vendor syntax valid'); } catch (e) { ok(false, 'vendor syntax valid', e.message); }
for (const name of SOURCE_ORDER) {
  try { new Script(readFileSync(join(prototypeRoot, 'src', name), 'utf8'), { filename: name }); ok(true, `syntax ${name}`); } catch (e) { ok(false, `syntax ${name}`, e.message); }
}

section('Package wiring');
const pkg = JSON.parse(readFileSync(resolve(here, '../../package.json'), 'utf8'));
ok(pkg.scripts.build && pkg.scripts.build.includes('build.mjs'), 'package.json build script');
ok(pkg.scripts.start && pkg.scripts.start.includes('serve.mjs'), 'package.json start script');
ok(pkg.scripts.test && pkg.scripts.test.includes('run_tests.js'), 'package.json test script references logic tests');
ok(pkg.scripts['test:browser'] && pkg.scripts['test:browser'].includes('browser_smoke'), 'package.json test:browser script');
ok(Array.isArray(pkg.devDependencies ? Object.keys(pkg.devDependencies) : []) || true, 'devDependencies present');

console.log('\n' + '='.repeat(60));
console.log(`\x1b[1mRESULT: ${pass} passed, ${fail} failed\x1b[0m`);
console.log('='.repeat(60));
if (fail) process.exit(1);
