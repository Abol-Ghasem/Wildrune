/* WILDRUNE — deterministic world generation. Pure data out; renderer consumes it. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else { root.WR = root.WR || {}; Object.assign(root.WR, factory(root)); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const D = (typeof module === 'object' && module.exports) ? require('./data.js') : root.WR;
  const { REGIONS, CONFIG } = D;

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  const dist2 = (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return Math.hypot(dx, dz); };

  const SPAWN = { x: 0, z: -152 };
  const SHRINE = REGIONS.shrine.center;
  const CAVE = REGIONS.cave.center;
  const RUINS = REGIONS.ruins.center;

  /** Terrain height. Shared by generator, renderer and runtime — single source of truth. */
  function heightAt(x, z) {
    let h = Math.sin(x * 0.035) * 1.5 + Math.cos(z * 0.029) * 1.7 + Math.sin((x + z) * 0.016) * 1.1;
    // main north-south path is gently flattened
    const path = 1 - smooth(4, 16, Math.abs(x));
    h *= (1 - path * 0.75);
    // arrival clearing
    h *= 1 - (1 - smooth(6, 20, dist2(x, z, SPAWN.x, SPAWN.z))) * 0.9;
    // cave basin sinks
    const caveD = dist2(x, z, CAVE[0], CAVE[1]);
    h -= (1 - smooth(38, 62, caveD)) * 5.5;
    // shrine plateau rises and flattens
    const shD = dist2(x, z, SHRINE[0], SHRINE[1]);
    const shW = 1 - smooth(26, 52, shD);
    h = h * (1 - shW) + 1.2 * shW;
    // ruins terrace
    const ruD = dist2(x, z, RUINS[0], RUINS[1]);
    const ruW = 1 - smooth(24, 50, ruD);
    h = h * (1 - ruW) + 0.6 * ruW;
    return h;
  }

  function regionAt(x, z) {
    let best = 'forest', bestScore = Infinity;
    for (const k of Object.keys(REGIONS)) {
      const r = REGIONS[k];
      const d = dist2(x, z, r.center[0], r.center[1]) / r.radius;
      if (d < bestScore) { bestScore = d; best = k; }
    }
    return bestScore > 1.35 ? 'forest' : best;
  }
  const inCave = (x, z) => dist2(x, z, CAVE[0], CAVE[1]) < 44;

  /** Cheap uniform-grid spatial hash for collider queries. */
  class ColliderGrid {
    constructor(cell) { this.cell = cell || 12; this.map = new Map(); }
    key(cx, cz) { return cx + ',' + cz; }
    add(c) {
      const cx = Math.floor(c.x / this.cell), cz = Math.floor(c.z / this.cell);
      const k = this.key(cx, cz);
      if (!this.map.has(k)) this.map.set(k, []);
      this.map.get(k).push(c);
      c._cell = k;
    }
    remove(c) {
      const arr = this.map.get(c._cell); if (!arr) return;
      const i = arr.indexOf(c); if (i >= 0) arr.splice(i, 1);
    }
    near(x, z, r) {
      const out = [];
      const c0x = Math.floor((x - r) / this.cell), c1x = Math.floor((x + r) / this.cell);
      const c0z = Math.floor((z - r) / this.cell), c1z = Math.floor((z + r) / this.cell);
      for (let cx = c0x; cx <= c1x; cx++) for (let cz = c0z; cz <= c1z; cz++) {
        const arr = this.map.get(this.key(cx, cz));
        if (arr) for (const c of arr) out.push(c);
      }
      return out;
    }
  }

  function generate(seed) {
    const rnd = mulberry32(seed || CONFIG.world.seed);
    const W = {
      seed: seed || CONFIG.world.seed, size: CONFIG.world.size,
      trees: [], rocks: [], grass: [], pillars: [], nodes: [], enemies: [],
      landmarks: [], colliders: [], caveWalls: [], spawn: { ...SPAWN }
    };
    const occupied = [];
    const free = (x, z, r) => {
      for (const o of occupied) if (dist2(x, z, o.x, o.z) < r + o.r) return false;
      return true;
    };
    const take = (x, z, r) => occupied.push({ x, z, r });

    // --- Reserve clearings, landmarks and the path -------------------------
    take(SPAWN.x, SPAWN.z, 16);
    take(SHRINE[0], SHRINE[1], 40);
    take(CAVE[0], CAVE[1], 12);
    take(RUINS[0], RUINS[1], 10);
    for (let z = -160; z <= 150; z += 10) take(0, z, 7); // main path corridor
    // Cave approach + entrance corridor must stay walkable (east-facing gap).
    for (let d = 0; d <= 66; d += 6) take(CAVE[0] + d, CAVE[1], 6);
    // Ruins approach corridor from the main path.
    for (let d = 0; d <= 70; d += 8) take(RUINS[0] - d, RUINS[1] - 14, 6);

    const addCollider = (x, z, r, kind) => { const c = { x, z, r, kind }; W.colliders.push(c); return c; };

    // --- Landmarks ---------------------------------------------------------
    const LM = W.landmarks;
    // Checkpoints (waystones)
    LM.push({ type: 'checkpoint', id: 'cp_arrival', x: SPAWN.x, z: SPAWN.z + 4, name: 'Arrival Clearing' });
    LM.push({ type: 'checkpoint', id: 'cp_cross', x: 2, z: -6, name: 'The Crossing' });
    LM.push({ type: 'checkpoint', id: 'cp_cave', x: CAVE[0] + 46, z: CAVE[1] - 6, name: 'Cave Mouth' });
    LM.push({ type: 'checkpoint', id: 'cp_ruins', x: RUINS[0] - 40, z: RUINS[1] - 16, name: 'Ruins Approach' });
    LM.push({ type: 'checkpoint', id: 'cp_shrine', x: SHRINE[0], z: SHRINE[1] - 46, name: 'Shrine Threshold' });
    for (const l of LM) take(l.x, l.z, 5);

    // Workbenches (forge stations)
    LM.push({ type: 'forge', id: 'forge_camp', x: SPAWN.x + 7, z: SPAWN.z + 2, name: 'Explorer\'s Workbench' });
    LM.push({ type: 'forge', id: 'forge_ruins', x: RUINS[0] - 34, z: RUINS[1] - 10, name: 'Warden\'s Anvil' });
    take(SPAWN.x + 7, SPAWN.z + 2, 4); take(RUINS[0] - 34, RUINS[1] - 10, 4);

    // Relics — one per exploration area, deliberately off the main path
    LM.push({ type: 'relic', id: 'relic_forest', x: -62, z: -104, name: 'Relic of Roots', item: 'relic_forest' });
    LM.push({ type: 'relic', id: 'relic_cave', x: CAVE[0] - 16, z: CAVE[1] + 14, name: 'Relic of Depths', item: 'relic_cave' });
    LM.push({ type: 'relic', id: 'relic_ruins', x: RUINS[0] + 22, z: RUINS[1] + 18, name: 'Relic of Stone', item: 'relic_ruins' });
    // Lore stones
    LM.push({ type: 'lore', id: 'lore1', x: 14, z: -118, name: 'Memory Stone' });
    LM.push({ type: 'lore', id: 'lore2', x: CAVE[0] + 8, z: CAVE[1] - 22, name: 'Memory Stone' });
    LM.push({ type: 'lore', id: 'lore3', x: RUINS[0] - 12, z: RUINS[1] + 26, name: 'Memory Stone' });
    LM.push({ type: 'lore', id: 'lore4', x: -34, z: 92, name: 'Memory Stone' });
    // Hidden cache under a fallen arch
    LM.push({ type: 'cache', id: 'cache1', x: 88, z: -46, name: 'Smuggler\'s Cache' });
    // Shrine gate + boss
    LM.push({ type: 'gate', id: 'shrine_gate', x: SHRINE[0], z: SHRINE[1] - 34, name: 'Sealed Gate' });
    LM.push({ type: 'boss', id: 'warden', x: SHRINE[0], z: SHRINE[1] + 6, name: 'The Runebound Warden' });
    LM.push({ type: 'ending', id: 'heart', x: SHRINE[0], z: SHRINE[1] + 26, name: 'The Heartroot' });
    for (const l of LM) if (l.type !== 'checkpoint' && l.type !== 'forge') take(l.x, l.z, 6);

    // --- Cave shell: ring of walls with an eastern entrance ----------------
    for (let i = 0; i < 34; i++) {
      const a = (i / 34) * Math.PI * 2;
      // entrance gap faces east (toward the forest), around angle 0
      if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.34) continue;
      const r = 45 + rnd() * 3;
      const x = CAVE[0] + Math.cos(a) * r, z = CAVE[1] + Math.sin(a) * r;
      W.caveWalls.push({ x, z, r: 5.5 + rnd() * 2, h: 16 + rnd() * 8, rot: rnd() * 6.28 });
      addCollider(x, z, 5.0, 'cavewall');
    }

    // --- Ruins: pillars, arches, broken walls ------------------------------
    for (let i = 0; i < 26; i++) {
      const a = rnd() * Math.PI * 2, r = 8 + rnd() * 44;
      const x = RUINS[0] + Math.cos(a) * r, z = RUINS[1] + Math.sin(a) * r;
      if (!free(x, z, 4)) continue;
      const h = 4 + rnd() * 9;
      W.pillars.push({ x, z, h, r: 1.1 + rnd() * 0.6, rot: rnd() * 6.28, broken: rnd() < 0.45 });
      addCollider(x, z, 1.5, 'pillar'); take(x, z, 4);
    }
    // Shrine colonnade
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      if (Math.abs(a - Math.PI * 1.5) < 0.45) continue; // south opening for the gate
      const x = SHRINE[0] + Math.cos(a) * 33, z = SHRINE[1] + Math.sin(a) * 33;
      W.pillars.push({ x, z, h: 12 + rnd() * 3, r: 1.6, rot: a, broken: false, corrupted: true });
      addCollider(x, z, 1.9, 'pillar');
    }

    // --- Forest scatter ----------------------------------------------------
    const half = CONFIG.world.size / 2 - 12;
    let guard = 0;
    while (W.trees.length < 430 && guard++ < 9000) {
      const x = (rnd() * 2 - 1) * half, z = (rnd() * 2 - 1) * half;
      const reg = regionAt(x, z);
      if (reg === 'cave' && inCave(x, z)) continue;
      if (reg === 'shrine' && dist2(x, z, SHRINE[0], SHRINE[1]) < 42) continue;
      if (reg === 'ruins' && rnd() < 0.55) continue;
      if (!free(x, z, 4.2)) continue;
      const s = 0.75 + rnd() * 0.9;
      W.trees.push({ x, z, s, rot: rnd() * 6.28, kind: rnd() < 0.22 ? 'pine' : 'broad', corrupted: reg === 'shrine' ? 1 : (rnd() < 0.08 ? 0.5 : 0) });
      addCollider(x, z, 0.85 * s, 'tree'); take(x, z, 4.2);
    }
    guard = 0;
    while (W.rocks.length < 210 && guard++ < 6000) {
      const x = (rnd() * 2 - 1) * half, z = (rnd() * 2 - 1) * half;
      if (!free(x, z, 2.6)) continue;
      const s = 0.6 + rnd() * 1.9;
      W.rocks.push({ x, z, s, rot: rnd() * 6.28, kind: rnd() < 0.5 ? 'boulder' : 'slab' });
      addCollider(x, z, 0.95 * s, 'rock'); take(x, z, 2.6);
    }
    for (let i = 0; i < 1400; i++) {
      const x = (rnd() * 2 - 1) * half, z = (rnd() * 2 - 1) * half;
      if (inCave(x, z)) continue;
      W.grass.push({ x, z, s: 0.6 + rnd() * 0.9, rot: rnd() * 6.28 });
    }

    // --- Resource nodes ----------------------------------------------------
    const nodePlan = [
      { item: 'leaf', count: 26, regions: ['forest'], kind: 'herb' },
      { item: 'timber', count: 18, regions: ['forest', 'ruins'], kind: 'log' },
      { item: 'ore', count: 18, regions: ['forest', 'ruins', 'cave'], kind: 'orerock' },
      { item: 'crystal', count: 12, regions: ['cave'], kind: 'crystal' }
    ];
    for (const plan of nodePlan) {
      let placed = 0, tries = 0;
      while (placed < plan.count && tries++ < 4000) {
        const x = (rnd() * 2 - 1) * half, z = (rnd() * 2 - 1) * half;
        const reg = regionAt(x, z);
        if (!plan.regions.includes(reg)) continue;
        if (plan.kind === 'crystal' && !inCave(x, z)) continue;
        if (plan.kind !== 'crystal' && inCave(x, z)) continue;
        if (!free(x, z, 2.2)) continue;
        W.nodes.push({ id: 'n' + W.nodes.length, x, z, item: plan.item, kind: plan.kind, qty: plan.item === 'crystal' ? 1 : 2, rot: rnd() * 6.28, s: 0.8 + rnd() * 0.5 });
        take(x, z, 2.2); placed++;
      }
    }

    // --- Enemy spawns ------------------------------------------------------
    const spawnPlan = [
      { type: 'stalker', count: 9, cx: 0, cz: -70, r: 95, avoidShrine: true },
      { type: 'stalker', count: 4, cx: CAVE[0], cz: CAVE[1], r: 34, cave: true },
      { type: 'guardian', count: 4, cx: RUINS[0], cz: RUINS[1], r: 42 },
      { type: 'guardian', count: 2, cx: -40, cz: 40, r: 40 },
      { type: 'spitter', count: 5, cx: RUINS[0] - 10, cz: RUINS[1] + 6, r: 46 },
      { type: 'spitter', count: 3, cx: 20, cz: 60, r: 45 }
    ];
    for (const plan of spawnPlan) {
      let placed = 0, tries = 0;
      while (placed < plan.count && tries++ < 3000) {
        const a = rnd() * Math.PI * 2, r = rnd() * plan.r;
        const x = plan.cx + Math.cos(a) * r, z = plan.cz + Math.sin(a) * r;
        if (Math.abs(x) > half || Math.abs(z) > half) continue;
        if (dist2(x, z, SPAWN.x, SPAWN.z) < 34) continue;
        if (plan.avoidShrine && dist2(x, z, SHRINE[0], SHRINE[1]) < 56) continue;
        if (plan.cave && !inCave(x, z)) continue;
        if (!plan.cave && inCave(x, z)) continue;
        if (!free(x, z, 2.0)) continue;
        W.enemies.push({ id: 'e' + W.enemies.length, type: plan.type, x, z, rot: rnd() * 6.28 });
        take(x, z, 2.0); placed++;
      }
    }

    W.grid = new ColliderGrid(14);
    for (const c of W.colliders) W.grid.add(c);
    return W;
  }

  return { generate, heightAt, regionAt, inCave, mulberry32, ColliderGrid, SPAWN, SHRINE, CAVE, RUINS, dist2, clamp, smooth };
});
