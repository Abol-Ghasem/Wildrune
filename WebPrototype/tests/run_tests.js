/* WILDRUNE — automated logic tests. Run: node WebPrototype/tests/run_tests.js */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// src files are UMD: in CJS they export via module.exports, in ESM (type:module) they attach to global WR.
const S = p => {
  const mod = require(path.join(__dirname, '..', 'src', p));
  if (mod && Object.keys(mod).length) return mod;
  return globalThis.WR || {};
};
const { CONFIG, ITEMS, RECIPES, ENEMIES, OBJECTIVES } = S('data.js');
const { Inventory, Crafting } = S('inventory.js');
const { inArc, AttackState, Attributes, useItem } = S('combat.js');
const { Progression, SaveSystem } = S('progression.js');
const AI = S('ai.js');
const World = S('world.js');

let pass = 0, fail = 0; const failures = []; let group = '';
const G = n => { group = n; console.log('\n\x1b[1m' + n + '\x1b[0m'); };
function ok(cond, name, detail) {
  if (cond) { pass++; console.log('  \x1b[32mPASS\x1b[0m ' + name); }
  else { fail++; failures.push(group + ' / ' + name + (detail ? ' :: ' + detail : '')); console.log('  \x1b[31mFAIL\x1b[0m ' + name + (detail ? ' :: ' + detail : '')); }
}
const eq = (a, b, n) => ok(a === b, n, `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
const near = (a, b, tol, n) => ok(Math.abs(a - b) <= tol, n, `expected ~${b}, got ${a}`);

function memStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _m: m };
}

// ---------------------------------------------------------------- Inventory
G('Inventory');
{
  const inv = new Inventory();
  eq(inv.add('leaf', 5), 5, 'add 5 leaves');
  eq(inv.count('leaf'), 5, 'count reflects add');
  eq(inv.add('leaf', 200), 94, 'add clamps to stack size (99)');
  eq(inv.count('leaf'), 99, 'stack capped at 99');
  eq(inv.add('leaf', 1), 0, 'add to full stack returns 0');
  eq(inv.remove('leaf', 10), 10, 'remove 10');
  eq(inv.remove('leaf', 999), 89, 'remove clamps to available');
  eq(inv.count('leaf'), 0, 'emptied');
  eq(inv.remove('leaf', 1), 0, 'remove from empty returns 0');
  eq(inv.add('not_an_item', 5), 0, 'unknown item rejected');
  eq(inv.add('leaf', -3), 0, 'negative quantity rejected');
  eq(inv.add('leaf', NaN), 0, 'NaN quantity rejected');
  eq(inv.remove('leaf', 0), 0, 'zero remove rejected');
  inv.add('ore', 3); inv.add('leaf', 2);
  const round = new Inventory(inv.serialize());
  eq(round.count('ore'), 3, 'serialize roundtrip ore');
  eq(round.count('leaf'), 2, 'serialize roundtrip leaf');
  const dirty = new Inventory({ leaf: -5, ore: 1e9, bogus: 3, timber: 'x' });
  eq(dirty.count('leaf'), 0, 'load rejects negative');
  eq(dirty.count('ore'), 99, 'load clamps over-stack');
  eq(dirty.count('bogus'), 0, 'load rejects unknown id');
  eq(dirty.count('timber'), 0, 'load rejects non-numeric');
  eq(inv.list().length, 2, 'list returns occupied slots only');
}

// ---------------------------------------------------------------- Crafting
G('Crafting');
{
  const inv = new Inventory();
  let c = Crafting.check(inv, 'r_salve', 'any');
  ok(!c.ok, 'cannot craft with no materials');
  eq(c.missing.leaf, 2, 'reports exact missing count');
  inv.add('leaf', 1);
  ok(!Crafting.check(inv, 'r_salve', 'any').ok, 'still cannot craft with 1/2');
  inv.add('leaf', 1);
  ok(Crafting.check(inv, 'r_salve', 'any').ok, 'can craft with 2/2');
  const before = inv.count('leaf');
  const r = Crafting.craft(inv, 'r_salve', 'any');
  ok(r.ok, 'craft succeeds');
  eq(inv.count('leaf'), before - 2, 'inputs consumed exactly');
  eq(inv.count('salve'), 1, 'output granted');

  // station gating
  const inv2 = new Inventory({ ore: 9 });
  ok(!Crafting.check(inv2, 'r_ingot', 'any').ok, 'forge recipe blocked away from forge');
  ok(!Crafting.check(inv2, 'r_ingot', 'any').stationOk, 'stationOk false');
  ok(Crafting.check(inv2, 'r_ingot', 'forge').ok, 'forge recipe allowed at forge');
  const bad = Crafting.craft(inv2, 'r_ingot', 'any');
  ok(!bad.ok, 'craft refused at wrong station');
  eq(inv2.count('ore'), 9, 'refused craft consumed nothing (atomic)');
  Crafting.craft(inv2, 'r_ingot', 'forge');
  eq(inv2.count('ore'), 6, 'forge craft consumed 3');
  eq(inv2.count('ingot'), 1, 'ingot produced');

  // atomicity on missing input
  const inv3 = new Inventory({ leaf: 3, essence: 0 });
  const r3 = Crafting.craft(inv3, 'r_elixir', 'any');
  ok(!r3.ok, 'elixir refused without essence');
  eq(inv3.count('leaf'), 3, 'no partial consumption on failure');

  // output overflow must roll back
  const inv4 = new Inventory({ leaf: 99, salve: 10 });
  const r4 = Crafting.craft(inv4, 'r_salve', 'any');
  ok(!r4.ok, 'craft refused when output stack full');
  eq(inv4.count('leaf'), 99, 'overflow rolled back inputs');
  eq(inv4.count('salve'), 10, 'overflow did not exceed stack');

  ok(!Crafting.craft(inv, 'r_does_not_exist', 'forge').ok, 'unknown recipe refused');
  eq(RECIPES.length, 11, 'recipe count is 11 (scope: 8-12)');
  const allValid = RECIPES.every(r => ITEMS[r.out] && Object.keys(r.in).every(k => ITEMS[k]));
  ok(allValid, 'every recipe references real items');
  const avail = Crafting.available(new Inventory({ leaf: 2 }), 'any');
  eq(avail.length, RECIPES.length, 'available() lists all recipes with status');
}

// ---------------------------------------------------------------- Combat
G('Combat — hit validation');
{
  // attacker at origin facing +Z (facing 0 => sin0=0, cos0=1)
  ok(inArc(0, 0, 0, 0, 2, 2.5, 1.5, 0.5), 'target directly ahead is hit');
  ok(!inArc(0, 0, 0, 0, -2, 2.5, 1.5, 0.5), 'target behind is NOT hit');
  ok(!inArc(0, 0, 0, 0, 9, 2.5, 1.5, 0.5), 'target out of range is NOT hit');
  ok(!inArc(0, 0, 0, 3, 0, 2.5, 1.5, 0.5), 'target at 90 deg outside arc is NOT hit');
  ok(inArc(0, 0, 0, 1.0, 1.6, 2.5, 1.5, 0.5), 'target inside arc edge is hit');
  ok(inArc(0, 0, Math.PI / 2, 2, 0, 2.5, 1.5, 0.5), 'rotated attacker hits +X target');
  ok(inArc(0, 0, 0, 0, 2.9, 2.5, 1.5, 0.5), 'target radius extends reach');
  ok(inArc(0, 0, 0, 0, 0, 2.5, 1.5, 0.5), 'overlapping target is hit');
}
G('Combat — one damage per swing');
{
  const a = new AttackState('light');
  eq(a.phase, 'windup', 'starts in windup');
  ok(!a.tryHit('e1'), 'no hit during windup');
  a.update(CONFIG.combat.light.windup + 0.01);
  ok(a.active, 'becomes active after windup');
  ok(a.tryHit('e1'), 'first contact registers');
  ok(!a.tryHit('e1'), 'same target NOT damaged twice in one swing');
  ok(a.tryHit('e2'), 'different target registers in same swing');
  a.update(CONFIG.combat.light.active + 0.01);
  eq(a.phase, 'recover', 'enters recovery');
  ok(!a.tryHit('e3'), 'no hit during recovery');
  a.update(CONFIG.combat.light.recover + 0.01);
  ok(a.done, 'swing completes');
  const b = new AttackState('light');
  b.update(CONFIG.combat.light.windup + 0.01);
  ok(b.tryHit('e1'), 'new swing can hit the same target again');
  // simulate a full 60fps swing and count hits
  const c = new AttackState('heavy'); let hits = 0;
  for (let i = 0; i < 120; i++) { c.update(1 / 60); if (c.tryHit('boss')) hits++; }
  eq(hits, 1, 'heavy swing at 60fps damages a target exactly once');
}
G('Combat — attributes, damage, i-frames');
{
  const at = new Attributes();
  eq(at.maxHealth, 100, 'base max health');
  eq(at.attackDamage('light'), 14, 'base light damage');
  eq(at.takeDamage(30), 30, 'damage applied');
  eq(at.health, 70, 'health reduced');
  eq(at.takeDamage(30), 0, 'i-frame blocks immediate second hit');
  at.update(0.6, false);
  eq(at.takeDamage(30), 30, 'damage allowed after i-frames expire');
  eq(at.health, 40, 'health at 40');
  eq(at.heal(1000), 60, 'heal clamps to max');
  eq(at.health, 100, 'full health');
  eq(at.heal(10), 0, 'heal at full returns 0');
  at.update(1, false);
  at.takeDamage(500);
  ok(at.dead, 'overkill causes death');
  eq(at.health, 0, 'health floors at 0');
  eq(at.takeDamage(10), 0, 'dead takes no further damage');
  eq(at.heal(50), 0, 'dead cannot heal');

  const b = new Attributes();
  ok(b.spend(25), 'stamina spend succeeds');
  eq(b.stamina, 75, 'stamina reduced');
  ok(!b.spend(1000), 'cannot overspend stamina');
  eq(b.stamina, 75, 'failed spend leaves stamina unchanged');
  b.update(0.2, true);
  ok(b.stamina <= 75, 'no regen while sprinting');
  b.update(1.0, false);
  ok(b.stamina > 75, 'regen resumes after delay');

  const up = new Attributes();
  up.weaponUpgrades = 2; up.healthUpgrades = 3; up.speedUpgrades = 2;
  eq(up.attackDamage('light'), 21, 'weapon upgrade +50% damage');
  eq(up.maxHealth, 160, 'health upgrades +60');
  near(up.speedMul, 1.2, 1e-9, 'speed upgrades +20%');
}
G('Combat — item usage');
{
  const inv = new Inventory({ salve: 2, hone: 1, charm: 1, lantern: 1 });
  const at = new Attributes(); at.health = 50;
  const r = useItem(inv, at, 'salve');
  ok(r.ok, 'salve usable'); eq(r.healed, 40, 'salve heals 40');
  eq(inv.count('salve'), 1, 'salve consumed');
  eq(at.health, 90, 'health after salve');
  at.health = 100;
  ok(!useItem(inv, at, 'salve').ok, 'salve refused at full health');
  eq(inv.count('salve'), 1, 'refused item not consumed');
  ok(useItem(inv, at, 'hone').ok, 'hone usable');
  eq(at.weaponUpgrades, 1, 'weapon upgrade applied');
  ok(useItem(inv, at, 'charm').ok, 'charm usable');
  eq(at.maxHealth, 120, 'charm raised max health');
  ok(useItem(inv, at, 'lantern').ok, 'lantern equips');
  ok(at.lanternEquipped, 'lantern flag set');
  inv.add('lantern', 1);
  ok(!useItem(inv, at, 'lantern').ok, 'lantern cannot double-equip');
  ok(!useItem(inv, at, 'leaf').ok, 'resource is not usable');
  ok(!useItem(inv, at, 'nonexistent').ok, 'unknown item refused');
  const empty = new Inventory();
  ok(!useItem(empty, at, 'salve').ok, 'cannot use item you do not have');
}

// ---------------------------------------------------------------- AI
G('AI — archetypes');
{
  const home = { x: 0, z: 0, rot: 0 };
  const mk = (type, dist) => {
    const b = AI.makeBrain(type, home);
    return { b, p: { px: 0, pz: dist, bx: 0, bz: 0, dist, dt: 1 / 60, playerDead: false, hasLOS: true, rand: 0.5, rand2: 0.5, healthFrac: 1 } };
  };
  // aggro
  let { b, p } = mk('stalker', 10);
  AI.step(b, p);
  eq(b.state, 'chase', 'stalker aggros inside range');
  // out of range stays idle
  ({ b, p } = mk('stalker', 60)); AI.step(b, p);
  ok(b.state === 'idle' || b.state === 'patrol', 'stalker ignores distant player');
  // telegraph then attack, never instant damage
  ({ b, p } = mk('stalker', 2.0));
  let sawTelegraph = false, sawAttack = false, frames = 0;
  for (let i = 0; i < 200; i++) { const it = AI.step(b, p); if (b.state === 'telegraph') sawTelegraph = true; if (it.melee) sawAttack = true; frames++; if (sawAttack) break; }
  ok(sawTelegraph, 'stalker telegraphs before attacking');
  ok(sawAttack, 'stalker eventually attacks');
  ok(frames > 20, 'telegraph gives >=0.33s of warning', 'frames=' + frames);
  // guardian telegraph is longer than stalker
  const g = AI.makeBrain('guardian', home);
  const gp = { px: 0, pz: 3.0, bx: 0, bz: 0, dist: 3.0, dt: 1 / 60, playerDead: false, hasLOS: true, rand: 0.5, healthFrac: 1 };
  let gFrames = 0; for (let i = 0; i < 400; i++) { const it = AI.step(g, gp); gFrames++; if (it.melee) break; }
  ok(gFrames > frames, 'guardian wind-up is longer (readable heavy attack)', `${gFrames} vs ${frames}`);
  // ranged kites
  const s = AI.makeBrain('spitter', home);
  const sp = { px: 0, pz: 4, bx: 0, bz: 0, dist: 4, dt: 1 / 60, playerDead: false, hasLOS: true, rand: 0.5, healthFrac: 1 };
  let repositioned = false;
  for (let i = 0; i < 120; i++) { AI.step(s, sp); if (s.state === 'reposition') repositioned = true; }
  ok(repositioned, 'spitter repositions when player closes in');
  const s2 = AI.makeBrain('spitter', home);
  const sp2 = { px: 0, pz: 12, bx: 0, bz: 0, dist: 12, dt: 1 / 60, playerDead: false, hasLOS: true, rand: 0.5, healthFrac: 1 };
  let fired = false; for (let i = 0; i < 300; i++) { const it = AI.step(s2, sp2); if (it.fire) fired = true; }
  ok(fired, 'spitter fires projectile at preferred range');
  // leash
  const l = AI.makeBrain('stalker', home);
  const lp = { px: 0, pz: 10, bx: 0, bz: 0, dist: 10, dt: 1 / 60, playerDead: false, hasLOS: true, rand: 0.5, healthFrac: 1 };
  AI.step(l, lp); eq(l.state, 'chase', 'leash test: engaged');
  lp.bx = 0; lp.bz = 100; lp.dist = 5;
  AI.step(l, lp);
  ok(!l.alerted, 'leash breaks aggro when dragged far from home');
  // dead player de-aggros
  const d = AI.makeBrain('stalker', home);
  const dp = { px: 0, pz: 5, bx: 0, bz: 0, dist: 5, dt: 1 / 60, playerDead: false, hasLOS: true, rand: 0.5, healthFrac: 1 };
  AI.step(d, dp); dp.playerDead = true; AI.step(d, dp);
  ok(!d.alerted, 'enemies stop attacking a dead player');
}
G('AI — damage & death');
{
  const b = AI.makeBrain('stalker', { x: 0, z: 0 });
  let hp = ENEMIES.stalker.health;
  let r = AI.applyDamage(b, hp, 10, 22); hp = r.hp;
  eq(r.applied, 10, 'damage applied'); ok(!r.killed, 'not killed yet');
  r = AI.applyDamage(b, hp, 15, 22); hp = r.hp;
  ok(r.staggered, 'stagger threshold reached (25 >= 22)');
  eq(b.state, 'stagger', 'enters stagger state');
  r = AI.applyDamage(b, hp, 999, 22); hp = r.hp;
  ok(r.killed, 'overkill kills'); eq(hp, 0, 'hp floors at 0');
  eq(b.state, 'dead', 'enters dead state');
  const after = AI.applyDamage(b, 0, 50, 22);
  eq(after.applied, 0, 'corpse takes no damage (no double-kill loot)');
  const boss = AI.makeBrain('warden', { x: 0, z: 0 });
  const br = AI.applyDamage(boss, 640, 200, 22);
  ok(!br.staggered, 'boss does not get stagger-locked');
}
G('AI — boss phases');
{
  const b = AI.makeBrain('warden', { x: 0, z: 0 });
  const p = { px: 0, pz: 8, bx: 0, bz: 0, dist: 8, dt: 1 / 60, playerDead: false, hasLOS: true, rand: 0.5, healthFrac: 1 };
  eq(b.phase, 1, 'boss starts phase 1');
  for (let i = 0; i < 60; i++) AI.step(b, p);
  p.healthFrac = 0.45;
  const it = AI.step(b, p);
  eq(b.phase, 2, 'boss transitions to phase 2 below 50%');
  eq(it.phaseChanged, 2, 'phase change emits event');
  const kinds = new Set();
  // Sweep player distance across every engagement band, as a real fight would.
  for (let i = 0; i < 6000; i++) {
    p.rand = (i % 100) / 100;
    p.dist = 3 + (i % 120) / 10;      // 3m .. 15m
    p.pz = p.dist;
    const x = AI.step(b, p); if (x.attackKind) kinds.add(x.attackKind);
  }
  ok(kinds.size >= 4, 'boss uses four distinct attacks', [...kinds].join(','));
  ok(kinds.has('nova'), 'boss uses rune nova');
  ok(kinds.has('cleave'), 'boss uses cleave');
  ok(kinds.has('slam'), 'boss uses slam');
  ok(kinds.has('charge'), 'boss uses charge');
}

// ---------------------------------------------------------------- Progression
G('Progression');
{
  const p = new Progression();
  eq(p.activeObjective().id, 'arrive', 'first objective is arrival');
  p.complete('arrive');
  eq(p.activeObjective().id, 'gather', 'advances to gather');
  for (let i = 0; i < 5; i++) p.noteGather();
  ok(!p.isDone('gather'), 'gather not complete without crafting');
  p.noteCraft('salve');
  ok(p.isDone('gather'), 'gather completes with 5 gathered + salve crafted');
  ok(!p.unsealShrine(), 'shrine cannot be unsealed without relics');
  p.addRelic('relic_forest'); p.addRelic('relic_cave');
  eq(p.relicCount(), 2, 'two relics counted');
  ok(!p.hasAllRelics(), 'not all relics yet');
  ok(!p.addRelic('relic_forest'), 'duplicate relic rejected');
  p.addRelic('relic_ruins');
  ok(p.isDone('relics'), 'relics objective completes');
  ok(p.unsealShrine(), 'shrine unseals with 3 relics');
  ok(!p.unsealShrine(), 'unseal is idempotent');
  ok(p.defeatBoss(), 'boss defeat registers');
  ok(!p.defeatBoss(), 'boss defeat is idempotent');
  ok(p.isDone('warden'), 'final objective complete');
  for (const l of ['lore1', 'lore2', 'lore3', 'lore4']) p.readLore(l);
  ok(p.isDone('lore'), 'all lore completes optional objective');
  ok(!p.readLore('lore1'), 'lore not re-readable');
  const events = []; const q = new Progression(); q.onChange(e => events.push(e.type));
  q.complete('arrive'); q.addRelic('relic_forest');
  ok(events.includes('objective') && events.includes('relic'), 'events emitted to listeners');
  const j = p.journal();
  eq(j.length, OBJECTIVES.length, 'journal lists every objective');
  ok(p.completionPercent() >= 85, 'completion percent computed', p.completionPercent() + '%');
}

// ---------------------------------------------------------------- Save/Load
G('Save / Load (incl. simulated application restart)');
{
  const store = memStorage();
  ok(!SaveSystem.exists(store), 'no save initially');
  eq(SaveSystem.read(store).error, 'no_save', 'read with no save reports no_save');

  const inv = new Inventory({ leaf: 7, salve: 2, relic_forest: 1 });
  const at = new Attributes(); at.health = 63; at.weaponUpgrades = 1;
  const pr = new Progression(); pr.complete('arrive'); pr.addRelic('relic_forest'); pr.readLore('lore1');
  const state = {
    playtime: 1234, player: { x: 12.5, z: -40.25, facing: 1.2 },
    attrs: at.serialize(), inventory: inv.serialize(), progression: pr.serialize(),
    checkpoint: { x: 0, z: -148, name: 'Arrival Clearing' }, world: { nodesTaken: { n3: true } }
  };
  const w = SaveSystem.write(store, state);
  ok(w.ok, 'save written'); ok(w.bytes > 100, 'save has content');
  ok(SaveSystem.exists(store), 'save exists after write');

  // simulate full restart: brand new objects reading the same storage
  const loaded = SaveSystem.read(store);
  ok(loaded.ok, 'save loads after restart');
  const inv2 = new Inventory(loaded.data.inventory);
  const at2 = new Attributes(loaded.data.attrs);
  const pr2 = new Progression(loaded.data.progression);
  eq(inv2.count('leaf'), 7, 'inventory survives restart');
  eq(inv2.count('salve'), 2, 'consumables survive restart');
  eq(inv2.count('relic_forest'), 1, 'relic survives restart');
  eq(at2.health, 63, 'health survives restart');
  eq(at2.weaponUpgrades, 1, 'upgrades survive restart');
  eq(at2.maxHealth, 100, 'derived stats recomputed correctly');
  ok(pr2.isDone('arrive'), 'objectives survive restart');
  eq(pr2.relicCount(), 1, 'relics survive restart');
  ok(!!pr2.loreRead.lore1, 'lore survives restart');
  near(loaded.data.player.x, 12.5, 1e-9, 'position survives restart');
  eq(loaded.data.checkpoint.name, 'Arrival Clearing', 'checkpoint survives restart');
  ok(loaded.data.world.nodesTaken.n3, 'world state survives restart');

  // corruption handling
  store.setItem(SaveSystem.key, '{ not json');
  eq(SaveSystem.read(store).error, 'corrupt_json', 'corrupt JSON handled');
  store.setItem(SaveSystem.key, JSON.stringify({ version: 999, player: { x: 0, z: 0 }, inventory: {}, progression: {} }));
  eq(SaveSystem.read(store).error, 'future_version', 'future save version refused');
  store.setItem(SaveSystem.key, JSON.stringify({ version: 3, player: { x: 'bad', z: 0 }, inventory: {}, progression: {} }));
  eq(SaveSystem.read(store).error, 'bad_player', 'invalid player data refused');
  store.setItem(SaveSystem.key, JSON.stringify({ version: 3, player: { x: NaN, z: 0 }, inventory: {}, progression: {} }));
  ok(!SaveSystem.read(store).ok, 'NaN position refused');
  store.setItem(SaveSystem.key, JSON.stringify({ version: 3, player: { x: 0, z: 0 } }));
  eq(SaveSystem.read(store).error, 'bad_inventory', 'missing inventory refused');

  // migration from v1
  store.setItem(SaveSystem.key, JSON.stringify({ version: 1, player: { x: 1, z: 2 }, inventory: { leaf: 1 }, progression: {} }));
  const mig = SaveSystem.read(store);
  ok(mig.ok, 'v1 save migrates');
  eq(mig.data.version, CONFIG.saveVersion, 'migrated to current version');
  ok(mig.data.progression.loreRead, 'migration adds loreRead');
  ok(mig.data.checkpoint, 'migration adds default checkpoint');

  // throwing storage must not crash
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
  eq(SaveSystem.read(broken).error, 'storage_unavailable', 'storage failure handled gracefully');
  ok(!SaveSystem.write(broken, state).ok, 'write failure handled gracefully');
  ok(!SaveSystem.exists(broken), 'exists() survives storage failure');

  SaveSystem.write(store, state);
  const sum = SaveSystem.summary(store);
  ok(sum && typeof sum.percent === 'number', 'save summary for menu');
  ok(SaveSystem.clear(store), 'save cleared');
  ok(!SaveSystem.exists(store), 'no save after clear');
}

// ---------------------------------------------------------------- World
G('World generation');
{
  const w1 = World.generate(20261114);
  const w2 = World.generate(20261114);
  eq(w1.trees.length, w2.trees.length, 'deterministic tree count');
  eq(JSON.stringify(w1.nodes), JSON.stringify(w2.nodes), 'fully deterministic node layout');
  const w3 = World.generate(999);
  ok(JSON.stringify(w3.nodes) !== JSON.stringify(w1.nodes), 'different seed gives different world');

  ok(w1.trees.length > 300, 'forest is populated', w1.trees.length + ' trees');
  ok(w1.nodes.length >= 60, 'enough resource nodes', w1.nodes.length + ' nodes');
  ok(w1.enemies.length >= 24, 'enough enemies', w1.enemies.length + ' enemies');
  const types = new Set(w1.enemies.map(e => e.type));
  eq(types.size, 3, 'exactly three enemy archetypes placed');
  ok(w1.nodes.some(n => n.item === 'crystal'), 'crystals exist in cave');
  ok(w1.nodes.filter(n => n.item === 'crystal').every(n => World.inCave(n.x, n.z)), 'all crystals are inside the cave');

  const lm = id => w1.landmarks.find(l => l.id === id);
  for (const id of ['relic_forest', 'relic_cave', 'relic_ruins', 'shrine_gate', 'warden', 'heart', 'cache1'])
    ok(!!lm(id), 'landmark present: ' + id);
  eq(w1.landmarks.filter(l => l.type === 'lore').length, 4, 'four lore stones');
  eq(w1.landmarks.filter(l => l.type === 'checkpoint').length, 5, 'five checkpoints');
  ok(lm('relic_cave') && World.inCave(lm('relic_cave').x, lm('relic_cave').z), 'cave relic is inside the cave');

  // spawn must be clear of colliders
  const nearSpawn = w1.grid.near(World.SPAWN.x, World.SPAWN.z, 6);
  const blocking = nearSpawn.filter(c => World.dist2(c.x, c.z, World.SPAWN.x, World.SPAWN.z) < c.r + CONFIG.player.radius);
  eq(blocking.length, 0, 'player spawn is not inside geometry');

  // landmarks must not be buried in colliders
  let buried = [];
  for (const l of w1.landmarks) {
    if (l.type === 'gate' || l.type === 'boss') continue;
    for (const c of w1.grid.near(l.x, l.z, 4))
      if (World.dist2(c.x, c.z, l.x, l.z) < c.r + 0.9) buried.push(l.id + '/' + c.kind);
  }
  eq(buried.length, 0, 'no landmark is buried inside a collider', buried.join(','));

  // cave entrance must be walkable from the forest
  const CAVE = World.CAVE;
  let blockedAt = null;
  for (let d = 62; d >= 0; d -= 0.5) {
    const x = CAVE[0] + d, z = CAVE[1];
    for (const c of w1.grid.near(x, z, 3))
      if (World.dist2(c.x, c.z, x, z) < c.r + CONFIG.player.radius) blockedAt = d;
  }
  eq(blockedAt, null, 'cave entrance corridor is walkable', 'blocked at d=' + blockedAt);

  // shrine south opening must be walkable
  const SH = World.SHRINE; let shBlocked = null;
  for (let d = 44; d >= 30; d -= 0.5) {
    const x = SH[0], z = SH[1] - d;
    for (const c of w1.grid.near(x, z, 3))
      if (World.dist2(c.x, c.z, x, z) < c.r + CONFIG.player.radius) shBlocked = d;
  }
  eq(shBlocked, null, 'shrine gate approach is walkable', 'blocked at d=' + shBlocked);

  // regions
  eq(World.regionAt(0, -100), 'forest', 'south is forest');
  eq(World.regionAt(CAVE[0], CAVE[1]), 'cave', 'cave centre is cave');
  eq(World.regionAt(World.RUINS[0], World.RUINS[1]), 'ruins', 'ruins centre is ruins');
  eq(World.regionAt(SH[0], SH[1]), 'shrine', 'shrine centre is shrine');
  ok(World.heightAt(CAVE[0], CAVE[1]) < World.heightAt(0, -100), 'cave basin sits lower than forest');
  ok(Number.isFinite(World.heightAt(123.4, -56.7)), 'height function is finite');

  // spatial hash correctness vs brute force
  const q = w1.grid.near(20, 20, 10);
  const brute = w1.colliders.filter(c => Math.abs(c.x - 20) <= 10 + 14 && Math.abs(c.z - 20) <= 10 + 14);
  ok(q.length > 0 && q.every(c => brute.includes(c)), 'spatial hash returns a valid subset');
}

// ---------------------------------------------------------------- Data integrity
G('Data integrity');
{
  const ids = Object.keys(ITEMS);
  ok(ids.every(k => ITEMS[k].id === k), 'item ids match keys');
  ok(ids.every(k => ITEMS[k].name && ITEMS[k].desc && ITEMS[k].icon), 'every item has name, desc, icon');
  ok(ids.every(k => ITEMS[k].stack > 0), 'every item has a positive stack size');
  ok(Object.keys(ENEMIES).length === 4, 'three archetypes plus one boss');
  ok(Object.values(ENEMIES).every(e => e.telegraph >= 0.4), 'every enemy has a readable telegraph >= 0.4s');
  ok(OBJECTIVES.filter(o => o.kind === 'main').length === 5, 'five main objectives');
  ok(RECIPES.every(r => r.qty > 0), 'recipes produce at least one item');
}

console.log('\n' + '='.repeat(60));
console.log(`\x1b[1mRESULT: ${pass} passed, ${fail} failed\x1b[0m`);
if (failures.length) { console.log('\nFailures:'); failures.forEach(f => console.log('  - ' + f)); }
console.log('='.repeat(60));
process.exit(fail ? 1 : 0);
