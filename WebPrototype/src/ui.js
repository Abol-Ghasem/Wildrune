/* WILDRUNE — UI layer: HUD, panels, menus, toasts, damage numbers. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else { root.WR = root.WR || {}; Object.assign(root.WR, factory(root)); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const D = root.WR;
  const $ = id => document.getElementById(id);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

  const ICONS = {
    leaf:    '<path d="M16 27C8 22 6 12 12 5c8 1 15 7 14 16-3 5-7 7-10 6z" fill="#7fce5c"/><path d="M13 26C15 19 18 13 23 8" stroke="#2f6b2c" stroke-width="1.6" fill="none"/>',
    timber:  '<rect x="3" y="11" width="26" height="10" rx="2" fill="#7a5c3a"/><ellipse cx="5" cy="16" rx="3" ry="5" fill="#a8825a"/><ellipse cx="5" cy="16" rx="1.5" ry="2.6" fill="#6b4f30"/><path d="M12 12v8M19 12v8" stroke="#5d452b" stroke-width="1.2"/>',
    ore:     '<path d="M6 20l6-11 9-3 6 9-5 10-11 1z" fill="#6f7a76"/><path d="M13 12l4 3-2 5" stroke="#d59a52" stroke-width="2.2" fill="none"/><circle cx="21" cy="14" r="2" fill="#d59a52"/>',
    crystal: '<path d="M16 2l7 12-7 16-7-16z" fill="#7fd8ff" opacity=".92"/><path d="M16 2v28M9 14h14" stroke="#d8f4ff" stroke-width="1.2"/>',
    essence: '<circle cx="16" cy="17" r="9" fill="#9b6bff" opacity=".85"/><circle cx="16" cy="17" r="4.5" fill="#e0b8ff"/><path d="M16 3v5M16 26v4M4 17h4M24 17h4" stroke="#c46bff" stroke-width="2"/>',
    ingot:   '<path d="M5 20l4-7h14l4 7-3 4H8z" fill="#9aa4ad"/><path d="M9 13h14l-2 4H11z" fill="#cfd8e0"/><path d="M13 18h6" stroke="#6fe3ff" stroke-width="1.8"/>',
    salve:   '<path d="M12 4h8v5l4 6v11a3 3 0 01-3 3H11a3 3 0 01-3-3V15l4-6z" fill="#3f7a52"/><path d="M9 18h14v8a2 2 0 01-2 2H11a2 2 0 01-2-2z" fill="#7ce89a"/><rect x="11" y="2" width="10" height="3" rx="1" fill="#c9a86a"/>',
    elixir:  '<path d="M12 4h8v5l5 7v10a3 3 0 01-3 3H10a3 3 0 01-3-3V16l5-7z" fill="#5a3f7a"/><path d="M8 19h16v7a2 2 0 01-2 2H10a2 2 0 01-2-2z" fill="#d17bff"/><rect x="11" y="2" width="10" height="3" rx="1" fill="#e2c179"/><circle cx="14" cy="23" r="1.5" fill="#fff"/>',
    tonic:   '<path d="M13 3h6v6l4 5v13a2 2 0 01-2 2H11a2 2 0 01-2-2V14l4-5z" fill="#2f6b4a"/><path d="M9 17h14v10a2 2 0 01-2 2H11a2 2 0 01-2-2z" fill="#63c883"/><path d="M14 20l3 3-3 3" stroke="#fff" stroke-width="1.6" fill="none"/>',
    draught: '<path d="M11 4h10v6l4 6v11a3 3 0 01-3 3H10a3 3 0 01-3-3V16l4-6z" fill="#2f5d7c"/><path d="M8 18h16v9a2 2 0 01-2 2H10a2 2 0 01-2-2z" fill="#8fd8ff"/><path d="M16 20v7M12.5 23.5h7" stroke="#fff" stroke-width="1.8"/>',
    ember:   '<circle cx="16" cy="20" r="9" fill="#8a3a2a"/><path d="M16 8c4 5 6 7 6 11a6 6 0 11-12 0c0-4 2-6 6-11z" fill="#ff9a3c"/><path d="M16 15c2 3 3 4 3 6a3 3 0 11-6 0c0-2 1-3 3-6z" fill="#ffe08a"/>',
    hone:    '<path d="M6 24L22 6l4 4L10 28z" fill="#cfd8e0"/><path d="M22 6l4 4 2-6z" fill="#e2c179"/><path d="M9 23l3 3" stroke="#6fe3ff" stroke-width="2"/>',
    charm:   '<circle cx="16" cy="18" r="9" fill="none" stroke="#e2c179" stroke-width="2.4"/><path d="M16 11l3 5-3 5-3-5z" fill="#6fe3ff"/><path d="M16 3v6" stroke="#e2c179" stroke-width="2"/>',
    boots:   '<path d="M9 5h6v13l9 4v7H9z" fill="#6b5335"/><path d="M9 22h15v7H9z" fill="#4a3a26"/><path d="M12 9h3M12 13h3" stroke="#e2c179" stroke-width="1.6"/>',
    lantern: '<path d="M12 3h8v3h-8z" fill="#a8894c"/><path d="M10 7h12l2 16H8z" fill="#3a4a44"/><path d="M12 9h8l1.4 12H10.6z" fill="#ffe6a8"/><circle cx="16" cy="15" r="3.4" fill="#fff8dc"/><path d="M14 1h4v2h-4z" fill="#a8894c"/>',
    relic:   '<path d="M16 2l6 8-6 20-6-20z" fill="#ffd98a"/><path d="M16 2v28M10 10h12" stroke="#a8781f" stroke-width="1.3"/><circle cx="16" cy="12" r="2.6" fill="#fff6d8"/>'
  };
  const icon = k => '<svg viewBox="0 0 32 32">' + (ICONS[k] || ICONS.ore) + '</svg>';

  const UI = {
    game: null, settings: { sens: 1.0, invert: false, quality: 'medium', vol: 0.7, music: 0.45, dmg: true, fps: false },
    openPanel: null, lastRegion: null, regionTimer: 0, craftTab: 'Consumables',

    init(game) {
      this.game = game;
      this.loadSettings();
      document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => this.closePanel());
      const bind = (id, fn) => { const e = $(id); if (e) e.onclick = () => { D.Audio.sfx('ui'); fn(); }; };
      bind('btnNew', () => game.newGame());
      bind('btnContinue', () => game.continueGame());
      bind('btnSettings', () => this.openSettings('menu'));
      bind('btnSettings2', () => this.openSettings('pause'));
      bind('btnControls', () => this.openControls('menu'));
      bind('btnControls2', () => this.openControls('pause'));
      bind('btnSettingsBack', () => { this.hide('settings'); this.show(this._settingsFrom); this.saveSettings(); });
      bind('btnControlsBack', () => { this.hide('controls'); this.show(this._controlsFrom); });
      bind('btnResume', () => game.resume());
      bind('btnSave', () => game.save(true));
      bind('btnQuit', () => game.quitToMenu());
      bind('btnRespawn', () => game.respawn());
      bind('btnEndContinue', () => game.afterEnding());
      bind('btnEndMenu', () => game.quitToMenu());
      bind('loreClose', () => game.closeLore());
      const s = this.settings;
      const wire = (id, key, parse) => { const e = $(id); if (!e) return; e.oninput = () => { s[key] = parse ? parse(e) : e.value; this.applySettings(); this.saveSettings(); }; };
      wire('setSens', 'sens', e => parseFloat(e.value));
      wire('setInvert', 'invert', e => e.checked);
      wire('setQuality', 'quality');
      wire('setVol', 'vol', e => parseFloat(e.value));
      wire('setMusic', 'music', e => parseFloat(e.value));
      wire('setDmg', 'dmg', e => e.checked);
      wire('setFps', 'fps', e => e.checked);
      this.applySettings();
      this.buildHotbar();
    },

    loadSettings() {
      try { const raw = localStorage.getItem('wildrune.settings'); if (raw) Object.assign(this.settings, JSON.parse(raw)); } catch (e) {}
    },
    saveSettings() { try { localStorage.setItem('wildrune.settings', JSON.stringify(this.settings)); } catch (e) {} },
    applySettings() {
      const s = this.settings;
      $('setSens').value = s.sens; $('setInvert').checked = s.invert; $('setQuality').value = s.quality;
      $('setVol').value = s.vol; $('setMusic').value = s.music; $('setDmg').checked = s.dmg; $('setFps').checked = s.fps;
      D.Audio.setVolume(s.vol); D.Audio.setMusicVolume(s.music);
      $('fps').style.display = s.fps ? 'block' : 'none';
      if (this.game && this.game.applyQuality) this.game.applyQuality(s.quality);
    },
    openSettings(from) { this._settingsFrom = from; this.hide(from); this.show('settings'); },
    openControls(from) { this._controlsFrom = from; this.hide(from); this.show('controls'); },

    show(id) { const e = $(id); if (e) e.classList.remove('hidden'); },
    hide(id) { const e = $(id); if (e) e.classList.add('hidden'); },

    // ---- HUD ----
    hud(attrs, inv) {
      const hp = Math.max(0, attrs.health) / attrs.maxHealth * 100;
      const sp = Math.max(0, attrs.stamina) / attrs.maxStamina * 100;
      $('hpFill').style.width = hp + '%';
      $('spFill').style.width = sp + '%';
      $('hpText').textContent = Math.ceil(attrs.health) + ' / ' + attrs.maxHealth;
      $('spText').textContent = Math.ceil(attrs.stamina) + ' / ' + attrs.maxStamina;
      $('spBar').classList.toggle('low', sp < 25);
      this.updateHotbar(inv);
    },
    buildHotbar() {
      const hb = $('hotbar'); hb.innerHTML = '';
      this.hotIds = ['salve', 'elixir', 'tonic', 'ember'];
      this.hotIds.forEach((id, i) => {
        const s = el('div', 'slot empty');
        s.innerHTML = '<span class="key">' + (i + 1) + '</span>' + icon(D.ITEMS[id].icon) + '<span class="qty">0</span>';
        s.title = D.ITEMS[id].name; s.dataset.item = id; hb.appendChild(s);
      });
    },
    updateHotbar(inv) {
      document.querySelectorAll('#hotbar .slot').forEach(s => {
        const n = inv.count(s.dataset.item);
        s.querySelector('.qty').textContent = n;
        s.classList.toggle('empty', n === 0);
      });
    },
    objective(o) {
      const t = $('objTrack');
      if (!o) { t.querySelector('.title').textContent = 'All objectives complete'; t.querySelector('.desc').textContent = 'The lands are yours to wander.'; return; }
      t.querySelector('.title').textContent = o.title;
      t.querySelector('.desc').textContent = o.desc;
    },
    region(name) {
      if (this.lastRegion === name) return;
      this.lastRegion = name;
      const r = $('region'); r.querySelector('.n').textContent = name;
      r.style.opacity = '1'; clearTimeout(this._rt);
      this._rt = setTimeout(() => { r.style.opacity = '0'; }, 3200);
    },
    prompt(text, key) {
      const p = $('prompt');
      if (!text) { p.style.display = 'none'; return; }
      p.style.display = 'block'; p.querySelector('b').textContent = key || 'E'; p.querySelector('span').textContent = text;
    },
    gather(frac) {
      const g = $('gatherRing');
      if (frac == null) { g.style.display = 'none'; return; }
      g.style.display = 'block';
      $('gatherArc').style.strokeDashoffset = (144.5 * (1 - frac)).toFixed(1);
    },
    boss(hp, max, phase) {
      const b = $('bossbar');
      if (hp == null) { b.style.display = 'none'; return; }
      b.style.display = 'block';
      $('bossFill').style.width = Math.max(0, hp / max * 100) + '%';
      $('bossPhase').textContent = phase === 2 ? 'Phase II · The Unbound' : 'Phase I · The Warden';
    },
    toast(msg, kind) {
      const t = el('div', 'toast ' + (kind || ''), msg);
      $('toasts').appendChild(t);
      setTimeout(() => { t.style.transition = 'opacity .4s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 420); }, 2600);
      const box = $('toasts');
      while (box.children.length > 5) box.firstChild.remove();
    },
    damage(x, y, amount, kind) {
      if (!this.settings.dmg) return;
      const d = el('div', 'dmg ' + (kind || ''), (kind === 'heal' ? '+' : '') + Math.round(amount));
      d.style.left = (x + (Math.random() - 0.5) * 26) + 'px'; d.style.top = y + 'px';
      if (!kind) d.style.color = '#ffe9b8';
      $('dmgLayer').appendChild(d);
      setTimeout(() => d.remove(), 900);
    },
    hurtFlash(strength) {
      const f = $('hurtFlash'); f.style.opacity = String(Math.min(0.95, strength));
      clearTimeout(this._ht); this._ht = setTimeout(() => { f.style.opacity = '0'; }, 130);
    },
    corruptFlash(on) { $('corruptFlash').style.opacity = on ? '0.55' : '0'; },

    // ---- Panels ----
    closePanel() {
      ['inventory', 'crafting', 'journal'].forEach(id => this.hide(id));
      this.openPanel = null;
      if (this.game) this.game.onPanelClosed();
    },
    togglePanel(name) {
      if (this.openPanel === name) { this.closePanel(); return; }
      ['inventory', 'crafting', 'journal'].forEach(id => this.hide(id));
      this.openPanel = name; this.show(name);
      if (name === 'inventory') this.renderInventory();
      if (name === 'crafting') this.renderCrafting();
      if (name === 'journal') this.renderJournal();
    },
    renderInventory() {
      const g = this.game, grid = $('invGrid'); grid.innerHTML = '';
      const list = g.inv.list();
      if (!list.length) { grid.innerHTML = '<div class="empty-note">Your satchel is empty. Gather from the land.</div>'; }
      for (const { item, qty } of list) {
        const c = el('div', 'card');
        const usable = !!item.use;
        c.innerHTML = '<span class="type">' + item.type + '</span>' +
          '<div class="top">' + icon(item.icon) + '<div><div class="nm">' + item.name + '</div><div class="qt">×' + qty + '</div></div></div>' +
          '<div class="ds">' + item.desc + '</div>';
        if (usable) {
          const b = el('button', 'btn', item.use.upgrade ? 'Apply' : item.use.equip ? 'Equip' : 'Use');
          b.onclick = () => { g.useItem(item.id); this.renderInventory(); };
          c.appendChild(b);
        }
        grid.appendChild(c);
      }
      $('invCount').textContent = g.inv.totalItems() + ' items carried';
    },
    renderCrafting() {
      const g = this.game, grid = $('craftGrid');
      const station = g.nearForge ? 'forge' : 'any';
      const cats = ['Consumables', 'Materials', 'Upgrades', 'Tools'];
      const tabs = $('craftTabs'); tabs.innerHTML = '';
      cats.forEach(cat => {
        const b = el('button', 'tab' + (this.craftTab === cat ? ' on' : ''), cat);
        b.onclick = () => { this.craftTab = cat; D.Audio.sfx('ui'); this.renderCrafting(); };
        tabs.appendChild(b);
      });
      grid.innerHTML = '';
      const rows = D.Crafting.available(g.inv, station).filter(r => r.recipe.cat === this.craftTab);
      if (!rows.length) grid.innerHTML = '<div class="empty-note">No recipes in this category.</div>';
      for (const { recipe, check } of rows) {
        const out = D.ITEMS[recipe.out];
        const c = el('div', 'card');
        let reqs = '<div class="reqs">';
        for (const k of Object.keys(recipe.in)) {
          const need = recipe.in[k], have = g.inv.count(k);
          reqs += '<span class="req' + (have < need ? ' miss' : '') + '">' + D.ITEMS[k].name + ' ' + have + '/' + need + '</span>';
        }
        reqs += '</div>';
        c.innerHTML = '<span class="type">' + (recipe.station === 'forge' ? 'Workbench' : 'Anywhere') + '</span>' +
          '<div class="top">' + icon(out.icon) + '<div><div class="nm">' + out.name + (recipe.qty > 1 ? ' ×' + recipe.qty : '') + '</div>' +
          '<div class="qt">' + recipe.desc + '</div></div></div>' + reqs + '<div class="ds">' + out.desc + '</div>';
        const b = el('button', 'btn', check.ok ? 'Craft' : (!check.stationOk ? 'Needs Workbench' : (!check.spaceOk ? 'Stack Full' : 'Missing Materials')));
        b.disabled = !check.ok;
        b.onclick = () => { g.craft(recipe.id); this.renderCrafting(); };
        c.appendChild(b); grid.appendChild(c);
      }
      $('stationNote').textContent = station === 'forge' ? 'At a workbench — all recipes available' : 'Field crafting only — find a workbench for advanced recipes';
    },
    renderJournal() {
      const g = this.game, list = $('journalList'); list.innerHTML = '';
      for (const o of g.prog.journal()) {
        const r = el('div', 'jrow' + (o.done ? ' done' : '') + (o.active ? ' active' : ''));
        r.innerHTML = '<div class="mark">' + (o.done ? '✓' : o.active ? '◆' : '') + '</div>' +
          '<div><div class="jt">' + o.title + '</div><div class="jd">' + o.desc + '</div>' +
          '<div class="kind">' + (o.kind === 'main' ? 'Main Path' : 'Optional Discovery') + '</div></div>';
        list.appendChild(r);
      }
      const loreRead = Object.keys(g.prog.loreRead).length;
      const extra = el('div', '', '<div class="rule"></div><div style="font-size:12.5px;color:var(--dim);line-height:1.9">' +
        'Relics recovered: <b style="color:var(--gold)">' + g.prog.relicCount() + ' / 3</b><br>' +
        'Memory stones read: <b style="color:var(--gold)">' + loreRead + ' / 4</b><br>' +
        'Resources gathered: <b style="color:var(--gold)">' + g.prog.gathered + '</b></div>');
      list.appendChild(extra);
      $('journalPct').textContent = g.prog.completionPercent() + '% complete';
    },
    showLore(title, text) { $('loreTitle').textContent = title; $('loreText').textContent = text; this.show('lore'); },

    // ---- Screens ----
    refreshMenu() {
      const sum = D.SaveSystem.summary(localStorage);
      const btn = $('btnContinue'), info = $('saveInfo');
      if (sum) {
        btn.disabled = false;
        const mins = Math.floor((sum.playtime || 0) / 60);
        info.innerHTML = 'Saved journey · ' + sum.percent + '% complete<br>' + sum.checkpoint + ' · ' + mins + ' min played<br>' +
          '<span style="color:var(--gold-dim)">' + sum.objective + '</span>' + (sum.bossDefeated ? '<br><span style="color:var(--corrupt)">The Warden has fallen.</span>' : '');
      } else { btn.disabled = true; info.textContent = 'No saved journey yet.'; }
    },
    death(msg, secs) { $('deathMsg').textContent = msg; $('deathCount').textContent = secs; this.show('death'); },
    ending(stats) {
      $('endStory').innerHTML = 'The Warden kneels, and the runes go quiet.<br>' +
        'You press the three wardstones into the Heartroot, and the door that was never meant to open<br>closes the way it should have — from this side.<br><br>' +
        'The forest does not thank you. It simply begins, slowly, to be a forest again.';
      const g = $('endStats'); g.innerHTML = '';
      const rows = [['Objectives', stats.percent + '%'], ['Time in the Lands', stats.time], ['Creatures Felled', stats.kills], ['Resources Gathered', stats.gathered], ['Deaths', stats.deaths], ['Memories Recovered', stats.lore + ' / 4']];
      for (const [k, v] of rows) g.appendChild(el('div', '', '<b>' + v + '</b><span>' + k + '</span>'));
      this.show('ending');
    },
    loading(pct, tip) {
      $('loadBar').querySelector('i').style.width = pct + '%';
      if (tip) $('loadTip').textContent = tip;
    }
  };
  return { UI, icon, ICONS };
});
