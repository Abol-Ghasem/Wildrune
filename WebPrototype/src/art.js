/* WILDRUNE — procedural stylized art. All geometry generated in-code: no external assets. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else { root.WR = root.WR || {}; Object.assign(root.WR, factory(root)); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const T = root.THREE;

  const PAL = {
    trunk: 0x5a4632, trunkDark: 0x3d2f22,
    leafA: 0x4f8f4a, leafB: 0x6fae55, leafC: 0x3c6f42, leafGold: 0x9fb84a,
    rock: 0x7d8a86, rockDark: 0x5b6663,
    stone: 0xa9a694, stoneDark: 0x7e7c6c,
    corrupt: 0x7b3fa0, corruptGlow: 0xc46bff, corruptDark: 0x3a1d4f,
    playerCloth: 0x2f5d7c, playerTrim: 0xd9b45b, skin: 0xe0b48f, hair: 0x3a2a22,
    blade: 0xd8e6f2, rune: 0x6fe3ff,
    crystal: 0x7fd8ff, herb: 0x8fdc6a, ore: 0xc08a4a, gold: 0xf0c465
  };

  const mat = (color, opts) => new T.MeshLambertMaterial(Object.assign({ color, flatShading: true }, opts || {}));
  const glowMat = (color, i) => new T.MeshBasicMaterial({ color, transparent: true, opacity: i == null ? 1 : i });

  function jitter(geo, amt, rnd) {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      p.setXYZ(i, p.getX(i) + (rnd() - 0.5) * amt, p.getY(i) + (rnd() - 0.5) * amt, p.getZ(i) + (rnd() - 0.5) * amt);
    }
    geo.computeVertexNormals(); return geo;
  }
  function rng(seed) { let a = seed | 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  // ---- Environment pieces (returned as geometry+material for instancing) --
  function treeParts(kind) {
    if (kind === 'pine') {
      return {
        trunk: { geo: new T.CylinderGeometry(0.16, 0.34, 3.4, 6), y: 1.7, color: PAL.trunkDark },
        foliage: [
          { geo: new T.ConeGeometry(1.75, 2.6, 7), y: 3.5, color: PAL.leafC },
          { geo: new T.ConeGeometry(1.35, 2.2, 7), y: 4.9, color: PAL.leafA },
          { geo: new T.ConeGeometry(0.85, 1.7, 7), y: 6.2, color: PAL.leafB }
        ]
      };
    }
    return {
      trunk: { geo: new T.CylinderGeometry(0.22, 0.46, 3.8, 6), y: 1.9, color: PAL.trunk },
      foliage: [
        { geo: new T.IcosahedronGeometry(1.9, 0), y: 4.5, color: PAL.leafA, scale: [1.15, 0.85, 1.15] },
        { geo: new T.IcosahedronGeometry(1.35, 0), y: 5.7, color: PAL.leafB, off: [0.7, 0, 0.3] },
        { geo: new T.IcosahedronGeometry(1.15, 0), y: 5.3, color: PAL.leafC, off: [-0.8, 0, -0.4] }
      ]
    };
  }
  function rockGeo(kind, seed) {
    const r = rng(seed || 7);
    if (kind === 'slab') return jitter(new T.BoxGeometry(1.6, 0.7, 1.2, 1, 1, 1), 0.22, r);
    return jitter(new T.IcosahedronGeometry(1, 0), 0.28, r);
  }
  function grassGeo() {
    const g = new T.ConeGeometry(0.16, 0.9, 4, 1, true);
    g.translate(0, 0.45, 0); return g;
  }
  function pillarGeo(h, r, broken) {
    const g = new T.CylinderGeometry(r * 0.85, r, h, 8, 1);
    g.translate(0, h / 2, 0);
    if (broken) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) > h * 0.85) p.setY(i, p.getY(i) - Math.random() * h * 0.25); g.computeVertexNormals(); }
    return g;
  }

  // ---- Resource nodes ----------------------------------------------------
  function makeNode(kind) {
    const g = new T.Group();
    if (kind === 'herb') {
      for (let i = 0; i < 5; i++) {
        const b = new T.Mesh(new T.ConeGeometry(0.16, 0.75, 4), mat(PAL.herb));
        b.position.set((Math.random() - 0.5) * 0.6, 0.36, (Math.random() - 0.5) * 0.6);
        b.rotation.z = (Math.random() - 0.5) * 0.5; g.add(b);
      }
      const flower = new T.Mesh(new T.IcosahedronGeometry(0.16, 0), glowMat(0xfff2a8)); flower.position.y = 0.8; g.add(flower);
    } else if (kind === 'log') {
      const l = new T.Mesh(new T.CylinderGeometry(0.34, 0.38, 2.2, 7), mat(PAL.trunk));
      l.rotation.z = Math.PI / 2; l.position.y = 0.36; g.add(l);
      for (const s of [-1, 1]) { const c = new T.Mesh(new T.CircleGeometry(0.34, 7), mat(0x8a6b4a)); c.position.set(s * 1.11, 0.36, 0); c.rotation.y = s * Math.PI / 2; g.add(c); }
      const moss = new T.Mesh(new T.IcosahedronGeometry(0.3, 0), mat(PAL.leafC)); moss.position.set(0.3, 0.62, 0.1); moss.scale.y = 0.5; g.add(moss);
    } else if (kind === 'orerock') {
      const base = new T.Mesh(rockGeo('boulder', 21), mat(PAL.rockDark)); base.scale.setScalar(0.85); base.position.y = 0.6; g.add(base);
      for (let i = 0; i < 4; i++) {
        const v = new T.Mesh(new T.OctahedronGeometry(0.19, 0), glowMat(PAL.ore));
        v.position.set((Math.random() - 0.5) * 0.9, 0.6 + Math.random() * 0.6, (Math.random() - 0.5) * 0.9); g.add(v);
      }
    } else if (kind === 'crystal') {
      for (let i = 0; i < 4; i++) {
        const h = 0.7 + Math.random() * 1.1;
        const c = new T.Mesh(new T.ConeGeometry(0.2, h, 5), new T.MeshLambertMaterial({ color: PAL.crystal, emissive: 0x2b7fa8, flatShading: true, transparent: true, opacity: 0.92 }));
        c.position.set((Math.random() - 0.5) * 0.7, h / 2, (Math.random() - 0.5) * 0.7);
        c.rotation.set((Math.random() - 0.5) * 0.35, 0, (Math.random() - 0.5) * 0.35); g.add(c);
      }
      const light = new T.PointLight(0x7fd8ff, 0.7, 7); light.position.y = 1; g.add(light);
    }
    return g;
  }

  // ---- Humanoid rig (player) ---------------------------------------------
  function makePlayer() {
    const g = new T.Group(); const parts = {};
    const cloth = mat(PAL.playerCloth), trim = mat(PAL.playerTrim), skin = mat(PAL.skin);
    parts.hips = new T.Group(); parts.hips.position.y = 0.92; g.add(parts.hips);
    parts.torso = new T.Mesh(new T.CapsuleGeometry(0.27, 0.42, 2, 8), cloth); parts.torso.position.y = 0.34; parts.hips.add(parts.torso);
    const belt = new T.Mesh(new T.TorusGeometry(0.27, 0.05, 4, 10), trim); belt.rotation.x = Math.PI / 2; belt.position.y = 0.08; parts.hips.add(belt);
    parts.head = new T.Group(); parts.head.position.y = 0.78; parts.hips.add(parts.head);
    const skull = new T.Mesh(new T.IcosahedronGeometry(0.21, 1), skin); parts.head.add(skull);
    const hair = new T.Mesh(new T.IcosahedronGeometry(0.225, 0), mat(PAL.hair)); hair.position.y = 0.05; hair.scale.set(1, 0.8, 1); parts.head.add(hair);
    const hood = new T.Mesh(new T.ConeGeometry(0.3, 0.42, 7), cloth); hood.position.set(0, 0.06, -0.06); parts.head.add(hood);
    // cloak
    parts.cloak = new T.Mesh(new T.ConeGeometry(0.42, 1.0, 7, 1, true), new T.MeshLambertMaterial({ color: 0x24485f, side: T.DoubleSide, flatShading: true }));
    parts.cloak.position.set(0, 0.26, -0.16); parts.hips.add(parts.cloak);
    const mkLimb = (len, r, m) => { const grp = new T.Group(); const mesh = new T.Mesh(new T.CapsuleGeometry(r, len, 2, 6), m); mesh.position.y = -len / 2 - r; grp.add(mesh); return grp; };
    parts.armL = mkLimb(0.42, 0.085, cloth); parts.armL.position.set(-0.33, 0.58, 0); parts.hips.add(parts.armL);
    parts.armR = mkLimb(0.42, 0.085, cloth); parts.armR.position.set(0.33, 0.58, 0); parts.hips.add(parts.armR);
    parts.legL = mkLimb(0.46, 0.10, mat(0x35424a)); parts.legL.position.set(-0.14, 0.02, 0); parts.hips.add(parts.legL);
    parts.legR = mkLimb(0.46, 0.10, mat(0x35424a)); parts.legR.position.set(0.14, 0.02, 0); parts.hips.add(parts.legR);
    // sword in right hand
    parts.weapon = new T.Group(); parts.weapon.position.set(0, -0.56, 0.04); parts.armR.add(parts.weapon);
    const grip = new T.Mesh(new T.CylinderGeometry(0.035, 0.035, 0.22, 6), mat(0x3a2a22)); parts.weapon.add(grip);
    const guard = new T.Mesh(new T.BoxGeometry(0.26, 0.05, 0.07), trim); guard.position.y = 0.13; parts.weapon.add(guard);
    const blade = new T.Mesh(new T.BoxGeometry(0.09, 1.0, 0.025), new T.MeshLambertMaterial({ color: PAL.blade, emissive: 0x14303f, flatShading: true }));
    blade.position.y = 0.65; parts.weapon.add(blade);
    const rune = new T.Mesh(new T.BoxGeometry(0.03, 0.8, 0.03), glowMat(PAL.rune, 0.9)); rune.position.set(0, 0.65, 0.02); parts.weapon.add(rune);
    parts.blade = blade; parts.rune = rune;
    parts.weapon.rotation.x = -0.35;
    // lantern anchor
    parts.lantern = new T.Group(); parts.lantern.position.set(-0.34, 0.15, 0.1); parts.hips.add(parts.lantern);
    const lampBody = new T.Mesh(new T.IcosahedronGeometry(0.13, 0), glowMat(0xffe6a8, 0.95)); parts.lantern.add(lampBody);
    parts.lanternLight = new T.PointLight(0xffd79a, 0, 16, 2); parts.lantern.add(parts.lanternLight);
    parts.lantern.visible = false;
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
    return { group: g, parts };
  }

  // ---- Enemies -----------------------------------------------------------
  function makeEnemy(type) {
    const g = new T.Group(); const parts = {};
    if (type === 'stalker') {
      const body = mat(0x6d2f4f), dark = mat(0x40182c);
      parts.hips = new T.Group(); parts.hips.position.y = 0.75; g.add(parts.hips);
      parts.torso = new T.Mesh(new T.CapsuleGeometry(0.3, 0.6, 2, 7), body);
      parts.torso.rotation.x = Math.PI / 2.3; parts.hips.add(parts.torso);
      parts.head = new T.Group(); parts.head.position.set(0, 0.22, 0.55); parts.hips.add(parts.head);
      const skull = new T.Mesh(new T.ConeGeometry(0.22, 0.6, 6), dark); skull.rotation.x = Math.PI / 2; parts.head.add(skull);
      parts.eyes = [];
      for (const s of [-1, 1]) { const e = new T.Mesh(new T.SphereGeometry(0.055, 6, 5), glowMat(0xff4d6d)); e.position.set(s * 0.1, 0.09, 0.2); parts.head.add(e); parts.eyes.push(e); }
      for (let i = 0; i < 5; i++) { const sp = new T.Mesh(new T.ConeGeometry(0.07, 0.34, 4), dark); sp.position.set(0, 0.28, -0.4 + i * 0.22); sp.rotation.x = -0.4; parts.hips.add(sp); }
      parts.legs = [];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const l = new T.Group(); l.position.set(sx * 0.26, -0.05, sz * 0.34);
        const m = new T.Mesh(new T.CapsuleGeometry(0.075, 0.5, 2, 5), dark); m.position.y = -0.32; l.add(m);
        parts.hips.add(l); parts.legs.push(l);
      }
      parts.armR = new T.Group(); parts.armR.position.set(0.28, 0.1, 0.4); parts.hips.add(parts.armR);
      const claw = new T.Mesh(new T.ConeGeometry(0.1, 0.5, 5), glowMat(0xff7a9a, 0.85)); claw.rotation.x = Math.PI / 2; claw.position.z = 0.25; parts.armR.add(claw);
      parts.telegraphMesh = claw;
    } else if (type === 'guardian') {
      const stone = mat(0x59704a), moss = mat(0x3f5c33), rock = mat(0x6b7268);
      parts.hips = new T.Group(); parts.hips.position.y = 1.35; g.add(parts.hips);
      parts.torso = new T.Mesh(new T.BoxGeometry(1.15, 1.25, 0.85), stone); parts.torso.position.y = 0.3; parts.hips.add(parts.torso);
      const shoulders = new T.Mesh(new T.IcosahedronGeometry(0.95, 0), rock); shoulders.scale.set(1.25, 0.55, 0.85); shoulders.position.y = 0.85; parts.hips.add(shoulders);
      for (let i = 0; i < 4; i++) { const m = new T.Mesh(new T.IcosahedronGeometry(0.26, 0), moss); m.position.set((Math.random() - 0.5) * 1.1, 0.9 + Math.random() * 0.2, (Math.random() - 0.5) * 0.7); m.scale.y = 0.5; parts.hips.add(m); }
      parts.head = new T.Group(); parts.head.position.y = 1.15; parts.hips.add(parts.head);
      const skull = new T.Mesh(new T.BoxGeometry(0.55, 0.5, 0.5), rock); parts.head.add(skull);
      parts.eyes = [];
      for (const s of [-1, 1]) { const e = new T.Mesh(new T.BoxGeometry(0.12, 0.07, 0.05), glowMat(0xa8ff6a)); e.position.set(s * 0.14, 0.05, 0.26); parts.head.add(e); parts.eyes.push(e); }
      const mkArm = sx => { const a = new T.Group(); a.position.set(sx * 0.78, 0.72, 0); const m = new T.Mesh(new T.CapsuleGeometry(0.22, 0.85, 2, 6), stone); m.position.y = -0.6; a.add(m); const fist = new T.Mesh(new T.IcosahedronGeometry(0.34, 0), rock); fist.position.y = -1.15; a.add(fist); parts.hips.add(a); return a; };
      parts.armL = mkArm(-1); parts.armR = mkArm(1);
      parts.legs = [];
      for (const s of [-1, 1]) { const l = new T.Group(); l.position.set(s * 0.32, -0.3, 0); const m = new T.Mesh(new T.CapsuleGeometry(0.24, 0.7, 2, 6), stone); m.position.y = -0.5; l.add(m); parts.hips.add(l); parts.legs.push(l); }
      parts.telegraphMesh = parts.armR.children[1];
    } else if (type === 'spitter') {
      const body = mat(0x4a3a72), sac = new T.MeshLambertMaterial({ color: 0x9b6bff, emissive: 0x3d1f6b, flatShading: true, transparent: true, opacity: 0.9 });
      parts.hips = new T.Group(); parts.hips.position.y = 1.25; g.add(parts.hips);
      parts.torso = new T.Mesh(new T.IcosahedronGeometry(0.48, 1), body); parts.hips.add(parts.torso);
      parts.sac = new T.Mesh(new T.IcosahedronGeometry(0.3, 0), sac); parts.sac.position.set(0, 0.05, 0.34); parts.hips.add(parts.sac);
      parts.head = new T.Group(); parts.head.position.y = 0.42; parts.hips.add(parts.head);
      const crown = new T.Mesh(new T.ConeGeometry(0.3, 0.45, 6), mat(0x2f2450)); parts.head.add(crown);
      parts.eyes = [];
      for (const s of [-1, 1]) { const e = new T.Mesh(new T.SphereGeometry(0.06, 6, 5), glowMat(0xd08bff)); e.position.set(s * 0.13, -0.05, 0.24); parts.head.add(e); parts.eyes.push(e); }
      parts.tendrils = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const t = new T.Mesh(new T.ConeGeometry(0.06, 0.75, 4), mat(0x352a5c));
        t.position.set(Math.cos(a) * 0.3, -0.5, Math.sin(a) * 0.3); t.rotation.x = Math.PI; parts.hips.add(t); parts.tendrils.push(t);
      }
      parts.telegraphMesh = parts.sac;
    } else if (type === 'warden') {
      const dark = mat(0x2a1440), robe = mat(0x4a2170), bone = mat(0xd8cfae);
      parts.hips = new T.Group(); parts.hips.position.y = 2.5; g.add(parts.hips);
      parts.torso = new T.Mesh(new T.ConeGeometry(1.05, 2.6, 8), robe); parts.torso.position.y = 0.2; parts.hips.add(parts.torso);
      const chest = new T.Mesh(new T.IcosahedronGeometry(0.62, 0), dark); chest.position.y = 1.15; chest.scale.set(1.2, 1, 0.8); parts.hips.add(chest);
      parts.core = new T.Mesh(new T.OctahedronGeometry(0.34, 0), glowMat(0xc46bff)); parts.core.position.set(0, 1.15, 0.5); parts.hips.add(parts.core);
      parts.coreLight = new T.PointLight(0xc46bff, 1.4, 22); parts.coreLight.position.copy(parts.core.position); parts.hips.add(parts.coreLight);
      parts.head = new T.Group(); parts.head.position.y = 1.95; parts.hips.add(parts.head);
      const skull = new T.Mesh(new T.IcosahedronGeometry(0.4, 0), bone); skull.scale.set(0.85, 1.1, 0.9); parts.head.add(skull);
      parts.eyes = [];
      for (const s of [-1, 1]) { const e = new T.Mesh(new T.SphereGeometry(0.09, 6, 5), glowMat(0xff5ce0)); e.position.set(s * 0.16, 0.05, 0.3); parts.head.add(e); parts.eyes.push(e); }
      // antlers
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
        const a = new T.Mesh(new T.ConeGeometry(0.075, 0.9 - i * 0.18, 5), bone);
        a.position.set(s * (0.24 + i * 0.14), 0.5 + i * 0.22, -0.05 - i * 0.1);
        a.rotation.z = s * (0.5 + i * 0.25); a.rotation.x = -0.25; parts.head.add(a);
      }
      const mkArm = sx => { const a = new T.Group(); a.position.set(sx * 1.0, 1.25, 0); const m = new T.Mesh(new T.CapsuleGeometry(0.17, 1.3, 2, 6), robe); m.position.y = -0.8; a.add(m); const hand = new T.Mesh(new T.IcosahedronGeometry(0.26, 0), bone); hand.position.y = -1.6; a.add(hand); parts.hips.add(a); return a; };
      parts.armL = mkArm(-1); parts.armR = mkArm(1);
      // floating rune shards
      parts.shards = [];
      for (let i = 0; i < 6; i++) {
        const s = new T.Mesh(new T.OctahedronGeometry(0.22, 0), glowMat(0xc46bff, 0.9));
        s.userData.a = (i / 6) * Math.PI * 2; parts.hips.add(s); parts.shards.push(s);
      }
      parts.legs = [];
      parts.telegraphMesh = parts.core;
    }
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return { group: g, parts };
  }

  // ---- Landmarks ---------------------------------------------------------
  function makeLandmark(type) {
    const g = new T.Group();
    if (type === 'checkpoint') {
      const base = new T.Mesh(new T.CylinderGeometry(0.9, 1.15, 0.35, 8), mat(PAL.stoneDark)); base.position.y = 0.17; g.add(base);
      const shaft = new T.Mesh(new T.BoxGeometry(0.55, 2.3, 0.55), mat(PAL.stone)); shaft.position.y = 1.4; g.add(shaft);
      const rune = new T.Mesh(new T.OctahedronGeometry(0.32, 0), glowMat(0x6fe3ff, 0.95)); rune.position.y = 2.85; g.add(rune);
      const l = new T.PointLight(0x6fe3ff, 0.9, 12); l.position.y = 2.85; g.add(l);
      g.userData.spin = rune; g.userData.light = l; g.userData.rune = rune;
    } else if (type === 'forge') {
      const bench = new T.Mesh(new T.BoxGeometry(2.0, 0.18, 1.0), mat(0x6b5335)); bench.position.y = 0.95; g.add(bench);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const leg = new T.Mesh(new T.BoxGeometry(0.14, 0.95, 0.14), mat(0x4a3a26)); leg.position.set(sx * 0.85, 0.47, sz * 0.4); g.add(leg); }
      const anvil = new T.Mesh(new T.BoxGeometry(0.7, 0.32, 0.34), mat(0x4a4f55)); anvil.position.set(-0.4, 1.2, 0); g.add(anvil);
      const bowl = new T.Mesh(new T.CylinderGeometry(0.26, 0.18, 0.22, 8), mat(0x6a6f75)); bowl.position.set(0.5, 1.15, 0); g.add(bowl);
      const fire = new T.Mesh(new T.IcosahedronGeometry(0.18, 0), glowMat(0xffa64d, 0.9)); fire.position.set(0.5, 1.3, 0); g.add(fire);
      const l = new T.PointLight(0xffa64d, 0.8, 9); l.position.set(0.5, 1.5, 0); g.add(l);
      g.userData.spin = fire;
    } else if (type === 'relic') {
      const base = new T.Mesh(new T.CylinderGeometry(1.1, 1.4, 0.5, 6), mat(PAL.stoneDark)); base.position.y = 0.25; g.add(base);
      const ped = new T.Mesh(new T.CylinderGeometry(0.4, 0.55, 1.5, 6), mat(PAL.stone)); ped.position.y = 1.15; g.add(ped);
      const relic = new T.Mesh(new T.OctahedronGeometry(0.42, 0), new T.MeshLambertMaterial({ color: 0xffd98a, emissive: 0x6a4a10, flatShading: true })); relic.position.y = 2.3; g.add(relic);
      const ring = new T.Mesh(new T.TorusGeometry(0.7, 0.045, 4, 20), glowMat(0xffd98a, 0.7)); ring.position.y = 2.3; ring.rotation.x = Math.PI / 2; g.add(ring);
      const l = new T.PointLight(0xffd98a, 1.1, 14); l.position.y = 2.4; g.add(l);
      g.userData.spin = relic; g.userData.ring = ring; g.userData.light = l; g.userData.pickup = relic;
    } else if (type === 'lore') {
      const s = new T.Mesh(new T.BoxGeometry(0.9, 1.7, 0.3), mat(0x8d8a78)); s.position.y = 0.85; s.rotation.z = 0.06; g.add(s);
      for (let i = 0; i < 4; i++) { const line = new T.Mesh(new T.BoxGeometry(0.55, 0.05, 0.02), glowMat(0x9fe8ff, 0.55)); line.position.set(0, 1.3 - i * 0.22, 0.16); g.add(line); }
      const l = new T.PointLight(0x9fe8ff, 0.4, 6); l.position.y = 1.2; g.add(l);
    } else if (type === 'cache') {
      const arch = new T.Mesh(new T.TorusGeometry(2.2, 0.35, 5, 12, Math.PI), mat(PAL.stoneDark));
      arch.rotation.set(0, 0.4, 0.15); arch.position.y = 0.2; g.add(arch);
      const box = new T.Mesh(new T.BoxGeometry(0.9, 0.6, 0.65), mat(0x6b5335)); box.position.set(0.2, 0.3, 0.4); g.add(box);
      const lid = new T.Mesh(new T.BoxGeometry(0.95, 0.12, 0.7), mat(0x4a3a26)); lid.position.set(0.2, 0.64, 0.4); g.add(lid);
      const gl = new T.Mesh(new T.BoxGeometry(0.2, 0.16, 0.06), glowMat(PAL.gold)); gl.position.set(0.2, 0.5, 0.74); g.add(gl);
      g.userData.pickup = box;
    } else if (type === 'gate') {
      for (const s of [-1, 1]) { const p = new T.Mesh(new T.BoxGeometry(1.3, 8, 1.3), mat(0x4a3a52)); p.position.set(s * 4.2, 4, 0); g.add(p); }
      const lintel = new T.Mesh(new T.BoxGeometry(10, 1.2, 1.5), mat(0x4a3a52)); lintel.position.y = 8.2; g.add(lintel);
      const barrier = new T.Mesh(new T.PlaneGeometry(8.2, 7.6), new T.MeshBasicMaterial({ color: 0xc46bff, transparent: true, opacity: 0.34, side: T.DoubleSide }));
      barrier.position.y = 3.9; g.add(barrier);
      const runes = new T.Group();
      for (let i = 0; i < 3; i++) { const r = new T.Mesh(new T.TorusGeometry(0.5, 0.08, 4, 12), glowMat(0xc46bff, 0.9)); r.position.set((i - 1) * 2.2, 4.5, 0.1); runes.add(r); }
      g.add(runes);
      const l = new T.PointLight(0xc46bff, 1.2, 20); l.position.y = 4.5; g.add(l);
      g.userData.barrier = barrier; g.userData.runes = runes; g.userData.light = l;
    } else if (type === 'ending') {
      const trunk = new T.Mesh(new T.CylinderGeometry(0.9, 1.6, 5.5, 8), mat(0x3a2a44)); trunk.position.y = 2.75; g.add(trunk);
      const heart = new T.Mesh(new T.IcosahedronGeometry(1.15, 1), new T.MeshLambertMaterial({ color: 0xc46bff, emissive: 0x5a1f80, flatShading: true })); heart.position.y = 5.6; g.add(heart);
      const l = new T.PointLight(0xc46bff, 1.6, 30); l.position.y = 5.6; g.add(l);
      for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; const root = new T.Mesh(new T.ConeGeometry(0.3, 2.4, 5), mat(0x3a2a44)); root.position.set(Math.cos(a) * 1.7, 0.6, Math.sin(a) * 1.7); root.rotation.z = Math.cos(a) * 0.7; root.rotation.x = -Math.sin(a) * 0.7; g.add(root); }
      g.userData.spin = heart; g.userData.light = l; g.userData.heart = heart;
    }
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return g;
  }

  return { PAL, mat, glowMat, jitter, treeParts, rockGeo, grassGeo, pillarGeo, makeNode, makePlayer, makeEnemy, makeLandmark };
});
