/* WILDRUNE — inventory + crafting logic. Pure, deterministic, unit-tested. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else { root.WR = root.WR || {}; Object.assign(root.WR, factory(root)); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const D = (typeof module === 'object' && module.exports) ? require('./data.js') : root.WR;
  const { ITEMS, RECIPES } = D;

  class Inventory {
    constructor(items) { this.slots = {}; if (items) this.load(items); }

    load(obj) {
      this.slots = {};
      if (!obj || typeof obj !== 'object') return;
      for (const k of Object.keys(obj)) {
        const n = Math.floor(Number(obj[k]));
        if (ITEMS[k] && Number.isFinite(n) && n > 0) this.slots[k] = Math.min(n, ITEMS[k].stack);
      }
    }
    serialize() { return Object.assign({}, this.slots); }
    count(id) { return this.slots[id] || 0; }
    has(id, n) { return this.count(id) >= (n || 1); }
    totalItems() { return Object.values(this.slots).reduce((a, b) => a + b, 0); }
    list() {
      return Object.keys(this.slots).filter(k => ITEMS[k]).map(k => ({ item: ITEMS[k], qty: this.slots[k] }))
        .sort((a, b) => a.item.name.localeCompare(b.item.name));
    }

    /** Add up to qty; returns amount actually added (0 if unknown/full). */
    add(id, qty) {
      const def = ITEMS[id]; qty = Math.floor(Number(qty));
      if (!def || !Number.isFinite(qty) || qty <= 0) return 0;
      const cur = this.count(id);
      const room = def.stack - cur;
      const put = Math.min(room, qty);
      if (put <= 0) return 0;
      this.slots[id] = cur + put;
      return put;
    }
    /** Remove up to qty; returns amount actually removed. */
    remove(id, qty) {
      qty = Math.floor(Number(qty));
      if (!ITEMS[id] || !Number.isFinite(qty) || qty <= 0) return 0;
      const cur = this.count(id);
      const take = Math.min(cur, qty);
      if (take <= 0) return 0;
      const left = cur - take;
      if (left <= 0) delete this.slots[id]; else this.slots[id] = left;
      return take;
    }
    canAdd(id, qty) { const d = ITEMS[id]; return !!d && (d.stack - this.count(id)) >= qty; }
  }

  const Crafting = {
    recipe(id) { return RECIPES.find(r => r.id === id) || null; },

    /** Returns {ok, missing:{id:need}, stationOk} without mutating anything. */
    check(inv, recipeId, station) {
      const r = Crafting.recipe(recipeId);
      if (!r) return { ok: false, reason: 'unknown_recipe', missing: {}, stationOk: false };
      const stationOk = r.station === 'any' || r.station === (station || 'any');
      const missing = {};
      for (const k of Object.keys(r.in)) {
        const need = r.in[k], have = inv.count(k);
        if (have < need) missing[k] = need - have;
      }
      const outDef = ITEMS[r.out];
      const spaceOk = !!outDef && (outDef.stack - inv.count(r.out)) >= r.qty;
      return { ok: stationOk && Object.keys(missing).length === 0 && spaceOk, missing, stationOk, spaceOk, recipe: r };
    },

    /** Atomic: consumes inputs and grants output only if the whole craft is valid. */
    craft(inv, recipeId, station) {
      const c = Crafting.check(inv, recipeId, station);
      if (!c.ok) return { ok: false, check: c };
      const r = c.recipe;
      const backup = inv.serialize();
      for (const k of Object.keys(r.in)) inv.remove(k, r.in[k]);
      const added = inv.add(r.out, r.qty);
      if (added !== r.qty) { inv.load(backup); return { ok: false, check: c, reason: 'output_overflow' }; }
      return { ok: true, produced: r.out, qty: added, recipe: r };
    },

    available(inv, station) {
      return RECIPES.map(r => ({ recipe: r, check: Crafting.check(inv, r.id, station) }));
    }
  };

  return { Inventory, Crafting };
});
