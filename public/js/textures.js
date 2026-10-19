// Procedural textures painted on canvases at load time (no image downloads).
// Each texture also works as its own bump map, which gives surfaces real relief under the sun.
import * as THREE from 'three';

function rng(seed) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }

// tileable value noise
function noiseField(size, cell, seed) {
  const r = rng(seed), n = Math.ceil(size / cell), g = [];
  for (let i = 0; i < n * n; i++) g.push(r());
  const at = (x, y) => g[((y % n + n) % n) * n + ((x % n + n) % n)];
  return (x, y) => {
    const fx = x / cell, fy = y / cell, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}
function fbm(size, seed, cells = [64, 32, 16, 8]) {
  const layers = cells.map((c, i) => noiseField(size, c, seed + i * 101));
  return (x, y) => { let v = 0, w = 0.5, t = 0; layers.forEach(f => { v += f(x, y) * w; t += w; w *= 0.5; }); return v / t; };
}
const hex = c => { const v = new THREE.Color(c); return [v.r * 255, v.g * 255, v.b * 255]; };

function canvas(size) { const c = document.createElement('canvas'); c.width = c.height = size; return [c, c.getContext('2d')]; }

function pixelPaint(size, seed, fn) {
  const [c, x] = canvas(size), img = x.createImageData(size, size), n = fbm(size, seed);
  for (let y = 0; y < size; y++) for (let X = 0; X < size; X++) {
    const [r, g, b] = fn(n(X, y), X, y), i = (y * size + X) * 4;
    img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return [c, x];
}
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const PAINTERS = {
  grass(size) {
    const A = hex('#5f8f3e'), B = hex('#86b052'), C = hex('#a6c46a');
    const [c, x] = pixelPaint(size, 3, v => v < 0.5 ? mix(A, B, v * 2) : mix(B, C, (v - 0.5) * 2));
    const r = rng(9);
    for (let i = 0; i < size * 6; i++) {
      const px = r() * size, py = r() * size, l = 3 + r() * 7, a = -0.5 + r();
      x.strokeStyle = `rgba(${r() < 0.5 ? '40,70,25' : '190,215,120'},${0.15 + r() * 0.25})`;
      x.lineWidth = 1; x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.sin(a) * l, py - Math.cos(a) * l); x.stroke();
    }
    return c;
  },
  dirt(size) {
    const A = hex('#8c6a45'), B = hex('#b89668'), C = hex('#c9ab7e');
    const [c, x] = pixelPaint(size, 5, v => v < 0.55 ? mix(A, B, v / 0.55) : mix(B, C, (v - 0.55) / 0.45));
    const r = rng(4);
    for (let i = 0; i < 260; i++) { x.fillStyle = `rgba(${r() < 0.5 ? '90,70,50' : '210,195,170'},${0.3 + r() * 0.4})`; x.beginPath(); x.ellipse(r() * size, r() * size, 1 + r() * 3, 1 + r() * 2, r() * 3, 0, 7); x.fill(); }
    return c;
  },
  wood(size, opt = {}) {
    const base = hex(opt.color || '#9a6e45'), dark = mix(base, [40, 25, 15], 0.45), lite = mix(base, [255, 235, 200], 0.18);
    const g = noiseField(size, 16, 7), r = rng(13);
    const [c, x] = canvas(size), img = x.createImageData(size, size);
    const planks = opt.planks || 4, pw = size / planks, offs = Array.from({ length: planks }, () => r());
    for (let y = 0; y < size; y++) for (let X = 0; X < size; X++) {
      const p = Math.floor(X / pw), local = (X % pw) / pw;
      const grain = Math.sin((X * 0.9 + g(X * 0.2, y * 3) * 40 + offs[p] * 50) * 0.55) * 0.5 + 0.5;
      let col = mix(dark, lite, 0.35 + grain * 0.35 + (offs[p] - 0.5) * 0.25);
      if (local < 0.04 || local > 0.96) col = mix(col, [30, 20, 12], 0.6);
      const i = (y * size + X) * 4; img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    if (opt.knots) for (let i = 0; i < 6; i++) { x.fillStyle = 'rgba(50,30,15,0.5)'; x.beginPath(); x.ellipse(r() * size, r() * size, 2 + r() * 3, 4 + r() * 6, 0, 0, 7); x.fill(); }
    return c;
  },
  siding(size, opt = {}) {
    const base = hex(opt.color || '#efe3cc'), r = rng(21), n = fbm(size, 8, [32, 16, 8]);
    const [c, x] = pixelPaint(size, 8, v => mix(base, mix(base, [150, 130, 100], 0.4), v * 0.35));
    const rows = 8, h = size / rows;
    for (let i = 0; i < rows; i++) {
      const y = i * h;
      const gr = x.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, 'rgba(0,0,0,0.22)'); gr.addColorStop(0.12, 'rgba(0,0,0,0)'); gr.addColorStop(0.9, 'rgba(255,255,255,0.08)'); gr.addColorStop(1, 'rgba(0,0,0,0.12)');
      x.fillStyle = gr; x.fillRect(0, y, size, h);
    }
    for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(110,90,60,${r() * 0.08})`; x.fillRect(r() * size, r() * size, 2 + r() * 30, 1 + r() * 2); }
    void n;
    return c;
  },
  boards(size, opt = {}) {   // vertical barn boards
    const base = hex(opt.color || '#b23b2e'), r = rng(31);
    const [c, x] = pixelPaint(size, 11, (v, X) => { const k = (X % (size / 8)) / (size / 8); let col = mix(base, mix(base, [60, 20, 15], 0.5), v * 0.5); if (k < 0.04) col = mix(col, [30, 10, 8], 0.65); return col; });
    for (let i = 0; i < 160; i++) { x.fillStyle = `rgba(255,230,210,${r() * 0.12})`; x.fillRect(r() * size, r() * size, 1, 6 + r() * 30); }
    return c;
  },
  shingles(size, opt = {}) {
    const base = hex(opt.color || '#a8443a'), r = rng(41);
    const [c, x] = canvas(size); x.fillStyle = `rgb(${mix(base, [0, 0, 0], 0.5).join(',')})`; x.fillRect(0, 0, size, size);
    const rows = 10, h = size / rows, w = size / 8;
    for (let row = 0; row < rows; row++) for (let k = -1; k < 9; k++) {
      const off = row % 2 ? w / 2 : 0, t = r();
      const col = mix(base, t < 0.5 ? [40, 15, 10] : [255, 210, 190], t < 0.5 ? (0.5 - t) * 0.5 : (t - 0.5) * 0.3);
      const g = x.createLinearGradient(0, row * h, 0, row * h + h); g.addColorStop(0, `rgb(${mix(col, [0, 0, 0], 0.25).join(',')})`); g.addColorStop(1, `rgb(${col.join(',')})`);
      x.fillStyle = g; x.fillRect(k * w + off + 1, row * h + 1, w - 2, h - 2);
    }
    return c;
  },
  metal(size) {
    const [c, x] = pixelPaint(size, 51, (v, X) => { const s = Math.sin(X / size * Math.PI * 24) * 0.5 + 0.5; return mix(hex('#8e969e'), hex('#c7ccd1'), s * 0.6 + v * 0.4); });
    const r = rng(52); for (let i = 0; i < 30; i++) { x.fillStyle = `rgba(140,90,50,${r() * 0.25})`; x.beginPath(); x.ellipse(r() * size, r() * size, 2 + r() * 8, 1 + r() * 4, 0, 0, 7); x.fill(); }
    return c;
  },
  hay(size) {
    const [c, x] = pixelPaint(size, 61, v => mix(hex('#b8913f'), hex('#e6c674'), v));
    const r = rng(62);
    for (let i = 0; i < size * 5; i++) { const px = r() * size, py = r() * size, l = 5 + r() * 14, a = r() * 0.6 - 0.3; x.strokeStyle = `rgba(${r() < 0.5 ? '120,90,30' : '250,225,150'},${0.25 + r() * 0.35})`; x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke(); }
    return c;
  },
  stone(size) {
    const [c, x] = pixelPaint(size, 71, v => mix(hex('#7f7b74'), hex('#b5b0a6'), v));
    const r = rng(72); for (let i = 0; i < 200; i++) { x.fillStyle = `rgba(${r() < 0.5 ? '60,58,55' : '220,215,205'},${r() * 0.3})`; x.fillRect(r() * size, r() * size, 1 + r() * 3, 1 + r() * 3); }
    return c;
  },
  water(size) {
    const [c] = pixelPaint(size, 81, v => mix(hex('#2f6f92'), hex('#5aa3c4'), v));
    return c;
  },
};

const cache = {};
export function tex(kind, repeatX = 1, repeatY = repeatX, opt = {}) {
  const key = kind + JSON.stringify(opt);
  if (!cache[key]) {
    const size = opt.size || 512;
    const t = new THREE.CanvasTexture(PAINTERS[kind](size, opt));
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    const b = new THREE.CanvasTexture(t.image); b.wrapS = b.wrapT = THREE.RepeatWrapping;
    cache[key] = { map: t, bump: b };
  }
  const { map, bump } = cache[key];
  const m = map.clone(), b = bump.clone();
  m.repeat.set(repeatX, repeatY); b.repeat.set(repeatX, repeatY);
  m.needsUpdate = b.needsUpdate = true;
  return { map: m, bumpMap: b };
}

// a ready-made physically based material from a procedural texture
export function texMat(kind, repeatX = 1, repeatY = repeatX, opt = {}) {
  const t = tex(kind, repeatX, repeatY, opt);
  return new THREE.MeshStandardMaterial({ map: t.map, bumpMap: t.bumpMap, bumpScale: opt.bump ?? 1.5, roughness: opt.roughness ?? 0.9, metalness: opt.metalness ?? 0, color: opt.tint || 0xffffff });
}
