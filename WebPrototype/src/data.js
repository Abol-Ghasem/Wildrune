/* WILDRUNE — data definitions. Pure data, no engine dependency. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.WR = root.WR || {}; Object.assign(root.WR, factory()); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CONFIG = {
    version: '0.4.0',
    saveVersion: 3,
    player: {
      maxHealth: 100, maxStamina: 100,
      walkSpeed: 4.6, sprintSpeed: 8.4, accel: 34, decel: 26,
      jumpVelocity: 8.2, gravity: 24,
      dodgeSpeed: 15, dodgeTime: 0.34, dodgeIFrames: 0.30, dodgeCost: 25, dodgeCooldown: 0.55,
      staminaRegen: 22, staminaRegenDelay: 0.65, sprintDrain: 16,
      radius: 0.45, height: 1.8,
      respawnDelay: 2.4
    },
    combat: {
      light: { damage: 14, stamina: 8, windup: 0.13, active: 0.14, recover: 0.20, range: 2.5, arc: 1.5, knock: 2.0 },
      heavy: { damage: 32, stamina: 22, windup: 0.38, active: 0.18, recover: 0.42, range: 3.0, arc: 1.9, knock: 6.5 },
      staggerThreshold: 22,
      playerIFrameAfterHit: 0.55
    },
    world: { size: 420, seed: 20261114 },
    interactRange: 3.2,
    gatherTime: 0.85
  };

  // ---- Items -------------------------------------------------------------
  const ITEMS = {
    leaf:     { id:'leaf',     name:'Verdant Leaf',      type:'resource', stack:99, icon:'leaf',    desc:'A bright leaf that still resists the corruption. Base of most salves.' },
    timber:   { id:'timber',   name:'Ancient Timber',    type:'resource', stack:99, icon:'timber',  desc:'Dense heartwood from a fallen forest giant. Sturdy and slow to burn.' },
    ore:      { id:'ore',      name:'Runestone Ore',     type:'resource', stack:99, icon:'ore',     desc:'Raw ore veined with dormant runes. Refine it before use.' },
    crystal:  { id:'crystal',  name:'Lumen Crystal',     type:'resource', stack:99, icon:'crystal', desc:'A cave-grown crystal holding cold light. Found only in the dark.' },
    essence:  { id:'essence',  name:'Corrupted Essence', type:'resource', stack:99, icon:'essence', desc:'Residue left by a corrupted creature. Unpleasant, but useful.' },
    ingot:    { id:'ingot',    name:'Runed Ingot',       type:'material', stack:99, icon:'ingot',   desc:'Refined runestone. Holds an edge and a memory.' },

    salve:    { id:'salve',    name:'Healing Salve',     type:'consumable', stack:10, icon:'salve',   desc:'Restores 40 health.', use:{ heal:40 } },
    elixir:   { id:'elixir',   name:'Greater Elixir',    type:'consumable', stack:10, icon:'elixir',  desc:'Restores 80 health.', use:{ heal:80 } },
    tonic:    { id:'tonic',    name:'Stamina Tonic',     type:'consumable', stack:10, icon:'tonic',   desc:'Restores all stamina and doubles regeneration for 20s.', use:{ stamina:100, buff:'stamina', buffTime:20 } },
    draught:  { id:'draught',  name:'Purifying Draught', type:'consumable', stack:10, icon:'draught', desc:'Clears corruption and restores 25 health.', use:{ heal:25, cleanse:true } },
    ember:    { id:'ember',    name:'Ember Flask',       type:'consumable', stack:5,  icon:'ember',   desc:'Shatters in a burst of flame: 55 damage to enemies within 6m.', use:{ burst:55, burstRadius:6 } },

    hone:     { id:'hone',     name:'Weapon Hone',       type:'upgrade', stack:3, icon:'hone',  desc:'Permanently sharpens your blade: +25% attack damage.', use:{ upgrade:'weapon' } },
    charm:    { id:'charm',    name:'Warding Charm',     type:'upgrade', stack:3, icon:'charm', desc:'Permanently raises maximum health by 20.', use:{ upgrade:'health' } },
    boots:    { id:'boots',    name:'Swiftstep Boots',   type:'upgrade', stack:2, icon:'boots', desc:'Permanently increases movement speed by 10%.', use:{ upgrade:'speed' } },
    lantern:  { id:'lantern',  name:'Lumen Lantern',     type:'tool',    stack:1, icon:'lantern', desc:'A steady light. Makes the Ancient Cave readable.', use:{ equip:'lantern' } },

    relic_forest: { id:'relic_forest', name:'Relic of Roots',  type:'relic', stack:1, icon:'relic', desc:'One of three wardstones that sealed the shrine. Warm to the touch.' },
    relic_cave:   { id:'relic_cave',   name:'Relic of Depths', type:'relic', stack:1, icon:'relic', desc:'One of three wardstones. It hums when pointed north.' },
    relic_ruins:  { id:'relic_ruins',  name:'Relic of Stone',  type:'relic', stack:1, icon:'relic', desc:'One of three wardstones. Cracked, but still holding.' }
  };

  // ---- Crafting (11 recipes) --------------------------------------------
  const RECIPES = [
    { id:'r_salve',   out:'salve',   qty:1, in:{ leaf:2 },                    station:'any',  cat:'Consumables', desc:'Basic field healing.' },
    { id:'r_elixir',  out:'elixir',  qty:1, in:{ leaf:3, essence:1 },         station:'any',  cat:'Consumables', desc:'Strong healing for the shrine.' },
    { id:'r_tonic',   out:'tonic',   qty:1, in:{ leaf:2, timber:1 },          station:'any',  cat:'Consumables', desc:'Keep sprinting and dodging.' },
    { id:'r_draught', out:'draught', qty:1, in:{ leaf:2, essence:2 },         station:'any',  cat:'Consumables', desc:'Shrugs off corruption.' },
    { id:'r_ember',   out:'ember',   qty:1, in:{ ore:1, essence:1 },          station:'any',  cat:'Consumables', desc:'Crowd control in a bottle.' },
    { id:'r_ingot',   out:'ingot',   qty:1, in:{ ore:3 },                     station:'forge',cat:'Materials',   desc:'Refine raw runestone ore.' },
    { id:'r_hone',    out:'hone',    qty:1, in:{ ingot:2, timber:1 },         station:'forge',cat:'Upgrades',    desc:'Sharpen the blade. Permanent.' },
    { id:'r_charm',   out:'charm',   qty:1, in:{ ingot:2, essence:2 },        station:'forge',cat:'Upgrades',    desc:'Ward the body. Permanent.' },
    { id:'r_boots',   out:'boots',   qty:1, in:{ timber:2, essence:1 },       station:'forge',cat:'Upgrades',    desc:'Move faster. Permanent.' },
    { id:'r_lantern', out:'lantern', qty:1, in:{ timber:3, crystal:1 },       station:'forge',cat:'Tools',       desc:'Light for the Ancient Cave.' },
    { id:'r_salve3',  out:'salve',   qty:3, in:{ leaf:5, crystal:1 },         station:'forge',cat:'Consumables', desc:'Bulk salves at the workbench.' }
  ];

  // ---- Enemies -----------------------------------------------------------
  const ENEMIES = {
    stalker: {
      id:'stalker', name:'Corrupted Stalker', health:48, speed:6.3, radius:0.55,
      aggroRange:21, leash:38, attackRange:2.3, telegraph:0.42, active:0.16, recover:0.55,
      damage:12, attackArc:1.4, cooldown:1.1, xpEssence:1, color:0x8b3a62, scale:1.0,
      behaviour:'melee_rush'
    },
    guardian: {
      id:'guardian', name:'Forest Guardian', health:135, speed:2.7, radius:0.95,
      aggroRange:17, leash:30, attackRange:3.4, telegraph:0.92, active:0.22, recover:0.95,
      damage:26, attackArc:2.2, cooldown:2.0, xpEssence:3, color:0x4a6b3a, scale:1.55,
      behaviour:'melee_heavy', knockback:9
    },
    spitter: {
      id:'spitter', name:'Corrupted Spitter', health:38, speed:4.4, radius:0.5,
      aggroRange:24, leash:34, attackRange:15, preferredRange:11, fleeRange:7,
      telegraph:0.7, active:0.1, recover:0.7, damage:11, cooldown:1.9,
      projectileSpeed:17, xpEssence:2, color:0x5c4a86, scale:0.95,
      behaviour:'ranged_kite'
    },
    warden: {
      id:'warden', name:'The Runebound Warden', health:640, speed:3.4, radius:1.7,
      aggroRange:40, leash:999, attackRange:4.6, telegraph:0.95, active:0.25, recover:0.85,
      damage:30, attackArc:2.4, cooldown:1.6, xpEssence:0, color:0x6a2f8f, scale:2.6,
      behaviour:'boss', phaseTwoAt:0.5, knockback:12
    }
  };

  // ---- Objectives --------------------------------------------------------
  const OBJECTIVES = [
    { id:'arrive',  title:'Enter the Forgotten Lands', desc:'Follow the old path north out of the arrival clearing.', kind:'main' },
    { id:'gather',  title:'Learn to Survive',          desc:'Gather 5 resources and craft a Healing Salve.',            kind:'main' },
    { id:'relics',  title:'Recover the Three Wardstones', desc:'Find the Relic of Roots, Depths and Stone.',           kind:'main' },
    { id:'unseal',  title:'Unseal the Corrupted Shrine', desc:'Bring all three relics to the shrine gate.',            kind:'main' },
    { id:'warden',  title:'Confront the Runebound Warden', desc:'End the corruption at its source.',                  kind:'main' },
    { id:'lore',    title:'Echoes of the Old Wardens',  desc:'Read the four memory stones scattered across the land.', kind:'optional' },
    { id:'cache',   title:'The Smuggler\'s Cache',      desc:'A hidden stash lies beneath the fallen arch.',           kind:'optional' }
  ];

  const LORE = [
    { id:'lore1', title:'The First Warden', text:'"We did not build the shrine to worship. We built it to hold a door shut. Remember which side you stand on."' },
    { id:'lore2', title:'On the Corruption', text:'"It does not hate us. It grows through us, the way roots grow through a wall — patiently, and without malice."' },
    { id:'lore3', title:'The Splitting', text:'"Three wardstones, three keepers. Roots, Depths, Stone. Should they ever be gathered again, the door may be opened by design rather than by rot."' },
    { id:'lore4', title:'The Last Entry', text:'"I am the last who remembers the sealing. If you read this, the door has already failed. Take the stones. Finish it properly."' }
  ];

  const REGIONS = {
    forest: { id:'forest', name:'Forgotten Forest',    center:[0,-60],   radius:118, fog:0x9fc4a8, fogDensity:0.010, ground:[0.30,0.44,0.26], ambient:0x6f8f7a },
    cave:   { id:'cave',   name:'Ancient Cave',        center:[-128,42], radius:62,  fog:0x141a24, fogDensity:0.045, ground:[0.22,0.22,0.27], ambient:0x2a3040 },
    ruins:  { id:'ruins',  name:'Overgrown Ruins',     center:[126,40],  radius:66,  fog:0xb9bfa8, fogDensity:0.014, ground:[0.42,0.42,0.33], ambient:0x8a8f78 },
    shrine: { id:'shrine', name:'Corrupted Shrine',    center:[0,148],   radius:60,  fog:0x3a2246, fogDensity:0.026, ground:[0.28,0.20,0.32], ambient:0x50356a }
  };

  return { CONFIG, ITEMS, RECIPES, ENEMIES, OBJECTIVES, LORE, REGIONS };
});
