/* WILDRUNE — game runtime: scene, player, AI embodiment, boss, interaction, flow. */
(function (root) {
  'use strict';
  const T = root.THREE, W = root.WR;
  const { CONFIG, ITEMS, ENEMIES, REGIONS, LORE, OBJECTIVES } = W;
  const { Inventory, Crafting, Attributes, AttackState, inArc, useItem, Progression, SaveSystem, Audio, UI } = W;
  const World = W, Art = W;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;

  const QUALITY = {
    low:    { pixel: 0.7, shadows: false, shadowSize: 512,  grass: 0.28, far: 210, aa: false },
    medium: { pixel: 1.0, shadows: true,  shadowSize: 1024, grass: 0.65, far: 280, aa: true },
    high:   { pixel: Math.min(root.devicePixelRatio || 1, 2), shadows: true, shadowSize: 2048, grass: 1.0, far: 340, aa: true }
  };

  const Game = {
    // ---------------------------------------------------------------- setup
    init() {
      this.clock = { last: performance.now(), acc: 0 };
      this.keys = {}; this.mouse = { dx: 0, dy: 0, left: false, right: false };
      this.camYaw = 0; this.camPitch = 0.22; this.camDist = 6.4; this.shake = 0;
      this.state = 'menu'; this.playtime = 0; this.kills = 0; this.deaths = 0;
      this.enemies = []; this.projectiles = []; this.effects = []; this.interactables = [];
      this.lightAnchors = []; this.nodeStates = {}; this.autosaveT = 0;
      this.timeScale = 1; this.slowmo = 0; this.gatherTarget = null; this.gatherT = 0;
      this.nearForge = false; this.bossActive = false; this.endingReady = false;
      this.fpsSamples = []; this.frameCount = 0;
      this.pointerFallback = false; this.fatal = null;

      const q = QUALITY[UI.settings.quality] || QUALITY.medium;
      this.renderer = new T.WebGLRenderer({ antialias: q.aa, powerPreference: 'high-performance' });
      this.renderer.setSize(innerWidth, innerHeight);
      this.renderer.setPixelRatio(q.pixel);
      this.renderer.outputEncoding = T.sRGBEncoding;
      this.renderer.toneMapping = T.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.06;
      this.renderer.shadowMap.enabled = q.shadows;
      this.renderer.shadowMap.type = T.PCFSoftShadowMap;
      document.getElementById('app').appendChild(this.renderer.domElement);

      this.scene = new T.Scene();
      this.scene.fog = new T.FogExp2(0x9fc4a8, 0.010);
      this.camera = new T.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, q.far);
      this.timeUniform = { value: 0 };

      this.setupLights();
      this.setupSky();
      this.bindInput();
      addEventListener('resize', () => this.onResize());
      this.loop = this.loop.bind(this);
      requestAnimationFrame(this.loop);
    },

    setupLights() {
      this.hemi = new T.HemisphereLight(0xbfd8e8, 0x3a4a30, 0.75); this.scene.add(this.hemi);
      this.sun = new T.DirectionalLight(0xffe9c4, 1.15);
      this.sun.position.set(48, 78, 30); this.sun.castShadow = true;
      const s = this.sun.shadow;
      s.mapSize.set(1024, 1024); s.camera.near = 1; s.camera.far = 190;
      s.camera.left = -42; s.camera.right = 42; s.camera.top = 42; s.camera.bottom = -42;
      s.bias = -0.0012; s.normalBias = 0.035;
      this.scene.add(this.sun); this.scene.add(this.sun.target);
      this.ambient = new T.AmbientLight(0x6f8f7a, 0.35); this.scene.add(this.ambient);
      // Fixed-size point light pool: avoids shader recompiles when lights move in/out of range.
      this.lightPool = [];
      for (let i = 0; i < 6; i++) { const l = new T.PointLight(0xffffff, 0, 18, 2); l.visible = true; this.scene.add(l); this.lightPool.push(l); }
    },

    setupSky() {
      const geo = new T.SphereGeometry(400, 24, 16);
      this.skyUniforms = {
        top: { value: new T.Color(0x4a7fb5) }, bottom: { value: new T.Color(0xd8e4c8) }, offset: { value: 30 }, exp: { value: 0.75 }
      };
      const mat = new T.ShaderMaterial({
        uniforms: this.skyUniforms, side: T.BackSide, depthWrite: false, fog: false,
        vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform vec3 top; uniform vec3 bottom; uniform float offset; uniform float exp; varying vec3 vP;' +
          'void main(){ float h = normalize(vP + vec3(0.0,offset,0.0)).y; float t = pow(max(h,0.0), exp); gl_FragColor = vec4(mix(bottom, top, t), 1.0); }'
      });
      this.sky = new T.Mesh(geo, mat); this.scene.add(this.sky);
      // distant mountain silhouette
      const mts = new T.Group();
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * Math.PI * 2, r = 300 + Math.random() * 40;
        const h = 30 + Math.random() * 55;
        const m = new T.Mesh(new T.ConeGeometry(28 + Math.random() * 26, h, 5), new T.MeshBasicMaterial({ color: 0x6d8296, fog: false }));
        m.position.set(Math.cos(a) * r, h / 2 - 12, Math.sin(a) * r); mts.add(m);
      }
      this.scene.add(mts); this.mountains = mts;
    },

    // ------------------------------------------------------- world building
    buildWorld(seed) {
      UI.loading(12, 'Raising the hills…');
      this.world = World.generate(seed);
      const size = this.world.size;

      // ---- terrain
      const seg = 150;
      const geo = new T.PlaneGeometry(size, size, seg, seg);
      geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes.position;
      const colors = new Float32Array(pos.count * 3);
      const c = new T.Color();
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i);
        const y = World.heightAt(x, z); pos.setY(i, y);
        const reg = REGIONS[World.regionAt(x, z)];
        const n = (Math.sin(x * 0.4) * Math.cos(z * 0.37) * 0.5 + 0.5) * 0.16;
        c.setRGB(reg.ground[0] + n - 0.08, reg.ground[1] + n - 0.08, reg.ground[2] + n - 0.08);
        // worn path
        const pathW = 1 - World.smooth(2.5, 7, Math.abs(x));
        if (pathW > 0 && z > -170 && z < 150) c.lerp(new T.Color(0x6b6047), pathW * 0.65);
        colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
      }
      geo.setAttribute('color', new T.BufferAttribute(colors, 3));
      geo.computeVertexNormals();
      this.ground = new T.Mesh(geo, new T.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
      this.ground.receiveShadow = true; this.scene.add(this.ground);

      UI.loading(30, 'Growing the forest…');
      this.buildTrees(); this.buildRocks(); this.buildGrass(); this.buildPillars(); this.buildCave();
      UI.loading(58, 'Scattering what was left behind…');
      this.buildNodes(); this.buildLandmarks();
      UI.loading(74, 'Waking the corrupted…');
      this.buildEnemies();
      this.buildPlayer();
      this.buildEffectPools();
      UI.loading(92, 'Lighting the way…');
    },

    windify(material) {
      material.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = this.timeUniform;
        sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader;
        sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>',
          '#include <begin_vertex>\n' +
          '#ifdef USE_INSTANCING\n' +
          '  float ph = instanceMatrix[3][0]*0.33 + instanceMatrix[3][2]*0.21;\n' +
          '  float sway = sin(uTime*1.5 + ph) * 0.09 + sin(uTime*2.7 + ph*1.7)*0.035;\n' +
          '  transformed.x += sway * max(position.y, 0.0);\n' +
          '  transformed.z += cos(uTime*1.2 + ph)*0.05 * max(position.y, 0.0);\n' +
          '#endif\n');
      };
      material.customProgramCacheKey = () => 'wind';
      return material;
    },

    buildTrees() {
      const dummy = new T.Object3D(), col = new T.Color();
      this.treeMeshes = [];
      for (const kind of ['broad', 'pine']) {
        const list = this.world.trees.filter(t => t.kind === kind);
        if (!list.length) continue;
        const parts = Art.treeParts(kind);
        const groups = [{ def: parts.trunk, wind: false }].concat(parts.foliage.map(f => ({ def: f, wind: true })));
        for (const gdef of groups) {
          const d = gdef.def;
          const m = new T.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
          if (gdef.wind) this.windify(m);
          const im = new T.InstancedMesh(d.geo, m, list.length);
          im.castShadow = true; im.receiveShadow = false;
          list.forEach((t, i) => {
            const sc = d.scale || [1, 1, 1];
            dummy.position.set(t.x + (d.off ? d.off[0] * t.s : 0), World.heightAt(t.x, t.z) + d.y * t.s, t.z + (d.off ? d.off[2] * t.s : 0));
            dummy.rotation.set(0, t.rot, 0);
            dummy.scale.set(t.s * sc[0], t.s * sc[1], t.s * sc[2]);
            dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix);
            col.setHex(d.color);
            const v = 0.86 + ((i * 37) % 100) / 100 * 0.28;
            col.multiplyScalar(v);
            if (t.corrupted) col.lerp(new T.Color(0x7b3fa0), t.corrupted * 0.7);
            im.setColorAt(i, col);
          });
          im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
          this.scene.add(im); this.treeMeshes.push(im);
        }
      }
    },
    buildRocks() {
      const dummy = new T.Object3D(), col = new T.Color();
      for (const kind of ['boulder', 'slab']) {
        const list = this.world.rocks.filter(r => r.kind === kind);
        if (!list.length) continue;
        const im = new T.InstancedMesh(Art.rockGeo(kind, kind === 'slab' ? 5 : 9), new T.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), list.length);
        im.castShadow = true; im.receiveShadow = true;
        list.forEach((r, i) => {
          dummy.position.set(r.x, World.heightAt(r.x, r.z) + r.s * 0.42, r.z);
          dummy.rotation.set(r.rot * 0.2, r.rot, r.rot * 0.15);
          dummy.scale.setScalar(r.s); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix);
          col.setHex(kind === 'slab' ? 0x6f7a76 : 0x7d8a86).multiplyScalar(0.82 + ((i * 53) % 100) / 100 * 0.34);
          im.setColorAt(i, col);
        });
        im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
        this.scene.add(im);
      }
    },
    buildGrass() {
      const dummy = new T.Object3D(), col = new T.Color();
      const list = this.world.grass;
      const m = this.windify(new T.MeshLambertMaterial({ color: 0xffffff, flatShading: true, side: T.DoubleSide }));
      const im = new T.InstancedMesh(Art.grassGeo(), m, list.length);
      im.castShadow = false; im.receiveShadow = false;
      list.forEach((g, i) => {
        dummy.position.set(g.x, World.heightAt(g.x, g.z), g.z);
        dummy.rotation.set(0, g.rot, 0); dummy.scale.set(g.s, g.s * (0.7 + (i % 7) / 10), g.s);
        dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix);
        const reg = World.regionAt(g.x, g.z);
        col.setHex(reg === 'shrine' ? 0x6a4a7a : reg === 'ruins' ? 0x8a9a5a : 0x5f9a4a).multiplyScalar(0.8 + ((i * 29) % 100) / 100 * 0.4);
        im.setColorAt(i, col);
      });
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
      this.grassMesh = im; this.grassTotal = list.length; this.scene.add(im);
    },
    buildPillars() {
      const g = new T.Group();
      for (const p of this.world.pillars) {
        const m = new T.Mesh(Art.pillarGeo(p.h, p.r, p.broken), Art.mat(p.corrupted ? 0x4a3a52 : 0xa9a694));
        m.position.set(p.x, World.heightAt(p.x, p.z), p.z); m.rotation.y = p.rot;
        m.castShadow = true; m.receiveShadow = true; g.add(m);
        if (!p.broken) {
          const cap = new T.Mesh(new T.BoxGeometry(p.r * 2.4, 0.4, p.r * 2.4), Art.mat(p.corrupted ? 0x3a2a44 : 0x8d8a78));
          cap.position.set(p.x, World.heightAt(p.x, p.z) + p.h + 0.2, p.z); cap.rotation.y = p.rot; cap.castShadow = true; g.add(cap);
        }
        if (p.corrupted) {
          const rune = new T.Mesh(new T.TorusGeometry(p.r * 0.9, 0.06, 4, 12), Art.glowMat(0xc46bff, 0.8));
          rune.position.set(p.x, World.heightAt(p.x, p.z) + p.h * 0.6, p.z); rune.rotation.x = Math.PI / 2; g.add(rune);
        }
      }
      this.scene.add(g); this.pillarGroup = g;
    },
    buildCave() {
      const dummy = new T.Object3D();
      const C = World.CAVE;
      const im = new T.InstancedMesh(Art.rockGeo('boulder', 31), Art.mat(0x4a5158), this.world.caveWalls.length);
      im.castShadow = true; im.receiveShadow = true;
      this.world.caveWalls.forEach((w, i) => {
        dummy.position.set(w.x, World.heightAt(w.x, w.z) + w.h * 0.35, w.z);
        dummy.rotation.set(0.1, w.rot, 0.08);
        dummy.scale.set(w.r, w.h * 0.55, w.r); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix);
      });
      im.instanceMatrix.needsUpdate = true; this.scene.add(im);
      // ceiling high enough to walk under; entrance gap is in the wall ring
      const ceil = new T.Mesh(new T.SphereGeometry(50, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), new T.MeshLambertMaterial({ color: 0x2a3038, side: T.BackSide, flatShading: true }));
      ceil.position.set(C[0], World.heightAt(C[0], C[1]) + 2, C[1]); ceil.scale.set(1, 0.34, 1);
      this.scene.add(ceil);
      // stalactites
      const st = new T.Group();
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * 6.28, r = Math.random() * 38;
        const x = C[0] + Math.cos(a) * r, z = C[1] + Math.sin(a) * r;
        const h = 1.5 + Math.random() * 3.5;
        const m = new T.Mesh(new T.ConeGeometry(0.35 + Math.random() * 0.4, h, 5), Art.mat(0x3d444c));
        m.position.set(x, World.heightAt(C[0], C[1]) + 13 - h / 2, z); m.rotation.x = Math.PI; st.add(m);
      }
      this.scene.add(st);
    },
    buildNodes() {
      this.nodeGroup = new T.Group(); this.scene.add(this.nodeGroup);
      for (const n of this.world.nodes) {
        const g = Art.makeNode(n.kind);
        g.position.set(n.x, World.heightAt(n.x, n.z), n.z); g.rotation.y = n.rot; g.scale.setScalar(n.s);
        this.stripLights(g);
        this.nodeGroup.add(g);
        n.mesh = g; n.taken = false; n.respawn = 0;
        this.interactables.push({ kind: 'node', ref: n, x: n.x, z: n.z, range: CONFIG.interactRange });
      }
    },
    buildLandmarks() {
      this.landmarkGroup = new T.Group(); this.scene.add(this.landmarkGroup);
      this.landmarks = {};
      for (const l of this.world.landmarks) {
        const g = Art.makeLandmark(l.type);
        g.position.set(l.x, World.heightAt(l.x, l.z), l.z);
        this.stripLights(g);
        this.landmarkGroup.add(g);
        l.mesh = g; this.landmarks[l.id] = l;
        if (l.type === 'gate') { l.collider = { x: l.x, z: l.z, r: 4.4, kind: 'gate' }; this.world.grid.add(l.collider); }
        if (l.type !== 'boss') this.interactables.push({ kind: l.type, ref: l, x: l.x, z: l.z, range: l.type === 'gate' ? 5 : CONFIG.interactRange });
      }
      // shrine floor disc
      const S = World.SHRINE;
      const disc = new T.Mesh(new T.CylinderGeometry(31, 33, 0.5, 32), Art.mat(0x4a3f52));
      disc.position.set(S[0], World.heightAt(S[0], S[1]) + 0.1, S[1]); disc.receiveShadow = true; this.scene.add(disc);
      const ring = new T.Mesh(new T.RingGeometry(19, 20.4, 40), new T.MeshBasicMaterial({ color: 0xc46bff, transparent: true, opacity: 0.35, side: T.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(S[0], World.heightAt(S[0], S[1]) + 0.38, S[1]); this.scene.add(ring);
      this.shrineRing = ring;
    },
    /** Remove embedded PointLights; register them as anchors for the fixed light pool. */
    stripLights(group) {
      const remove = [];
      group.traverse(o => { if (o.isLight) remove.push(o); });
      for (const l of remove) {
        const wp = new T.Vector3(); l.getWorldPosition(wp);
        this.lightAnchors.push({ obj: l, parent: l.parent, color: l.color.getHex(), intensity: l.intensity, dist: l.distance || 16, local: l.position.clone(), owner: group });
        l.parent.remove(l);
      }
    },

    buildPlayer() {
      const rig = Art.makePlayer();
      this.stripLights(rig.group);
      this.playerRig = rig; this.scene.add(rig.group);
      this.p = {
        pos: new T.Vector3(World.SPAWN.x, 0, World.SPAWN.z), vel: new T.Vector3(),
        yaw: 0, grounded: true, attack: null, dodgeT: 0, dodgeCd: 0, dodgeDir: new T.Vector3(),
        stepT: 0, animT: 0, hurtT: 0, sprinting: false, lanternOn: false
      };
      this.p.pos.y = World.heightAt(this.p.pos.x, this.p.pos.z);
      this.attrs = new Attributes();
      this.inv = new Inventory();
      this.prog = new Progression();
      this.prog.onChange(e => this.onProgress(e));
      this.checkpoint = { x: World.SPAWN.x, z: World.SPAWN.z, name: 'Arrival Clearing' };
      // lantern light reserved from pool slot 0
      this.lanternAnchor = { obj: null, color: 0xffd79a, intensity: 1.5, dist: 17, world: new T.Vector3(), always: true };
    },

    buildEnemies() {
      this.enemyGroup = new T.Group(); this.scene.add(this.enemyGroup);
      for (const e of this.world.enemies) this.spawnEnemy(e.type, e.x, e.z, e.id);
      const b = this.landmarks.warden;
      this.boss = this.spawnEnemy('warden', b.x, b.z, 'warden', true);
      this.boss.rig.group.visible = false; this.boss.dormant = true;
    },
    spawnEnemy(type, x, z, id, isBoss) {
      const def = ENEMIES[type];
      const rig = Art.makeEnemy(type);
      this.stripLights(rig.group);
      rig.group.scale.setScalar(def.scale);
      const pos = new T.Vector3(x, World.heightAt(x, z), z);
      rig.group.position.copy(pos);
      this.enemyGroup.add(rig.group);
      const e = {
        id, type, def, rig, pos, vel: new T.Vector3(), hp: def.health, maxHp: def.health,
        brain: AI_makeBrain(type, { x, z }), home: { x, z }, alive: true, isBoss: !!isBoss,
        losT: Math.random() * 0.3, hasLOS: true, attackHit: false, deathT: 0, dormant: false,
        flashT: 0, telegraphRing: null, animT: Math.random() * 10
      };
      this.enemies.push(e);
      return e;
    },

    buildEffectPools() {
      // ground telegraph ring reused per enemy on demand
      this.ringGeo = new T.RingGeometry(0.8, 1.0, 32);
      this.sparkGeo = new T.OctahedronGeometry(0.09, 0);
      this.sparkMat = Art.glowMat(0xffd9a0);
      this.novaMesh = new T.Mesh(new T.RingGeometry(0.9, 1.0, 48), new T.MeshBasicMaterial({ color: 0xc46bff, transparent: true, opacity: 0.8, side: T.DoubleSide }));
      this.novaMesh.rotation.x = -Math.PI / 2; this.novaMesh.visible = false; this.scene.add(this.novaMesh);
      this.nova = null;
      // corruption motes in shrine
      const S = World.SHRINE, N = 260;
      const g = new T.BufferGeometry(); const arr = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        const a = Math.random() * 6.28, r = Math.random() * 40;
        arr[i * 3] = S[0] + Math.cos(a) * r; arr[i * 3 + 1] = World.heightAt(S[0], S[1]) + Math.random() * 14; arr[i * 3 + 2] = S[1] + Math.sin(a) * r;
      }
      g.setAttribute('position', new T.BufferAttribute(arr, 3));
      this.motes = new T.Points(g, new T.PointsMaterial({ color: 0xc46bff, size: 0.22, transparent: true, opacity: 0.75, sizeAttenuation: true }));
      this.scene.add(this.motes);
    },

    // ---------------------------------------------------------------- input
    bindInput() {
      const canvas = this.renderer.domElement;
      addEventListener('keydown', e => {
        if (e.repeat) return;
        const k = e.key.toLowerCase(); this.keys[k] = true;
        if (['w', 'a', 's', 'd', ' ', 'shift', 'control', 'alt', 'e', 'i', 'c', 'j', 'q', '1', '2', '3', '4', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
        if (this.state === 'playing') {
          if (UI.openPanel) {
            if (k === 'escape' || k === UI.openPanel[0] || (UI.openPanel === 'inventory' && k === 'i') || (UI.openPanel === 'crafting' && k === 'c') || (UI.openPanel === 'journal' && k === 'j')) this.togglePanel(UI.openPanel);
            return;
          }
          if (k === 'escape') this.pause();
          else if (k === 'i') this.togglePanel('inventory');
          else if (k === 'c') this.togglePanel('crafting');
          else if (k === 'j') this.togglePanel('journal');
          else if (k === 'q') this.quickHeal();
          else if (['1', '2', '3', '4'].includes(k)) this.useItem(['salve', 'elixir', 'tonic', 'ember'][+k - 1]);
          else if (k === ' ') this.jump();
          else if (k === 'control' || k === 'alt') this.dodge();
        } else if (this.state === 'paused' && k === 'escape') this.resume();
        else if (this.state === 'lore' && (k === 'escape' || k === 'e' || k === ' ')) this.closeLore();
        else if (this.state === 'dead' && (k === 'escape' || k === ' ' || k === 'enter')) this.respawn();
        else if (UI.openPanel && k === 'escape') this.togglePanel(UI.openPanel);
      });
      addEventListener('keyup', e => { this.keys[e.key.toLowerCase()] = false; });
      addEventListener('blur', () => { this.keys = {}; if (this.state === 'playing') this.pause(); });
      canvas.addEventListener('mousedown', e => {
        if (this.state !== 'playing') return;
        if (document.pointerLockElement !== canvas && !this.pointerFallback) { this.requestLookControl(); return; }
        if (UI.openPanel) return;
        if (e.button === 0) this.startAttack('light');
        else if (e.button === 2) this.startAttack('heavy');
      });
      canvas.addEventListener('contextmenu', e => e.preventDefault());
      addEventListener('mousemove', e => {
        if (this.state !== 'playing' || UI.openPanel) return;
        if (document.pointerLockElement !== canvas && !(this.pointerFallback && (e.buttons & 4))) return;
        const s = UI.settings.sens * 0.0022;
        this.camYaw -= e.movementX * s;
        this.camPitch += (UI.settings.invert ? -1 : 1) * e.movementY * s;
        this.camPitch = clamp(this.camPitch, -0.55, 1.15);
      });
      addEventListener('wheel', e => { if (this.state === 'playing') this.camDist = clamp(this.camDist + Math.sign(e.deltaY) * 0.6, 3.2, 10); }, { passive: true });
      document.addEventListener('pointerlockchange', () => {
        if (document.pointerLockElement !== canvas && this.state === 'playing' && !UI.openPanel && !this.pointerFallback) this.pause();
      });
    },
    onResize() {
      this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    },
    applyQuality(name) {
      const q = QUALITY[name] || QUALITY.medium;
      this.quality = q;
      if (!this.renderer) return;
      this.renderer.setPixelRatio(q.pixel);
      this.renderer.shadowMap.enabled = q.shadows;
      this.sun.castShadow = q.shadows;
      this.sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
      this.camera.far = q.far; this.camera.updateProjectionMatrix();
      if (this.grassMesh) this.grassMesh.count = Math.floor(this.grassTotal * q.grass);
      this.scene.traverse(o => { if (o.isMesh && o.material) o.material.needsUpdate = true; });
    },

    // ------------------------------------------------------------ game flow
    newGame() {
      Audio.init(); Audio.resume();
      this.resetRun();
      this.prog = new Progression(); this.prog.onChange(e => this.onProgress(e));
      this.inv = new Inventory(); this.attrs = new Attributes();
      this.playtime = 0; this.kills = 0; this.deaths = 0;
      this.checkpoint = { x: World.SPAWN.x, z: World.SPAWN.z, name: 'Arrival Clearing' };
      this.nodeStates = {};
      this.p.pos.set(World.SPAWN.x, World.heightAt(World.SPAWN.x, World.SPAWN.z), World.SPAWN.z);
      this.p.vel.set(0, 0, 0); this.p.yaw = 0; this.camYaw = 0;
      UI.hide('menu'); this.beginPlay();
      UI.toast('The waystone remembers you. Rest at any waystone to save.', 'good');
      setTimeout(() => UI.toast('Objective: follow the path north.', ''), 1800);
    },
    continueGame() {
      Audio.init(); Audio.resume();
      const r = SaveSystem.read(localStorage);
      if (!r.ok) { UI.toast('Could not read save: ' + r.error, 'bad'); return; }
      this.resetRun();
      const d = r.data;
      this.inv = new Inventory(d.inventory);
      this.attrs = new Attributes(d.attrs || {});
      this.prog = new Progression(d.progression); this.prog.onChange(e => this.onProgress(e));
      this.playtime = d.playtime || 0; this.kills = (d.world && d.world.kills) || 0; this.deaths = (d.world && d.world.deaths) || 0;
      this.checkpoint = d.checkpoint;
      this.nodeStates = (d.world && d.world.nodesTaken) || {};
      this.applyWorldState();
      const cp = d.player;
      if (this.attrs.dead || this.attrs.health <= 0) {
        // A save written at the moment of death resumes at the waystone, not as a corpse.
        this.attrs.dead = false; this.attrs.health = this.attrs.maxHealth; this.attrs.stamina = this.attrs.maxStamina;
        this.p.pos.set(this.checkpoint.x, World.heightAt(this.checkpoint.x, this.checkpoint.z), this.checkpoint.z);
      } else {
        this.p.pos.set(cp.x, World.heightAt(cp.x, cp.z), cp.z);
      }
      this.p.yaw = cp.facing || 0; this.camYaw = cp.facing || 0;
      this.attrs.lanternEquipped = !!(d.attrs && d.attrs.lanternEquipped);
      this.setLantern(this.attrs.lanternEquipped);
      UI.hide('menu'); this.beginPlay();
      UI.toast('Journey resumed at ' + this.checkpoint.name + '.', 'good');
    },
    resetRun() {
      for (const e of this.enemies) {
        e.hp = e.maxHp; e.alive = true; e.brain = AI_makeBrain(e.type, e.home);
        e.pos.set(e.home.x, World.heightAt(e.home.x, e.home.z), e.home.z);
        e.vel.set(0, 0, 0); e.deathT = 0; e.rig.group.visible = !e.isBoss;
        e.rig.group.scale.setScalar(e.def.scale); e.rig.group.rotation.set(0, 0, 0);
        e.rig.group.position.copy(e.pos);
        if (e.telegraphRing) { e.telegraphRing.visible = false; }
      }
      if (this.boss) {
        this.boss.dormant = true; this.boss.rig.group.visible = false;
        for (const s of this.boss.rig.parts.shards || []) s.material.color.setHex(0xc46bff);
        if (this.boss.rig.parts.core) this.boss.rig.parts.core.material.color.setHex(0xc46bff);
        for (const a of this.lightAnchors) if (a.owner === this.boss.rig.group) a.color = 0xc46bff;
      }
      this.bossActive = false; this.endingReady = false; this.nova = null; this.novaMesh.visible = false;
      for (const pr of this.projectiles) { this.scene.remove(pr.mesh); pr.mesh.geometry.dispose(); pr.mesh.material.dispose(); }
      this.projectiles.length = 0;
      for (const f of this.effects) { this.scene.remove(f.mesh); if (f.kind === 'ring') f.mesh.geometry.dispose(); f.mesh.material.dispose(); }
      this.effects.length = 0;
      for (const n of this.world.nodes) { n.taken = false; n.respawn = 0; n.mesh.visible = true; }
      for (const id of ['relic_forest', 'relic_cave', 'relic_ruins']) {
        const l = this.landmarks[id];
        if (l && l.mesh.userData.pickup) { l.mesh.userData.pickup.visible = true; if (l.mesh.userData.ring) l.mesh.userData.ring.visible = true; }
      }
      const gate = this.landmarks.shrine_gate;
      if (gate) {
        gate.mesh.userData.barrier.visible = true; gate.mesh.userData.runes.visible = true;
        if (!gate.collider) {
          gate.collider = { x: gate.x, z: gate.z, r: 4.4, kind: 'gate' };
          this.world.colliders.push(gate.collider); this.world.grid.add(gate.collider);
        }
      }
      const heart = this.landmarks.heart;
      if (heart && heart.mesh.userData.heart) {
        heart.mesh.userData.heart.material.color.setHex(0xc46bff);
        heart.mesh.userData.heart.material.emissive.setHex(0x5a1f80);
        for (const a of this.lightAnchors) if (a.owner === heart.mesh) a.color = 0xc46bff;
      }
      if (this.shrineRing) this.shrineRing.material.color.setHex(0xc46bff);
      this.keys = {}; this.gatherTarget = null; this.gatherT = 0; this._eLatch = false;
      this.slowmo = 0; this.timeScale = 1; this.autosaveT = 0;
      UI.boss(null); UI.gather(null); UI.prompt(null); UI.corruptFlash(false);
    },
    applyWorldState() {
      for (const n of this.world.nodes) if (this.nodeStates[n.id]) { n.taken = true; n.mesh.visible = false; n.respawn = 60; }
      for (const id of Object.keys(this.prog.relics)) {
        const l = this.landmarks[id];
        if (l && l.mesh.userData.pickup) { l.mesh.userData.pickup.visible = false; if (l.mesh.userData.ring) l.mesh.userData.ring.visible = false; }
      }
      if (this.prog.flags.shrineOpen) this.openGateVisual();
      if (this.prog.bossDefeated) {
        this.boss.alive = false; this.boss.dormant = true; this.boss.rig.group.visible = false;
        this.endingReady = true; this.setHeartCleansed();
      }
    },
    beginPlay() {
      this.state = 'playing';
      this.playerRig.group.visible = true;
      UI.show('hud'); UI.hud(this.attrs, this.inv); UI.objective(this.prog.activeObjective());
      this.applyQuality(UI.settings.quality);
      this.requestLookControl();
      this.clock.last = performance.now();
      Audio.setRegion(World.regionAt(this.p.pos.x, this.p.pos.z));
      this.save(false);
    },
    /** Pointer lock is best-effort: embedded previews often deny it. Arrow keys always work. */
    requestLookControl() {
      const canvas = this.renderer.domElement;
      if (!canvas.requestPointerLock) { this.enablePointerFallback(); return; }
      try {
        const r = canvas.requestPointerLock();
        if (r && typeof r.catch === 'function') r.catch(() => this.enablePointerFallback());
      } catch (e) { this.enablePointerFallback(); }
    },
    enablePointerFallback() {
      if (this.pointerFallback) return;
      this.pointerFallback = true;
      UI.toast('Mouse lock unavailable — drag middle mouse or use arrow keys to look.', '');
    },
    pause() {
      if (this.state !== 'playing') return;
      this.state = 'paused'; UI.closePanel(); UI.show('pause');
      document.exitPointerLock();
      const mins = Math.floor(this.playtime / 60);
      document.getElementById('pauseInfo').textContent = mins + ' min played · ' + this.prog.completionPercent() + '% complete · ' + this.kills + ' felled';
    },
    resume() {
      this.state = 'playing'; UI.hide('pause'); UI.hide('settings'); UI.hide('controls');
      this.requestLookControl(); this.clock.last = performance.now();
    },
    quitToMenu() {
      if (this.state === 'playing' || this.state === 'paused') this.save(false);
      this.state = 'menu'; document.exitPointerLock();
      ['pause', 'ending', 'death', 'hud', 'settings', 'controls', 'lore'].forEach(id => UI.hide(id));
      UI.closePanel(); UI.show('menu'); UI.refreshMenu(); Audio.stopAmbient();
    },
    togglePanel(name) {
      UI.togglePanel(name);
      if (UI.openPanel) {
        this.keys = {}; this.gatherTarget = null; this.gatherT = 0; UI.gather(null);
        document.exitPointerLock();
      } else if (this.state === 'playing') this.requestLookControl();
    },
    onPanelClosed() { if (this.state === 'playing') this.requestLookControl(); },

    save(notify) {
      const state = {
        playtime: this.playtime,
        player: { x: this.p.pos.x, z: this.p.pos.z, facing: this.p.yaw },
        attrs: Object.assign(this.attrs.serialize(), { lanternEquipped: !!this.attrs.lanternEquipped }),
        inventory: this.inv.serialize(), progression: this.prog.serialize(),
        checkpoint: this.checkpoint,
        world: { nodesTaken: this.nodeStates, kills: this.kills, deaths: this.deaths }
      };
      const r = SaveSystem.write(localStorage, state);
      if (notify) UI.toast(r.ok ? 'Progress saved.' : 'Save failed: ' + r.error, r.ok ? 'good' : 'bad');
      return r.ok;
    },
    onProgress(e) {
      if (e.type === 'objective') {
        const o = OBJECTIVES.find(x => x.id === e.id);
        UI.toast('Objective complete — ' + o.title, 'good'); Audio.sfx('objective');
        UI.objective(this.prog.activeObjective()); this.save(false);
      } else if (e.type === 'relic') {
        UI.toast('Wardstone recovered (' + e.count + '/3)', 'epic'); Audio.sfx('relic'); this.save(false);
      } else if (e.type === 'shrine_open') {
        UI.toast('The seal breaks. The shrine is open.', 'epic'); Audio.sfx('gate');
      } else if (e.type === 'boss_defeated') { this.save(false); }
      else if (e.type === 'lore') { UI.toast('A memory recovered.', 'good'); }
    },

    // -------------------------------------------------------------- actions
    jump() {
      if (!this.p.grounded || this.attrs.dead || this.p.dodgeT > 0) return;
      this.p.vel.y = CONFIG.player.jumpVelocity; this.p.grounded = false; Audio.sfx('jump');
    },
    dodge() {
      const P = CONFIG.player;
      if (this.p.dodgeCd > 0 || this.p.dodgeT > 0 || this.attrs.dead) return;
      if (!this.attrs.spend(P.dodgeCost)) { UI.toast('Too exhausted to dodge.', 'bad'); Audio.sfx('error'); return; }
      const dir = this.moveDir();
      if (dir.lengthSq() < 0.01) dir.set(Math.sin(this.p.yaw), 0, Math.cos(this.p.yaw));
      this.p.dodgeDir.copy(dir).normalize();
      this.p.dodgeT = P.dodgeTime; this.p.dodgeCd = P.dodgeCooldown;
      this.attrs.invuln = Math.max(this.attrs.invuln, P.dodgeIFrames);
      if (this.p.attack) this.p.attack = null;
      Audio.sfx('dodge');
    },
    startAttack(kind) {
      if (this.attrs.dead || this.p.dodgeT > 0) return;
      if (this.p.attack && !this.p.attack.done) return;
      const spec = CONFIG.combat[kind];
      if (!this.attrs.spend(spec.stamina)) { UI.toast('Not enough stamina.', 'bad'); Audio.sfx('error'); return; }
      this.p.attack = new AttackState(kind, spec);
      this.p.attackTargets = new Set();
      Audio.sfx(kind === 'heavy' ? 'swingHeavy' : 'swing');
      // face camera direction on attack
      this.p.yaw = this.camYaw;
    },
    quickHeal() {
      if (this.inv.count('salve') > 0) this.useItem('salve');
      else if (this.inv.count('elixir') > 0) this.useItem('elixir');
      else { UI.toast('No healing items. Craft a Healing Salve (2 Verdant Leaf).', 'bad'); Audio.sfx('error'); }
    },
    useItem(id) {
      const r = useItem(this.inv, this.attrs, id);
      if (!r.ok) {
        const msg = { already_full: 'Already at full health.', none_left: 'None left.', max_upgrade: 'That upgrade is already maxed.', already_equipped: 'Already equipped.', not_usable: 'That cannot be used.' }[r.reason] || 'Cannot use that.';
        UI.toast(msg, 'bad'); Audio.sfx('error'); return;
      }
      if (r.healed) { this.floatText(this.p.pos, r.healed, 'heal'); Audio.sfx('heal'); }
      else Audio.sfx('pickup');
      if (r.effects.some(x => x.startsWith('upgrade'))) { UI.toast(ITEMS[id].name + ' applied — permanent bonus.', 'good'); Audio.sfx('craft'); }
      if (r.effects.includes('equip:lantern')) { this.setLantern(true); UI.toast('The lantern pushes back the dark.', 'good'); }
      if (r.burst) this.emberBurst(r.burst, r.burstRadius);
      if (r.effects.includes('cleanse')) { this.attrs.cleanse(); UI.corruptFlash(false); }
      UI.hud(this.attrs, this.inv);
      this.save(false);
    },
    setLantern(on) {
      this.attrs.lanternEquipped = on;
      this.playerRig.parts.lantern.visible = on;
      this.lanternOn = on;
    },
    emberBurst(dmg, radius) {
      Audio.sfx('slam'); this.shake = Math.max(this.shake, 0.5);
      this.spawnRingEffect(this.p.pos, radius, 0xff9a3c, 0.5);
      for (const e of this.enemies) {
        if (!e.alive || e.dormant) continue;
        if (World.dist2(e.pos.x, e.pos.z, this.p.pos.x, this.p.pos.z) <= radius) this.damageEnemy(e, dmg, true);
      }
    },
    craft(recipeId) {
      const station = this.nearForge ? 'forge' : 'any';
      const r = Crafting.craft(this.inv, recipeId, station);
      if (!r.ok) { UI.toast('Cannot craft that here.', 'bad'); Audio.sfx('error'); return; }
      UI.toast('Crafted ' + ITEMS[r.produced].name + (r.qty > 1 ? ' ×' + r.qty : ''), 'good');
      Audio.sfx('craft'); this.prog.noteCraft(r.produced);
      UI.hud(this.attrs, this.inv); this.save(false);
    },

    // ------------------------------------------------------------- combat
    damageEnemy(e, amount, isBurst) {
      if (!e.alive) return;
      const res = W.applyDamage(e.brain, e.hp, amount, CONFIG.combat.staggerThreshold);
      e.hp = res.hp; e.flashT = 0.18;
      this.floatText(e.pos, res.applied, amount >= 28 ? 'crit' : '');
      Audio.sfx(amount >= 28 ? 'hitHeavy' : 'hit');
      this.spawnSparks(e.pos, isBurst ? 0xff9a3c : 0xffd9a0, isBurst ? 10 : 6);
      this.shake = Math.max(this.shake, amount >= 28 ? 0.34 : 0.16);
      if (e.isBoss) UI.boss(e.hp, e.maxHp, e.brain.phase);
      if (res.killed) this.killEnemy(e);
    },
    killEnemy(e) {
      e.alive = false; e.brain.state = 'dead'; e.deathT = 0;
      this.kills++; Audio.sfx('enemyDie');
      if (e.telegraphRing) e.telegraphRing.visible = false;
      if (e.isBoss) { this.onBossDefeated(); return; }
      const ess = e.def.xpEssence || 1;
      if (ess > 0) { this.inv.add('essence', ess); this.floatText(e.pos, ess, 'heal'); UI.hud(this.attrs, this.inv); }
      if (Math.random() < 0.22) { this.inv.add('leaf', 1); }
    },
    onBossDefeated() {
      this.bossActive = false; UI.boss(null);
      this.prog.defeatBoss(); this.slowmo = 2.6; this.timeScale = 0.35;
      Audio.sfx('bossRoar'); Audio.sfx('victory');
      this.shake = 1.2;
      this.endingReady = true;
      this.setHeartCleansed();
      UI.toast('The Warden falls. Approach the Heartroot.', 'epic');
      this.spawnRingEffect(this.boss.pos, 24, 0xc46bff, 1.6);
    },
    setHeartCleansed() {
      const h = this.landmarks.heart;
      if (!h) return;
      const heart = h.mesh.userData.heart;
      if (heart) { heart.material.color.setHex(0x8fe8a0); heart.material.emissive.setHex(0x2f6b4a); }
      if (this.shrineRing) this.shrineRing.material.color.setHex(0x8fe8a0);
      for (const a of this.lightAnchors) if (a.owner === h.mesh) a.color = 0x8fe8a0;
    },
    hurtPlayer(amount, srcPos, knock) {
      if (this.attrs.dead) return;
      const applied = this.attrs.takeDamage(amount);
      if (applied <= 0) { if (this.p.dodgeT > 0) this.floatText(this.p.pos, 'DODGE', 'heal'); return; }
      UI.hurtFlash(0.35 + applied / 60); Audio.sfx('hurt');
      this.floatText(this.p.pos, applied, 'player');
      this.shake = Math.max(this.shake, 0.4);
      UI.hud(this.attrs, this.inv);
      if (srcPos && knock) {
        const dx = this.p.pos.x - srcPos.x, dz = this.p.pos.z - srcPos.z, d = Math.hypot(dx, dz) || 1;
        this.p.vel.x += dx / d * knock; this.p.vel.z += dz / d * knock;
      }
      if (this.attrs.dead) this.onPlayerDeath();
    },
    onPlayerDeath() {
      this.deaths++; this.state = 'dead'; document.exitPointerLock();
      Audio.sfx('death'); UI.hud(this.attrs, this.inv);
      UI.death('The land takes you back to the last waystone.', 'Your items and progress are kept.');
      this.save(false);
    },
    respawn() {
      UI.hide('death');
      this.attrs.dead = false; this.attrs.health = this.attrs.maxHealth;
      this.attrs.stamina = this.attrs.maxStamina; this.attrs.invuln = 1.5; this.attrs.corruption = 0;
      UI.corruptFlash(false);
      const cp = this.checkpoint;
      this.p.pos.set(cp.x, World.heightAt(cp.x, cp.z), cp.z); this.p.vel.set(0, 0, 0);
      this.p.attack = null; this.p.dodgeT = 0;
      for (const e of this.enemies) {
        if (e.isBoss) continue;
        e.hp = e.maxHp; e.alive = true; e.brain = AI_makeBrain(e.type, e.home);
        e.pos.set(e.home.x, World.heightAt(e.home.x, e.home.z), e.home.z); e.vel.set(0, 0, 0);
        e.rig.group.visible = true; e.rig.group.scale.setScalar(e.def.scale); e.deathT = 0;
        if (e.telegraphRing) e.telegraphRing.visible = false;
      }
      if (this.boss && this.boss.alive) {
        this.boss.hp = this.boss.maxHp; this.boss.brain = AI_makeBrain('warden', this.boss.home);
        this.boss.pos.set(this.boss.home.x, World.heightAt(this.boss.home.x, this.boss.home.z), this.boss.home.z);
        this.bossActive = false; this.boss.dormant = true; this.boss.rig.group.visible = false; UI.boss(null);
      }
      for (const pr of this.projectiles) this.scene.remove(pr.mesh);
      this.projectiles.length = 0;
      this.nova = null; this.novaMesh.visible = false;
      this.state = 'playing'; UI.hud(this.attrs, this.inv);
      this.requestLookControl(); this.clock.last = performance.now();
      UI.toast('You wake at ' + this.checkpoint.name + '.', 'good');
    },

    // ---------------------------------------------------------- interaction
    findInteractable() {
      let best = null, bestD = Infinity;
      for (const it of this.interactables) {
        if (it.kind === 'node' && it.ref.taken) continue;
        if (it.kind === 'relic' && this.prog.relics[it.ref.id]) continue;
        if (it.kind === 'gate' && this.prog.flags.shrineOpen) continue;
        if (it.kind === 'ending' && !this.endingReady) continue;
        const d = World.dist2(this.p.pos.x, this.p.pos.z, it.x, it.z);
        const r = it.range + (it.kind === 'gate' ? 1.5 : 0);
        if (d < r && d < bestD) { bestD = d; best = it; }
      }
      return best;
    },
    interactLabel(it) {
      switch (it.kind) {
        case 'node': return 'Gather ' + ITEMS[it.ref.item].name;
        case 'relic': return 'Take the ' + it.ref.name;
        case 'lore': return this.prog.loreRead[it.ref.id] ? 'Read again' : 'Read the memory stone';
        case 'forge': return 'Use the ' + it.ref.name;
        case 'checkpoint': return 'Rest at the waystone';
        case 'cache': return this.prog.flags.cacheOpened ? 'Empty cache' : 'Open the hidden cache';
        case 'gate': return this.prog.hasAllRelics() ? 'Unseal the gate' : 'Sealed — ' + this.prog.relicCount() + '/3 wardstones';
        case 'ending': return 'Cleanse the Heartroot';
      }
      return 'Interact';
    },
    doInteract(it) {
      switch (it.kind) {
        case 'relic': {
          const l = it.ref;
          this.prog.addRelic(l.id); this.inv.add(l.item, 1);
          if (l.mesh.userData.pickup) l.mesh.userData.pickup.visible = false;
          if (l.mesh.userData.ring) l.mesh.userData.ring.visible = false;
          this.spawnSparks(new T.Vector3(l.x, World.heightAt(l.x, l.z) + 2.3, l.z), 0xffd98a, 16);
          UI.hud(this.attrs, this.inv); this.save(false); break;
        }
        case 'lore': {
          const l = LORE.find(x => x.id === it.ref.id);
          this.prog.readLore(it.ref.id);
          this.state = 'lore'; document.exitPointerLock();
          UI.showLore(l.title, l.text); Audio.sfx('pickup'); break;
        }
        case 'forge': this.nearForge = true; this.togglePanel('crafting'); break;
        case 'checkpoint': {
          this.checkpoint = { x: it.ref.x, z: it.ref.z, name: it.ref.name };
          this.attrs.health = this.attrs.maxHealth; this.attrs.stamina = this.attrs.maxStamina;
          this.attrs.corruption = 0; UI.corruptFlash(false);
          UI.hud(this.attrs, this.inv);
          UI.toast('Rested at ' + it.ref.name + ' — progress saved.', 'good');
          Audio.sfx('heal'); this.save(false); break;
        }
        case 'cache': {
          if (this.prog.flags.cacheOpened) { UI.toast('Nothing left but dust.', ''); return; }
          this.prog.flags.cacheOpened = true; this.prog.complete('cache');
          const loot = { ingot: 2, salve: 2, crystal: 2, essence: 3 };
          for (const k of Object.keys(loot)) this.inv.add(k, loot[k]);
          UI.toast('Cache opened: 2 Ingots, 2 Salves, 2 Crystals, 3 Essence.', 'good');
          Audio.sfx('pickup'); UI.hud(this.attrs, this.inv); this.save(false); break;
        }
        case 'gate': {
          if (!this.prog.hasAllRelics()) { UI.toast('Three wardstones are required. You have ' + this.prog.relicCount() + '.', 'bad'); Audio.sfx('error'); return; }
          this.prog.unsealShrine(); this.openGateVisual();
          this.boss.dormant = false; this.boss.rig.group.visible = true;
          this.spawnRingEffect(new T.Vector3(it.ref.x, World.heightAt(it.ref.x, it.ref.z), it.ref.z), 12, 0xc46bff, 1.2);
          this.save(false); break;
        }
        case 'ending': this.triggerEnding(); break;
      }
    },
    openGateVisual() {
      const g = this.landmarks.shrine_gate;
      if (!g) return;
      g.mesh.userData.barrier.visible = false; g.mesh.userData.runes.visible = false;
      if (g.collider) { this.world.grid.remove(g.collider); const i = this.world.colliders.indexOf(g.collider); if (i >= 0) this.world.colliders.splice(i, 1); g.collider = null; }
    },
    closeLore() { UI.hide('lore'); this.state = 'playing'; this.requestLookControl(); this.clock.last = performance.now(); },
    triggerEnding() {
      this.state = 'ending'; document.exitPointerLock();
      this.prog.endingSeen = true; this.save(false);
      Audio.sfx('victory'); Audio.stopAmbient();
      const mins = Math.floor(this.playtime / 60), secs = Math.floor(this.playtime % 60);
      UI.hud(this.attrs, this.inv); UI.hide('hud');
      UI.ending({
        percent: this.prog.completionPercent(), time: mins + 'm ' + secs + 's',
        kills: this.kills, gathered: this.prog.gathered, deaths: this.deaths,
        lore: Object.keys(this.prog.loreRead).length
      });
    },
    afterEnding() { UI.hide('ending'); UI.show('hud'); this.state = 'playing'; this.requestLookControl(); this.clock.last = performance.now(); Audio.setRegion(World.regionAt(this.p.pos.x, this.p.pos.z)); },

    // -------------------------------------------------------------- effects
    floatText(worldPos, text, kind) {
      const v = new T.Vector3(worldPos.x, worldPos.y + 2.0, worldPos.z).project(this.camera);
      if (v.z > 1) return;
      UI.damage((v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight, text, kind);
    },
    spawnSparks(pos, color, n) {
      for (let i = 0; i < n; i++) {
        const m = new T.Mesh(this.sparkGeo, new T.MeshBasicMaterial({ color, transparent: true, opacity: 1 }));
        m.position.set(pos.x, pos.y + 1.1, pos.z);
        const a = Math.random() * 6.28, sp = 2 + Math.random() * 4;
        this.scene.add(m);
        this.effects.push({ mesh: m, vel: new T.Vector3(Math.cos(a) * sp, 2 + Math.random() * 3, Math.sin(a) * sp), life: 0.5, max: 0.5, kind: 'spark' });
      }
    },
    spawnRingEffect(pos, radius, color, dur) {
      const m = new T.Mesh(new T.RingGeometry(0.9, 1.0, 40), new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: T.DoubleSide }));
      m.rotation.x = -Math.PI / 2; m.position.set(pos.x, World.heightAt(pos.x, pos.z) + 0.15, pos.z);
      this.scene.add(m);
      this.effects.push({ mesh: m, life: dur, max: dur, kind: 'ring', radius });
    },
    getTelegraphRing(e) {
      if (!e.telegraphRing) {
        const m = new T.Mesh(this.ringGeo, new T.MeshBasicMaterial({ color: 0xff4d5e, transparent: true, opacity: 0.6, side: T.DoubleSide }));
        m.rotation.x = -Math.PI / 2; this.scene.add(m); e.telegraphRing = m;
      }
      return e.telegraphRing;
    },

    // ------------------------------------------------------------- movement
    moveDir() {
      const f = new T.Vector3(Math.sin(this.camYaw), 0, Math.cos(this.camYaw));
      const r = new T.Vector3(f.z, 0, -f.x);
      const d = new T.Vector3();
      if (this.keys['w']) d.add(f);
      if (this.keys['s']) d.sub(f);
      if (this.keys['d']) d.sub(r);
      if (this.keys['a']) d.add(r);
      if (d.lengthSq() > 0) d.normalize();
      return d;
    },
    resolveCollisions(pos, radius, ignoreGate) {
      const near = this.world.grid.near(pos.x, pos.z, radius + 3);
      for (const c of near) {
        if (ignoreGate && c.kind === 'gate') continue;
        const dx = pos.x - c.x, dz = pos.z - c.z;
        const d = Math.hypot(dx, dz), min = c.r + radius;
        if (d < min && d > 0.0001) {
          const push = (min - d);
          pos.x += dx / d * push; pos.z += dz / d * push;
        } else if (d <= 0.0001) { pos.x += min; }
      }
      const half = this.world.size / 2 - 4;
      pos.x = clamp(pos.x, -half, half); pos.z = clamp(pos.z, -half, half);
      return pos;
    },
    hasLineOfSight(ax, az, bx, bz) {
      const dx = bx - ax, dz = bz - az, dist = Math.hypot(dx, dz);
      if (dist < 1) return true;
      const steps = Math.min(14, Math.ceil(dist / 2.5));
      for (let i = 1; i < steps; i++) {
        const t = i / steps, x = ax + dx * t, z = az + dz * t;
        const near = this.world.grid.near(x, z, 3);
        for (const c of near) {
          if (c.kind === 'tree' && c.r < 0.9) continue; // thin trunks don't fully block sight
          if (World.dist2(c.x, c.z, x, z) < c.r * 0.85) return false;
        }
      }
      return true;
    },

    updatePlayer(dt) {
      const P = CONFIG.player, p = this.p, a = this.attrs;
      // Keyboard camera fallback (also useful when pointer lock is denied in an iframe).
      const look = 2.1 * dt;
      if (this.keys['arrowleft']) this.camYaw += look;
      if (this.keys['arrowright']) this.camYaw -= look;
      if (this.keys['arrowup']) this.camPitch = clamp(this.camPitch - look * 0.7, -0.55, 1.15);
      if (this.keys['arrowdown']) this.camPitch = clamp(this.camPitch + look * 0.7, -0.55, 1.15);
      if (p.dodgeCd > 0) p.dodgeCd -= dt;
      const dir = this.moveDir();
      const moving = dir.lengthSq() > 0.01;
      const wantSprint = !!this.keys['shift'] && moving && a.stamina > 1 && !p.attack;
      p.sprinting = wantSprint;
      if (wantSprint) a.stamina = Math.max(0, a.stamina - P.sprintDrain * dt);
      a.update(dt, wantSprint);

      if (p.dodgeT > 0) {
        p.dodgeT -= dt;
        p.vel.x = p.dodgeDir.x * P.dodgeSpeed; p.vel.z = p.dodgeDir.z * P.dodgeSpeed;
        p.yaw = Math.atan2(p.dodgeDir.x, p.dodgeDir.z);
      } else {
        const speed = (wantSprint ? P.sprintSpeed : P.walkSpeed) * a.speedMul * (p.attack ? 0.32 : 1);
        const tx = dir.x * speed, tz = dir.z * speed;
        const acc = (moving ? P.accel : P.decel) * dt;
        p.vel.x += clamp(tx - p.vel.x, -acc, acc);
        p.vel.z += clamp(tz - p.vel.z, -acc, acc);
        if (moving && !p.attack) {
          const want = Math.atan2(dir.x, dir.z);
          let diff = want - p.yaw;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          p.yaw += diff * Math.min(1, dt * 16);
        }
      }
      // gravity + ground
      p.vel.y -= P.gravity * dt;
      p.pos.x += p.vel.x * dt; p.pos.z += p.vel.z * dt; p.pos.y += p.vel.y * dt;
      this.resolveCollisions(p.pos, P.radius);
      const gy = World.heightAt(p.pos.x, p.pos.z);
      if (p.pos.y <= gy) {
        if (!p.grounded && p.vel.y < -6) Audio.sfx('land');
        p.pos.y = gy; p.vel.y = 0; p.grounded = true;
      } else p.grounded = false;

      // footsteps
      const hs = Math.hypot(p.vel.x, p.vel.z);
      if (p.grounded && hs > 1.2) { p.stepT -= dt * hs; if (p.stepT <= 0) { Audio.sfx('step'); p.stepT = 2.6; } }

      // attack resolution
      if (p.attack) {
        p.attack.update(dt);
        if (p.attack.active) {
          const spec = p.attack.spec;
          for (const e of this.enemies) {
            if (!e.alive || e.dormant) continue;
            if (!inArc(p.pos.x, p.pos.z, p.yaw, e.pos.x, e.pos.z, spec.range, spec.arc, e.def.radius * e.def.scale * 0.6)) continue;
            if (!p.attack.tryHit(e.id)) continue;
            this.damageEnemy(e, a.attackDamage(p.attack.kind));
            const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z, d = Math.hypot(dx, dz) || 1;
            if (!e.isBoss) { e.vel.x += dx / d * spec.knock; e.vel.z += dz / d * spec.knock; }
          }
        }
        if (p.attack.done) p.attack = null;
      }
      // corruption in shrine
      const reg = World.regionAt(p.pos.x, p.pos.z);
      if (reg === 'shrine' && !this.prog.bossDefeated && World.dist2(p.pos.x, p.pos.z, World.SHRINE[0], World.SHRINE[1]) < 34) {
        if (a.corruption <= 0) UI.corruptFlash(true);
        a.corruption = 1.2;
      } else if (a.corruption <= 0) UI.corruptFlash(false);

      this.animatePlayer(dt, hs);
      this.playerRig.group.position.copy(p.pos);
      this.playerRig.group.rotation.y = p.yaw;
    },

    animatePlayer(dt, hs) {
      const R = this.playerRig.parts, p = this.p;
      p.animT += dt * (hs > 0.4 ? hs * 1.5 : 1.2);
      const t = p.animT;
      const walk = Math.min(1, hs / 5);
      if (p.dodgeT > 0) {
        const k = 1 - p.dodgeT / CONFIG.player.dodgeTime;
        this.playerRig.group.rotation.x = -k * Math.PI * 2;
        R.hips.position.y = 0.62;
      } else {
        this.playerRig.group.rotation.x = 0;
        R.hips.position.y = 0.92 + Math.sin(t * 2) * 0.035 * walk;
        R.legL.rotation.x = Math.sin(t * 2) * 0.75 * walk;
        R.legR.rotation.x = -Math.sin(t * 2) * 0.75 * walk;
        if (!p.attack) {
          R.armL.rotation.x = -Math.sin(t * 2) * 0.55 * walk;
          R.armR.rotation.x = Math.sin(t * 2) * 0.55 * walk - 0.15;
          R.armR.rotation.z = 0;
        }
        R.cloak.rotation.x = -0.12 - walk * 0.22 + Math.sin(t * 2.3) * 0.05;
      }
      if (p.attack) {
        const k = p.attack.progress, heavy = p.attack.kind === 'heavy';
        const swing = Math.sin(Math.min(1, k * 1.5) * Math.PI);
        R.armR.rotation.x = -2.3 * swing + (heavy ? -0.5 * swing : 0);
        R.armR.rotation.z = -0.7 * swing;
        R.torso.rotation.y = -0.5 * swing;
        R.rune.material.opacity = 0.6 + swing * 0.4;
        R.blade.material.emissive.setHex(p.attack.active ? 0x2f7f9f : 0x14303f);
      } else { R.torso.rotation.y = 0; R.rune.material.opacity = 0.85; R.blade.material.emissive.setHex(0x14303f); }
      if (!p.grounded) { R.legL.rotation.x = -0.4; R.legR.rotation.x = 0.3; }
    },

    // ---------------------------------------------------------------- AI
    updateEnemies(dt) {
      const px = this.p.pos.x, pz = this.p.pos.z;
      for (const e of this.enemies) {
        if (e.dormant) continue;
        const g = e.rig.group;
        if (!e.alive) {
          e.deathT += dt;
          const k = Math.min(1, e.deathT / 1.3);
          g.scale.setScalar(e.def.scale * (1 - k * 0.85));
          g.position.y = e.pos.y - k * 1.2;
          g.rotation.z = k * 0.9;
          if (e.deathT > 1.4) g.visible = false;
          continue;
        }
        const dist = World.dist2(px, pz, e.pos.x, e.pos.z);
        // visibility culling for distant actors (keeps draw calls low)
        const vis = dist < 95;
        if (g.visible !== vis) g.visible = vis;
        if (dist > 130) continue; // far AI sleeps

        e.losT -= dt;
        if (e.losT <= 0) { e.hasLOS = this.hasLineOfSight(e.pos.x, e.pos.z, px, pz); e.losT = 0.25 + Math.random() * 0.15; }

        const percepts = {
          px, pz, bx: e.pos.x, bz: e.pos.z, dist, dt,
          playerDead: this.attrs.dead, hasLOS: e.hasLOS,
          rand: Math.random(), rand2: Math.random(), healthFrac: e.hp / e.maxHp
        };
        const intent = W.step(e.brain, percepts);
        if (intent.phaseChanged) this.onBossPhase(e, intent.phaseChanged);

        // movement
        if (intent.move && intent.speed > 0) {
          const ml = Math.hypot(intent.move.x, intent.move.z) || 1;
          let mx = intent.move.x / ml, mz = intent.move.z / ml;
          // obstacle avoidance
          const near = this.world.grid.near(e.pos.x, e.pos.z, e.def.radius + 3.5);
          for (const c of near) {
            const dx = e.pos.x - c.x, dz = e.pos.z - c.z, d = Math.hypot(dx, dz);
            const infl = c.r + e.def.radius + 1.6;
            if (d < infl && d > 0.001) { const w = (infl - d) / infl * 1.5; mx += dx / d * w; mz += dz / d * w; }
          }
          // separation
          for (const o of this.enemies) {
            if (o === e || !o.alive || o.dormant) continue;
            const dx = e.pos.x - o.pos.x, dz = e.pos.z - o.pos.z, d = Math.hypot(dx, dz);
            const infl = e.def.radius + o.def.radius + 0.8;
            if (d < infl && d > 0.001) { mx += dx / d * 0.7; mz += dz / d * 0.7; }
          }
          const nl = Math.hypot(mx, mz) || 1;
          const tvx = mx / nl * intent.speed, tvz = mz / nl * intent.speed;
          e.vel.x += clamp(tvx - e.vel.x, -30 * dt, 30 * dt);
          e.vel.z += clamp(tvz - e.vel.z, -30 * dt, 30 * dt);
        } else {
          e.vel.x *= Math.max(0, 1 - 8 * dt); e.vel.z *= Math.max(0, 1 - 8 * dt);
        }
        e.pos.x += e.vel.x * dt; e.pos.z += e.vel.z * dt;
        this.resolveCollisions(e.pos, e.def.radius);
        e.pos.y = World.heightAt(e.pos.x, e.pos.z);
        g.position.copy(e.pos);
        g.rotation.y = e.brain.facing;

        // attacks
        if (intent.fire) this.fireProjectile(e);
        if (intent.melee) this.enemyMelee(e, intent.attackKind);
        if (e.brain.state === 'attack' && intent.attackKind === 'charge') {
          if (dist < e.def.radius + CONFIG.player.radius + 1.2 && !e.chargeHit) {
            this.hurtPlayer(e.def.damage, e.pos, e.def.knockback || 5); e.chargeHit = true;
          }
        } else e.chargeHit = false;

        this.animateEnemy(e, dt, intent);
      }
    },
    enemyMelee(e, kind) {
      const def = e.def;
      if (e.isBoss) {
        if (kind === 'slam') {
          Audio.sfx('slam'); this.shake = Math.max(this.shake, 0.7);
          this.spawnRingEffect(e.pos, 8, 0xc46bff, 0.55);
          if (World.dist2(this.p.pos.x, this.p.pos.z, e.pos.x, e.pos.z) < 8 && this.p.pos.y - World.heightAt(this.p.pos.x, this.p.pos.z) < 1.4)
            this.hurtPlayer(def.damage, e.pos, def.knockback);
          return;
        }
        if (kind === 'nova') { this.startNova(e); return; }
        if (kind === 'charge') { Audio.sfx('swingHeavy'); return; }
        // cleave
        Audio.sfx('swingHeavy');
        if (inArc(e.pos.x, e.pos.z, e.brain.facing, this.p.pos.x, this.p.pos.z, def.attackRange + 1.5, def.attackArc, CONFIG.player.radius))
          this.hurtPlayer(def.damage, e.pos, def.knockback);
        this.spawnRingEffect(e.pos, def.attackRange + 1, 0xff5ce0, 0.35);
        return;
      }
      Audio.sfx('swing');
      if (inArc(e.pos.x, e.pos.z, e.brain.facing, this.p.pos.x, this.p.pos.z, def.attackRange, def.attackArc, CONFIG.player.radius))
        this.hurtPlayer(def.damage, e.pos, def.knockback || 3);
    },
    fireProjectile(e) {
      const def = e.def;
      const from = new T.Vector3(e.pos.x, e.pos.y + 1.3 * def.scale, e.pos.z);
      const to = new T.Vector3(this.p.pos.x, this.p.pos.y + 0.9, this.p.pos.z);
      const dir = to.sub(from).normalize();
      const m = new T.Mesh(new T.IcosahedronGeometry(0.22, 0), Art.glowMat(0xc46bff));
      m.position.copy(from); this.scene.add(m);
      this.projectiles.push({ mesh: m, vel: dir.multiplyScalar(def.projectileSpeed || 17), life: 3.2, damage: def.damage, owner: e });
      Audio.sfx('spit');
    },
    updateProjectiles(dt) {
      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        const pr = this.projectiles[i];
        pr.life -= dt;
        pr.vel.y -= 3.2 * dt;
        pr.mesh.position.addScaledVector(pr.vel, dt);
        pr.mesh.rotation.x += dt * 8; pr.mesh.rotation.y += dt * 6;
        const mp = pr.mesh.position;
        let hit = false;
        if (World.dist2(mp.x, mp.z, this.p.pos.x, this.p.pos.z) < 0.85 && Math.abs(mp.y - (this.p.pos.y + 0.9)) < 1.3) {
          this.hurtPlayer(pr.damage, mp, 2); hit = true;
        }
        if (!hit && mp.y < World.heightAt(mp.x, mp.z)) hit = true;
        if (!hit) {
          const near = this.world.grid.near(mp.x, mp.z, 2);
          for (const c of near) if (World.dist2(c.x, c.z, mp.x, mp.z) < c.r && mp.y < World.heightAt(c.x, c.z) + 6) { hit = true; break; }
        }
        if (hit || pr.life <= 0) {
          this.spawnSparks(mp, 0xc46bff, 4);
          this.scene.remove(pr.mesh); pr.mesh.geometry.dispose(); pr.mesh.material.dispose();
          this.projectiles.splice(i, 1);
        }
      }
    },
    startNova(e) {
      Audio.sfx('nova');
      this.nova = { x: e.pos.x, z: e.pos.z, r: 1.5, max: 20, speed: 12, damage: e.def.damage * 0.8, hit: false };
      this.novaMesh.visible = true;
      this.novaMesh.position.set(e.pos.x, World.heightAt(e.pos.x, e.pos.z) + 0.2, e.pos.z);
    },
    updateNova(dt) {
      if (!this.nova) return;
      const n = this.nova;
      n.r += n.speed * dt;
      this.novaMesh.scale.setScalar(n.r);
      this.novaMesh.material.opacity = 0.85 * (1 - n.r / n.max);
      const pd = World.dist2(this.p.pos.x, this.p.pos.z, n.x, n.z);
      const airborne = this.p.pos.y - World.heightAt(this.p.pos.x, this.p.pos.z) > 1.1;
      if (!n.hit && Math.abs(pd - n.r) < 1.3 && !airborne) { this.hurtPlayer(n.damage, new T.Vector3(n.x, this.p.pos.y, n.z), 7); n.hit = true; }
      if (n.r >= n.max) { this.nova = null; this.novaMesh.visible = false; }
    },
    onBossPhase(e, phase) {
      Audio.sfx('bossRoar'); this.shake = 1.0;
      UI.toast('The Warden unbinds its runes — Phase II', 'epic');
      UI.boss(e.hp, e.maxHp, phase);
      this.spawnRingEffect(e.pos, 16, 0xff5ce0, 1.2);
      for (const s of e.rig.parts.shards || []) s.material.color.setHex(0xff5ce0);
      if (e.rig.parts.core) e.rig.parts.core.material.color.setHex(0xff5ce0);
      for (const a of this.lightAnchors) if (a.owner === e.rig.group) a.color = 0xff5ce0;
    },
    animateEnemy(e, dt, intent) {
      const R = e.rig.parts, b = e.brain;
      e.animT += dt;
      const speed = Math.hypot(e.vel.x, e.vel.z);
      const walk = Math.min(1, speed / (e.def.speed || 4));
      const t = e.animT * (2 + walk * 4);
      if (e.flashT > 0) e.flashT -= dt;
      // hit flash via emissive
      const flash = e.flashT > 0 ? 0x882222 : 0x000000;
      if (e._lastFlash !== flash) {
        e.rig.group.traverse(o => { if (o.isMesh && o.material && o.material.emissive) o.material.emissive.setHex(flash); });
        e._lastFlash = flash;
      }
      if (R.legs) R.legs.forEach((l, i) => { l.rotation.x = Math.sin(t + i * Math.PI) * 0.6 * walk; });
      if (R.tendrils) R.tendrils.forEach((td, i) => { td.rotation.z = Math.sin(e.animT * 2 + i) * 0.25; });
      if (e.type === 'spitter') { R.hips.position.y = 1.25 + Math.sin(e.animT * 2) * 0.14; }
      if (e.type === 'stalker') { R.hips.position.y = 0.75 + Math.abs(Math.sin(t)) * 0.09 * walk; }
      if (e.type === 'guardian') { R.hips.position.y = 1.35 + Math.abs(Math.sin(t)) * 0.07 * walk; R.hips.rotation.z = Math.sin(t) * 0.05 * walk; }
      if (R.shards) R.shards.forEach((s, i) => {
        const a = s.userData.a + e.animT * (b.phase === 2 ? 2.2 : 1.1);
        const r = 2.2 + Math.sin(e.animT * 1.5 + i) * 0.3;
        s.position.set(Math.cos(a) * r, 1.2 + Math.sin(e.animT * 1.2 + i) * 0.5, Math.sin(a) * r);
        s.rotation.x += dt * 2; s.rotation.y += dt * 1.5;
      });
      // telegraph
      const tel = b.state === 'telegraph';
      const ring = this.getTelegraphRing(e);
      if (tel) {
        const kind = b.attackKind;
        const rad = e.isBoss ? (kind === 'slam' ? 8 : kind === 'nova' ? 3.5 : def_range(e)) : def_range(e);
        ring.visible = true;
        ring.position.set(e.pos.x, e.pos.y + 0.12, e.pos.z);
        ring.scale.setScalar(rad);
        const pulse = 0.45 + Math.abs(Math.sin(e.animT * 14)) * 0.4;
        ring.material.opacity = pulse;
        ring.material.color.setHex(e.isBoss ? 0xc46bff : 0xff4d5e);
        if (R.telegraphMesh && R.telegraphMesh.material) {
          if (R.telegraphMesh.material.emissive) R.telegraphMesh.material.emissive.setHex(0x662222);
          else R.telegraphMesh.material.color.setHex(0xff8899);
        }
        if (!e._telSfx) { Audio.sfx('telegraph'); e._telSfx = true; }
        if (R.armR && e.type !== 'spitter') R.armR.rotation.x = -1.4 * Math.min(1, b.t / (e.def.telegraph || 0.5));
      } else {
        ring.visible = false; e._telSfx = false;
        if (R.telegraphMesh && R.telegraphMesh.material && R.telegraphMesh.material.emissive && e.flashT <= 0) R.telegraphMesh.material.emissive.setHex(0x000000);
        if (b.state === 'attack') {
          const k = Math.min(1, b.t / Math.max(0.05, e.def.active));
          if (R.armR) R.armR.rotation.x = -1.4 + 3.0 * k;
          if (R.armL && e.isBoss) R.armL.rotation.x = -1.4 + 3.0 * k;
        } else if (R.armR && e.type !== 'stalker') {
          R.armR.rotation.x = Math.sin(t) * 0.4 * walk;
          if (R.armL) R.armL.rotation.x = -Math.sin(t) * 0.4 * walk;
        }
      }
      function def_range(en) { return en.def.attackRange; }
    },

    // -------------------------------------------------------- interaction tick
    updateInteraction(dt) {
      const it = this.findInteractable();
      this.currentTarget = it;
      this.nearForge = false;
      for (const x of this.interactables) if (x.kind === 'forge' && World.dist2(this.p.pos.x, this.p.pos.z, x.x, x.z) < 6) this.nearForge = true;
      if (!it) { UI.prompt(null); UI.gather(null); this.gatherTarget = null; this.gatherT = 0; return; }
      UI.prompt(this.interactLabel(it));
      if (it.kind === 'node') {
        if (this.keys['e']) {
          if (this.gatherTarget !== it) { this.gatherTarget = it; this.gatherT = 0; }
          this.gatherT += dt;
          UI.gather(Math.min(1, this.gatherT / CONFIG.gatherTime));
          if (this.gatherT >= CONFIG.gatherTime) {
            const n = it.ref;
            const added = this.inv.add(n.item, n.qty);
            if (added > 0) {
              n.taken = true; n.mesh.visible = false; n.respawn = 120;
              this.nodeStates[n.id] = true;
              this.prog.noteGather();
              UI.toast('+' + added + ' ' + ITEMS[n.item].name, 'good');
              Audio.sfx('pickup'); UI.hud(this.attrs, this.inv);
              this.spawnSparks(new T.Vector3(n.x, World.heightAt(n.x, n.z), n.z), 0x9fe8a0, 6);
            } else { UI.toast('Cannot carry more ' + ITEMS[n.item].name + '.', 'bad'); Audio.sfx('error'); }
            this.gatherT = 0; this.gatherTarget = null; UI.gather(null);
          }
        } else { this.gatherT = 0; this.gatherTarget = null; UI.gather(null); }
      } else {
        UI.gather(null);
        if (this.keys['e'] && !this._eLatch) { this._eLatch = true; this.doInteract(it); }
      }
      if (!this.keys['e']) this._eLatch = false;
    },
    updateNodes(dt) {
      for (const n of this.world.nodes) {
        if (!n.taken) continue;
        n.respawn -= dt;
        if (n.respawn <= 0) { n.taken = false; n.mesh.visible = true; delete this.nodeStates[n.id]; }
      }
    },

    // ------------------------------------------------------------ atmosphere
    updateAtmosphere(dt) {
      const reg = World.regionAt(this.p.pos.x, this.p.pos.z);
      const R = REGIONS[reg];
      const inside = World.inCave(this.p.pos.x, this.p.pos.z);
      const targetFog = inside ? REGIONS.cave : R;
      const k = Math.min(1, dt * 1.4);
      this.scene.fog.color.lerp(new T.Color(targetFog.fog), k);
      this.scene.fog.density = lerp(this.scene.fog.density, targetFog.fogDensity, k);
      this.ambient.color.lerp(new T.Color(targetFog.ambient), k);
      this.ambient.intensity = lerp(this.ambient.intensity, inside ? 0.55 : 0.35, k);
      this.sun.intensity = lerp(this.sun.intensity, inside ? 0.12 : (reg === 'shrine' ? 0.55 : 1.15), k);
      this.hemi.intensity = lerp(this.hemi.intensity, inside ? 0.22 : 0.75, k);
      const skyTop = inside ? 0x0a0f16 : reg === 'shrine' ? 0x3a2a55 : 0x4a7fb5;
      const skyBot = inside ? 0x141a24 : reg === 'shrine' ? 0x6a4a7a : 0xd8e4c8;
      this.skyUniforms.top.value.lerp(new T.Color(skyTop), k);
      this.skyUniforms.bottom.value.lerp(new T.Color(skyBot), k);
      this.renderer.setClearColor(this.scene.fog.color);
      if (this._reg !== reg) { this._reg = reg; UI.region(R.name); Audio.setRegion(reg); }
      // sun shadow follows player
      this.sun.position.set(this.p.pos.x + 48, this.p.pos.y + 78, this.p.pos.z + 30);
      this.sun.target.position.copy(this.p.pos);
      this.sky.position.copy(this.p.pos);
      this.mountains.position.set(this.p.pos.x, 0, this.p.pos.z);
      // motes drift
      if (this.motes) {
        const arr = this.motes.geometry.attributes.position.array;
        for (let i = 1; i < arr.length; i += 3) { arr[i] += dt * 0.55; if (arr[i] > World.heightAt(World.SHRINE[0], World.SHRINE[1]) + 15) arr[i] = World.heightAt(World.SHRINE[0], World.SHRINE[1]); }
        this.motes.geometry.attributes.position.needsUpdate = true;
        this.motes.material.color.setHex(this.prog.bossDefeated ? 0x8fe8a0 : 0xc46bff);
      }
      if (this.shrineRing) this.shrineRing.material.opacity = 0.25 + Math.abs(Math.sin(this.timeUniform.value * 1.2)) * 0.2;
    },
    updateLightPool() {
      // slot 0: player lantern; slots 1..5: nearest anchors
      const pool = this.lightPool;
      const l0 = pool[0];
      if (this.lanternOn) {
        l0.position.set(this.p.pos.x, this.p.pos.y + 1.5, this.p.pos.z);
        l0.color.setHex(0xffd79a); l0.intensity = 1.6; l0.distance = 18;
      } else { l0.intensity = 0; }
      const cand = [];
      for (const a of this.lightAnchors) {
        if (!a.owner.visible) continue;
        const wp = a.owner.position;
        const lx = wp.x + a.local.x, ly = wp.y + a.local.y, lz = wp.z + a.local.z;
        const d = World.dist2(lx, lz, this.p.pos.x, this.p.pos.z);
        if (d < 42) cand.push({ a, d, x: lx, y: ly, z: lz });
      }
      cand.sort((x, y) => x.d - y.d);
      for (let i = 1; i < pool.length; i++) {
        const c = cand[i - 1], l = pool[i];
        if (!c) { l.intensity = 0; continue; }
        l.position.set(c.x, c.y, c.z); l.color.setHex(c.a.color);
        l.distance = c.a.dist;
        l.intensity = c.a.intensity * clamp(1 - (c.d - 30) / 12, 0, 1);
      }
    },
    updateLandmarks(dt) {
      const t = this.timeUniform.value;
      for (const id in this.landmarks) {
        const l = this.landmarks[id], u = l.mesh.userData;
        if (u.spin) { u.spin.rotation.y += dt * 0.9; u.spin.position.y += Math.sin(t * 1.6 + l.x) * dt * 0.12; }
        if (u.ring) u.ring.rotation.z += dt * 0.6;
        if (u.runes && u.runes.visible) u.runes.children.forEach((r, i) => { r.rotation.z += dt * (0.5 + i * 0.2); });
        if (u.barrier && u.barrier.visible) u.barrier.material.opacity = 0.28 + Math.abs(Math.sin(t * 1.5)) * 0.14;
      }
    },
    updateEffects(dt) {
      for (let i = this.effects.length - 1; i >= 0; i--) {
        const f = this.effects[i];
        f.life -= dt;
        if (f.kind === 'spark') {
          f.vel.y -= 12 * dt;
          f.mesh.position.addScaledVector(f.vel, dt);
          f.mesh.material.opacity = Math.max(0, f.life / f.max);
          f.mesh.scale.setScalar(0.5 + f.life / f.max);
        } else if (f.kind === 'ring') {
          const k = 1 - f.life / f.max;
          f.mesh.scale.setScalar(0.5 + k * f.radius);
          f.mesh.material.opacity = 0.85 * (1 - k);
        }
        if (f.life <= 0) {
          this.scene.remove(f.mesh);
          if (f.kind === 'ring') f.mesh.geometry.dispose();
          f.mesh.material.dispose();
          this.effects.splice(i, 1);
        }
      }
    },
    updateCamera(dt) {
      const p = this.p;
      const target = new T.Vector3(p.pos.x, p.pos.y + 1.55, p.pos.z);
      const dir = new T.Vector3(
        Math.sin(this.camYaw) * Math.cos(this.camPitch),
        Math.sin(this.camPitch),
        Math.cos(this.camYaw) * Math.cos(this.camPitch)
      );
      let dist = this.camDist;
      // pull camera in if geometry is between it and the player
      for (let s = dist; s > 1.4; s -= 0.45) {
        const cx = target.x - dir.x * s, cz = target.z - dir.z * s;
        const cy = target.y - dir.y * s;
        let blocked = cy < World.heightAt(cx, cz) + 0.5;
        if (!blocked) {
          const near = this.world.grid.near(cx, cz, 2.5);
          for (const c of near) {
            if (c.kind === 'tree' && c.r < 0.75) continue;
            if (World.dist2(c.x, c.z, cx, cz) < c.r + 0.35 && cy < World.heightAt(c.x, c.z) + 7) { blocked = true; break; }
          }
        }
        if (!blocked) { dist = s; break; }
        dist = s - 0.45;
      }
      dist = Math.max(1.6, dist);
      const desired = new T.Vector3(target.x - dir.x * dist, target.y - dir.y * dist + 0.35, target.z - dir.z * dist);
      if (this.shake > 0) {
        this.shake = Math.max(0, this.shake - dt * 2.2);
        const s = this.shake * 0.32;
        desired.x += (Math.random() - 0.5) * s; desired.y += (Math.random() - 0.5) * s; desired.z += (Math.random() - 0.5) * s;
      }
      this.camera.position.lerp(desired, Math.min(1, dt * 14));
      this.camera.lookAt(target);
    },

    // ---------------------------------------------------------------- loop
    loop(now) {
      requestAnimationFrame(this.loop);
      let dt = (now - this.clock.last) / 1000;
      this.clock.last = now;
      if (!isFinite(dt) || dt < 0) dt = 0;
      dt = Math.min(dt, 0.05);
      this.frameCount++;
      // fps
      this.fpsSamples.push(dt);
      if (this.fpsSamples.length > 60) this.fpsSamples.shift();
      if (UI.settings.fps && this.frameCount % 20 === 0) {
        const avg = this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length;
        const sorted = this.fpsSamples.slice().sort((a, b) => b - a);
        const low = sorted[Math.floor(sorted.length * 0.01)] || avg;
        document.getElementById('fps').textContent = (1 / avg).toFixed(0) + ' fps · ' + (avg * 1000).toFixed(1) + ' ms · 1% low ' + (1 / low).toFixed(0);
      }
      if (!this.world || !this.p || this.fatal) return;
      this.timeUniform.value += dt;

      if (this.state === 'playing' && !UI.openPanel) {
        if (this.slowmo > 0) { this.slowmo -= dt; if (this.slowmo <= 0) this.timeScale = 1; }
        const sdt = dt * this.timeScale;
        this.playtime += sdt;
        this.updatePlayer(sdt);
        this.updateEnemies(sdt);
        this.updateProjectiles(sdt);
        this.updateNova(sdt);
        this.updateInteraction(sdt);
        this.updateNodes(sdt);
        this.updateEffects(sdt);
        this.updateLandmarks(sdt);
        this.updateBossTrigger();
        this.autosaveT += sdt;
        if (this.autosaveT > 60) { this.autosaveT = 0; this.save(false); }
        if (!this.prog.isDone('arrive') && this.p.pos.z > -130) this.prog.complete('arrive');
        UI.hud(this.attrs, this.inv);
      } else if (this.state === 'dead' || this.state === 'ending') {
        this.updateEffects(dt); this.updateLandmarks(dt);
      }
      this.updateAtmosphere(dt);
      this.updateLightPool();
      if (this.state !== 'menu') this.updateCamera(dt);
      else this.menuCamera(dt);
      this.renderer.render(this.scene, this.camera);
    },
    updateBossTrigger() {
      if (this.bossActive || !this.boss || !this.boss.alive || this.boss.dormant) return;
      const d = World.dist2(this.p.pos.x, this.p.pos.z, World.SHRINE[0], World.SHRINE[1]);
      if (d < 30 && this.prog.flags.shrineOpen) {
        this.bossActive = true; this.boss.rig.group.visible = true;
        UI.boss(this.boss.hp, this.boss.maxHp, 1);
        Audio.sfx('bossRoar'); this.shake = 0.9;
        UI.toast('THE RUNEBOUND WARDEN', 'epic');
      }
    },
    menuCamera(dt) {
      const t = this.timeUniform.value * 0.06;
      const cx = Math.sin(t) * 46, cz = -120 + Math.cos(t) * 30;
      this.camera.position.set(cx, World.heightAt(cx, cz) + 12, cz);
      this.camera.lookAt(0, World.heightAt(0, -60) + 4, -60);
      if (this.playerRig) this.playerRig.group.visible = false;
    }
  };

  function AI_makeBrain(type, home) { return W.makeBrain(type, home); }

  // ------------------------------------------------------------------ boot
  root.WRGame = Game;
  function boot() {
    try {
      UI.init(Game);
      Game.init();
      setTimeout(() => {
        try {
          Game.buildWorld(CONFIG.world.seed);
          Game.applyQuality(UI.settings.quality);
          UI.loading(100, 'The lands are waiting.');
          setTimeout(() => {
            const l = document.getElementById('loading');
            l.classList.add('fadeOut');
            setTimeout(() => l.classList.add('hidden'), 650);
            UI.refreshMenu();
            if (Game.playerRig) Game.playerRig.group.visible = false;
          }, 420);
        } catch (err) { showBootError(err); }
      }, 60);
    } catch (err) { showBootError(err); }
  }
  function showBootError(err) {
    Game.fatal = err;
    console.error('WILDRUNE boot failed:', err);
    const tip = document.getElementById('loadTip');
    if (tip) tip.textContent = 'The lands could not be raised: ' + (err && err.message ? err.message : String(err)) + '. Try a WebGL-capable browser or lower graphics quality.';
    const bar = document.querySelector('#loadBar i');
    if (bar) bar.style.background = '#c8434a';
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof globalThis !== 'undefined' ? globalThis : this);
