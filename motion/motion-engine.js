/* Ada Lovelace — the film engine.
   render(ctx, t) paints the 1920×1080 frame at t seconds. Every motion is a pure function of t,
   so the scroll-driven site, the keyframe stills and the exported video are the same drawing.
   While the film rests on a keyframe, an ambient clock (tau) keeps each scene alive: the bird
   flaps, the loom weaves, the program runs, the roll plays. Sound comes from the same timeline.
   Each easing curve stands for a mechanism Lovelace described or watched: the loom's shuttle,
   the card prism's detent, the engines' successive carry, the pendulum. */
(function (root) {
'use strict';
const W = 1920, H = 1080, TAU = Math.PI * 2;
const BEAT = 0.48; // seconds: 125 beats a minute. Every duration below is counted in beats.

const COL = {
  ground: '#0A1222', ground2: '#111D35', ivory: '#ECE8DC', dim: '#9AA6C0', faint: '#2C3F66',
  brass: '#D8B064', brassDeep: '#9C7428', cyan: '#8FB6F2', silk: '#F28FA4',
  card: '#E6DCC2', cardInk: '#2A2414', weft: '#1D3C73',
};
const FAM = {
  display: '"Bodoni Moda", "Bodoni 72", Didot, Georgia, serif',
  body: '"Newsreader", "Iowan Old Style", Georgia, serif',
  mono: '"IBM Plex Mono", Consolas, monospace',
};
const font = (weight, size, fam, style = '') => `${style} ${weight} ${size}px ${FAM[fam]}`.trim();

/* ---------------- math & mechanical easing ---------------- */
const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (p, a, b) => clamp01((p - a) / (b - a));
const mod = (a, n) => ((a % n) + n) % n;
const EASE = {
  linear: t => clamp01(t),
  // The shuttle is thrown, crosses at speed and is caught: a trapezoid of velocity.
  shuttle: t => {
    t = clamp01(t); const a = 0.2, k = 2 * a * (1 - a);
    if (t < a) return t * t / k;
    if (t > 1 - a) { const u = 1 - t; return 1 - u * u / k; }
    return (t - a / 2) / (1 - a);
  },
  // The card prism turns a quarter and drops into its notch: quick, a small overshoot, settled.
  detent: t => { t = clamp01(t); const c1 = 1.25, c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; },
  // A released pendulum swings past rest and dies away.
  pendulum: t => { t = clamp01(t); return t >= 1 ? 1 : 1 - Math.exp(-8 * t) * Math.cos(5 * Math.PI * t); },
  inOut: t => { t = clamp01(t); return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2; },
  out: t => { t = clamp01(t); return 1 - (1 - t) ** 3; },
  in: t => { t = clamp01(t); return t * t * t; },
};

/* ---------------- drawing helpers ---------------- */
function setFont(ctx, f, ls) { ctx.font = f; ctx.letterSpacing = ls || '0px'; }
function rich(x, y, size, f, parts, opt = {}) {
  return { x, y, size, font: f, parts: typeof parts === 'string' ? [[parts, opt.color || COL.ivory]] : parts, align: opt.align || 'left', ls: opt.ls || '0px' };
}
const eyebrow = (x, y, s, align) => rich(x, y, 20, font(500, 20, 'mono'), [[s, COL.brass]], { ls: '4px', align });
function lineBox(ctx, ln) {
  setFont(ctx, ln.font, ln.ls);
  const w = ln.parts.reduce((s, [t]) => s + ctx.measureText(t).width, 0);
  const x0 = ln.align === 'center' ? ln.x - w / 2 : ln.align === 'right' ? ln.x - w : ln.x;
  return { x0, w, top: ln.y - ln.size * 0.98, h: ln.size * 1.3 };
}
function drawLine(ctx, ln, alpha = 1, dy = 0) {
  const b = lineBox(ctx, ln); let x = b.x0;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.globalAlpha = alpha;
  for (const [t, c] of ln.parts) { ctx.fillStyle = c; ctx.fillText(t, x, ln.y + dy); x += ctx.measureText(t).width; }
  ctx.globalAlpha = 1; ctx.letterSpacing = '0px';
  return b;
}
function bar(ctx, x, top, h, a) {
  ctx.globalAlpha = a; ctx.fillStyle = COL.brass; ctx.fillRect(x - 1.5, top + h * 0.08, 3, h * 0.84); ctx.globalAlpha = 1;
}
// Text enters and leaves by one of three mechanisms; lines are staggered like successive picks.
const REVEAL = {
  wipe(ctx, ln, a, b) { // a shuttle crossing the line
    const bx = lineBox(ctx, ln);
    const L = b > 0 ? bx.x0 + bx.w * EASE.shuttle(b) : bx.x0 - 60;
    const R = a < 1 ? bx.x0 + bx.w * EASE.shuttle(a) : bx.x0 + bx.w + 60;
    if (R - L < 0.5) return;
    ctx.save(); ctx.beginPath(); ctx.rect(L, bx.top, R - L, bx.h); ctx.clip(); drawLine(ctx, ln); ctx.restore();
    if (a < 1) bar(ctx, R, bx.top, bx.h, 1); else if (b > 0) bar(ctx, L, bx.top, bx.h, 1);
  },
  rise(ctx, ln, a, b) {
    const e = EASE.out(a) * (1 - EASE.in(b));
    drawLine(ctx, ln, e, (1 - EASE.out(a)) * 26 - EASE.in(b) * 26);
  },
  punch(ctx, ln, a, b) { // read in through a grid of holes that open until they merge
    const bx = lineBox(ctx, ln), cell = Math.max(10, ln.size * 0.2);
    const r = cell * 0.74 * EASE.detent(a) * (1 - b);
    if (r <= 0.2) return;
    if (a >= 1 && b <= 0) { drawLine(ctx, ln); return; }
    ctx.save(); ctx.beginPath();
    for (let y = bx.top; y < bx.top + bx.h + cell; y += cell)
      for (let x = bx.x0 - cell; x < bx.x0 + bx.w + cell; x += cell) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU); }
    ctx.clip(); drawLine(ctx, ln); ctx.restore();
  },
};
function drawText(ctx, lines, inE = 1, outE = 0, mode = 'wipe') {
  const n = lines.length, st = n > 1 ? Math.min(0.1, 0.45 / (n - 1)) : 0, span = 1 - st * (n - 1);
  lines.forEach((ln, i) => {
    const a = seg(inE, i * st, i * st + span), b = seg(outE, i * st, i * st + span);
    if (a <= 0 || b >= 1) return;
    if (a >= 1 && b <= 0) { drawLine(ctx, ln); return; }
    REVEAL[mode](ctx, ln, a, b);
  });
}
// Lovelace's variable notation: an upper index before V, a column number after it.
function drawVar(ctx, x, y, size, sup, sub, color, fam = 'display', alpha = 1) {
  ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  setFont(ctx, font(500, size * 0.56, fam)); const ws = ctx.measureText(String(sup)).width;
  ctx.fillText(String(sup), x, y - size * 0.42);
  setFont(ctx, font(500, size, fam)); const wv = ctx.measureText('V').width; ctx.fillText('V', x + ws + 1, y);
  setFont(ctx, font(500, size * 0.56, fam)); const wb = ctx.measureText(String(sub)).width;
  ctx.fillText(String(sub), x + ws + 1 + wv, y + size * 0.2);
  ctx.globalAlpha = 1;
  return ws + 1 + wv + wb;
}
// Statements such as "A{0} + B{1}A{1}": a letter followed by {n} takes a subscript.
function mathRuns(s) {
  const runs = [], re = /([A-Z])\{(\d+)\}/g; let i = 0, m;
  while ((m = re.exec(s))) { if (m.index > i) runs.push({ t: s.slice(i, m.index) }); runs.push({ t: m[1], sub: m[2] }); i = re.lastIndex; }
  if (i < s.length) runs.push({ t: s.slice(i) });
  return runs;
}
function drawMath(ctx, s, x, y, size, color, fam = 'display', align = 'left', alpha = 1, weight = 400) {
  const runs = mathRuns(s), big = font(weight, size, fam), small = font(weight, size * 0.6, fam);
  let w = 0;
  for (const r of runs) { setFont(ctx, big); w += ctx.measureText(r.t).width; if (r.sub) { setFont(ctx, small); w += ctx.measureText(r.sub).width + 1; } }
  let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  for (const r of runs) {
    setFont(ctx, big); ctx.fillText(r.t, cx, y); cx += ctx.measureText(r.t).width;
    if (r.sub) { setFont(ctx, small); ctx.fillText(r.sub, cx + 1, y + size * 0.22); cx += ctx.measureText(r.sub).width + 1; }
  }
  ctx.globalAlpha = 1;
  return w;
}
function pasteboard(ctx, x, y, w, h, alpha = 1, fill = COL.card) {
  const cut = Math.min(w, h) * 0.2;
  ctx.globalAlpha = alpha; ctx.fillStyle = fill; ctx.beginPath();
  ctx.moveTo(x + cut, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + cut); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;
}
function drawShuttle(ctx, x, y, dir = 1, s = 1, alpha = 1) {
  if (alpha <= 0) return;
  ctx.save(); ctx.translate(x, y); ctx.scale(s * dir, s); ctx.globalAlpha = alpha;
  ctx.fillStyle = COL.brass; ctx.beginPath(); ctx.moveTo(-32, 0); ctx.quadraticCurveTo(-4, -12, 32, 0); ctx.quadraticCurveTo(-4, 12, -32, 0); ctx.fill();
  ctx.fillStyle = COL.brassDeep; ctx.fillRect(-11, -2.6, 22, 5.2);
  ctx.restore();
}
// Keep the part of a convex polygon where g(x, y) < 0.
function clipHalf(pts, g) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], ga = g(a[0], a[1]), gb = g(b[0], b[1]);
    if (ga < 0) out.push(a);
    if ((ga < 0) !== (gb < 0)) { const u = ga / (ga - gb); out.push([lerp(a[0], b[0], u), lerp(a[1], b[1], u)]); }
  }
  return out;
}
function pathOf(ctx, pts) { ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); }
const FRAME = [[0, 0], [W, 0], [W, H], [0, H]];
const newCanvas = (w = W, h = H) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

/* ---------------- woven cloth: one card per row ---------------- */
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const t = f < 0 ? 0 : 255, p = Math.abs(f);
  return `rgb(${Math.round(r + (t - r) * p)},${Math.round(g + (t - g) * p)},${Math.round(b + (t - b) * p)})`;
}
function weaveCell(ctx, x, y, c, up, P) {
  const X = x * c, Y = y * c;
  if (up) {
    ctx.fillStyle = P.warp; ctx.fillRect(X, Y, c, c);
    ctx.fillStyle = P.warpLo; ctx.fillRect(X, Y, c * 0.18, c); ctx.fillRect(X + c * 0.82, Y, c * 0.18, c);
    ctx.fillStyle = P.warpHi; ctx.fillRect(X + c * 0.42, Y + c * 0.15, c * 0.16, c * 0.7);
  } else {
    ctx.fillStyle = P.weft; ctx.fillRect(X, Y, c, c);
    ctx.fillStyle = P.weftLo; ctx.fillRect(X, Y, c, c * 0.18); ctx.fillRect(X, Y + c * 0.82, c, c * 0.18);
    ctx.fillStyle = P.weftHi; ctx.fillRect(X + c * 0.15, Y + c * 0.42, c * 0.7, c * 0.16);
  }
}
function buildWeave(cols, rows, cell, bit) {
  const cv = newCanvas(cols * cell, rows * cell), ctx = cv.getContext('2d');
  const P = { warp: COL.brass, weft: COL.weft, warpLo: shade(COL.brass, -0.3), weftLo: shade(COL.weft, -0.35), warpHi: shade(COL.brass, 0.25), weftHi: shade(COL.weft, 0.16) };
  const bits = new Uint8Array(cols * rows);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) { const up = bit(x, y) ? 1 : 0; bits[y * cols + x] = up; weaveCell(ctx, x, y, cell, up, P); }
  return { cv, cols, rows, cell, w: cols * cell, h: rows * cell, bits };
}
// rowsF woven rows from the top; the row in progress is crossed by the shuttle, reversing each pick.
function drawWeave(ctx, wv, X, Y, rowsF, warpAlpha = 0, shuttle = true) {
  const c = wv.cell, full = Math.max(0, Math.min(wv.rows, Math.floor(rowsF))), frac = rowsF - Math.floor(rowsF);
  if (warpAlpha > 0 && full < wv.rows) {
    ctx.strokeStyle = COL.brass; ctx.globalAlpha = warpAlpha; ctx.lineWidth = Math.max(1, c * 0.2); ctx.beginPath();
    for (let j = 0; j < wv.cols; j++) { const x = X + (j + 0.5) * c; ctx.moveTo(x, Y + full * c); ctx.lineTo(x, Y + wv.h); }
    ctx.stroke(); ctx.globalAlpha = 1;
  }
  if (full > 0) ctx.drawImage(wv.cv, 0, 0, wv.w, full * c, X, Y, wv.w, full * c);
  if (full < wv.rows && frac > 0.001) {
    const ltr = full % 2 === 0, ww = wv.w * EASE.shuttle(frac), sx = ltr ? 0 : wv.w - ww;
    if (ww > 0.5) ctx.drawImage(wv.cv, sx, full * c, ww, c, X + sx, Y + full * c, ww, c);
    if (shuttle) drawShuttle(ctx, X + (ltr ? ww : wv.w - ww), Y + full * c + c / 2, ltr ? 1 : -1, 0.62);
  }
}
// The loom running on: the cloth rises as new rows are woven in at the bottom.
function drawWeaveScroll(ctx, wv, X, Y, off, alpha) {
  const s = mod(off, wv.rows) * wv.cell, h1 = wv.h - s;
  ctx.globalAlpha = alpha;
  if (h1 > 0.5) ctx.drawImage(wv.cv, 0, s, wv.w, h1, X, Y, wv.w, h1);
  if (s > 0.5) ctx.drawImage(wv.cv, 0, 0, wv.w, s, X, Y + h1, wv.w, s);
  ctx.globalAlpha = 1;
}
function drawCardStrip(ctx, wv, row, x, y, w, alpha) {
  if (alpha <= 0) return;
  const h = 36, step = w / wv.cols, r = Math.min(step * 0.34, 3.2);
  pasteboard(ctx, x, y, w, h, alpha);
  ctx.globalAlpha = alpha; ctx.fillStyle = COL.ground; ctx.beginPath();
  for (let j = 0; j < wv.cols; j++) if (wv.bits[row * wv.cols + j]) { const cx = x + (j + 0.5) * step; ctx.moveTo(cx + r, y + h / 2); ctx.arc(cx, y + h / 2, r, 0, TAU); }
  ctx.fill(); ctx.globalAlpha = 1;
  setFont(ctx, font(500, 14, 'mono'), '2px'); ctx.fillStyle = COL.dim; ctx.globalAlpha = alpha; ctx.textAlign = 'left';
  ctx.fillText(`CARD ${row + 1} OF ${wv.rows} · THE ROW NOW ON THE LOOM`, x, y + h + 24); ctx.globalAlpha = 1; ctx.letterSpacing = '0px';
}

/* ---------------- assets built once ---------------- */
const A = { portrait: null, cloth: null, words: null, wall: null, ready: false };
function makePortrait(img) {
  const n = 130, cell = 6, t = newCanvas(n, n);
  const tc = t.getContext('2d', { willReadFrequently: true });
  const iw = img.naturalWidth, ih = img.naturalHeight, ss = iw * 0.78;
  tc.drawImage(img, iw * 0.11, ih * 0.025, ss, ss, 0, 0, n, n);
  const d = tc.getImageData(0, 0, n, n).data, lum = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) lum[i] = (0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) / 255;
  const sorted = Float32Array.from(lum).sort(), lo = sorted[Math.floor(n * n * 0.03)], hi = sorted[Math.floor(n * n * 0.97)];
  for (let i = 0; i < n * n; i++) { // darken the grey ground and the edges, keep the light of face and gown
    const v = clamp01((lum[i] - lo) / (hi - lo)), x = (i % n) / n - 0.55, y = Math.floor(i / n) / n - 0.5;
    const vig = 1 - 0.5 * clamp01((Math.hypot(x, y * 0.9) - 0.3) / 0.4);
    lum[i] = Math.pow(clamp01((v * vig - 0.1) / 0.8), 1.4);
  }
  const bits = new Uint8Array(n * n); // Floyd–Steinberg: each thread either lifts (light) or stays down (dark)
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x, v = lum[i], o = v >= 0.5 ? 1 : 0, e = v - o; bits[i] = o;
    if (x + 1 < n) lum[i + 1] += e * 7 / 16;
    if (y + 1 < n) { if (x > 0) lum[i + n - 1] += e * 3 / 16; lum[i + n] += e * 5 / 16; if (x + 1 < n) lum[i + n + 1] += e / 16; }
  }
  return buildWeave(n, n, cell, (x, y) => bits[y * n + x]);
}
function makeCloth() {
  const c = 102, r = 82;
  return buildWeave(c, r, 10, (x, y) => { const xx = Math.min(x, c - 1 - x), yy = Math.min(y, r - 1 - y); return (xx * xx + yy * yy) % 29 < 14.5; });
}
// Two words cut into ribbons: "poetical" runs as weft, "science" as warp.
function makeWords() {
  const Acv = newCanvas(), Bcv = newCanvas();
  const a = Acv.getContext('2d', { willReadFrequently: true }), b = Bcv.getContext('2d', { willReadFrequently: true });
  setFont(a, font(400, 520, 'display', 'italic')); a.fillStyle = COL.brass; a.textAlign = 'left'; a.fillText('poetical', -40, 600);
  setFont(b, font(500, 520, 'display')); b.fillStyle = COL.ivory; b.textAlign = 'right'; b.fillText('science', 1980, 724);
  const cell = 26, cols = Math.ceil(W / cell), rows = Math.ceil(H / cell);
  const occ = c => {
    const d = c.getImageData(0, 0, W, H).data, o = new Uint8Array(cols * rows);
    for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) if (d[(y * W + x) * 4 + 3] > 40) o[Math.floor(y / cell) * cols + Math.floor(x / cell)] = 1;
    return o;
  };
  const oa = occ(a), ob = occ(b), rowsA = [], colsB = [], both = [];
  for (let j = 0; j < rows; j++) if (oa.subarray(j * cols, (j + 1) * cols).some(v => v)) rowsA.push(j);
  for (let i = 0; i < cols; i++) { for (let j = 0; j < rows; j++) if (ob[j * cols + i]) { colsB.push(i); break; } }
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) if (oa[j * cols + i] && ob[j * cols + i]) both.push([i, j]);
  return { A: Acv, B: Bcv, cell, cols, rows, rowsA, colsB, both };
}
// The wall of Note F: 200 × 120 = 24,000 cards, and the number itself picked out in lit cards.
function makeWall() {
  const COLS = 200, ROWS = 120, cw = W / COLS, ch = H / ROWS;
  const dim = newCanvas(), bright = newCanvas(), lit = newCanvas(), mask = newCanvas(), all = newCanvas();
  const d = dim.getContext('2d'), b = bright.getContext('2d'), m = mask.getContext('2d');
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  d.fillStyle = COL.card; d.globalAlpha = 0.13;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const x = c * cw + 1, y = r * ch + 1.1;
    d.fillRect(x, y, cw - 2, ch - 2.2);
    b.fillStyle = COL.card; b.fillRect(x, y, cw - 2, ch - 2.2);
    b.fillStyle = COL.ground; for (let k = 0; k < 3; k++) if (rnd() < 0.5) b.fillRect(x + 1 + k * 2.3, y + 2.4, 1.4, 1.8);
  }
  setFont(m, font(500, 100, 'display')); const size = 2080 / m.measureText('24,000').width * 100;
  setFont(m, font(500, size, 'display')); m.fillStyle = '#fff'; m.textAlign = 'center'; m.fillText('24,000', 960, 470 + size * 0.34);
  const l = lit.getContext('2d'); l.drawImage(bright, 0, 0); l.globalCompositeOperation = 'destination-in'; l.drawImage(mask, 0, 0); l.globalCompositeOperation = 'source-over';
  const al = all.getContext('2d'); al.drawImage(dim, 0, 0); al.drawImage(lit, 0, 0);
  return { dim, bright, lit, all, COLS, ROWS, cw, ch };
}

/* ---------------- Note G, n = 4, as a trace of 36 operations ---------------- */
const gcdN = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; };
const Q = (n, d = 1) => { if (d < 0) { n = -n; d = -d; } const g = gcdN(n, d) || 1; return { n: n / g, d: d / g }; };
const QOP = {
  '+': (a, b) => Q(a.n * b.d + b.n * a.d, a.d * b.d), '−': (a, b) => Q(a.n * b.d - b.n * a.d, a.d * b.d),
  '×': (a, b) => Q(a.n * b.n, a.d * b.d), '÷': (a, b) => Q(a.n * b.d, a.d * b.n),
};
const qs = q => (q.n < 0 ? '−' : '') + Math.abs(q.n) + (q.d === 1 ? '' : '/' + q.d);
// [card, op, a, b, receiving, cleared after reading, cleared by Variable-card, statement]; card 4 as corrected
const CARDS = [
  [1, '×', 2, 3, [4, 5, 6], [], [], '= 2n'], [2, '−', 4, 1, [4], [], [], '= 2n − 1'], [3, '+', 5, 1, [5], [], [], '= 2n + 1'],
  [4, '÷', 4, 5, [11], [5, 4], [], '= (2n − 1) / (2n + 1)'], [5, '÷', 11, 2, [11], [], [], '= ½ · (2n − 1) / (2n + 1)'],
  [6, '−', 13, 11, [13], [11], [], '= A{0}'], [7, '−', 3, 1, [10], [], [], '= n − 1 (= 3)'],
  [8, '+', 2, 7, [7], [], [], '= 2 + 0 = 2'], [9, '÷', 6, 7, [11], [], [], '= 2n / 2 = A{1}'],
  [10, '×', 21, 11, [12], [], [], '= B{1}A{1}'], [11, '+', 12, 13, [13], [12], [], '= A{0} + B{1}A{1}'],
  [12, '−', 10, 1, [10], [], [], '= n − 2 (= 2)'], [13, '−', 6, 1, [6], [], [], '= 2n − 1'], [14, '+', 1, 7, [7], [], [], '= 2 + 1 = 3'],
  [15, '÷', 6, 7, [8], [], [], '= (2n − 1) / 3'], [16, '×', 8, 11, [11], [8], [], '= 2n / 2 · (2n − 1) / 3'],
  [17, '−', 6, 1, [6], [], [], '= 2n − 2'], [18, '+', 1, 7, [7], [], [], '= 3 + 1 = 4'], [19, '÷', 6, 7, [9], [], [], '= (2n − 2) / 4'],
  [20, '×', 9, 11, [11], [9], [], '= A{3}'], [21, '×', 'B', 11, [12], [], [], '= B{3}A{3}'],
  [22, '+', 12, 13, [13], [12], [], '= A{0} + B{1}A{1} + B{3}A{3}'], [23, '−', 10, 1, [10], [], [], '= n − 3 (= 1)'],
  [24, '+', 13, 24, [24], [13], [], '= B{7}'], [25, '+', 1, 3, [3], [], [6, 7], '= n + 1 = 5'],
];
const TRACE = (() => {
  const V = {}; for (const k of [...Array(13).keys()].map(i => i + 1).concat([21, 22, 23, 24])) V[k] = { q: Q(0), c: 0, z: true };
  const put = (k, q) => { V[k] = { q, c: 1, z: false }; };
  put(1, Q(1)); put(2, Q(2)); put(3, Q(4)); put(21, Q(1, 6)); put(22, Q(-1, 30)); put(23, Q(1, 42));
  const steps = []; let pc = 1, cyc = 0;
  for (let guard = 0; guard < 60; guard++) {
    const [no, op, a0, b, outs, zero, after, st] = CARDS[pc - 1];
    const a = a0 === 'B' ? 21 + cyc : a0, A1 = V[a], B1 = V[b];
    const ia = A1.z ? 0 : A1.c, ib = B1.z ? 0 : B1.c, va = A1.q, vb = B1.q, r = QOP[op](va, vb);
    for (const z of zero) V[z] = { q: Q(0), c: V[z].c, z: true };
    for (const o of outs) V[o] = { q: r, c: V[o].c + 1, z: false };
    for (const z of after) V[z] = { q: Q(0), c: V[z].c, z: true };
    steps.push({ no, op, a, b, ia, ib, outs: outs.map(o => [V[o].c, o]), va, vb, r, st, cyc });
    if (no === 25) break;
    let next = no + 1;
    if (no === 7 || no === 12 || no === 23) next = V[10].q.n === 0 ? 24 : (no === 23 ? 13 : no + 1);
    if (next === 13) cyc++;
    pc = next;
  }
  return steps;
})();
const STEP_CARDS = TRACE.map(s => s.no);

/* ---------------- the ten keyframes: their words ---------------- */
const KF = [
  { title: 'Portrait', bl: 'After A. E. Chalon, c. 1840 · public domain', br: '130 THREADS × 130 CARDS',
    lines: [eyebrow(120, 250, 'AUGUSTA ADA KING · COUNTESS OF LOVELACE · 1815–1852'),
      rich(106, 450, 205, font(500, 205, 'display'), 'Ada'), rich(106, 650, 205, font(500, 205, 'display'), 'Lovelace'),
      rich(120, 744, 46, font(400, 46, 'display', 'italic'), [['Analyst (& Metaphysician)', COL.brass]]),
      rich(120, 830, 26, font(400, 26, 'body'), [['Woven as Jacquard’s silk portrait was woven:', COL.dim]]),
      rich(120, 868, 26, font(400, 26, 'body'), [['one punched card for every row of cloth.', COL.dim]])] },
  { title: 'Poetical Science', full: true, bl: 'Letter to Lady Byron · Toole 1992', br: 'WEFT · WARP · PLAIN WEAVE',
    lines: [eyebrow(120, 112, 'II · TO HER MOTHER, IN HER THIRTIES'),
      rich(120, 990, 34, font(400, 34, 'display', 'italic'), '“If you can’t give me poetry, can’t you give me ‘poetical science’?”'),
      rich(120, 1034, 15, font(500, 15, 'mono'), [['QUOTED IN TOOLE, 1992 · WEFT: POETICAL · WARP: SCIENCE · PLAIN WEAVE', COL.dim]], { ls: '3px' })] },
  { title: 'Flyology', bl: 'Letters to Lady Byron, 1828', br: 'PLATE I · ONE DOT PER WINGBEAT',
    lines: [eyebrow(120, 200, 'III · 1828 · LETTERS TO LADY BYRON'),
      rich(106, 360, 170, font(500, 170, 'display'), 'Flyology'),
      rich(120, 456, 28, font(400, 28, 'body'), [['At twelve, a plan to fly. She studied the anatomy of birds and weighed', COL.dim]]),
      rich(120, 496, 28, font(400, 28, 'body'), [['paper, oilsilk, wire and feathers as materials for wings.', COL.dim]])] },
  { title: 'The Discovering Faculty', bl: 'Manuscript, 5 January 1841', br: '240 POINTS · k = 2 · CARDIOID',
    lines: [eyebrow(120, 300, 'IV · 5 JANUARY 1841'),
      rich(120, 410, 72, font(400, 72, 'display', 'italic'), 'Imagination is'),
      rich(120, 494, 72, font(400, 72, 'display', 'italic'), 'the Discovering'),
      rich(120, 578, 72, font(400, 72, 'display', 'italic'), 'Faculty, pre-eminently.'),
      rich(120, 680, 26, font(400, 26, 'body'), [['No line on the right traces the curve.', COL.dim]]),
      rich(120, 718, 26, font(400, 26, 'body'), [['It appears where 240 chords crowd together,', COL.dim]]),
      rich(120, 756, 26, font(400, 26, 'body'), [['each joining point i to point 2i.', COL.dim]])] },
  { title: 'The Loom', bl: 'Scientific Memoirs III, p. 696', br: '102 THREADS × 82 CARDS',
    lines: [eyebrow(120, 210, 'V · NOTE A · 1843'),
      rich(120, 310, 54, font(400, 54, 'display', 'italic'), '“The Analytical Engine'),
      rich(120, 378, 54, font(400, 54, 'display', 'italic'), [['weaves ', COL.ivory], ['algebraical', COL.brass]]),
      rich(120, 446, 54, font(400, 54, 'display', 'italic'), [['patterns', COL.brass], [' just as the', COL.ivory]]),
      rich(120, 514, 54, font(400, 54, 'display', 'italic'), 'Jacquard-loom weaves'),
      rich(120, 582, 54, font(400, 54, 'display', 'italic'), 'flowers and leaves.”'),
      rich(120, 676, 24, font(400, 24, 'body'), [['One card for every row of cloth. These cards', COL.dim]]),
      rich(120, 710, 24, font(400, 24, 'body'), [['were punched from (x² + y²) mod 29.', COL.dim]])] },
  { title: 'The Store', bl: 'Scientific Memoirs III, Note B', br: 'THE STORE AFTER CARD 3 · n = 4',
    lines: [eyebrow(120, 210, 'VI · NOTE B · 1843'),
      rich(106, 340, 130, font(500, 130, 'display'), 'The Store'),
      rich(120, 430, 40, font(400, 40, 'display', 'italic'), '“a pile of rather large'),
      rich(120, 482, 40, font(400, 40, 'display', 'italic'), 'draughtsmen heaped'),
      rich(120, 534, 40, font(400, 40, 'display', 'italic'), 'perpendicularly one'),
      rich(120, 586, 40, font(400, 40, 'display', 'italic'), 'above another”'),
      rich(120, 676, 24, font(400, 24, 'body'), [['Each column of discs holds one number.', COL.dim]]),
      rich(120, 710, 24, font(400, 24, 'body'), [['Lovelace expected “probably at least', COL.dim]]),
      rich(120, 744, 24, font(400, 24, 'body'), [['two hundred” columns.', COL.dim]])] },
  { title: '24,000', full: true, bl: 'Scientific Memoirs III, Note F', br: '200 × 120 CARDS',
    lines: [eyebrow(120, 112, 'VII · NOTE F · 1843'),
      rich(120, 930, 34, font(400, 34, 'display', 'italic'), '“There is in existence a beautiful woven portrait of Jacquard,'),
      rich(120, 976, 34, font(400, 34, 'display', 'italic'), 'in the fabrication of which 24,000 cards were required.”'),
      rich(120, 1030, 15, font(500, 15, 'mono'), [['NOTE F · 1843 · THE WALL BEHIND HOLDS 200 × 120 = 24,000 CARDS', COL.dim]], { ls: '3px' }),
      rich(1800, 868, 15, font(500, 15, 'mono'), [['CARDS IN HER BERNOULLI PROGRAM', COL.dim]], { align: 'right', ls: '3px' }),
      rich(1800, 1010, 150, font(500, 150, 'display'), [['25', COL.brass]], { align: 'right' })] },
  { title: 'The Program', bl: 'Note G, fold-out diagram', br: '25 CARDS · 36 OPERATIONS',
    lines: [eyebrow(120, 330, 'VIII · NOTE G · 1843'),
      rich(106, 440, 104, font(500, 104, 'display'), 'The Bernoulli'),
      rich(106, 540, 104, font(500, 104, 'display'), 'program'),
      rich(120, 612, 24, font(400, 24, 'body'), [['Twenty-five operation-cards, one test,', COL.dim]]),
      rich(120, 648, 24, font(400, 24, 'body'), [['and one cycle that the chain backs up', COL.dim]]),
      rich(120, 684, 24, font(400, 24, 'body'), [['to run again: the “backing” of Note C.', COL.dim]])] },
  { title: 'Pitched Sounds', bl: 'Scientific Memoirs III, p. 694', br: 'ROLL · BERNOULLI NUMERATORS',
    lines: [eyebrow(120, 220, 'IX · NOTE A · 1843'),
      rich(106, 430, 210, font(500, 210, 'display'), '3 : 2'),
      rich(120, 504, 46, font(400, 46, 'display', 'italic'), [['a perfect fifth', COL.brass]]),
      rich(120, 596, 34, font(400, 34, 'display', 'italic'), '“the engine might compose elaborate'),
      rich(120, 642, 34, font(400, 34, 'display', 'italic'), 'and scientific pieces of music of any'),
      rich(120, 688, 34, font(400, 34, 'display', 'italic'), 'degree of complexity or extent.”')] },
  { title: 'No Pretensions', bl: 'Scientific Memoirs III, p. 722', br: 'A.A.L. · 1815–1852',
    lines: [eyebrow(960, 300, 'X · NOTE G · 1843', 'center'),
      rich(960, 420, 76, font(500, 76, 'display'), '“The Analytical Engine has no pretensions', { align: 'center' }),
      rich(960, 510, 76, font(500, 76, 'display'), 'whatever to originate anything.', { align: 'center' }),
      rich(960, 610, 50, font(400, 50, 'display', 'italic'), [['It can do whatever we know how to order it to perform.”', COL.brass]], { align: 'center' }),
      rich(960, 706, 26, font(400, 26, 'body'), [['In 1950 Alan Turing called this “Lady Lovelace’s Objection” and argued against it.', COL.dim]], { align: 'center' }),
      rich(960, 744, 26, font(400, 26, 'body'), [['She had already added that the Engine would throw mathematics “into new lights.”', COL.dim]], { align: 'center' })] },
];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const NK = KF.length;
const chromeAlpha = k => k < 0 ? 0 : KF[k].full ? 0 : 1;

/* ---------------- running head, card-chain navigation, labels ---------------- */
function drawChrome(ctx, k0, k1, mix, reader, alpha = 1) {
  if (alpha <= 0.002) return;
  ctx.globalAlpha = alpha;
  setFont(ctx, font(400, 34, 'display', 'italic')); ctx.fillStyle = COL.ivory; ctx.textAlign = 'left'; ctx.fillText('A.A.L.', 120, 96);
  const head = (k, a) => {
    if (a <= 0 || k < 0) return;
    ctx.globalAlpha = alpha * a; setFont(ctx, font(400, 22, 'body', 'italic')); ctx.fillStyle = COL.dim; ctx.textAlign = 'right';
    ctx.fillText(`${ROMAN[k]} — ${KF[k].title}`, 1800, 96);
    setFont(ctx, font(400, 19, 'body', 'italic')); ctx.textAlign = 'left'; ctx.fillText(KF[k].bl, 120, 1030);
    setFont(ctx, font(500, 14, 'mono'), '2px'); ctx.textAlign = 'right'; ctx.fillText(KF[k].br, 1800, 1030);
    ctx.letterSpacing = '0px';
  };
  head(k0, 1 - mix); head(k1, mix);
  // one card per keyframe; the brass reader marks where the chain stands
  const cw = 48, ch = 36, gap = 10, x0 = 960 - (NK * cw + (NK - 1) * gap) / 2, y0 = 998;
  for (let i = 0; i < NK; i++) {
    const x = x0 + i * (cw + gap), near = clamp01(1 - Math.abs(reader - i));
    pasteboard(ctx, x, y0, cw, ch, alpha * (0.3 + 0.7 * near), KF[i].full ? COL.brass : COL.card);
    ctx.globalAlpha = alpha * (0.3 + 0.7 * near); ctx.fillStyle = COL.ground;
    for (let b = 0; b < 4; b++) if ((i + 1) >> b & 1) { ctx.beginPath(); ctx.arc(x + 10 + b * 9.5, y0 + 11, 2.6, 0, TAU); ctx.fill(); }
    setFont(ctx, font(500, 10, 'mono')); ctx.fillStyle = COL.cardInk; ctx.textAlign = 'center'; ctx.fillText(ROMAN[i], x + cw / 2, y0 + 29);
  }
  ctx.globalAlpha = alpha; ctx.strokeStyle = COL.brass; ctx.lineWidth = 2.5;
  ctx.strokeRect(x0 + reader * (cw + gap) - 5, y0 - 5, cw + 10, ch + 10);
  ctx.globalAlpha = 1; ctx.textAlign = 'left';
}

/* ================= the scenes =================
   Each scene takes o.amb (0…1, how alive it is) and o.tau (the ambient clock, seconds).
   With amb = 0 it draws its keyframe exactly; transitions pass their own partial states. */

/* ---- I · Portrait ---- */
const PORT_X = 1020, PORT_Y = 150;
function sPortrait(ctx, o = {}) {
  drawText(ctx, KF[0].lines, o.textIn ?? 1, o.textOut ?? 0, 'wipe');
  drawWeave(ctx, A.portrait, PORT_X, PORT_Y, o.rows ?? A.portrait.rows, o.warp ?? 0, o.shuttle ?? true);
  const amb = o.amb || 0;
  if (amb > 0) { // the loom reads the portrait again, row by row
    const P = 16 * BEAT, rf = mod(o.tau / P, 1) * A.portrait.rows, row = Math.floor(rf), fr = rf - row, ltr = row % 2 === 0;
    const y = PORT_Y + row * A.portrait.cell;
    ctx.globalAlpha = amb * 0.35; ctx.fillStyle = COL.ivory; ctx.fillRect(PORT_X, y, A.portrait.w, A.portrait.cell); ctx.globalAlpha = 1;
    drawShuttle(ctx, PORT_X + A.portrait.w * (ltr ? fr : 1 - fr), y + 3, ltr ? 1 : -1, 0.7, amb);
  }
}

/* ---- II · Poetical Science (full bleed) ---- */
const WOVEN_Y = 548;
function drawWoven(ctx, o = {}) {
  const Wd = A.words, c = Wd.cell, g = 3, alpha = o.alpha ?? 1;
  if (alpha <= 0) return;
  const dyOf = i => (o.bOff ? o.bOff(i) : 0) + (o.shed ? o.shed * (i % 2 ? 1 : -1) : 0);
  const dxOf = j => o.aOff ? o.aOff(j) : 0;
  ctx.globalAlpha = alpha;
  for (const i of Wd.colsB) { const dy = dyOf(i); if (Math.abs(dy) < H) ctx.drawImage(Wd.B, i * c, 0, c - g, H, i * c, dy, c - g, H); }
  for (const j of Wd.rowsA) { const dx = dxOf(j); if (Math.abs(dx) < W) ctx.drawImage(Wd.A, 0, j * c, W, c - g, dx, j * c, W, c - g); }
  const over = o.over ?? 1;
  if (over > 0) { // where the warp is up, "science" crosses over "poetical"
    ctx.globalAlpha = alpha * over;
    for (const [i, j] of Wd.both) {
      if (!(o.parity ? o.parity(i, j) : (i + j) % 2 === 0)) continue;
      const dy = dyOf(i); if (Math.abs(dy) > c * 2 || Math.abs(dxOf(j)) > 0.5) continue;
      ctx.drawImage(Wd.B, i * c, j * c - dy, c - g, c - g, i * c, j * c, c - g, c - g);
    }
  }
  ctx.globalAlpha = 1;
}
function sPoetical(ctx, o = {}) {
  const amb = o.amb || 0;
  if (o.woven) o.woven(ctx);
  else {
    if (amb < 1) drawWoven(ctx, { alpha: 1 });
    if (amb > 0) { // a shuttle crosses every four beats; behind it the interlacing flips, and the shed opens and closes
      const P = 4 * BEAT, pf = o.tau / P, n = Math.floor(pf), fx = (pf - n) * (W + 240) - 120, c = A.words.cell;
      drawWoven(ctx, { alpha: amb, shed: 7 * Math.sin(TAU * pf), parity: (i, j) => (i + j + n + (i * c + c / 2 < fx ? 1 : 0)) % 2 === 0 });
      drawShuttle(ctx, fx, WOVEN_Y, 1, 1.7, amb);
    }
  }
  drawText(ctx, KF[1].lines, o.textIn ?? 1, o.textOut ?? 0, 'rise');
}

/* ---- III · Flyology ---- */
const WAVE = { y0: 700, A: 150, lam: 260, xB: 1560, phi: Math.PI / 2 };
const waveY = (x, phi = WAVE.phi) => WAVE.y0 - WAVE.A * Math.sin(TAU * (WAVE.xB - x) / WAVE.lam + phi);
const CIRC = { cx: 1360, cy: 540, R: 400 };
function wavePoint(x, wrap, damp, phi = WAVE.phi) {
  const y = waveY(x, phi);
  if (wrap <= 0) return [x, y];
  const th = -Math.PI / 2 + TAU * (x / WAVE.xB), r = CIRC.R + (y - WAVE.y0) * 0.35 * damp;
  return [lerp(x, CIRC.cx + r * Math.cos(th), wrap), lerp(y, CIRC.cy + r * Math.sin(th), wrap)];
}
function drawWave(ctx, x1, alpha, wrap = 0, damp = 1, lw = 3, phi = WAVE.phi) {
  if (alpha <= 0 || x1 <= 0) return;
  ctx.strokeStyle = COL.brass; ctx.lineWidth = lw; ctx.globalAlpha = alpha; ctx.beginPath();
  for (let x = 0; x <= x1; x += 3) { const [px, py] = wavePoint(x, wrap, damp, phi); x ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
  const [ex, ey] = wavePoint(x1, wrap, damp, phi); ctx.lineTo(ex, ey);
  ctx.stroke(); ctx.globalAlpha = 1;
}
function drawCrests(ctx, trail, alpha, phi = WAVE.phi) {
  if (alpha <= 0) return;
  ctx.fillStyle = COL.brass; ctx.globalAlpha = alpha;
  const step = WAVE.lam, x0 = WAVE.xB - mod(Math.PI / 2 - phi, TAU) / TAU * step; // crests: one per wingbeat
  for (let x = x0; x >= 0; x -= step) if (x <= trail + 0.5) { ctx.beginPath(); ctx.arc(x, waveY(x, phi), 6, 0, TAU); ctx.fill(); }
  ctx.globalAlpha = 1;
}
function drawBird(ctx, alpha, phi = WAVE.phi) {
  if (alpha <= 0) return;
  const bx = WAVE.xB, by = WAVE.y0, s = 2.3, tx = bx, ty = waveY(bx, phi);
  ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = COL.ivory; ctx.fillStyle = COL.ivory; ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.ellipse(bx + 8 * s, by + 3 * s, 22 * s, 7 * s, -0.05, 0, TAU); ctx.stroke();
  ctx.beginPath(); ctx.arc(bx + 32 * s, by - 2 * s, 5.5 * s, 0, TAU); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(bx + 37 * s, by - 2.5 * s); ctx.lineTo(bx + 45 * s, by - 0.5 * s); ctx.lineTo(bx + 37 * s, by + 0.5 * s); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(bx - 13 * s, by + 2 * s); ctx.lineTo(bx - 30 * s, by - 3 * s); ctx.lineTo(bx - 28 * s, by + 8 * s); ctx.closePath(); ctx.stroke();
  ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(bx - 14, (by + ty) / 2, tx, ty); ctx.stroke();
  ctx.beginPath(); ctx.arc(bx, by, 4.5, 0, TAU); ctx.fill();
  ctx.restore();
}
function sFly(ctx, o = {}) {
  const trail = o.trail ?? WAVE.xB, decor = o.decor ?? 1, amb = o.amb || 0;
  drawText(ctx, KF[2].lines, o.textIn ?? 1, o.textOut ?? 0, 'wipe');
  if (decor > 0) { // the shoulder's straight path, for comparison
    ctx.save(); ctx.setLineDash([6, 8]); ctx.strokeStyle = COL.dim; ctx.globalAlpha = 0.6 * decor; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, WAVE.y0); ctx.lineTo(Math.min(trail, WAVE.xB), WAVE.y0); ctx.stroke(); ctx.restore();
  }
  const canon = 1 - amb;
  if (canon > 0) {
    drawWave(ctx, trail, (o.waveAlpha ?? 1) * canon, o.wrap ?? 0, o.damp ?? 1);
    drawCrests(ctx, trail, decor * canon);
    drawBird(ctx, (o.bird ?? 1) * canon);
  }
  if (amb > 0) { // in flight: one wingbeat a beat, the air streaming back past the bird
    const phi = WAVE.phi - TAU * o.tau / BEAT;
    drawWave(ctx, WAVE.xB, amb, 0, 1, 3, phi); drawCrests(ctx, WAVE.xB, amb, phi); drawBird(ctx, amb, phi);
  }
}

/* ---- IV · The Discovering Faculty ---- */
function chordEnds(i, N, k) {
  const a1 = TAU * i / N - Math.PI / 2, a2 = TAU * ((i * k) % N) / N - Math.PI / 2, { cx, cy, R } = CIRC;
  return [cx + R * Math.cos(a1), cy + R * Math.sin(a1), cx + R * Math.cos(a2), cy + R * Math.sin(a2)];
}
function sImag(ctx, o = {}) {
  const N = 240, amb = o.amb || 0, chords = o.chords ?? 1, dots = o.dots ?? 1, ring = o.ring ?? 1;
  const k = (o.k ?? 2) + amb * 0.22 * (1 - Math.cos(TAU * (o.tau || 0) / (16 * BEAT))) / 2; // the multiplier breathes past 2
  drawText(ctx, KF[3].lines, o.textIn ?? 1, o.textOut ?? 0, 'rise');
  if (ring > 0) { ctx.strokeStyle = COL.faint; ctx.lineWidth = 2; ctx.globalAlpha = ring; ctx.beginPath(); ctx.arc(CIRC.cx, CIRC.cy, CIRC.R, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; }
  if (chords > 0) {
    ctx.strokeStyle = COL.brass; ctx.lineWidth = 1.15; ctx.globalAlpha = 0.5 * chords; ctx.beginPath();
    for (let i = 0; i < N; i++) { const [x1, y1, x2, y2] = chordEnds(i, N, k); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); }
    ctx.stroke(); ctx.globalAlpha = 1;
  }
  if (dots > 0) {
    ctx.fillStyle = COL.ivory;
    for (let i = 0; i < N; i++) {
      const a = seg(dots, i / N * 0.6, i / N * 0.6 + 0.4); if (a <= 0) continue;
      const th = TAU * i / N - Math.PI / 2; ctx.globalAlpha = a;
      ctx.beginPath(); ctx.arc(CIRC.cx + CIRC.R * Math.cos(th), CIRC.cy + CIRC.R * Math.sin(th), 2.2, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  if (amb > 0) { setFont(ctx, font(500, 18, 'mono'), '3px'); ctx.fillStyle = COL.dim; ctx.globalAlpha = amb; ctx.textAlign = 'center'; ctx.fillText(`k = ${k.toFixed(3)}`, CIRC.cx, CIRC.cy + CIRC.R + 44); ctx.globalAlpha = 1; ctx.letterSpacing = '0px'; ctx.textAlign = 'left'; }
}

/* ---- V · The Loom ---- */
const CLOTH_X = 780, CLOTH_Y = 120;
const LOOM_RATE = 2 / BEAT; // two picks a beat
function sLoom(ctx, o = {}) {
  const rows = o.rows ?? A.cloth.rows, amb = o.amb || 0, wv = A.cloth;
  drawText(ctx, KF[4].lines, o.textIn ?? 1, o.textOut ?? 0, 'wipe');
  drawWeave(ctx, wv, CLOTH_X, CLOTH_Y, rows, o.warp ?? 0, o.shuttle ?? true);
  const row = Math.max(0, Math.min(wv.rows - 1, Math.ceil(rows) - 1));
  drawCardStrip(ctx, wv, row, 120, 770, 560, (o.card ?? 1) * (1 - amb));
  if (amb > 0) { // the loom keeps weaving: cloth rises, a new card for every pick
    const off = o.tau * LOOM_RATE, fr = off - Math.floor(off), bottom = mod(Math.floor(off) + wv.rows - 1, wv.rows);
    drawWeaveScroll(ctx, wv, CLOTH_X, CLOTH_Y, off, amb);
    const ltr = Math.floor(off) % 2 === 0, x = CLOTH_X + wv.w * (ltr ? EASE.shuttle(fr) : 1 - EASE.shuttle(fr));
    ctx.globalAlpha = amb; ctx.fillStyle = COL.brass; ctx.fillRect(CLOTH_X, CLOTH_Y + wv.h + 4, wv.w, 3); ctx.globalAlpha = 1;
    drawShuttle(ctx, x, CLOTH_Y + wv.h + 16, ltr ? 1 : -1, 0.9, amb);
    drawCardStrip(ctx, wv, bottom, 120, 770, 560, amb);
  }
}

/* ---- VI · The Store ---- */
const STORE_VALUES = [1, 2, 4, 7, 9, 8, 0, 0, 0, 0];      // after card 3 of Note G, n = 4
const STORE_INDEX = [1, 1, 1, 2, 2, 1, 0, 0, 0, 0];
const storeX = c => 870 + c * 100;
const discY = d => 250 + d * 56 + (d >= 4 ? 16 : 0);       // d = 0 top … 9 bottom; four whole figures, six decimals
function discDigit(c, d) { const s = String(STORE_VALUES[c]).padStart(4, '0') + '000000'; return +s[d]; }
function drawDisc(ctx, x, y, e, digit, roll, sink, glow = 0) {
  if (e <= 0) return;
  const w = 80 * e, h = 46 * e, X = x - w / 2, Y = y + (46 - h) / 2 + sink;
  const g = ctx.createLinearGradient(0, Y, 0, Y + h); g.addColorStop(0, '#ECD496'); g.addColorStop(0.55, '#C99D48'); g.addColorStop(1, '#94701F');
  ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(X, Y, w, h, h / 2); ctx.fill();
  if (e < 0.7) return;
  const a0 = ctx.globalAlpha;
  ctx.save(); ctx.beginPath(); ctx.roundRect(X, Y, w, h, h / 2); ctx.clip();
  setFont(ctx, font(500, 26, 'mono')); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const v = digit * EASE.detent(roll), lo = Math.floor(v), fr = v - lo;
  ctx.fillStyle = '#1d1606';
  ctx.fillText(String(((lo % 10) + 10) % 10), x, Y + h / 2 - fr * h);
  if (fr > 0.001) ctx.fillText(String((lo + 1) % 10), x, Y + h / 2 + (1 - fr) * h);
  ctx.restore(); ctx.textBaseline = 'alphabetic';
  const warn = Math.max(roll > 0 && roll < 1 ? Math.sin(roll * Math.PI) : 0, glow);
  if (warn > 0) { // the carry warning, armed while the wheel turns
    ctx.strokeStyle = COL.ivory; ctx.lineWidth = 2; ctx.globalAlpha = a0 * warn;
    ctx.beginPath(); ctx.roundRect(X - 4, Y - 4, w + 8, h + 8, h / 2 + 4); ctx.stroke(); ctx.globalAlpha = a0;
  }
}
function sStore(ctx, o = {}) {
  drawText(ctx, KF[5].lines, o.textIn ?? 1, o.textOut ?? 0, 'wipe');
  const sink = (o.sink ?? 0) * 90, fade = 1 - (o.sink ?? 0), amb = o.amb || 0;
  // ambient: a carry runs up one column each beat, lowest disc first
  const liveCol = Math.floor((o.tau || 0) / BEAT) % 10, u = mod((o.tau || 0) / BEAT, 1);
  for (let c = 0; c < 10; c++) {
    const x = storeX(c);
    for (let d = 0; d < 10; d++) {
      const e = o.disc ? o.disc(c, d) : 1, r = o.roll ? o.roll(c, d) : 1;
      let glow = 0;
      if (amb > 0 && c === liveCol) { const a = (9 - d) * 0.075, q = seg(u, a, a + 0.14); glow = amb * Math.sin(q * Math.PI); }
      ctx.globalAlpha = fade; drawDisc(ctx, x, discY(d), e, discDigit(c, d), r, sink, glow);
    }
    const la = (o.labels ?? 1) * fade;
    if (la > 0) {
      ctx.globalAlpha = la; ctx.fillStyle = COL.brass; ctx.fillRect(x - 30, discY(3) + 52 + sink, 60, 3);
      ctx.strokeStyle = COL.dim; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, 222 + sink, 11, 0, TAU); ctx.stroke();
      if (STORE_VALUES[c]) { setFont(ctx, font(500, 16, 'mono')); ctx.fillStyle = COL.ivory; ctx.textAlign = 'center'; ctx.fillText('+', x, 228 + sink); }
      drawVar(ctx, x - 23, 192 + sink, 32, STORE_INDEX[c], c + 1, COL.ivory, 'display', la);
      setFont(ctx, font(500, 22, 'mono')); ctx.fillStyle = COL.dim; ctx.globalAlpha = la; ctx.textAlign = 'center';
      ctx.fillText(String(STORE_VALUES[c]), x, 880 + sink);
    }
  }
  ctx.globalAlpha = 1; ctx.textAlign = 'left';
}

/* ---- VII · 24,000 (full bleed) ---- */
const frontG = f => (x, y) => x / A.wall.cw + 1.6 * y / A.wall.ch - f; // card (c, r) is down once c + 1.6r < f
const FRONT_MAX = 200 + 1.6 * 120 + 2;
function cardsBefore(f) { let n = 0; for (let r = 0; r < 120; r++) n += Math.max(0, Math.min(200, Math.ceil(f - 1.6 * r))); return Math.min(24000, n); }
function sCards(ctx, o = {}) {
  const Wl = A.wall, amb = o.amb || 0, front = o.front ?? FRONT_MAX + 10;
  if (front >= FRONT_MAX) ctx.drawImage(Wl.dim, 0, 0);
  else if (front > 0) { // the cards fall into place along a diagonal front
    ctx.save(); pathOf(ctx, clipHalf(FRAME, frontG(front))); ctx.clip(); ctx.drawImage(Wl.dim, 0, 0); ctx.restore();
    const band = clipHalf(clipHalf(FRAME, frontG(front)), (x, y) => -frontG(front - 6)(x, y));
    if (band.length > 2) { ctx.save(); pathOf(ctx, band); ctx.clip(); ctx.globalAlpha = 0.8; ctx.drawImage(Wl.bright, 0, 0); ctx.restore(); ctx.globalAlpha = 1; }
  }
  const lit = o.lit ?? 1;
  if (lit > 0) { ctx.globalAlpha = lit; ctx.drawImage(Wl.lit, 0, 0); ctx.globalAlpha = 1; }
  if (amb > 0) { // a reader runs down the wall, one row of cards at a time
    const P = 8 * BEAT, rf = mod(o.tau / P, 1) * Wl.ROWS, r = Math.floor(rf);
    for (let k = 0; k < 7; k++) {
      const rr = r - k; if (rr < 0) continue;
      ctx.globalAlpha = amb * (k === 0 ? 0.95 : 0.5 * (1 - k / 7));
      ctx.drawImage(Wl.bright, 0, rr * Wl.ch, W, Wl.ch, 0, rr * Wl.ch, W, Wl.ch);
    }
    ctx.globalAlpha = 1;
  }
  const bandA = o.band ?? 1;
  if (bandA > 0) {
    const g = ctx.createLinearGradient(0, 790, 0, H); g.addColorStop(0, 'rgba(10,18,34,0)'); g.addColorStop(0.42, 'rgba(10,18,34,.88)'); g.addColorStop(1, 'rgba(10,18,34,.94)');
    ctx.globalAlpha = bandA; ctx.fillStyle = g; ctx.fillRect(0, 790, W, H - 790);
    ctx.fillStyle = 'rgba(10,18,34,.86)'; ctx.fillRect(104, 84, 400, 40); ctx.globalAlpha = 1; // a backing for the eyebrow only
  }
  drawText(ctx, KF[6].lines, o.textIn ?? 1, o.textOut ?? 0, 'rise');
}

/* ---- VIII · The Program ---- */
const chainX = i => 120 + (i - 1) * 67.2;
const CHAIN_Y = 172;
function drawChain(ctx, o) {
  const A0 = o.alpha ?? 1;
  for (let i = 1; i <= 25; i++) {
    const e = o.drop ? o.drop(i) : 1; if (e <= 0) continue;
    const x = chainX(i), y = CHAIN_Y - (1 - e) * 60 + (o.lift ? o.lift(i) : 0) * -120;
    const al = A0 * e * (o.lift ? 1 - o.lift(i) : 1) * (o.done && o.done(i) ? 1 : 0.42);
    pasteboard(ctx, x, y, 56, 40, al);
    ctx.globalAlpha = al; setFont(ctx, font(600, 22, 'body')); ctx.fillStyle = COL.cardInk; ctx.textAlign = 'center';
    ctx.fillText(CARDS[i - 1][1], x + 28, y + 28);
    ctx.globalAlpha = al * 0.9; setFont(ctx, font(500, 12, 'mono')); ctx.fillStyle = COL.dim; ctx.fillText(String(i), x + 28, y - 8);
  }
  ctx.globalAlpha = 1; ctx.textAlign = 'left';
  const ca = (o.cycle ?? 0) * A0;
  if (ca > 0) {
    const xa = chainX(13), xb = chainX(23) + 56, y = CHAIN_Y - 34;
    ctx.globalAlpha = ca; ctx.strokeStyle = COL.brass; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(xa, y + 8); ctx.lineTo(xa, y); ctx.lineTo(xb, y); ctx.lineTo(xb, y + 8); ctx.stroke();
    setFont(ctx, font(500, 13, 'mono'), '2px'); ctx.fillStyle = COL.brass; ctx.textAlign = 'center';
    ctx.fillText('CYCLE 13–23 · RUN TWICE', (xa + xb) / 2, y - 10); ctx.letterSpacing = '0px';
  }
  const ba = (o.backing ?? 0) * A0;
  if (ba > 0) {
    const x1 = chainX(23) + 28, x2 = chainX(13) + 28, y = CHAIN_Y + 50;
    ctx.globalAlpha = ba; ctx.strokeStyle = COL.brass; ctx.lineWidth = 2 + (o.backGlow ?? 0) * 2;
    ctx.beginPath(); ctx.moveTo(x1, y); ctx.bezierCurveTo(x1, y + 52, x2, y + 52, x2, y + 4); ctx.stroke();
    ctx.fillStyle = COL.brass; ctx.beginPath(); ctx.moveTo(x2, y - 2); ctx.lineTo(x2 - 7, y + 12); ctx.lineTo(x2 + 7, y + 12); ctx.closePath(); ctx.fill();
    setFont(ctx, font(500, 13, 'mono'), '2px'); ctx.textAlign = 'center'; ctx.fillText('BACKING · NOTE C', (x1 + x2) / 2, y + 66); ctx.letterSpacing = '0px';
  }
  if (o.reader != null && (o.readerA ?? 1) * A0 > 0) {
    const x = lerp(chainX(1), chainX(25), (o.reader - 1) / 24);
    ctx.globalAlpha = (o.readerA ?? 1) * A0; ctx.strokeStyle = COL.brass; ctx.lineWidth = 3; ctx.strokeRect(x - 5, CHAIN_Y - 5, 66, 50);
  }
  ctx.globalAlpha = 1; ctx.textAlign = 'left';
}
function drawMill(ctx, s, alpha, count) {
  if (alpha <= 0 || !s) return;
  const x = 1060, y = 336;
  pasteboard(ctx, x, y, 230, 150, alpha);
  ctx.globalAlpha = alpha; ctx.fillStyle = COL.cardInk; ctx.textAlign = 'center';
  setFont(ctx, font(600, 96, 'body')); ctx.fillText(s.op, x + 115, y + 102);
  setFont(ctx, font(500, 13, 'mono'), '2px'); ctx.textAlign = 'right'; ctx.fillText(`CARD ${s.no}`, x + 218, y + 22); ctx.letterSpacing = '0px';
  ['+', '−', '×', '÷'].forEach((o, i) => {
    const hx = x + 40 + i * 50, hy = y + 128;
    ctx.beginPath(); ctx.arc(hx, hy, 6, 0, TAU);
    if (o === s.op) { ctx.fillStyle = COL.ground; ctx.fill(); } else { ctx.strokeStyle = 'rgba(42,36,20,.45)'; ctx.lineWidth = 1.2; ctx.stroke(); }
  });
  const vc = (cx, sup, sub) => { pasteboard(ctx, cx, y, 120, 80, alpha); drawVar(ctx, cx + 30, y + 56, 34, sup, sub, COL.cardInk, 'display', alpha); };
  vc(1320, s.ia, s.a); vc(1460, s.ib, s.b);
  ctx.globalAlpha = alpha; ctx.strokeStyle = COL.brass; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(1592, y + 40); ctx.lineTo(1628, y + 40); ctx.stroke();
  ctx.fillStyle = COL.brass; ctx.beginPath(); ctx.moveTo(1636, y + 40); ctx.lineTo(1624, y + 33); ctx.lineTo(1624, y + 47); ctx.closePath(); ctx.fill();
  vc(1644, s.outs[0][0], s.outs[0][1]);
  drawMath(ctx, s.st, 1320, y + 136, 34, COL.ivory, 'display', 'left', alpha);
  setFont(ctx, font(500, 24, 'mono')); ctx.fillStyle = COL.brass; ctx.globalAlpha = alpha; ctx.textAlign = 'left';
  ctx.fillText(`${qs(s.va)} ${s.op} ${qs(s.vb)} = ${qs(s.r)}`, x, y + 206);
  setFont(ctx, font(500, 15, 'mono'), '2px'); ctx.fillStyle = COL.dim;
  ctx.fillText(`OPERATION ${String(count).padStart(2, '0')} OF 36 · CYCLE PASSES ${s.cyc}`, x, y + 244); ctx.letterSpacing = '0px';
  ctx.globalAlpha = 1;
}
function drawResult(ctx, e, alpha = 1) {
  if (e <= 0 || alpha <= 0) return;
  const x = 1060, y = 760;
  const draw = () => {
    ctx.fillStyle = COL.ivory; ctx.textAlign = 'left';
    setFont(ctx, font(500, 140, 'display')); ctx.fillText('B', x, y); let cx = x + ctx.measureText('B').width;
    setFont(ctx, font(500, 70, 'display')); ctx.fillText('7', cx + 2, y + 28); cx += ctx.measureText('7').width + 26;
    ctx.fillRect(cx, y - 55, 52, 4.5); ctx.fillRect(cx, y - 37, 52, 4.5); cx += 52 + 34; // equals and minus drawn at the fraction bar's weight
    ctx.fillRect(cx, y - 44, 46, 5); cx += 46 + 30;
    setFont(ctx, font(500, 76, 'display')); ctx.textAlign = 'center';
    const fw = ctx.measureText('30').width + 20;
    ctx.fillText('1', cx + fw / 2, y - 64); ctx.fillText('30', cx + fw / 2, y + 40);
    ctx.fillRect(cx, y - 44, fw, 5);
    setFont(ctx, font(500, 16, 'mono'), '3px'); ctx.textAlign = 'left'; ctx.fillStyle = COL.dim;
    ctx.fillText('ON V24 AFTER 36 OPERATIONS · B8 IN TODAY’S NUMBERING', x, y + 108); ctx.letterSpacing = '0px';
  };
  ctx.save(); ctx.globalAlpha = alpha;
  if (e < 1) { // punched in
    const cell = 22, r = cell * 0.74 * EASE.detent(e); ctx.beginPath();
    for (let yy = y - 160; yy < y + 130; yy += cell) for (let xx = x - 20; xx < x + 780; xx += cell) { ctx.moveTo(xx + r, yy); ctx.arc(xx, yy, r, 0, TAU); }
    ctx.clip();
  }
  draw(); ctx.restore();
}
// Where the program stands sF operations in (0…36): the reader steps with the detent, or backs the chain up.
function programAt(sF, wrapPrev = 1) {
  const n = TRACE.length, s = Math.min(n - 1, Math.floor(sF)), fr = sF >= n ? 1 : sF - s;
  const prev = s > 0 ? STEP_CARDS[s - 1] : wrapPrev, cur = STEP_CARDS[s];
  const backing = (prev === 23 && cur === 13) || prev > cur + 1;
  const reader = lerp(prev, cur, backing ? EASE.inOut(fr) : EASE.detent(seg(fr, 0, 0.5)));
  const executed = s + (fr >= 0.5 ? 1 : 0), done = new Set(STEP_CARDS.slice(0, executed));
  return { s, fr, reader, executed, done, backing: prev === 23 && cur === 13 };
}
const FIRST_CYCLE = STEP_CARDS.indexOf(13), FIRST_BACK = TRACE.findIndex((x, i) => i > 0 && STEP_CARDS[i - 1] === 23 && x.no === 13);
function sProgram(ctx, o = {}) {
  const amb = o.amb || 0;
  drawText(ctx, KF[7].lines, o.textIn ?? 1, o.textOut ?? 0, 'wipe');
  const state = (st, alpha) => {
    drawChain(ctx, { alpha, drop: o.drop, lift: o.lift, done: st.done, cycle: st.cycle, backing: st.backing, backGlow: st.backGlow, reader: st.reader, readerA: st.readerA });
    drawMill(ctx, TRACE[st.step], (o.mill ?? 1) * alpha, st.count);
  };
  if (amb < 1) state({ done: o.done ?? (() => true), cycle: o.cycle ?? 1, backing: o.backing ?? 1, backGlow: o.backGlow ?? 0, reader: o.reader ?? 25,
    readerA: o.readerA ?? 1, step: o.step ?? TRACE.length - 1, count: o.count ?? 36 }, 1 - amb);
  if (amb > 0) { // the program runs on, 36 operations every sixteen beats
    const P = 16 * BEAT, pr = programAt(mod(o.tau / P, 1) * TRACE.length, 25);
    state({ done: i => pr.done.has(i), cycle: 1, backing: 1, backGlow: pr.backing ? Math.sin(pr.fr * Math.PI) : 0, reader: pr.reader, readerA: 1, step: pr.s, count: pr.executed }, amb);
  }
  drawResult(ctx, o.result ?? 1, o.resultA ?? 1);
}

/* ---- IX · Pitched Sounds ---- */
const HARM = { cx: 1330, cy: 480, R: 300 };
const RATIOS = [[1, 1], [9, 8], [5, 4], [4, 3], [3, 2], [5, 3], [15, 8], [2, 1], [9, 4], [5, 2]];
const INTERVALS = ['unison', 'a major second', 'a major third', 'a perfect fourth', 'a perfect fifth', 'a major sixth', 'a major seventh', 'an octave', 'a major ninth', 'a major tenth'];
const ROLL_SEQ = (() => { const o = []; [1, 1, 1, 1, 5, 691, 7, 3617, 43867, 174611].forEach((n, i) => { if (i) o.push(null); String(n).split('').forEach(d => o.push(+d)); }); return o; })();
const ROLL_LOOP = ROLL_SEQ.length + 1; // one beat's rest before the roll comes round again
function harmPoint(s, dampMul, p, q) {
  const T = TAU * 7, t = s * T, e = Math.exp(-0.05 * dampMul * t);
  return [Math.sin(p * 1.0015 * t + Math.PI / 2) * e, Math.sin(q * t) * e];
}
function drawHarm(ctx, frac, dampMul = 1, alpha = 1, guides = 1, ratio = [3, 2]) {
  if (alpha <= 0) return;
  const [p, q] = ratio, N = 1600, n = Math.max(0, Math.floor(N * clamp01(frac))), { cx, cy, R } = HARM;
  if (n >= 2) {
    ctx.strokeStyle = COL.brass; ctx.lineWidth = 1.6; ctx.globalAlpha = alpha; ctx.beginPath();
    for (let k = 0; k <= n; k++) { const [x, y] = harmPoint(k / N, dampMul, p, q); k ? ctx.lineTo(cx + x * R, cy + y * R) : ctx.moveTo(cx + x * R, cy + y * R); }
    ctx.stroke();
  }
  const [px, py] = harmPoint(n / N, dampMul, p, q), X = cx + px * R, Y = cy + py * R;
  if (guides > 0) { // the two pendulums, each free on its own axis; the pen sits where they cross
    ctx.globalAlpha = alpha * guides; ctx.strokeStyle = COL.faint; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cx - R - 20, cy - R - 40); ctx.lineTo(cx + R + 20, cy - R - 40); ctx.moveTo(cx + R + 40, cy - R - 20); ctx.lineTo(cx + R + 40, cy + R + 20); ctx.stroke();
    ctx.setLineDash([3, 6]); ctx.strokeStyle = COL.dim; ctx.beginPath(); ctx.moveTo(X, cy - R - 40); ctx.lineTo(X, Y); ctx.moveTo(cx + R + 40, Y); ctx.lineTo(X, Y); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = COL.ivory; ctx.beginPath(); ctx.arc(X, cy - R - 40, 7, 0, TAU); ctx.arc(cx + R + 40, Y, 7, 0, TAU); ctx.fill();
    setFont(ctx, font(500, 13, 'mono'), '2px'); ctx.fillStyle = COL.dim; ctx.textAlign = 'left';
    ctx.fillText(`PENDULUM 1 · ${p} SWINGS`, cx - R - 20, cy - R - 58);
    ctx.save(); ctx.translate(cx + R + 64, cy - R); ctx.rotate(Math.PI / 2); ctx.fillText(`PENDULUM 2 · ${q} SWINGS`, 0, 0); ctx.restore();
    ctx.letterSpacing = '0px';
  }
  ctx.globalAlpha = alpha; ctx.fillStyle = COL.ivory; ctx.beginPath(); ctx.arc(X, Y, 4, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
}
// The roll moves right to left under a fixed gold line, and a note sounds only as its hole crosses that line.
// q counts slots past the line: slot k sits on it when q = k. At rest (q = −1) the first hole waits one step to the
// right, so the scene wakes in silence and its first note sounds a beat later, on the line.
const ROLL_LINE = 304, ROLL_STEP = 36;
function drawRoll(ctx, punched, alpha, drop = 0, q = -1, cur = -1) {
  if (alpha <= 0) return;
  const x = 120, y = 856 + drop * 40, w = 1680, h = 96, rows = 10, rh = h / rows;
  ctx.globalAlpha = alpha; ctx.fillStyle = COL.card; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(42,36,20,.13)'; ctx.lineWidth = 1; ctx.beginPath();
  for (let r = 1; r < rows; r++) { ctx.moveTo(x, y + r * rh + 0.5); ctx.lineTo(x + w, y + r * rh + 0.5); } ctx.stroke();
  ctx.save(); ctx.beginPath(); ctx.rect(x + 150, y, w - 150, h); ctx.clip();
  const qq = q >= 0 ? mod(q, ROLL_LOOP) : q;
  for (let rep = 0; rep < (q >= 0 ? 2 : 1); rep++) ROLL_SEQ.forEach((d, k) => {
    if (d === null) return; const e = EASE.detent(clamp01(punched - k)); if (e <= 0) return;
    const cx = ROLL_LINE + (k + rep * ROLL_LOOP - qq) * ROLL_STEP, cy = y + (rows - 1 - d) * rh + rh / 2;
    if (cx < x + 140 || cx > x + w + 20) return;
    ctx.fillStyle = k === cur && rep === 0 ? COL.brassDeep : COL.ground;
    ctx.beginPath(); ctx.roundRect(cx - 12 * e, cy - 3.4 * e, 24 * e, 6.8 * e, 3); ctx.fill();
  });
  ctx.restore();
  setFont(ctx, font(500, 13, 'mono'), '2px'); ctx.fillStyle = 'rgba(42,36,20,.7)'; ctx.textAlign = 'left';
  ctx.fillText('NOTE A ·', x + 14, y + 40); ctx.fillText('MUSIC ROLL', x + 14, y + 60); ctx.letterSpacing = '0px';
  ctx.fillStyle = COL.brass; ctx.fillRect(ROLL_LINE - 1.5, y - 6, 3, h + 12);
  ctx.globalAlpha = 1;
}
// The roll as heard at time tau: the slot on the gold line, how far past it, and the ratio held through rests.
function rollAt(tau) {
  const q = tau / BEAT - 1;
  if (q < 0) return { q, slot: -1, u: 1, d: 4, fresh: false }; // nothing has reached the line yet: the resting 3 : 2
  const qq = mod(q, ROLL_LOOP), slot = Math.floor(qq), u = qq - slot;
  let k = slot, d = null; while (k >= 0 && (d = ROLL_SEQ[k] ?? null) === null) k--;
  if (d === null) d = 4;
  return { q, slot, u, d, fresh: ROLL_SEQ[slot] != null };
}
function sMusic(ctx, o = {}) {
  const amb = o.amb || 0, L = KF[8].lines;
  drawText(ctx, [L[0], L[3], L[4], L[5]], o.textIn ?? 1, o.textOut ?? 0, 'rise');
  if (amb < 1) {
    const ca = 1 - amb;
    if (ca > 0.999) drawText(ctx, [L[1], L[2]], o.textIn ?? 1, o.textOut ?? 0, 'rise');
    else { drawLine(ctx, L[1], ca); drawLine(ctx, L[2], ca); }
    drawHarm(ctx, o.frac ?? 1, o.damp ?? 1, (o.harmA ?? 1) * ca, o.guides ?? 1);
    drawRoll(ctx, o.punched ?? ROLL_SEQ.length, (o.roll ?? 1) * ca, o.rollDrop ?? 0);
  }
  if (amb > 0) { // the roll plays: each note's ratio against the drone is drawn by the pendulums
    const r = rollAt(o.tau), [p, q] = RATIOS[r.d];
    const prev = rollAt(o.tau - BEAT);
    drawHarm(ctx, 1, 1, amb * 0.16, 0, RATIOS[prev.d]);
    drawHarm(ctx, r.fresh ? EASE.out(seg(r.u, 0, 0.92)) : 1, 1, amb, 1, [p, q]);
    const rise = r.fresh ? EASE.out(seg(r.u, 0, 0.25)) : 1;
    drawLine(ctx, rich(106, 430, 210, font(500, 210, 'display'), `${p} : ${q}`), amb * rise, (1 - rise) * 18);
    drawLine(ctx, rich(120, 504, 46, font(400, 46, 'display', 'italic'), [[INTERVALS[r.d], COL.brass]]), amb * rise);
    drawRoll(ctx, ROLL_SEQ.length, amb, 0, r.q, r.slot);
  }
}

/* ---- X · No Pretensions ---- */
function periodPos(ctx) {
  const ln = KF[9].lines[2], b = lineBox(ctx, ln); setFont(ctx, ln.font);
  return [b.x0 + b.w - ctx.measureText('.').width / 2, ln.y - ln.size * 0.09];
}
function sCoda(ctx, o = {}) {
  drawText(ctx, KF[9].lines, o.textIn ?? 1, 0, 'punch');
  const amb = o.amb || 0;
  if (amb > 0) { // the point at rest still answers the beat, slowly
    const pulse = Math.pow(Math.max(0, Math.sin(TAU * o.tau / (8 * BEAT))), 6), [x, y] = periodPos(ctx);
    ctx.globalAlpha = amb * pulse; ctx.strokeStyle = COL.brass; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 8 + 26 * pulse, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
  }
}

/* ---------------- the film: holds and transitions, counted in beats ---------------- */
const SEGS = [
  { id: 'T0', kind: 't', from: -1, to: 0, beats: 8, name: 'The first pick', mech: 'Shuttle', ease: 'shuttle',
    work: 'Jacquard’s woven portrait, which Lovelace cites in Note F',
    chor: [[0, .35, 'Running head and card chain fade up', 'out'], [.05, 1, 'Portrait woven row by row, the shuttle reversing on every pick', 'shuttle'], [.15, .85, 'Title lines wiped in by the shuttle, staggered', 'shuttle']] },
  { id: 'K1', kind: 'k', k: 0, beats: 6 },
  { id: 'T1', kind: 't', from: 0, to: 1, beats: 10, name: 'Warp and weft part', mech: 'Unweaving · weft thrown, warp lowered', ease: 'shuttle',
    work: 'From the woven portrait to “poetical science”',
    chor: [[0, .3, 'Title wiped out, last line first', 'shuttle'], [0, .4, 'Portrait unwoven, pick by pick from the bottom', 'inOut'], [.35, .7, 'Its warp stretched across the whole frame', 'inOut'], [.45, .82, '“poetical” thrown in as weft, ribbon by ribbon', 'shuttle'], [.5, .86, '“science” lowered in as warp, ribbon by ribbon', 'detent'], [.84, 1, 'The two words interlace: plain weave', 'out'], [.3, .7, 'Running head and chain withdraw: the frame goes full bleed', 'inOut'], [.7, 1, 'Her sentence rises in', 'out']] },
  { id: 'K2', kind: 'k', k: 1, beats: 8 },
  { id: 'T2', kind: 't', from: 1, to: 2, beats: 9, name: 'The shuttle takes flight', mech: 'Shuttle → wingbeat', ease: 'shuttle',
    work: 'From the loom of Note A to Flyology, 1828',
    chor: [[0, .25, 'The sentence lifts out', 'in'], [0, .45, 'Weft carried off to the right, warp drawn up', 'in'], [.45, .5, 'The shuttle enters from the left', 'in'], [.5, .92, 'The shuttle flies the wingtip’s path and lays the trail', 'shuttle'], [.55, 1, 'Flyology wiped in', 'shuttle'], [.86, 1, 'The shuttle becomes the bird', 'out'], [.4, .8, 'Running head and chain return', 'inOut']] },
  { id: 'K3', kind: 'k', k: 2, beats: 8 },
  { id: 'T3', kind: 't', from: 2, to: 3, beats: 10, name: 'Wrap and discover', mech: 'Polar wrap → envelope', ease: 'inOut',
    work: 'From Flyology to imagination as “the Discovering Faculty”, 1841',
    chor: [[0, .25, 'Flyology wiped out', 'shuttle'], [0, .2, 'Bird and wingbeat dots fade', 'out'], [.1, .5, 'The wave is wrapped round a circle', 'inOut'], [.42, .6, 'The wave is damped into a true circle', 'inOut'], [.5, .72, '240 points appear round the circle', 'out'], [.55, .95, 'Chords grow as k runs from 1 to 2; the cardioid appears', 'inOut'], [.55, 1, 'The 1841 quotation rises in', 'out'], [.78, 1, 'Card chain advances one notch', 'detent']] },
  { id: 'K4', kind: 'k', k: 3, beats: 6 },
  { id: 'T4', kind: 't', from: 3, to: 4, beats: 10, name: 'Chords become warp', mech: 'Thread · one card per pick', ease: 'shuttle',
    work: 'Note A: “weaves algebraical patterns”',
    chor: [[0, .25, 'The quotation lifts out', 'in'], [0, .2, 'Circle and points fade', 'out'], [.05, .6, 'Each chord swings upright into a warp thread', 'inOut'], [.5, .95, 'Cloth woven top to bottom, one card per row', 'linear'], [.5, 1, 'Note A wiped in', 'shuttle'], [.55, .7, 'The card now on the loom appears', 'out'], [.78, 1, 'Card chain advances one notch', 'detent']] },
  { id: 'K5', kind: 'k', k: 4, beats: 8 },
  { id: 'T5', kind: 't', from: 4, to: 5, beats: 10, name: 'Warp into columns', mech: 'Successive carry', ease: 'detent',
    work: 'Note B’s Store of discs; the carry of Babbage’s engines',
    chor: [[0, .25, 'Note A wiped out', 'shuttle'], [0, .32, 'Cloth unwoven, warp left standing', 'inOut'], [.3, .7, 'Warp gathered into ten columns', 'inOut'], [.55, .79, 'Discs stack, lowest first', 'detent'], [.68, .94, 'Figures set by successive carry, lowest disc first', 'detent'], [.8, .95, 'Variable names and values appear', 'out'], [.5, 1, 'Note B wiped in', 'shuttle'], [.78, 1, 'Card chain advances one notch', 'detent']] },
  { id: 'K6', kind: 'k', k: 5, beats: 6 },
  { id: 'T6', kind: 't', from: 5, to: 6, beats: 10, name: 'Cards by the thousand', mech: 'Card · cascade', ease: 'inOut',
    work: 'Note F: the woven portrait that needed 24,000 cards',
    chor: [[0, .2, 'Note B wiped out', 'shuttle'], [0, .25, 'The Store sinks away', 'in'], [.15, .72, 'Cards fall into a wall along a diagonal front, counted as they land', 'inOut'], [.65, .9, 'The number picks itself out in lit cards', 'out'], [.3, .7, 'Running head and chain withdraw: full bleed', 'inOut'], [.7, 1, 'Note F’s sentence and the count of 25 rise in', 'out']] },
  { id: 'K7', kind: 'k', k: 6, beats: 8 },
  { id: 'T7', kind: 't', from: 6, to: 7, beats: 14, name: '24,000 become 25', mech: 'Collapse · prism detent · backing', ease: 'detent',
    work: 'Note F’s saving of cards; Note G’s program; the “backing” of Note C',
    chor: [[0, .2, 'Note F lifts out', 'in'], [.05, .3, 'The wall collapses into a single line', 'in'], [.24, .36, 'Twenty-five operation-cards drop out of the line', 'detent'], [.3, .36, 'The Mill opens', 'out'], [.36, .9, '36 operations: the reader steps card to card and backs up from 23 to 13', 'detent'], [.9, 1, 'The result, −1/30, punched in', 'detent'], [.3, .6, 'Note G wiped in', 'shuttle'], [.3, .7, 'Running head and chain return', 'inOut']] },
  { id: 'K8', kind: 'k', k: 7, beats: 8 },
  { id: 'T8', kind: 't', from: 7, to: 8, beats: 10, name: 'Number becomes ratio', mech: 'Pendulum', ease: 'pendulum',
    work: 'From Note G’s numbers to Note A’s music',
    chor: [[0, .2, 'Note G wiped out', 'shuttle'], [0, .3, 'Cards lift away; Mill and result fade', 'in'], [.15, .28, 'A music roll slides up', 'out'], [.25, .6, 'Bernoulli numerators punched as notes, in silence', 'detent'], [.35, .5, 'Two pendulums appear', 'pendulum'], [.45, 1, 'The pen draws 3 : 2 at the pendulums’ own pace', 'linear'], [.45, .95, 'Note A rises in', 'out'], [.78, 1, 'Card chain advances one notch', 'detent']] },
  { id: 'K9', kind: 'k', k: 8, beats: 16 },
  { id: 'T9', kind: 't', from: 8, to: 9, beats: 9, name: 'Coming to rest', mech: 'Damping · card reading', ease: 'inOut',
    work: 'Note G: “no pretensions whatever to originate anything”; Turing, 1950',
    chor: [[0, .25, 'Note A lifts out', 'in'], [0, .3, 'The roll drops away', 'in'], [0, .45, 'Damping raised until the figure comes to rest', 'inOut'], [.3, .62, 'The resting point travels to the full stop', 'inOut'], [.45, 1, 'Note G read in, line by line, through punched holes', 'detent'], [.78, 1, 'Card chain advances to the last card', 'detent']] },
  { id: 'K10', kind: 'k', k: 9, beats: 8 },
];
let acc = 0;
for (const s of SEGS) { s.t0 = acc; s.dur = s.beats * BEAT; acc += s.dur; s.t1 = acc; }
const SEG_BY = Object.fromEntries(SEGS.map(s => [s.id, s]));
const DURATION = acc;
const HOLDS = SEGS.filter(s => s.kind === 'k');
const KEY_TIMES = HOLDS.map(s => (s.t0 + s.t1) / 2);
function segmentAt(t) {
  t = Math.max(0, Math.min(DURATION - 1e-6, t));
  for (let i = 0; i < SEGS.length; i++) { const s = SEGS[i]; if (t < s.t1) return { s, i, p: (t - s.t0) / s.dur }; }
  const i = SEGS.length - 1; return { s: SEGS[i], i, p: 1 };
}
// How alive a hold is: one beat to wake after the transition lands, one beat to settle before the next.
const ambAt = (s, t) => s.kind !== 'k' ? 0 : EASE.inOut(seg(t, s.t0, s.t0 + BEAT)) * (1 - EASE.inOut(seg(t, s.t1 - BEAT, s.t1)));

/* ---------------- transitions ---------------- */
const SCENES = [sPortrait, sPoetical, sFly, sImag, sLoom, sStore, sCards, sProgram, sMusic, sCoda];
const TR = {
  T0(ctx, p) {
    sPortrait(ctx, { textIn: seg(p, 0.15, 0.85), rows: A.portrait.rows * seg(p, 0.05, 1), warp: 0.32 });
  },
  T1(ctx, p) {
    const unweave = A.portrait.rows * (1 - EASE.inOut(seg(p, 0, 0.4)));
    sPortrait(ctx, { textIn: 1, textOut: seg(p, 0, 0.3), rows: unweave, warp: 0.32 * (1 - seg(p, 0.35, 0.45)) });
    const spread = EASE.inOut(seg(p, 0.35, 0.7)), wa = seg(p, 0.33, 0.4) * (1 - seg(p, 0.66, 0.8));
    if (wa > 0) { // the portrait's warp, stretched over the whole frame
      ctx.strokeStyle = COL.brass; ctx.lineWidth = 1.4; ctx.globalAlpha = 0.45 * wa; ctx.beginPath();
      for (let j = 0; j < A.portrait.cols; j++) {
        const x = lerp(PORT_X + (j + 0.5) * A.portrait.cell, (j + 0.5) * W / A.portrait.cols, spread);
        ctx.moveTo(x, lerp(PORT_Y, 0, spread)); ctx.lineTo(x, lerp(PORT_Y + A.portrait.h, H, spread));
      }
      ctx.stroke(); ctx.globalAlpha = 1;
    }
    const Wd = A.words, nA = Wd.rowsA.length, nB = Wd.colsB.length;
    sPoetical(ctx, { textIn: seg(p, 0.7, 1), woven: c => drawWoven(c, {
      aOff: j => { const k = Wd.rowsA.indexOf(j), a = 0.45 + 0.22 * k / nA; return -W * (1 - EASE.shuttle(seg(p, a, a + 0.15))); },
      bOff: i => { const k = Wd.colsB.indexOf(i), a = 0.5 + 0.2 * k / nB; return -H * (1 - EASE.detent(seg(p, a, a + 0.16))); },
      over: seg(p, 0.84, 1) }) });
  },
  T2(ctx, p) {
    const Wd = A.words, nA = Wd.rowsA.length, nB = Wd.colsB.length;
    sPoetical(ctx, { textIn: 1, textOut: seg(p, 0, 0.25), woven: c => drawWoven(c, {
      aOff: j => { const k = Wd.rowsA.indexOf(j), a = 0.02 + 0.2 * k / nA; return W * EASE.in(seg(p, a, a + 0.22)); },
      bOff: i => { const k = Wd.colsB.indexOf(i), a = 0.04 + 0.2 * k / nB; return -H * EASE.in(seg(p, a, a + 0.2)); },
      over: 1 - seg(p, 0, 0.06) }) });
    const fly = EASE.shuttle(seg(p, 0.5, 0.92)), trail = fly * WAVE.xB;
    sFly(ctx, { textIn: seg(p, 0.55, 1), trail, decor: seg(p, 0.5, 0.6), bird: seg(p, 0.86, 1) });
    const enter = seg(p, 0.45, 0.5);
    if (enter > 0 && p < 0.5) drawShuttle(ctx, lerp(-90, 0, EASE.out(enter)), waveY(0), 1, 1);
    if (p >= 0.5 && p < 1) { const x = Math.max(0, trail); drawShuttle(ctx, x, waveY(x), 1, 1, 1 - seg(p, 0.86, 0.96)); }
  },
  T3(ctx, p) {
    const wrap = EASE.inOut(seg(p, 0.1, 0.5)), damp = 1 - EASE.inOut(seg(p, 0.42, 0.6));
    sFly(ctx, { textIn: 1, textOut: seg(p, 0, 0.25), trail: WAVE.xB, decor: 1 - seg(p, 0, 0.2), bird: 1 - seg(p, 0, 0.15),
      wrap, damp, waveAlpha: 1 - seg(p, 0.6, 0.8) });
    sImag(ctx, { textIn: seg(p, 0.55, 1), ring: seg(p, 0.6, 0.8), dots: seg(p, 0.5, 0.72),
      k: 1 + EASE.inOut(seg(p, 0.55, 0.95)), chords: seg(p, 0.55, 0.62) });
  },
  T4(ctx, p) {
    sImag(ctx, { textIn: 1, textOut: seg(p, 0, 0.25), ring: 1 - seg(p, 0, 0.2), dots: 1 - seg(p, 0, 0.15), chords: 0 });
    const N = 240, wa = 1 - seg(p, 0.85, 0.95);
    ctx.strokeStyle = COL.brass; ctx.lineWidth = 1.15; ctx.globalAlpha = lerp(0.5, 0.6, seg(p, 0.05, 0.6)) * wa; ctx.beginPath();
    for (let i = 0; i < N; i++) {
      const u = EASE.inOut(seg(p, 0.05 + 0.15 * i / N, 0.45 + 0.15 * i / N));
      let [x1, y1, x2, y2] = chordEnds(i, N, 2); if (y2 < y1) [x1, y1, x2, y2] = [x2, y2, x1, y1];
      const xt = CLOTH_X + (i + 0.5) * A.cloth.w / N;
      ctx.moveTo(lerp(x1, xt, u), lerp(y1, CLOTH_Y, u)); ctx.lineTo(lerp(x2, xt, u), lerp(y2, CLOTH_Y + A.cloth.h, u));
    }
    ctx.stroke(); ctx.globalAlpha = 1;
    sLoom(ctx, { textIn: seg(p, 0.5, 1), rows: A.cloth.rows * seg(p, 0.5, 0.95), card: seg(p, 0.55, 0.7) });
  },
  T5(ctx, p) {
    const rows = A.cloth.rows * (1 - EASE.inOut(seg(p, 0, 0.32)));
    sLoom(ctx, { textIn: 1, textOut: seg(p, 0, 0.25), rows, warp: 0, card: 1 - seg(p, 0, 0.15) });
    const c = A.cloth.cell, fade = 1 - seg(p, 0.62, 0.75);
    if (fade > 0) { // warp threads, standing where the cloth has gone, then gathered into ten columns
      ctx.strokeStyle = COL.brass; ctx.lineWidth = 2; ctx.globalAlpha = 0.6 * fade; ctx.beginPath();
      for (let j = 0; j < A.cloth.cols; j++) {
        const col = Math.min(9, Math.floor(j / 10.2)), u = EASE.inOut(seg(p, 0.3 + 0.1 * j / A.cloth.cols, 0.6 + 0.1 * j / A.cloth.cols));
        const x = lerp(CLOTH_X + (j + 0.5) * c, storeX(col) + (j - col * 10.2 - 4.6) * 4, u);
        const top = Math.max(lerp(CLOTH_Y, 250, u), CLOTH_Y + Math.max(0, rows) * c * (1 - u));
        ctx.moveTo(x, top); ctx.lineTo(x, lerp(CLOTH_Y + A.cloth.h, 836, u));
      }
      ctx.stroke(); ctx.globalAlpha = 1;
    }
    sStore(ctx, { textIn: seg(p, 0.5, 1),
      disc: (col, d) => EASE.detent(seg(p, 0.55 + 0.012 * (9 - d) + 0.006 * col, 0.65 + 0.012 * (9 - d) + 0.006 * col)),
      roll: (col, d) => seg(p, 0.68 + 0.022 * (9 - d), 0.74 + 0.022 * (9 - d)),
      labels: seg(p, 0.8, 0.95) });
  },
  T6(ctx, p) {
    const rv = EASE.inOut(seg(p, 0.15, 0.72)), front = rv * (FRONT_MAX + 6);
    sCards(ctx, { front, lit: EASE.out(seg(p, 0.65, 0.9)), band: seg(p, 0.6, 0.85), textIn: seg(p, 0.7, 1) });
    sStore(ctx, { textIn: 1, textOut: seg(p, 0, 0.2), sink: EASE.in(seg(p, 0, 0.25)) });
    const ca = seg(p, 0.15, 0.22) * (1 - seg(p, 0.78, 0.9));
    if (ca > 0) { // the count, as the cards land
      setFont(ctx, font(500, 64, 'display')); ctx.globalAlpha = ca; ctx.fillStyle = COL.brass; ctx.textAlign = 'right';
      ctx.fillText(cardsBefore(front).toLocaleString('en-US'), 1800, 210);
      setFont(ctx, font(500, 14, 'mono'), '3px'); ctx.fillStyle = COL.dim; ctx.fillText('CARDS DOWN', 1800, 236); ctx.letterSpacing = '0px';
      ctx.globalAlpha = 1; ctx.textAlign = 'left';
    }
  },
  T7(ctx, p) {
    const col = EASE.in(seg(p, 0.05, 0.3)), wa = 1 - seg(p, 0.26, 0.34);
    if (wa > 0) { // the wall collapses into the line the chain will hang on
      const y = lerp(0, CHAIN_Y, col), h = lerp(H, 40, col);
      ctx.globalAlpha = wa; ctx.drawImage(A.wall.all, 0, 0, W, H, 0, y, W, h); ctx.globalAlpha = 1;
    }
    sCards(ctx, { textIn: 1, textOut: seg(p, 0, 0.2), lit: 0, band: 1 - seg(p, 0.05, 0.2), front: -1 });
    const tau = seg(p, 0.36, 0.9), pr = programAt(tau * TRACE.length, 1);
    sProgram(ctx, { textIn: seg(p, 0.3, 0.6), step: pr.s, count: tau > 0 ? pr.executed : 0,
      drop: i => EASE.detent(seg(p, 0.24 + 0.004 * i, 0.32 + 0.004 * i)), done: i => tau > 0 && pr.done.has(i),
      cycle: tau > 0 && pr.s >= FIRST_CYCLE ? seg(tau * TRACE.length, FIRST_CYCLE, FIRST_CYCLE + 1) : 0,
      backing: tau > 0 && pr.s >= FIRST_BACK ? seg(tau * TRACE.length, FIRST_BACK, FIRST_BACK + 1) : 0, backGlow: pr.backing ? Math.sin(pr.fr * Math.PI) : 0,
      reader: tau <= 0 ? 1 : pr.reader, readerA: seg(p, 0.32, 0.38), mill: seg(p, 0.3, 0.36), result: seg(p, 0.9, 1) });
  },
  T8(ctx, p) {
    sProgram(ctx, { textIn: 1, textOut: seg(p, 0, 0.2), lift: i => EASE.in(seg(p, 0.004 * i, 0.15 + 0.004 * i)), readerA: 1 - seg(p, 0, 0.1),
      cycle: 1 - seg(p, 0, 0.12), backing: 1 - seg(p, 0, 0.12), mill: 1 - seg(p, 0, 0.18), resultA: 1 - seg(p, 0.1, 0.3) });
    sMusic(ctx, { textIn: seg(p, 0.45, 0.95), roll: seg(p, 0.15, 0.28), rollDrop: 1 - EASE.out(seg(p, 0.15, 0.28)),
      punched: ROLL_SEQ.length * seg(p, 0.25, 0.6), frac: seg(p, 0.45, 1), guides: EASE.pendulum(seg(p, 0.35, 0.5)), harmA: seg(p, 0.35, 0.45) });
  },
  T9(ctx, p) {
    const rest = EASE.inOut(seg(p, 0, 0.45));
    sMusic(ctx, { textIn: 1, textOut: seg(p, 0, 0.25), roll: 1 - seg(p, 0, 0.3), rollDrop: EASE.in(seg(p, 0, 0.3)),
      damp: 1 + 30 * rest, guides: 1 - seg(p, 0, 0.3), harmA: 1 - seg(p, 0.3, 0.4) });
    sCoda(ctx, { textIn: seg(p, 0.45, 1) });
    const appear = seg(p, 0.3, 0.38), travel = EASE.inOut(seg(p, 0.4, 0.62)), gone = seg(p, 0.85, 1);
    if (appear > 0 && gone < 1) {
      const [tx, ty] = periodPos(ctx), x = lerp(HARM.cx, tx, travel), y = lerp(HARM.cy, ty, travel) - Math.sin(travel * Math.PI) * 120;
      ctx.globalAlpha = appear * (1 - gone); ctx.fillStyle = COL.brass; ctx.beginPath(); ctx.arc(x, y, lerp(8, 6, travel), 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    }
  },
};

/* ---------------- render ---------------- */
// opt.tau: ambient clock (defaults to film time, as in the exported video); opt.amb: force how alive holds are (0 for stills).
function render(ctx, t, opt = {}) {
  const { s, p } = segmentAt(t);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = COL.ground; ctx.fillRect(0, 0, W, H);
  if (A.ready) {
    if (s.kind === 'k') {
      const amb = opt.amb ?? ambAt(s, t);
      SCENES[s.k](ctx, { amb, tau: opt.tau ?? (t - s.t0) }); // each loop starts from its beginning when the hold begins
      drawChrome(ctx, s.k, s.k, 0, s.k, chromeAlpha(s.k));
    } else {
      TR[s.id](ctx, p);
      if (s.from < 0) drawChrome(ctx, -1, 0, 1, 0, seg(p, 0, 0.35));
      else drawChrome(ctx, s.from, s.to, seg(p, 0.45, 0.6), s.from + EASE.detent(seg(p, 0.78, 1)),
        lerp(chromeAlpha(s.from), chromeAlpha(s.to), EASE.inOut(seg(p, KF[s.from].full ? 0.4 : 0.3, KF[s.from].full ? 0.8 : 0.7))));
    }
  }
  ctx.restore();
}
// One keyframe on its own, alive, without the running head: for the full-bleed bands of the page.
function renderScene(ctx, k, tau, amb = 1) {
  ctx.fillStyle = COL.ground; ctx.fillRect(0, 0, W, H);
  if (A.ready) SCENES[k](ctx, { amb, tau });
}

/* ---------------- motion boards and storyboard ---------------- */
let scratch = null;
const scratchCtx = () => { if (!scratch) scratch = newCanvas(); return scratch.getContext('2d'); };
function drawBoard(ctx, segId) {
  const s = SEG_BY[segId]; if (!s) return;
  const sc = scratchCtx();
  ctx.fillStyle = COL.ground; ctx.fillRect(0, 0, W, H);
  const trs = SEGS.filter(x => x.kind === 't'), n = trs.indexOf(s);
  setFont(ctx, font(500, 18, 'mono'), '4px'); ctx.fillStyle = COL.brass; ctx.textAlign = 'left';
  ctx.fillText(`${s.id} · ${n ? `TRANSITION ${n} OF ${trs.length - 1}` : 'OPENING'} · ${s.beats} BEATS · ${s.dur.toFixed(2)} S`, 120, 92);
  ctx.letterSpacing = '0px';
  setFont(ctx, font(500, 64, 'display')); ctx.fillStyle = COL.ivory; ctx.fillText(s.name, 116, 170);
  setFont(ctx, font(400, 24, 'body', 'italic')); ctx.fillStyle = COL.dim;
  ctx.fillText(`${s.mech} · ${s.work}`, 120, 214);
  const bx = 1460, by = 64, bw = 340, bh = 150, f = EASE[s.ease];
  ctx.strokeStyle = COL.faint; ctx.lineWidth = 1; ctx.strokeRect(bx, by, bw, bh);
  ctx.strokeStyle = COL.brass; ctx.lineWidth = 2.5; ctx.beginPath();
  for (let i = 0; i <= 100; i++) { const u = i / 100, v = f(u); const X = bx + u * bw, Y = by + bh - v * bh * 0.82 - bh * 0.09; i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }
  ctx.stroke();
  setFont(ctx, font(500, 13, 'mono'), '2px'); ctx.fillStyle = COL.dim; ctx.fillText(`EASING · ${s.ease.toUpperCase()}`, bx, by + bh + 24); ctx.letterSpacing = '0px';
  const P = [0, 0.2, 0.4, 0.6, 0.8, 1], tw = 544, th = 306;
  P.forEach((pp, i) => {
    const col = i % 3, row = Math.floor(i / 3), x = 120 + col * (tw + 24), y = 262 + row * (th + 82);
    render(sc, Math.min(s.t1 - 1e-4, s.t0 + pp * s.dur), { amb: 0 });
    ctx.drawImage(scratch, x, y, tw, th);
    ctx.strokeStyle = COL.faint; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, tw - 1, th - 1);
    setFont(ctx, font(500, 15, 'mono'), '2px'); ctx.fillStyle = COL.brass;
    ctx.fillText(`p ${pp.toFixed(2)} · t ${(s.t0 + pp * s.dur).toFixed(2)} s`, x, y + th + 26); ctx.letterSpacing = '0px';
    const active = s.chor.filter(([a, b]) => pp >= a && pp <= b).map(c => c[2]);
    setFont(ctx, font(400, 17, 'body')); ctx.fillStyle = COL.dim;
    const txt = active.length ? active.slice(0, 2).join(' · ') : 'Held';
    let line = txt; while (ctx.measureText(line).width > tw && line.length > 4) line = line.slice(0, -2);
    ctx.fillText(line === txt ? line : line.trimEnd() + '…', x, y + th + 52);
    const fx = bx + pp * bw, fy = by + bh - f(pp) * bh * 0.82 - bh * 0.09;
    ctx.fillStyle = COL.ivory; ctx.beginPath(); ctx.arc(fx, fy, 4.5, 0, TAU); ctx.fill();
  });
}
function drawOverview(ctx) {
  const sc = scratchCtx();
  ctx.fillStyle = COL.ground; ctx.fillRect(0, 0, W, H);
  setFont(ctx, font(500, 18, 'mono'), '4px'); ctx.fillStyle = COL.brass; ctx.textAlign = 'left';
  ctx.fillText(`ADA LOVELACE · STORYBOARD · ${NK} KEYFRAMES · 16:9`, 120, 92); ctx.letterSpacing = '0px';
  setFont(ctx, font(500, 64, 'display')); ctx.fillStyle = COL.ivory; ctx.fillText(`The film in ${NK === 10 ? 'ten' : NK} stills`, 116, 170);
  const tw = 318, th = 179, gx = 22;
  KEY_TIMES.forEach((t, i) => {
    const col = i % 5, row = Math.floor(i / 5), x = 120 + col * (tw + gx), y = 320 + row * (th + 150);
    render(sc, t, { amb: 0 }); ctx.drawImage(scratch, x, y, tw, th);
    ctx.strokeStyle = KF[i].full ? COL.brass : COL.faint; ctx.lineWidth = KF[i].full ? 2 : 1; ctx.strokeRect(x + .5, y + .5, tw - 1, th - 1);
    setFont(ctx, font(500, 14, 'mono'), '2px'); ctx.fillStyle = COL.brass;
    ctx.fillText(`K${i + 1} · ${ROMAN[i]} · t ${t.toFixed(1)} s`, x, y + th + 28); ctx.letterSpacing = '0px';
    setFont(ctx, font(400, 24, 'body', 'italic')); ctx.fillStyle = COL.ivory; ctx.fillText(KF[i].title + (KF[i].full ? ' · full bleed' : ''), x, y + th + 60);
  });
}

/* ================= sound =================
   Synthesised in Web Audio from the same timeline: film events at fixed film times, ambient
   events on the ambient clock while a hold is alive, and a drone bed that follows the scene.
   The same functions run live and inside an OfflineAudioContext for the exported soundtrack. */
const noiseCache = new WeakMap();
function noise(ac) {
  let b = noiseCache.get(ac); if (b) return b;
  b = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); const d = b.getChannelData(0);
  let s = 1234567; for (let i = 0; i < d.length; i++) { s = (s * 16807) % 2147483647; d[i] = s / 1073741823.5 - 1; }
  noiseCache.set(ac, b); return b;
}
function noiseSrc(ac, t, dur) { const n = ac.createBufferSource(); n.buffer = noise(ac); n.loop = true; n.start(t, (t * 7.31) % 0.7, dur + 0.05); return n; }
function envG(ac, t, attack, peak, decay) {
  const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  return g;
}
const SYN = {
  // a card dropping into its notch: a dry click and a wooden knock
  tick(ac, out, t, o = {}) {
    const g = o.g ?? 0.16, n = noiseSrc(ac, t, 0.05), bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = o.f ?? 2600; bp.Q.value = 5;
    n.connect(bp).connect(envG(ac, t, 0.001, g, 0.035)).connect(out);
    const k = ac.createOscillator(); k.frequency.setValueAtTime(o.low ?? 190, t); k.frequency.exponentialRampToValueAtTime((o.low ?? 190) * 0.6, t + 0.06);
    k.connect(envG(ac, t, 0.002, g * 0.5, 0.06)).connect(out); k.start(t); k.stop(t + 0.1);
  },
  // the shuttle crossing: a band of noise sweeping up
  swish(ac, out, t, o = {}) {
    const dur = o.dur ?? 0.22, g = o.g ?? 0.07, n = noiseSrc(ac, t, dur), bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.3;
    bp.frequency.setValueAtTime(o.f0 ?? 700, t); bp.frequency.exponentialRampToValueAtTime(o.f1 ?? 2800, t + dur);
    const e = ac.createGain(); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(g, t + dur * 0.45); e.gain.linearRampToValueAtTime(0, t + dur);
    n.connect(bp).connect(e).connect(out);
  },
  // the batten beating up the weft, a disc landing, a hole punched
  thump(ac, out, t, o = {}) {
    const f = o.f ?? 110, k = ac.createOscillator(); k.type = 'sine';
    k.frequency.setValueAtTime(f, t); k.frequency.exponentialRampToValueAtTime(f * 0.5, t + 0.12);
    k.connect(envG(ac, t, 0.003, o.g ?? 0.28, 0.18)).connect(out); k.start(t); k.stop(t + 0.25);
    const n = noiseSrc(ac, t, 0.04), lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
    n.connect(lp).connect(envG(ac, t, 0.001, (o.g ?? 0.28) * 0.4, 0.03)).connect(out);
  },
  // a plucked note, harp-like, at any frequency
  note(ac, out, t, o = {}) {
    const f = o.f ?? 196, dur = o.dur ?? 1.2, g = o.g ?? 0.15;
    // bright overtones that fade faster than the fundamental, so the notes carry on small speakers
    [[1, 'triangle', 1, 1], [2, 'sine', 0.5, 0.75], [3, 'sine', 0.3, 0.55], [4, 'sine', 0.15, 0.4]].forEach(([m, type, a, d]) => {
      const k = ac.createOscillator(); k.type = type; k.frequency.value = f * m;
      k.connect(envG(ac, t, 0.012, g * a, dur * d)).connect(out); k.start(t); k.stop(t + dur * d + 0.05);
    });
  },
  bell(ac, out, t, o = {}) {
    const f = o.f ?? 392, g = o.g ?? 0.08;
    [[1, 1], [2.76, 0.45], [5.4, 0.22], [8.93, 0.1]].forEach(([m, a], i) => {
      const k = ac.createOscillator(); k.frequency.value = f * m;
      k.connect(envG(ac, t, 0.004, g * a, 3.2 / (i + 1))).connect(out); k.start(t); k.stop(t + 3.4);
    });
  },
  // air under a wing
  whoosh(ac, out, t, o = {}) {
    const dur = o.dur ?? 0.36, n = noiseSrc(ac, t, dur), lp = ac.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(260, t); lp.frequency.linearRampToValueAtTime(o.f ?? 900, t + dur * 0.4); lp.frequency.linearRampToValueAtTime(260, t + dur);
    const e = ac.createGain(); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(o.g ?? 0.08, t + dur * 0.35); e.gain.linearRampToValueAtTime(0, t + dur);
    n.connect(lp).connect(e).connect(out);
  },
  gliss(ac, out, t, o = {}) {
    const dur = o.dur ?? 1.5, g = o.g ?? 0.05, k = ac.createOscillator(); k.type = 'sine';
    k.frequency.setValueAtTime(o.f0 ?? 220, t); k.frequency.exponentialRampToValueAtTime(o.f1 ?? 330, t + dur);
    const e = ac.createGain(); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(g, t + dur * 0.2); e.gain.linearRampToValueAtTime(g, t + dur * 0.7); e.gain.linearRampToValueAtTime(0, t + dur);
    k.connect(e).connect(out); k.start(t); k.stop(t + dur + 0.05);
  },
  // the chain backed up: a ratchet running down
  zip(ac, out, t, o = {}) { for (let i = 0; i < 11; i++) SYN.tick(ac, out, t + i * 0.022, { f: 3600 - i * 220, g: (o.g ?? 0.1) * (1 - i / 14), low: 260 }); },
};
const OP_PITCH = { '+': 2400, '−': 2050, '×': 2800, '÷': 3200 };
const ratioHz = d => 196 * RATIOS[d][0] / RATIOS[d][1];
// Fixed events of the film, at film times.
const FILM_EVENTS = (() => {
  // Each event belongs to a scene, k: before its transition's split to the scene being left, after it to the one arriving.
  // The splits sit where the scenes hand over: the program starts at 0.2 of T7, the roll appears at 0.15 of T8, Note G is read in from 0.4 of T9.
  const SPLIT = { T7: 0.2, T8: 0.15, T9: 0.4 };
  const owner = (id, p) => { const s = SEG_BY[id]; return p < (SPLIT[id] ?? 0.5) ? s.from : s.to; };
  const ev = [], at = (id, p, type, o = {}) => { const s = SEG_BY[id]; ev.push({ t: s.t0 + clamp01(p) * s.dur, type, o, k: owner(id, p) }); };
  const spread = (id, a, b, n, type, o) => { for (let i = 0; i < n; i++) at(id, a + (b - a) * (n > 1 ? i / (n - 1) : 0), type, typeof o === 'function' ? o(i) : o); };
  // the chain advances a notch; not into IX, which stays silent until its first note reaches the gold line
  for (const s of SEGS) if (s.kind === 't' && s.from >= 0 && s.id !== 'T8') at(s.id, 0.9, 'tick', { f: 2100, g: 0.11, low: 150 });
  // T0 — the first pick
  for (let r = 0; r <= 120; r += 10) at('T0', 0.05 + 0.95 * r / 130, 'swish', { g: 0.05, dur: 0.18 });
  at('T0', 0.15, 'swish', { g: 0.035, f0: 1500, f1: 4500, dur: 0.6 });
  // T1 — warp and weft part
  spread('T1', 0.02, 0.38, 8, 'swish', { g: 0.04, dur: 0.16, f0: 2600, f1: 900 });
  at('T1', 0.36, 'gliss', { f0: 98, f1: 147, dur: 1.4, g: 0.05 });
  spread('T1', 0.47, 0.72, 6, 'swish', i => ({ g: 0.06, dur: 0.3, f0: 500 + i * 60, f1: 3200 }));
  spread('T1', 0.55, 0.8, 6, 'thump', i => ({ g: 0.12, f: 96 - i * 4 }));
  at('T1', 0.88, 'thump', { g: 0.3, f: 72 }); at('T1', 0.88, 'bell', { f: 294, g: 0.04 });
  // T2 — the shuttle takes flight
  spread('T2', 0.04, 0.4, 6, 'swish', { g: 0.04, dur: 0.18, f0: 1800, f1: 700 });
  for (let m = 6; m >= 0; m--) { // a whoosh as the shuttle passes each crest
    const x = WAVE.xB - m * WAVE.lam; let lo = 0, hi = 1;
    for (let k = 0; k < 30; k++) { const mid = (lo + hi) / 2; (EASE.shuttle(mid) * WAVE.xB < x ? lo = mid : hi = mid); }
    at('T2', 0.5 + 0.42 * lo, 'whoosh', { g: 0.07 });
  }
  // T3 — wrap and discover
  at('T3', 0.1, 'whoosh', { g: 0.05, dur: 1.4, f: 600 });
  spread('T3', 0.5, 0.72, 8, 'tick', i => ({ f: 4200 + i * 120, g: 0.025, low: 600 }));
  at('T3', 0.55, 'gliss', { f0: 196, f1: 392, dur: 1.9, g: 0.04 });
  // T4 — chords become warp
  spread('T4', 0.08, 0.6, 12, 'note', i => ({ f: ratioHz(9 - (i % 10)) * 2, dur: 0.6, g: 0.05 }));
  spread('T4', 0.52, 0.94, 8, 'swish', { g: 0.045, dur: 0.16 });
  // T5 — warp into columns
  spread('T5', 0.02, 0.3, 5, 'swish', { g: 0.04, dur: 0.16, f0: 2600, f1: 900 });
  at('T5', 0.32, 'whoosh', { g: 0.06, dur: 1.2, f: 500 });
  for (let d = 9; d >= 0; d--) at('T5', 0.6 + 0.012 * (9 - d), 'thump', { g: 0.08, f: 150 + (9 - d) * 6 });
  for (let d = 9; d >= 0; d--) at('T5', 0.7 + 0.022 * (9 - d), 'tick', { f: 1800 + (9 - d) * 200, g: 0.08 });
  // T6 — cards by the thousand
  for (let i = 0; i < 90; i++) { const u = (i + 0.5) / 90, p = 0.15 + 0.57 * (0.5 - Math.cos(Math.PI * u) / 2); at('T6', p, 'tick', { f: 3000 + (i % 7) * 260, g: 0.035 + 0.04 * Math.sin(Math.PI * u), low: 400 }); }
  at('T6', 0.15, 'gliss', { f0: 98, f1: 196, dur: 2.6, g: 0.04 });
  at('T6', 0.7, 'thump', { g: 0.3, f: 64 }); at('T6', 0.7, 'bell', { f: 196, g: 0.05 });
  // T7 — 24,000 become 25
  at('T7', 0.05, 'whoosh', { g: 0.09, dur: 1.6, f: 700 });
  for (let i = 1; i <= 25; i++) at('T7', 0.24 + 0.004 * i + 0.05, 'tick', { f: 1900, g: 0.05 });
  for (let s = 0; s < TRACE.length; s++) {
    const p = 0.36 + 0.54 * (s + 0.25) / TRACE.length;
    if (s === FIRST_BACK) at('T7', 0.36 + 0.54 * s / TRACE.length, 'zip', { g: 0.09 });
    else at('T7', p, 'tick', { f: OP_PITCH[TRACE[s].op], g: 0.1 });
  }
  at('T7', 0.92, 'thump', { g: 0.32, f: 80 }); at('T7', 0.92, 'bell', { f: 392, g: 0.035 });
  // T8 — number becomes ratio: every punched hole sounds its note
  // T8 — number becomes ratio: the roll is punched in silence; its notes sound only as they cross the gold line in IX
  // T9 — coming to rest
  at('T9', 0, 'gliss', { f0: 294, f1: 98, dur: 2.2, g: 0.05 });
  at('T9', 0.42, 'whoosh', { g: 0.05, dur: 1, f: 500 });
  for (let i = 0; i < 6; i++) at('T9', 0.45 + i * 0.055, 'tick', { f: 3600, g: 0.03, low: 500 });
  at('T9', 0.98, 'bell', { f: 196, g: 0.07 });
  return ev.sort((a, b) => a.t - b.t);
})();
// Events on the ambient clock while scene k is alive, for tau in (a, b].
function ambientEvents(k, a, b) {
  const out = [], each = (period, offset, fn) => { const n0 = Math.floor((a - offset) / period) - 1, n1 = Math.floor((b - offset) / period); for (let n = n0; n <= n1; n++) fn(offset + n * period, n); };
  switch (k) {
    case 0: each(16 * BEAT / 130 * 4, 0, t => out.push({ t, type: 'swish', o: { g: 0.02, dur: 0.14 } })); break;
    case 1: each(4 * BEAT, 0, t => { out.push({ t, type: 'swish', o: { g: 0.06, dur: 1.6, f0: 420, f1: 2400 } }); out.push({ t: t + 4 * BEAT * 0.94, type: 'thump', o: { g: 0.16, f: 82 } }); }); break;
    case 2: each(BEAT, BEAT * 0.15, t => out.push({ t, type: 'whoosh', o: { g: 0.05, dur: 0.32, f: 700 } })); break;
    case 3: each(16 * BEAT, 8 * BEAT, t => out.push({ t, type: 'bell', o: { f: 587, g: 0.025 } })); break;
    case 4: each(1 / LOOM_RATE, 0, t => { out.push({ t, type: 'swish', o: { g: 0.03, dur: 0.18 } }); out.push({ t: t + 0.19, type: 'thump', o: { g: 0.05, f: 70 } }); }); break;
    case 5: each(BEAT, 0, t => { for (let d = 9; d >= 0; d--) out.push({ t: t + (9 - d) * 0.075 * BEAT, type: 'tick', o: { f: 1700 + (9 - d) * 170, g: 0.045 } }); }); break;
    case 6: each(8 * BEAT / 120, 0, (t, n) => out.push({ t, type: 'tick', o: { f: 3400, g: n % 12 ? 0.008 : 0.035, low: 500 } })); break;
    case 7: { const per = 16 * BEAT / TRACE.length;
      each(per, per * 0.25, (t, n) => { const s = mod(n, TRACE.length); out.push(s === FIRST_BACK ? { t: t - per * 0.25, type: 'zip', o: { g: 0.07 } } : { t, type: 'tick', o: { f: OP_PITCH[TRACE[s].op], g: 0.075 } }); }); break; }
    case 8: each(BEAT, BEAT, (t, n) => { // slot n crosses the gold line at tau = (n + 1) beats
      if (n < 0) return; const d = ROLL_SEQ[mod(n, ROLL_LOOP)]; if (d != null) out.push({ t, type: 'note', o: { f: ratioHz(d), dur: 1.3, g: 0.2 } }); }); break;
    case 9: each(8 * BEAT, 2 * BEAT, t => out.push({ t, type: 'bell', o: { f: 392, g: 0.03 } })); break;
  }
  return out.filter(e => e.t > a && e.t <= b);
}
// Which scenes sound: CONFIG.soundScenes lists scene indices (0 = I … 9 = X); null means every scene, as in the
// full-sound version. This version sounds only in IX, Pitched Sounds: the roll's notes over the G drone, a soft bed of
// filtered white noise under them, and the halves of the transitions that belong to IX.
const CONFIG = { soundScenes: [8] };
const sceneSounds = k => !CONFIG.soundScenes || CONFIG.soundScenes.includes(k);
const eventSounds = e => sceneSounds(e.k);
// The drone bed: G and D under everything, a full chord in the full-bleed scenes, a G drone for the music.
const BED = { normal: { root: 0.03, fifth: 0.018, third: 0, drone: 0 }, full: { root: 0.05, fifth: 0.035, third: 0.026, drone: 0 }, music: { root: 0.02, fifth: 0.012, third: 0, drone: 0.055 } };
const NOISE = 0.007; // a hiss under the music, kept well below the notes
const bedFor = k => {
  const L = { root: 0, fifth: 0, third: 0, drone: 0, noise: 0 };
  if (k < 0 || !sceneSounds(k)) return L;
  Object.assign(L, KF[k].full ? BED.full : k === 8 ? BED.music : BED.normal);
  if (CONFIG.soundScenes) L.noise = NOISE; // the reduced versions lay a soft hiss under the scenes that sound
  return L;
};
// A scene's bed wakes with its hold and dies away through the transition that leaves it; nothing sounds while a scene
// is still arriving. In IX the bed waits for the first note to reach the gold line, one beat into the hold.
const BED_WAIT = k => k === 8 ? BEAT : 0;
function bedLevels(t, tau) {
  const { s, p } = segmentAt(t); let L;
  if (s.kind === 'k') {
    const lt = tau ?? (t - s.t0), d0 = BED_WAIT(s.k), w = EASE.inOut(seg(lt, d0, d0 + BEAT * 0.5));
    L = bedFor(s.k); for (const k in L) L[k] *= w;
  }
  else { const a = bedFor(s.from), u = EASE.inOut(p); L = {}; for (const k in a) L[k] = a[k] * (1 - u); }
  if (s === SEGS[SEGS.length - 1]) { const f = 1 - seg(t, s.t0 + s.dur * 0.3, s.t1); for (const k in L) L[k] = L[k] * f; }
  return L;
}
const longNoiseCache = new WeakMap();
function longNoise(ac) { // four seconds, so the loop in the bed cannot be heard
  let b = longNoiseCache.get(ac); if (b) return b;
  b = ac.createBuffer(1, ac.sampleRate * 4, ac.sampleRate); const d = b.getChannelData(0);
  let s = 7654321; for (let i = 0; i < d.length; i++) { s = (s * 48271) % 2147483647; d[i] = s / 1073741823.5 - 1; }
  longNoiseCache.set(ac, b); return b;
}
function makeBus(ac) {
  const master = ac.createGain(); master.gain.value = 2.0;
  const comp = ac.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3; comp.attack.value = 0.005; comp.release.value = 0.2;
  master.connect(comp).connect(ac.destination);
  return master;
}
function makeBed(ac, out) {
  const v = {};
  for (const [k, f, type] of [['root', 98, 'sine'], ['fifth', 147, 'sine'], ['third', 122.5, 'sine'], ['drone', 196, 'triangle']]) {
    const o = ac.createOscillator(); o.type = type; o.frequency.value = f; const g = ac.createGain(); g.gain.value = 0;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    o.connect(lp).connect(g).connect(out); o.start(); v[k] = g;
  }
  const n = ac.createBufferSource(); n.buffer = longNoise(ac); n.loop = true;
  const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 140;
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
  const g = ac.createGain(); g.gain.value = 0; n.connect(hp).connect(lp).connect(g).connect(out); n.start(); v.noise = g;
  return v;
}
const live = { ac: null, bus: null, bed: null };
const audio = {
  async start() {
    if (!live.ac) { const AC = root.AudioContext || root.webkitAudioContext; if (!AC) return false; live.ac = new AC(); live.bus = makeBus(live.ac); live.bed = makeBed(live.ac, live.bus); }
    await live.ac.resume(); return true;
  },
  stop() { if (live.ac) { for (const k in live.bed) live.bed[k].gain.setTargetAtTime(0, live.ac.currentTime, 0.1); setTimeout(() => live.ac && live.ac.suspend(), 400); } },
  get on() { return !!live.ac && live.ac.state === 'running'; },
  // Call once a frame: plays what the film passed between tPrev and t, and what the ambient clock passed.
  frame(tPrev, t, tauPrev, tau, ambOn = true) {
    if (!audio.on) return;
    const ac = live.ac, now = ac.currentTime + 0.02;
    if (t > tPrev && t - tPrev < 0.6) for (const e of FILM_EVENTS) { if (e.t <= tPrev) continue; if (e.t > t) break; if (eventSounds(e)) SYN[e.type](ac, live.bus, now, e.o); }
    const { s } = segmentAt(t);
    if (ambOn && s.kind === 'k' && sceneSounds(s.k) && tau > tauPrev && tau - tauPrev < 0.5) {
      const g = ambAt(s, t);
      if (g > 0.05) for (const e of ambientEvents(s.k, tauPrev, tau)) SYN[e.type](ac, live.bus, now, { ...e.o, g: (e.o.g ?? 0.1) * g });
    }
    const L = bedLevels(t, s.kind === 'k' ? tau : undefined); for (const k in live.bed) live.bed[k].gain.setTargetAtTime(L[k], ac.currentTime, 0.12);
  },
};
// Offline: the film's soundtrack from t0 to t1, or one scene's ambient loop (opt.loop = k), as a 16-bit WAV in base64.
async function renderAudio(t0, t1, opt = {}) {
  const sr = opt.sampleRate || 44100, ac = new OfflineAudioContext(1, Math.max(1, Math.ceil((t1 - t0) * sr)), sr);
  const bus = makeBus(ac), bed = makeBed(ac, bus);
  if (opt.loop != null) {
    const L = bedFor(opt.loop), d0 = BED_WAIT(opt.loop);
    for (const k in bed) { bed[k].gain.setValueAtTime(0, 0); bed[k].gain.setValueAtTime(0, d0); bed[k].gain.linearRampToValueAtTime(L[k], d0 + BEAT * 0.5); }
    if (sceneSounds(opt.loop)) for (const e of ambientEvents(opt.loop, -1e-6, t1 - t0)) SYN[e.type](ac, bus, Math.max(0, e.t), e.o);
  } else {
    for (const e of FILM_EVENTS) if (e.t >= t0 && e.t < t1 && eventSounds(e)) SYN[e.type](ac, bus, e.t - t0, e.o);
    for (const s of HOLDS) {
      const a = Math.max(s.t0, t0), b = Math.min(s.t1, t1); if (b <= a || !sceneSounds(s.k)) continue;
      for (const e of ambientEvents(s.k, a - s.t0 - 1e-6, b - s.t0)) { // the ambient clock starts at the hold
        const tt = s.t0 + e.t, g = ambAt(s, tt); if (g > 0.05) SYN[e.type](ac, bus, tt - t0, { ...e.o, g: (e.o.g ?? 0.1) * g });
      }
    }
    let first = true;
    for (let x = t0; x <= t1 + 1e-9; x += 0.05) { const L = bedLevels(x); for (const k in bed) first ? bed[k].gain.setValueAtTime(L[k], 0) : bed[k].gain.linearRampToValueAtTime(L[k], x - t0); first = false; }
  }
  const buf = await ac.startRendering(), d = buf.getChannelData(0), bytes = new Uint8Array(44 + d.length * 2), dv = new DataView(bytes.buffer);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); dv.setUint32(4, 36 + d.length * 2, true); str(8, 'WAVE'); str(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); str(36, 'data'); dv.setUint32(40, d.length * 2, true);
  for (let i = 0; i < d.length; i++) dv.setInt16(44 + i * 2, Math.max(-1, Math.min(1, d[i])) * 32767, true);
  let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
// The length of each scene's ambient loop, in seconds.
const LOOP_LEN = [16, 8, 8, 16, 16, 10, 8, 16, ROLL_LOOP, 8].map(b => b * BEAT);

/* ---------------- boot ---------------- */
async function init(opts = {}) {
  const fonts = ['500 100px "Bodoni Moda"', 'italic 400 100px "Bodoni Moda"', '400 30px "Newsreader"', 'italic 400 30px "Newsreader"',
    '600 30px "Newsreader"', '500 20px "IBM Plex Mono"'];
  try { await Promise.race([Promise.all(fonts.map(f => document.fonts.load(f))), new Promise(r => setTimeout(r, 4000))]); } catch (e) { /* fall back to system faces */ }
  const img = new Image(); // handlers first, then the source, so a cached image cannot slip past them
  await new Promise(r => { img.onload = r; img.onerror = r; setTimeout(r, 8000); img.src = opts.portrait || 'assets/chalon-portrait-1840.jpg'; });
  A.portrait = img.complete && img.naturalWidth ? makePortrait(img) : buildWeave(130, 130, 6, (x, y) => (x + y) % 2);
  A.cloth = makeCloth(); A.words = makeWords(); A.wall = makeWall();
  if (opts.soundScenes !== undefined) CONFIG.soundScenes = opts.soundScenes;
  A.ready = true;
}

root.LovelaceMotion = { CONFIG, W, H, BEAT, COL, EASE, SEGS, KF, ROMAN, DURATION, KEY_TIMES, HOLDS, TRACE, LOOP_LEN, FILM_EVENTS,
  init, render, renderScene, segmentAt, ambAt, drawBoard, drawOverview, audio, renderAudio };
})(window);
