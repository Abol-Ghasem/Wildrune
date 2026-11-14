/* WILDRUNE — procedural audio. All sound synthesized via WebAudio: no audio assets. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else { root.WR = root.WR || {}; Object.assign(root.WR, factory(root)); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const Audio = {
    ctx: null, master: null, musicGain: null, sfxGain: null,
    volume: 0.7, musicVolume: 0.45, enabled: true, started: false,
    ambient: null, currentRegion: null,

    init() {
      if (this.ctx) return true;
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) { this.enabled = false; return false; }
      try {
        this.ctx = new AC();
        this.master = this.ctx.createGain(); this.master.gain.value = this.volume; this.master.connect(this.ctx.destination);
        this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = 1; this.sfxGain.connect(this.master);
        this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = this.musicVolume; this.musicGain.connect(this.master);
        return true;
      } catch (e) { this.enabled = false; return false; }
    },
    resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
    setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; },
    setMusicVolume(v) { this.musicVolume = v; if (this.musicGain) this.musicGain.gain.value = v; },
    now() { return this.ctx ? this.ctx.currentTime : 0; },

    tone(freq, dur, type, gain, slideTo, delay) {
      if (!this.enabled || !this.ctx) return;
      const t = this.now() + (delay || 0);
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain == null ? 0.2 : gain), t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.sfxGain); o.start(t); o.stop(t + dur + 0.05);
    },
    noise(dur, gain, filterFreq, type, delay) {
      if (!this.enabled || !this.ctx) return;
      const t = this.now() + (delay || 0);
      const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource(); src.buffer = buf;
      const f = this.ctx.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = filterFreq || 1200; f.Q.value = 1.2;
      const g = this.ctx.createGain(); g.gain.setValueAtTime(gain == null ? 0.2 : gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(this.sfxGain); src.start(t); src.stop(t + dur + 0.02);
    },

    sfx(name) {
      if (!this.enabled || !this.ctx) return;
      switch (name) {
        case 'swing':      this.noise(0.16, 0.16, 1700, 'bandpass'); this.tone(320, 0.12, 'triangle', 0.05, 180); break;
        case 'swingHeavy': this.noise(0.28, 0.22, 900, 'bandpass'); this.tone(180, 0.22, 'sawtooth', 0.07, 90); break;
        case 'hit':        this.noise(0.12, 0.3, 2400, 'bandpass'); this.tone(140, 0.14, 'square', 0.14, 60); break;
        case 'hitHeavy':   this.noise(0.22, 0.36, 1200, 'bandpass'); this.tone(90, 0.28, 'square', 0.18, 40); break;
        case 'hurt':       this.tone(220, 0.26, 'sawtooth', 0.2, 90); this.noise(0.18, 0.16, 700); break;
        case 'dodge':      this.noise(0.22, 0.13, 2600, 'highpass'); this.tone(500, 0.14, 'sine', 0.05, 900); break;
        case 'jump':       this.tone(340, 0.14, 'sine', 0.1, 620); break;
        case 'land':       this.noise(0.1, 0.12, 400, 'lowpass'); break;
        case 'step':       this.noise(0.06, 0.045, 520, 'lowpass'); break;
        case 'pickup':     this.tone(660, 0.1, 'sine', 0.13); this.tone(990, 0.14, 'sine', 0.1, null, 0.07); break;
        case 'craft':      this.tone(440, 0.1, 'triangle', 0.12); this.tone(660, 0.1, 'triangle', 0.12, null, 0.08); this.tone(880, 0.2, 'triangle', 0.12, null, 0.16); break;
        case 'heal':       this.tone(520, 0.2, 'sine', 0.12, 780); this.tone(780, 0.3, 'sine', 0.08, 1040, 0.1); break;
        case 'error':      this.tone(180, 0.16, 'square', 0.1, 120); break;
        case 'ui':         this.tone(720, 0.05, 'sine', 0.06); break;
        case 'objective':  this.tone(587, 0.16, 'triangle', 0.12); this.tone(784, 0.16, 'triangle', 0.12, null, 0.12); this.tone(1046, 0.34, 'triangle', 0.12, null, 0.24); break;
        case 'relic':      this.tone(523, 0.3, 'sine', 0.14); this.tone(784, 0.3, 'sine', 0.12, null, 0.12); this.tone(1046, 0.5, 'sine', 0.12, null, 0.24); this.tone(1568, 0.6, 'sine', 0.07, null, 0.36); break;
        case 'enemyDie':   this.tone(300, 0.4, 'sawtooth', 0.14, 60); this.noise(0.35, 0.16, 500, 'lowpass'); break;
        case 'spit':       this.tone(700, 0.16, 'sawtooth', 0.09, 240); break;
        case 'telegraph':  this.tone(160, 0.3, 'sawtooth', 0.07, 240); break;
        case 'bossRoar':   this.tone(70, 1.5, 'sawtooth', 0.26, 42); this.tone(105, 1.3, 'square', 0.12, 60, 0.05); this.noise(1.2, 0.16, 320, 'lowpass'); break;
        case 'nova':       this.tone(120, 0.8, 'sawtooth', 0.2, 900); this.noise(0.7, 0.2, 1800, 'bandpass'); break;
        case 'slam':       this.tone(60, 0.6, 'square', 0.28, 30); this.noise(0.5, 0.28, 260, 'lowpass'); break;
        case 'death':      this.tone(300, 1.2, 'sine', 0.2, 70); this.tone(150, 1.6, 'triangle', 0.14, 50, 0.15); break;
        case 'victory':    [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.7, 'triangle', 0.13, null, i * 0.16)); break;
        case 'gate':       this.tone(90, 1.2, 'sawtooth', 0.2, 220); this.noise(1.0, 0.18, 600, 'lowpass'); this.tone(440, 0.8, 'sine', 0.1, 880, 0.4); break;
      }
    },

    /** Region ambience: layered drones + filtered noise, crossfaded on region change. */
    setRegion(region) {
      if (!this.enabled || !this.ctx || this.currentRegion === region) return;
      this.currentRegion = region;
      this.stopAmbient();
      const cfg = {
        forest: { base: 110, fifth: 165, noise: 900, nGain: 0.035, type: 'sine', lfo: 0.07 },
        cave:   { base: 55,  fifth: 82,  noise: 320, nGain: 0.05,  type: 'triangle', lfo: 0.04 },
        ruins:  { base: 98,  fifth: 147, noise: 1400, nGain: 0.03, type: 'sine', lfo: 0.09 },
        shrine: { base: 62,  fifth: 93,  noise: 500, nGain: 0.06, type: 'sawtooth', lfo: 0.13 }
      }[region] || { base: 110, fifth: 165, noise: 900, nGain: 0.03, type: 'sine', lfo: 0.07 };

      const g = this.ctx.createGain(); g.gain.value = 0; g.connect(this.musicGain);
      g.gain.linearRampToValueAtTime(0.5, this.now() + 2.5);
      const nodes = [];
      for (const f of [cfg.base, cfg.fifth, cfg.base * 2]) {
        const o = this.ctx.createOscillator(); o.type = cfg.type; o.frequency.value = f;
        const og = this.ctx.createGain(); og.gain.value = f === cfg.base ? 0.16 : 0.06;
        const lfo = this.ctx.createOscillator(); lfo.frequency.value = cfg.lfo * (1 + Math.random());
        const lg = this.ctx.createGain(); lg.gain.value = f * 0.008;
        lfo.connect(lg); lg.connect(o.frequency);
        o.connect(og); og.connect(g); o.start(); lfo.start(); nodes.push(o, lfo);
      }
      // wind / rumble bed
      const len = this.ctx.sampleRate * 4;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const filt = this.ctx.createBiquadFilter(); filt.type = 'bandpass'; filt.frequency.value = cfg.noise; filt.Q.value = 0.7;
      const ng = this.ctx.createGain(); ng.gain.value = cfg.nGain;
      src.connect(filt); filt.connect(ng); ng.connect(g); src.start(); nodes.push(src);
      this.ambient = { gain: g, nodes };
    },
    stopAmbient() {
      if (!this.ambient) return;
      const a = this.ambient; this.ambient = null;
      try {
        a.gain.gain.cancelScheduledValues(this.now());
        a.gain.gain.setValueAtTime(a.gain.gain.value, this.now());
        a.gain.gain.linearRampToValueAtTime(0.0001, this.now() + 1.2);
        setTimeout(() => { a.nodes.forEach(n => { try { n.stop(); } catch (e) {} }); try { a.gain.disconnect(); } catch (e) {} }, 1500);
      } catch (e) {}
    }
  };
  return { Audio };
});
