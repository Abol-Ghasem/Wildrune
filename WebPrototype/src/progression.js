/* WILDRUNE — progression + save/load. Pure logic, testable across simulated restarts. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else { root.WR = root.WR || {}; Object.assign(root.WR, factory(root)); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const D = (typeof module === 'object' && module.exports) ? require('./data.js') : root.WR;
  const { CONFIG, OBJECTIVES } = D;

  class Progression {
    constructor(state) {
      this.completed = {};        // objectiveId -> true
      this.flags = {};            // arbitrary world flags
      this.relics = {};           // relic id -> true
      this.loreRead = {};
      this.gathered = 0;
      this.craftedSalve = false;
      this.bossDefeated = false;
      this.endingSeen = false;
      this.listeners = [];
      if (state) this.load(state);
    }
    onChange(fn) { this.listeners.push(fn); }
    emit(evt) { for (const f of this.listeners) { try { f(evt); } catch (e) { /* listener isolation */ } } }

    load(s) {
      if (!s || typeof s !== 'object') return;
      this.completed = Object.assign({}, s.completed);
      this.flags = Object.assign({}, s.flags);
      this.relics = Object.assign({}, s.relics);
      this.loreRead = Object.assign({}, s.loreRead);
      this.gathered = Number(s.gathered) || 0;
      this.craftedSalve = !!s.craftedSalve;
      this.bossDefeated = !!s.bossDefeated;
      this.endingSeen = !!s.endingSeen;
    }
    serialize() {
      return {
        completed: this.completed, flags: this.flags, relics: this.relics, loreRead: this.loreRead,
        gathered: this.gathered, craftedSalve: this.craftedSalve,
        bossDefeated: this.bossDefeated, endingSeen: this.endingSeen
      };
    }

    complete(id) {
      if (this.completed[id]) return false;
      const o = OBJECTIVES.find(x => x.id === id);
      if (!o) return false;
      this.completed[id] = true;
      this.emit({ type: 'objective', id, title: o.title });
      return true;
    }
    isDone(id) { return !!this.completed[id]; }
    relicCount() { return Object.keys(this.relics).filter(k => this.relics[k]).length; }
    hasAllRelics() { return this.relicCount() >= 3; }

    addRelic(id) {
      if (this.relics[id]) return false;
      this.relics[id] = true;
      this.emit({ type: 'relic', id, count: this.relicCount() });
      if (this.hasAllRelics()) this.complete('relics');
      return true;
    }
    readLore(id) {
      if (this.loreRead[id]) return false;
      this.loreRead[id] = true;
      this.emit({ type: 'lore', id });
      if (Object.keys(this.loreRead).length >= 4) this.complete('lore');
      return true;
    }
    noteGather() { this.gathered++; this.evaluate(); }
    noteCraft(itemId) { if (itemId === 'salve') { this.craftedSalve = true; this.evaluate(); } }
    evaluate() {
      if (this.gathered >= 5 && this.craftedSalve) this.complete('gather');
    }
    unsealShrine() {
      if (!this.hasAllRelics()) return false;
      if (this.flags.shrineOpen) return false;
      this.flags.shrineOpen = true;
      this.complete('unseal');
      this.emit({ type: 'shrine_open' });
      return true;
    }
    defeatBoss() {
      if (this.bossDefeated) return false;
      this.bossDefeated = true;
      this.complete('warden');
      this.emit({ type: 'boss_defeated' });
      return true;
    }
    /** Ordered objective list for the journal, with the active one flagged. */
    journal() {
      const order = OBJECTIVES.map(o => ({ ...o, done: this.isDone(o.id) }));
      const activeMain = order.find(o => o.kind === 'main' && !o.done);
      return order.map(o => ({ ...o, active: !!activeMain && o.id === activeMain.id }));
    }
    activeObjective() { return this.journal().find(o => o.active) || null; }
    completionPercent() {
      const total = OBJECTIVES.length;
      return Math.round((Object.keys(this.completed).filter(k => OBJECTIVES.some(o => o.id === k)).length / total) * 100);
    }
  }

  // ---- Save system -------------------------------------------------------
  const SAVE_KEY = 'wildrune.save.v3';

  const SaveSystem = {
    key: SAVE_KEY,
    /** storage: {getItem,setItem,removeItem} — localStorage in browser, Map-backed in tests. */
    build(state) {
      return {
        version: CONFIG.saveVersion,
        gameVersion: CONFIG.version,
        timestamp: Date.now(),
        playtime: Math.round(state.playtime || 0),
        player: state.player, attrs: state.attrs, inventory: state.inventory,
        progression: state.progression, checkpoint: state.checkpoint,
        world: state.world || {}
      };
    },
    write(storage, state) {
      try {
        const payload = SaveSystem.build(state);
        storage.setItem(SAVE_KEY, JSON.stringify(payload));
        return { ok: true, bytes: JSON.stringify(payload).length };
      } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
    },
    read(storage) {
      let raw = null;
      try { raw = storage.getItem(SAVE_KEY); } catch (e) { return { ok: false, error: 'storage_unavailable' }; }
      if (!raw) return { ok: false, error: 'no_save' };
      let data;
      try { data = JSON.parse(raw); } catch (e) { return { ok: false, error: 'corrupt_json' }; }
      const v = SaveSystem.validate(data);
      if (!v.ok) return { ok: false, error: v.error };
      return { ok: true, data: SaveSystem.migrate(data) };
    },
    validate(d) {
      if (!d || typeof d !== 'object') return { ok: false, error: 'not_object' };
      if (typeof d.version !== 'number') return { ok: false, error: 'no_version' };
      if (d.version > CONFIG.saveVersion) return { ok: false, error: 'future_version' };
      if (!d.player || typeof d.player.x !== 'number' || typeof d.player.z !== 'number') return { ok: false, error: 'bad_player' };
      if (!d.inventory || typeof d.inventory !== 'object') return { ok: false, error: 'bad_inventory' };
      if (!d.progression || typeof d.progression !== 'object') return { ok: false, error: 'bad_progression' };
      if (!Number.isFinite(d.player.x) || !Number.isFinite(d.player.z)) return { ok: false, error: 'nan_position' };
      return { ok: true };
    },
    migrate(d) {
      const out = JSON.parse(JSON.stringify(d));
      if (out.version < 2) { out.progression.loreRead = out.progression.loreRead || {}; out.version = 2; }
      if (out.version < 3) { out.world = out.world || {}; out.playtime = out.playtime || 0; out.version = 3; }
      out.attrs = out.attrs || {};
      out.checkpoint = out.checkpoint || { x: 0, z: -150, name: 'Arrival Clearing' };
      return out;
    },
    exists(storage) { try { return !!storage.getItem(SAVE_KEY); } catch (e) { return false; } },
    clear(storage) { try { storage.removeItem(SAVE_KEY); return true; } catch (e) { return false; } },
    summary(storage) {
      const r = SaveSystem.read(storage);
      if (!r.ok) return null;
      const d = r.data;
      const p = new Progression(d.progression);
      return {
        timestamp: d.timestamp, playtime: d.playtime || 0,
        percent: p.completionPercent(), bossDefeated: p.bossDefeated,
        checkpoint: (d.checkpoint && d.checkpoint.name) || 'Unknown',
        objective: (p.activeObjective() || {}).title || 'Complete'
      };
    }
  };

  return { Progression, SaveSystem, SAVE_KEY };
});
