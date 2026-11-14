/* WILDRUNE — combat + attributes. Pure logic: no rendering, fully testable. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else { root.WR = root.WR || {}; Object.assign(root.WR, factory(root)); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const D = (typeof module === 'object' && module.exports) ? require('./data.js') : root.WR;
  const { CONFIG } = D;

  /** Angle-aware cone test used for ALL melee hit detection (player and AI). */
  function inArc(ax, az, facing, tx, tz, range, arc, targetRadius) {
    const dx = tx - ax, dz = tz - az;
    const dist = Math.hypot(dx, dz);
    if (dist > range + (targetRadius || 0)) return false;
    if (dist < 0.0001) return true;
    const fx = Math.sin(facing), fz = Math.cos(facing);
    const dot = (dx * fx + dz * fz) / dist;
    return dot >= Math.cos(arc / 2);
  }

  /** A single swing. Guarantees each target is damaged at most once. */
  class AttackState {
    constructor(kind, spec) {
      this.kind = kind;
      this.spec = spec || CONFIG.combat[kind];
      this.t = 0; this.phase = 'windup'; this.hitSet = new Set(); this.done = false;
      this.total = this.spec.windup + this.spec.active + this.spec.recover;
    }
    get active() { return this.phase === 'active'; }
    update(dt) {
      if (this.done) return;
      this.t += dt;
      const s = this.spec;
      if (this.t < s.windup) this.phase = 'windup';
      else if (this.t < s.windup + s.active) this.phase = 'active';
      else if (this.t < this.total) this.phase = 'recover';
      else { this.phase = 'done'; this.done = true; }
    }
    /** Returns true only on the first valid contact with this id during this swing. */
    tryHit(id) {
      if (!this.active || this.hitSet.has(id)) return false;
      this.hitSet.add(id); return true;
    }
    get progress() { return Math.min(1, this.t / this.total); }
  }

  class Attributes {
    constructor(opts) {
      opts = opts || {};
      this.baseMaxHealth = opts.maxHealth || CONFIG.player.maxHealth;
      this.baseMaxStamina = opts.maxStamina || CONFIG.player.maxStamina;
      this.healthUpgrades = opts.healthUpgrades || 0;
      this.weaponUpgrades = opts.weaponUpgrades || 0;
      this.speedUpgrades = opts.speedUpgrades || 0;
      this.health = opts.health != null ? opts.health : this.maxHealth;
      this.stamina = opts.stamina != null ? opts.stamina : this.maxStamina;
      this.invuln = 0; this.staminaDelay = 0; this.corruption = 0;
      this.buffs = {}; this.dead = this.health <= 0;
    }
    get maxHealth() { return this.baseMaxHealth + this.healthUpgrades * 20; }
    get maxStamina() { return this.baseMaxStamina; }
    get damageMul() { return 1 + this.weaponUpgrades * 0.25; }
    get speedMul() { return 1 + this.speedUpgrades * 0.10; }

    attackDamage(kind) {
      const s = CONFIG.combat[kind]; if (!s) return 0;
      return Math.round(s.damage * this.damageMul);
    }
    canSpend(cost) { return this.stamina >= cost; }
    spend(cost) {
      if (cost <= 0) return true;
      if (this.stamina < cost) return false;
      this.stamina -= cost; this.staminaDelay = CONFIG.player.staminaRegenDelay; return true;
    }
    /** Returns damage actually applied (0 while invulnerable or dead). */
    takeDamage(amount, opts) {
      opts = opts || {};
      if (this.dead || amount <= 0) return 0;
      if (this.invuln > 0 && !opts.pierce) return 0;
      const applied = Math.min(this.health, Math.round(amount));
      this.health -= applied;
      if (!opts.noIFrame) this.invuln = Math.max(this.invuln, opts.iframe != null ? opts.iframe : CONFIG.combat.playerIFrameAfterHit);
      if (this.health <= 0) { this.health = 0; this.dead = true; }
      return applied;
    }
    heal(amount) {
      if (this.dead || amount <= 0) return 0;
      const before = this.health;
      this.health = Math.min(this.maxHealth, this.health + Math.round(amount));
      return this.health - before;
    }
    restoreStamina(amount) {
      const before = this.stamina;
      this.stamina = Math.min(this.maxStamina, this.stamina + amount);
      return this.stamina - before;
    }
    applyBuff(name, time) { this.buffs[name] = Math.max(this.buffs[name] || 0, time); }
    cleanse() { this.corruption = 0; }

    update(dt, sprinting) {
      if (this.invuln > 0) this.invuln = Math.max(0, this.invuln - dt);
      for (const k of Object.keys(this.buffs)) {
        this.buffs[k] -= dt; if (this.buffs[k] <= 0) delete this.buffs[k];
      }
      if (this.corruption > 0 && !this.dead) {
        this.corruption = Math.max(0, this.corruption - dt);
        this.health = Math.max(1, this.health - 3 * dt); // corruption never kills on its own
      }
      if (sprinting) { this.staminaDelay = CONFIG.player.staminaRegenDelay; }
      else if (!this.dead) {
        // Consume the regen delay first, then regenerate with the remaining slice of
        // this frame. Prevents a dead frame where delay hits 0 but no regen occurs.
        let regenDt = dt;
        if (this.staminaDelay > 0) {
          const used = Math.min(this.staminaDelay, dt);
          this.staminaDelay -= used; regenDt = dt - used;
        }
        if (regenDt > 0) {
          const mul = this.buffs.stamina ? 2 : 1;
          this.stamina = Math.min(this.maxStamina, this.stamina + CONFIG.player.staminaRegen * mul * regenDt);
        }
      }
    }
    serialize() {
      return {
        health: this.health, stamina: this.stamina,
        healthUpgrades: this.healthUpgrades, weaponUpgrades: this.weaponUpgrades, speedUpgrades: this.speedUpgrades
      };
    }
  }

  /** Consumable / upgrade application. Returns a result object; never throws. */
  function useItem(inv, attrs, id) {
    const def = D.ITEMS[id];
    if (!def || !def.use) return { ok: false, reason: 'not_usable' };
    if (inv.count(id) <= 0) return { ok: false, reason: 'none_left' };
    const u = def.use;
    if (u.heal && attrs.health >= attrs.maxHealth && !u.cleanse) return { ok: false, reason: 'already_full' };
    if (u.upgrade) {
      const cap = { weapon: 3, health: 3, speed: 2 }[u.upgrade];
      const cur = { weapon: attrs.weaponUpgrades, health: attrs.healthUpgrades, speed: attrs.speedUpgrades }[u.upgrade];
      if (cur >= cap) return { ok: false, reason: 'max_upgrade' };
    }
    if (u.equip === 'lantern' && attrs.lanternEquipped) return { ok: false, reason: 'already_equipped' };

    inv.remove(id, 1);
    const res = { ok: true, id, healed: 0, effects: [] };
    if (u.heal) { res.healed = attrs.heal(u.heal); res.effects.push('heal'); }
    if (u.stamina) { attrs.restoreStamina(u.stamina); res.effects.push('stamina'); }
    if (u.buff) { attrs.applyBuff(u.buff, u.buffTime || 15); res.effects.push('buff:' + u.buff); }
    if (u.cleanse) { attrs.cleanse(); res.effects.push('cleanse'); }
    if (u.upgrade) {
      if (u.upgrade === 'weapon') attrs.weaponUpgrades++;
      if (u.upgrade === 'health') { attrs.healthUpgrades++; attrs.health += 20; }
      if (u.upgrade === 'speed') attrs.speedUpgrades++;
      res.effects.push('upgrade:' + u.upgrade);
    }
    if (u.equip) { attrs.lanternEquipped = true; res.effects.push('equip:' + u.equip); }
    if (u.burst) { res.burst = u.burst; res.burstRadius = u.burstRadius; res.effects.push('burst'); }
    return res;
  }

  return { inArc, AttackState, Attributes, useItem };
});
