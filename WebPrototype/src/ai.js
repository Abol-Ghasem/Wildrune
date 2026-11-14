/* WILDRUNE — enemy AI decision logic. Pure FSM, no rendering: unit-testable. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else { root.WR = root.WR || {}; Object.assign(root.WR, factory(root)); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const D = (typeof module === 'object' && module.exports) ? require('./data.js') : root.WR;
  const { ENEMIES } = D;

  const STATES = ['idle', 'patrol', 'chase', 'telegraph', 'attack', 'recover', 'stagger', 'reposition', 'dead'];

  function makeBrain(type, home) {
    const def = ENEMIES[type];
    return {
      type, def, state: 'idle', t: 0, cooldown: 0, home: { x: home.x, z: home.z },
      facing: home.rot || 0, alerted: false, staggerBank: 0,
      patrolTarget: null, patrolWait: 0, phase: 1, attackKind: 'basic',
      hitFlash: 0, deathT: 0, comboStep: 0
    };
  }

  /**
   * Advance the brain. Returns an intent object the runtime executes:
   * {move:{x,z}, speed, face, fire, melee, telegraphKind, stateChanged}
   * `p` = percepts {px,pz,playerDead,dist,dt,hasLOS,rand}
   */
  function step(b, p) {
    const def = b.def, dt = p.dt;
    const intent = { move: null, speed: 0, face: b.facing, fire: false, melee: false, stateChanged: false, attackKind: null };
    const prev = b.state;
    b.t += dt;
    if (b.cooldown > 0) b.cooldown = Math.max(0, b.cooldown - dt);
    if (b.hitFlash > 0) b.hitFlash = Math.max(0, b.hitFlash - dt);

    if (b.state === 'dead') { b.deathT += dt; intent.stateChanged = prev !== b.state; return intent; }

    const toPlayer = Math.atan2(p.px - b.home.x, p.pz - b.home.z);
    const dirX = p.px - (p.bx != null ? p.bx : b.home.x);
    const dirZ = p.pz - (p.bz != null ? p.bz : b.home.z);
    const bx = p.bx != null ? p.bx : b.home.x, bz = p.bz != null ? p.bz : b.home.z;
    const facePlayer = Math.atan2(dirX, dirZ);
    const homeDist = Math.hypot(bx - b.home.x, bz - b.home.z);

    // Boss phase transition
    if (def.behaviour === 'boss' && p.healthFrac != null && p.healthFrac <= def.phaseTwoAt && b.phase === 1) {
      b.phase = 2; intent.phaseChanged = 2;
    }
    const speedMul = b.phase === 2 ? 1.28 : 1;
    const cdMul = b.phase === 2 ? 0.68 : 1;

    // Aggro / leash
    const canSee = p.dist <= def.aggroRange && (p.hasLOS !== false) && !p.playerDead;
    if (canSee) b.alerted = true;
    if (b.alerted && (p.playerDead || homeDist > def.leash || p.dist > def.aggroRange * 1.7)) {
      b.alerted = false;
      if (b.state !== 'stagger') { b.state = 'idle'; b.t = 0; }
    }

    switch (b.state) {
      case 'idle': {
        if (b.alerted) { b.state = 'chase'; b.t = 0; break; }
        if (homeDist > 2.5) { intent.move = { x: b.home.x - bx, z: b.home.z - bz }; intent.speed = def.speed * 0.45; intent.face = Math.atan2(b.home.x - bx, b.home.z - bz); }
        else if (b.t > 2.5 + (p.rand || 0) * 2) { b.state = 'patrol'; b.t = 0; b.patrolTarget = null; }
        break;
      }
      case 'patrol': {
        if (b.alerted) { b.state = 'chase'; b.t = 0; break; }
        if (!b.patrolTarget) {
          const a = (p.rand || 0.5) * Math.PI * 2, r = 4 + (p.rand2 || 0.5) * 8;
          b.patrolTarget = { x: b.home.x + Math.cos(a) * r, z: b.home.z + Math.sin(a) * r };
        }
        const dx = b.patrolTarget.x - bx, dz = b.patrolTarget.z - bz;
        if (Math.hypot(dx, dz) < 1.2 || b.t > 7) { b.state = 'idle'; b.t = 0; b.patrolTarget = null; }
        else { intent.move = { x: dx, z: dz }; intent.speed = def.speed * 0.38; intent.face = Math.atan2(dx, dz); }
        break;
      }
      case 'chase': {
        intent.face = facePlayer;
        if (!b.alerted) { b.state = 'idle'; b.t = 0; break; }
        if (def.behaviour === 'ranged_kite') {
          if (p.dist < def.fleeRange) { b.state = 'reposition'; b.t = 0; break; }
          if (p.dist <= def.attackRange && b.cooldown <= 0 && p.hasLOS !== false) { b.state = 'telegraph'; b.t = 0; b.attackKind = 'spit'; break; }
          if (p.dist > def.preferredRange) { intent.move = { x: dirX, z: dirZ }; intent.speed = def.speed; }
          else { // strafe to stay interesting
            intent.move = { x: -dirZ, z: dirX }; intent.speed = def.speed * 0.5;
          }
        } else if (def.behaviour === 'boss') {
          if (b.cooldown <= 0) {
            const roll = p.rand || 0.5;
            if (p.dist > 9) b.attackKind = (b.phase === 2 && roll < 0.5) ? 'nova' : 'charge';
            else if (p.dist > 5.5) b.attackKind = (b.phase === 2 && roll < 0.3) ? 'nova' : (roll < 0.65 ? 'slam' : 'charge');
            else b.attackKind = roll < 0.6 ? 'cleave' : 'slam';
            b.state = 'telegraph'; b.t = 0; break;
          }
          intent.move = { x: dirX, z: dirZ }; intent.speed = def.speed * speedMul;
        } else {
          if (p.dist <= def.attackRange && b.cooldown <= 0) { b.state = 'telegraph'; b.t = 0; b.attackKind = 'basic'; break; }
          intent.move = { x: dirX, z: dirZ }; intent.speed = def.speed * speedMul;
        }
        break;
      }
      case 'reposition': {
        intent.face = facePlayer;
        intent.move = { x: -dirX, z: -dirZ }; intent.speed = def.speed * 1.05;
        if (p.dist >= def.preferredRange || b.t > 1.6) { b.state = 'chase'; b.t = 0; }
        break;
      }
      case 'telegraph': {
        intent.face = facePlayer;
        intent.telegraphKind = b.attackKind;
        const wind = def.telegraph * (b.attackKind === 'nova' ? 1.35 : b.attackKind === 'charge' ? 0.85 : 1) / speedMul;
        if (def.behaviour === 'boss' && b.attackKind === 'charge') { intent.move = { x: dirX, z: dirZ }; intent.speed = def.speed * 0.3; }
        if (b.t >= wind) {
          b.state = 'attack'; b.t = 0;
          if (b.attackKind === 'spit') intent.fire = true; else intent.melee = true;
          intent.attackKind = b.attackKind;
        }
        break;
      }
      case 'attack': {
        intent.face = b.facing;
        intent.attackKind = b.attackKind;
        if (b.attackKind === 'charge') { intent.move = { x: Math.sin(b.facing), z: Math.cos(b.facing) }; intent.speed = def.speed * 3.1; }
        if (b.t >= def.active + (b.attackKind === 'charge' ? 0.55 : 0)) { b.state = 'recover'; b.t = 0; }
        break;
      }
      case 'recover': {
        if (b.t >= def.recover * cdMul) {
          b.state = 'chase'; b.t = 0;
          b.cooldown = def.cooldown * cdMul * (0.8 + (p.rand || 0.5) * 0.4);
        }
        break;
      }
      case 'stagger': {
        if (b.t >= 0.42) { b.state = 'chase'; b.t = 0; }
        break;
      }
    }

    if (b.state !== prev) intent.stateChanged = true;
    if (intent.face != null) b.facing = intent.face;
    return intent;
  }

  /** Damage intake shared by all enemies. Returns {applied, killed, staggered}. */
  function applyDamage(b, hp, amount, staggerThreshold) {
    if (b.state === 'dead' || amount <= 0) return { applied: 0, killed: false, staggered: false, hp };
    const applied = Math.min(hp, Math.round(amount));
    hp -= applied;
    b.hitFlash = 0.18;
    let staggered = false;
    if (hp <= 0) { b.state = 'dead'; b.t = 0; b.deathT = 0; return { applied, killed: true, staggered: false, hp: 0 }; }
    b.staggerBank += applied;
    const thr = staggerThreshold || 22;
    if (b.def.behaviour !== 'boss' && b.staggerBank >= thr) {
      b.staggerBank = 0; b.state = 'stagger'; b.t = 0; staggered = true;
    } else if (b.def.behaviour === 'boss' && b.staggerBank >= thr * 4) {
      b.staggerBank = 0; // boss only flinches visually, never loses its turn
    }
    return { applied, killed: false, staggered, hp };
  }

  return { makeBrain, step, applyDamage, STATES };
});
