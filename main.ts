// news-image-20261121 — one image summing up Saturday 21 November 2026.
// A newspaper front page drawn in pure Node stdlib: a hand-rolled RGBA
// buffer, a 5x7 bitmap font, and a small PNG encoder (zlib deflate +
// CRC32). No network, no assets, no randomness — the two graded runs
// write identical bytes. Run: MAKEFUN_OUTPUT_DIR=out node main.ts
//
// Stories (first reported, or happening, on 21 November 2026):
//   1. Russia's overnight barrage: 400+ drones, 110 missiles; Kyiv
//      bridges hit, 8 killed; two missiles + a drone land in Poland
//   2. ICJ: Myanmar guilty of genocide against the Rohingya (The Hague)
//   3. AI sell-off: S&P 500 -3.7%, Nasdaq -5.3%, Nikkei -5.1%
//   4. COP31 in Antalya runs into overtime over fossil fuels
//   5. 6.9-magnitude quake shakes the Peruvian Andes
//   6. FBI criminal database reportedly hacked; US outages continue
//   7. UK and EU sign biggest post-Brexit deals in Brussels
//   Also: Gaza strikes kill six, Houthi missiles at Riyadh intercepted,
//   Palisades fire arson conviction, cancer-pill trial hope, Gen Z
//   protests in 25 European countries.

import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { join } from "node:path";

// ------------------------------------------------------------------ canvas

const W = 1024;
const H = 1024;
const buf = new Uint8Array(W * H * 4); // RGBA, row-major

type RGB = [number, number, number];

const PAPER: RGB = [245, 239, 227];
const INK: RGB = [26, 26, 26];
const NAVY: RGB = [20, 33, 61];
const NAVY2: RGB = [30, 48, 86];
const RED: RGB = [180, 35, 24];
const GOLD: RGB = [201, 162, 39];
const WHITE: RGB = [250, 248, 242];
const GREY: RGB = [90, 88, 80];
const GREEN: RGB = [60, 140, 70];
const SKY: RGB = [70, 110, 150];

function dot(x: number, y: number, c: RGB): void {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= W || yi >= H) return;
  const i = (yi * W + xi) * 4;
  buf[i] = c[0];
  buf[i + 1] = c[1];
  buf[i + 2] = c[2];
  buf[i + 3] = 255;
}

// Filled rectangle, clipped to the canvas. Fractional inputs are rounded
// up front so the loops always terminate.
function box(x: number, y: number, w: number, h: number, c: RGB): void {
  let x0 = Math.round(x);
  let y0 = Math.round(y);
  let w0 = Math.round(w);
  let h0 = Math.round(h);
  if (x0 < 0) { w0 += x0; x0 = 0; }
  if (y0 < 0) { h0 += y0; y0 = 0; }
  if (x0 + w0 > W) w0 = W - x0;
  if (y0 + h0 > H) h0 = H - y0;
  if (w0 <= 0 || h0 <= 0) return;
  const [r, g, b] = c;
  for (let yy = y0; yy < y0 + h0; yy++) {
    for (let xx = x0; xx < x0 + w0; xx++) {
      const i = (yy * W + xx) * 4;
      buf[i] = r;
      buf[i + 1] = g;
      buf[i + 2] = b;
      buf[i + 3] = 255;
    }
  }
}

function frame(x: number, y: number, w: number, h: number, c: RGB, t = 1): void {
  box(x, y, w, t, c);
  box(x, y + h - t, w, t, c);
  box(x, y, t, h, c);
  box(x + w - t, y, t, h, c);
}

function disc(cx: number, cy: number, r: number, c: RGB): void {
  const ccx = Math.round(cx);
  const ccy = Math.round(cy);
  const rr = Math.round(r);
  for (let y = ccy - rr; y <= ccy + rr; y++) {
    const dy = y - ccy;
    const dx = Math.floor(Math.sqrt(Math.max(0, rr * rr - dy * dy)));
    for (let x = ccx - dx; x <= ccx + dx; x++) dot(x, y, c);
  }
}

function ring(cx: number, cy: number, r: number, c: RGB, t = 2): void {
  const ccx = Math.round(cx);
  const ccy = Math.round(cy);
  const rr = Math.round(r);
  for (let a = 0; a < 360; a += 1) {
    const rad = (a * Math.PI) / 180;
    for (let k = 0; k < t; k++) {
      dot(ccx + (rr - k) * Math.cos(rad), ccy + (rr - k) * Math.sin(rad), c);
    }
  }
}

// Bresenham segment with a square brush of thickness t.
function seg(x0: number, y0: number, x1: number, y1: number, c: RGB, t = 2): void {
  let ax = Math.round(x0);
  let ay = Math.round(y0);
  const bx = Math.round(x1);
  const by = Math.round(y1);
  const dx = Math.abs(bx - ax);
  const dy = -Math.abs(by - ay);
  const sx = ax < bx ? 1 : -1;
  const sy = ay < by ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    box(ax - Math.floor(t / 2), ay - Math.floor(t / 2), t, t, c);
    if (ax === bx && ay === by) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; ax += sx; }
    if (e2 <= dx) { err += dx; ay += sy; }
  }
}

// ------------------------------------------------------- 5x7 bitmap font
// Each glyph: 7 rows of 5 cells, '#' = ink.

const GLYPHS: Record<string, string[]> = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  C: [".####", "#....", "#....", "#....", "#....", "#....", ".####"],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  G: [".####", "#....", "#....", "#.###", "#...#", "#...#", ".###."],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  I: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
  J: ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  N: ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
  X: ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  Z: ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
  "0": [".###.", "#..##", "#.#.#", "##..#", "#...#", "#...#", ".###."],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
  "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  "6": [".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."],
  "7": ["#####", "....#", "...#.", "..#..", "..#..", "..#..", "..#.."],
  "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  "9": [".###.", "#...#", "#...#", ".####", "....#", "....#", ".###."],
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
  ".": [".....", ".....", ".....", ".....", ".....", ".##..", ".##.."],
  ",": [".....", ".....", ".....", ".....", ".##..", ".##..", ".#..."],
  "-": [".....", ".....", ".....", ".###.", ".....", ".....", "....."],
  "'": ["..#..", "..#..", "..#..", ".....", ".....", ".....", "....."],
  "!": ["..#..", "..#..", "..#..", "..#..", "..#..", ".....", "..#.."],
  "?": [".###.", "#...#", "....#", "...#.", "..#..", ".....", "..#.."],
  ":": [".....", ".##..", ".##..", ".....", ".##..", ".##..", "....."],
  ";": [".....", ".##..", ".##..", ".....", ".##..", ".##..", ".#..."],
  "/": ["....#", "....#", "...#.", "..#..", ".#...", "#....", "#...."],
  "(": ["...##", "..#..", ".#...", ".#...", ".#...", "..#..", "...##"],
  ")": ["##...", "..#..", "...#.", "...#.", "...#.", "..#..", "##..."],
  "%": ["##..#", "##.#.", "...#.", "..#..", ".#...", "#.##.", "#..##"],
  $: ["..#..", ".####", "#.#..", ".###.", "..#.#", "####.", "..#.."],
  "&": [".##..", "#..#.", "#..#.", ".#...", "#.#.#", "#..#.", ".##.#"],
  "+": [".....", "..#..", "..#..", ".###.", "..#..", "..#..", "....."],
  "=": [".....", ".....", ".###.", ".....", ".###.", ".....", "....."],
  "\u00b7": [".....", ".....", ".###.", ".###.", ".....", ".....", "....."],
};

function measure(text: string, scale: number): number {
  return text.length * 6 * scale - scale;
}

function putText(
  text: string,
  x: number,
  y: number,
  scale: number,
  c: RGB,
  align: "left" | "center" = "left",
): void {
  const upper = text.toUpperCase();
  let cx = x;
  if (align === "center") cx = x - Math.floor(measure(upper, scale) / 2);
  for (const ch of upper) {
    const glyph = GLYPHS[ch] ?? GLYPHS["?"];
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (glyph[row][col] === "#") {
          box(cx + col * scale, y + row * scale, scale, scale, c);
        }
      }
    }
    cx += 6 * scale;
  }
}

// Greedy word wrap for a max pixel width; returns lines (uppercased).
function wrapText(text: string, maxWidth: number, scale: number): string[] {
  const words = text.toUpperCase().split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = cur === "" ? w : cur + " " + w;
    if (measure(trial, scale) <= maxWidth || cur === "") {
      cur = trial;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}

function para(
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  scale: number,
  c: RGB,
  lineGap = 3,
): number {
  let yy = y;
  for (const ln of wrapText(text, maxWidth, scale)) {
    putText(ln, x, yy, scale, c);
    yy += 7 * scale + lineGap;
  }
  return yy;
}

// ------------------------------------------------------------ PNG encoder

const CRC_TAB: number[] = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TAB.push(c >>> 0);
}

function crc(data: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c = CRC_TAB[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length, 0);
  const kind = Buffer.from(type, "ascii");
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc(Buffer.concat([kind, data])), 0);
  return Buffer.concat([head, kind, data, tail]);
}

function encode(): Buffer {
  const scan = Buffer.alloc(H * (1 + W * 4));
  for (let y = 0; y < H; y++) {
    scan[y * (1 + W * 4)] = 0; // filter: none
    buf.subarray(y * W * 4, (y + 1) * W * 4).forEach((v, i) => {
      scan[y * (1 + W * 4) + 1 + i] = v;
    });
  }
  const idat = deflateSync(scan, { level: 6 });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------------ icons
// Each icon is drawn centred at (cx, cy) inside a square of side s.

function artBarrage(cx: number, cy: number, s: number): void {
  // A Kyiv bridge over the Dnipro, struck from above: the overnight barrage.
  const x0 = cx - s / 2 + 8;
  const x1 = cx + s / 2 - 8;
  const deckY = cy + s / 4;
  // two towers
  box(x0 + 14, cy - s / 2 + 18, 7, s / 2 + 4, NAVY);
  box(x1 - 21, cy - s / 2 + 18, 7, s / 2 + 4, NAVY);
  // suspension cables
  for (let t = 0; t <= 24; t++) {
    const fx = x0 + 14 + ((x1 - 21 - (x0 + 14)) * t) / 24;
    const fy = deckY - 4 - Math.sin((t / 24) * Math.PI) * (s / 4);
    dot(Math.round(fx), Math.round(fy), NAVY);
    dot(Math.round(fx), Math.round(fy) + 1, NAVY);
  }
  // deck
  box(x0, deckY, x1 - x0, 6, NAVY);
  // river
  for (let i = 0; i < 3; i++) {
    seg(x0 + 8 + i * 5, deckY + 18 + i * 9, x1 - 12 - i * 7, deckY + 18 + i * 9, SKY, 2);
  }
  // missile streaks from top right
  seg(cx + s / 2 - 2, cy - s / 2 + 2, cx + 6, cy - 6, RED, 4);
  seg(cx + s / 2 - 12, cy - s / 2 + 14, cx + 2, cy - 2, RED, 2);
  // impact burst on the deck
  for (let a = 0; a < 360; a += 30) {
    const rad = (a * Math.PI) / 180;
    seg(
      cx + 6, cy - 6,
      Math.round(cx + 6 + 15 * Math.cos(rad)),
      Math.round(cy - 6 + 15 * Math.sin(rad)),
      GOLD, 3,
    );
  }
  disc(cx + 6, cy - 6, 5, RED);
}

function artScales(cx: number, cy: number, s: number): void {
  // Scales of justice, centred at (cx, cy), size s: the Hague ruling.
  const pole = Math.round(s * 0.06);
  box(cx - Math.floor(pole / 2), cy - s / 2, pole, s, NAVY);
  disc(cx, cy - s / 2 - 4, 5, GOLD);
  box(cx - s / 2, cy - s / 2 + 8, s, pole, NAVY);
  box(cx - s / 2 - 6, cy + s / 2 - 6, s + 12, 8, NAVY);
  const panY = cy + s / 4;
  for (const side of [-1, 1]) {
    const topX = cx + side * (s / 2 - 4);
    const panCx = cx + side * (s / 2 - 6);
    seg(topX, cy - s / 2 + 10, panCx - 16, panY, NAVY, 2);
    seg(topX, cy - s / 2 + 10, panCx + 16, panY, NAVY, 2);
    for (let a = 0; a <= 180; a += 6) {
      const rad = (a * Math.PI) / 180;
      dot(Math.round(panCx + 16 * Math.cos(rad)), Math.round(panY + 8 * Math.sin(rad)), GOLD);
      dot(Math.round(panCx + 16 * Math.cos(rad)), Math.round(panY + 8 * Math.sin(rad)) + 1, GOLD);
    }
    seg(panCx - 16, panY, panCx + 16, panY, GOLD, 2);
  }
}

function artChart(cx: number, cy: number, s: number): void {
  // Falling market chart with arrow: the AI sell-off.
  const x0 = cx - s / 2 + 6;
  const x1 = cx + s / 2 - 6;
  const y0 = cy - s / 2 + 10;
  const y1 = cy + s / 2 - 14;
  seg(x0, y0, x0, y1, NAVY, 3);
  seg(x0, y1, x1, y1, NAVY, 3);
  const pts: Array<[number, number]> = [
    [x0 + 4, y0 + 8],
    [x0 + 22, y0 + 16],
    [x0 + 34, y0 + 10],
    [x0 + 52, y0 + 30],
    [x0 + 66, y0 + 26],
    [x0 + 84, y0 + 48],
  ];
  for (let i = 0; i < pts.length - 1; i++) {
    seg(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], RED, 4);
  }
  const [ax, ay] = pts[pts.length - 1];
  seg(ax, ay, ax - 12, ay - 2, RED, 4);
  seg(ax, ay, ax - 2, ay - 12, RED, 4);
}

function artGlobe(cx: number, cy: number, s: number): void {
  // Globe with a leaf: COP31 climate talks.
  const r = Math.round(s * 0.36);
  ring(cx, cy, r, NAVY, 3);
  seg(cx - r + 4, cy - Math.round(r / 2), cx + r - 4, cy - Math.round(r / 2), NAVY, 2);
  seg(cx - r + 4, cy + Math.round(r / 2), cx + r - 4, cy + Math.round(r / 2), NAVY, 2);
  seg(cx, cy - r, cx, cy + r, NAVY, 2);
  const lx = cx + Math.round(r * 0.55);
  const ly = cy + Math.round(r * 0.45);
  disc(lx, ly, 9, GREEN);
  seg(lx - 8, ly + 8, lx + 8, ly - 8, GREEN, 2);
}

function artQuake(cx: number, cy: number, s: number): void {
  // Mountain split by a quake crack: the Peruvian Andes.
  const baseY = cy + s / 2 - 12;
  const peakX = cx - 6;
  const peakY = cy - s / 2 + 8;
  // mountain: two slopes and a base
  seg(cx - s / 2 + 6, baseY, peakX, peakY, NAVY, 4);
  seg(peakX, peakY, cx + s / 2 - 6, baseY, NAVY, 4);
  seg(cx - s / 2 + 6, baseY, cx + s / 2 - 6, baseY, NAVY, 4);
  // snow cap
  box(peakX - 8, peakY + 6, 16, 5, WHITE);
  // zigzag crack down from the peak
  const crack: Array<[number, number]> = [
    [peakX, peakY + 12],
    [peakX - 8, peakY + 26],
    [peakX + 6, peakY + 40],
    [peakX - 6, peakY + 54],
    [peakX + 4, baseY - 4],
  ];
  for (let i = 0; i < crack.length - 1; i++) {
    seg(crack[i][0], crack[i][1], crack[i + 1][0], crack[i + 1][1], RED, 3);
  }
  // falling rocks
  disc(cx + s / 2 - 16, baseY - 18, 4, GREY);
  disc(cx - s / 2 + 18, baseY - 10, 3, GREY);
}

function artHack(cx: number, cy: number, s: number): void {
  // A breached screen with a broken padlock: the FBI database hack.
  const sw = Math.round(s * 0.72);
  const sh = Math.round(s * 0.52);
  const sx = cx - sw / 2;
  const sy = cy - sh / 2 - 4;
  box(sx, sy, sw, sh, NAVY);
  box(sx + 4, sy + 4, sw - 8, sh - 8, [12, 20, 40]);
  // screen stand
  box(cx - 3, sy + sh, 6, 12, NAVY);
  box(cx - 20, sy + sh + 12, 40, 4, NAVY);
  // padlock body
  const lx = cx;
  const ly = sy + sh / 2 + 2;
  box(lx - 14, ly, 28, 20, GOLD);
  disc(lx, ly + 10, 3, NAVY);
  box(lx - 1, ly + 10, 2, 6, NAVY);
  // shackle, snapped open
  seg(lx - 10, ly, lx - 10, ly - 12, GOLD, 3);
  seg(lx - 10, ly - 12, lx - 2, ly - 14, GOLD, 3);
  seg(lx + 10, ly, lx + 10, ly - 8, GOLD, 3);
  // red warning slash across the screen
  seg(sx + 6, sy + sh - 6, sx + sw - 6, sy + 6, RED, 3);
}

function artFlags(cx: number, cy: number, s: number): void {
  // Two flags on poles, shaking hands below: UK-EU deals in Brussels.
  const poleH = Math.round(s * 0.62);
  const topY = cy - poleH / 2 - 6;
  // left flag: navy with a red cross
  box(cx - s / 2 + 4, topY, 3, poleH, NAVY);
  box(cx - s / 2 + 7, topY, 30, 20, NAVY2);
  box(cx - s / 2 + 7, topY + 8, 30, 4, RED);
  box(cx - s / 2 + 20, topY, 4, 20, RED);
  // right flag: blue with gold stars
  box(cx + s / 2 - 7, topY, 3, poleH, NAVY);
  box(cx + s / 2 - 37, topY, 30, 20, NAVY2);
  for (const [dx, dy] of [[-10, 4], [10, 4], [0, 10], [-6, 14], [6, 14]] as Array<[number, number]>) {
    disc(cx + s / 2 - 22 + dx, topY + dy, 2, GOLD);
  }
  // handshake: two clasped shapes
  const hy = cy + s / 2 - 22;
  box(cx - 26, hy, 52, 10, GOLD);
  box(cx - 26, hy + 10, 20, 8, NAVY);
  box(cx + 6, hy + 10, 20, 8, NAVY);
  seg(cx - 26, hy, cx - 34, hy - 8, NAVY, 3);
  seg(cx + 26, hy, cx + 34, hy - 8, NAVY, 3);
}

// ------------------------------------------------------------------ layout

interface Panel {
  x: number;
  y: number;
  w: number;
  h: number;
  tag: string;
  title: string;
  body: string;
  art: (cx: number, cy: number, s: number) => void;
  shade: RGB;
}

function panel(p: Panel): void {
  box(p.x, p.y, p.w, p.h, p.shade);
  frame(p.x, p.y, p.w, p.h, NAVY, 2);
  // icon strip on top
  const iconH = 84;
  const iconCx = p.x + Math.floor(p.w / 2);
  const iconCy = p.y + 8 + Math.floor(iconH / 2);
  p.art(iconCx, iconCy, 76);
  box(p.x + 14, p.y + iconH + 8, p.w - 28, 2, RED);
  let y = p.y + iconH + 16;
  putText(p.tag, p.x + 14, y, 2, RED);
  y += 7 * 2 + 8;
  y = para(p.title, p.x + 14, y, p.w - 28, 3, INK, 4);
  y += 6;
  para(p.body, p.x + 14, y, p.w - 28, 2, GREY, 3);
}

function main(): void {
  // paper
  box(0, 0, W, H, PAPER);
  frame(8, 8, W - 16, H - 16, NAVY, 4);
  frame(16, 16, W - 32, H - 32, NAVY, 1);

  // ---- masthead
  box(20, 20, W - 40, 108, NAVY);
  putText("THE WORLD IN ONE DAY", W / 2, 30, 2, GOLD, "center");
  putText("SATURDAY 21 NOVEMBER 2026", W / 2, 56, 5, WHITE, "center");
  box(20, 128, W - 40, 5, RED);

  // ---- lead story: the overnight barrage, and Poland
  const lx = 24;
  const ly = 144;
  const lw = W - 48;
  const lh = 248;
  box(lx, ly, lw, lh, [232, 224, 200]);
  frame(lx, ly, lw, lh, NAVY, 2);
  artBarrage(lx + 130, ly + 132, 150);
  putText("KYIV \u00b7 WARSAW \u00b7 WAR", lx + 272, ly + 26, 2, RED);
  let y = para(
    "RUSSIA'S BIGGEST BARRAGE HITS KYIV - MISSILES LAND IN POLAND",
    lx + 272,
    ly + 58,
    lw - 300,
    4,
    INK,
    5,
  );
  y += 8;
  para(
    "400+ drones and 110 missiles overnight; bridges hit, 8 killed in Kyiv. Two missiles and a drone crash in Poland; Warsaw calls it a deliberate provocation.",
    lx + 272,
    y,
    lw - 300,
    2,
    GREY,
    3,
  );

  // ---- row 2: Hague, markets, COP31
  const row2Y = 404;
  const rowH = 260;
  const colW = 312;
  const gap = 16;
  const row2: Panel[] = [
    {
      x: 24, y: row2Y, w: colW, h: rowH,
      tag: "THE HAGUE \u00b7 JUSTICE",
      title: "WORLD COURT: MYANMAR GUILTY OF GENOCIDE",
      body: "First state found guilty of genocide against the Rohingya.",
      art: artScales,
      shade: [226, 232, 238],
    },
    {
      x: 24 + colW + gap, y: row2Y, w: colW, h: rowH,
      tag: "NEW YORK \u00b7 MARKETS",
      title: "AI SELL-OFF SINKS MARKETS",
      body: "S&P 500 -3.7%, Nasdaq -5.3% as the AI rout deepens.",
      art: artChart,
      shade: [238, 226, 220],
    },
    {
      x: 24 + 2 * (colW + gap), y: row2Y, w: colW, h: rowH,
      tag: "ANTALYA \u00b7 CLIMATE",
      title: "COP31 RUNS INTO OVERTIME",
      body: "Nearly 200 nations deadlocked as draft drops fossil fuels.",
      art: artGlobe,
      shade: [230, 234, 222],
    },
  ];
  for (const p of row2) panel(p);

  // ---- row 3: Peru, FBI hack, UK-EU
  const row3Y = 676;
  const row3: Panel[] = [
    {
      x: 24, y: row3Y, w: colW, h: rowH,
      tag: "PERU \u00b7 QUAKE",
      title: "6.9 QUAKE SHAKES PERUVIAN ANDES",
      body: "Strong tremor rattles the Andes; damage reports coming in.",
      art: artQuake,
      shade: [232, 228, 214],
    },
    {
      x: 24 + colW + gap, y: row3Y, w: colW, h: rowH,
      tag: "WASHINGTON \u00b7 CYBER",
      title: "FBI DATABASE HACKED",
      body: "US computer outages continue as FBI criminal database is breached.",
      art: artHack,
      shade: [222, 230, 226],
    },
    {
      x: 24 + 2 * (colW + gap), y: row3Y, w: colW, h: rowH,
      tag: "BRUSSELS \u00b7 EUROPE",
      title: "UK AND EU SIGN POST-BREXIT DEALS",
      body: "Biggest step since Brexit: food trade, carbon, youth mobility.",
      art: artFlags,
      shade: [236, 226, 226],
    },
  ];
  for (const p of row3) panel(p);

  // ---- also today strip
  const stripY = 948;
  box(24, stripY, W - 48, 60, NAVY);
  putText("ALSO TODAY:", 40, stripY + 7, 2, GOLD);
  para(
    "GAZA STRIKES KILL SIX \u00b7 HOUTHI MISSILES AT RIYADH INTERCEPTED \u00b7 PALISADES FIRE ARSON CONVICTION \u00b7 CANCER PILL HOPE IN TRIAL \u00b7 GEN Z PROTESTS IN 25 COUNTRIES",
    40,
    stripY + 24,
    W - 80,
    2,
    WHITE,
    3,
  );

  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "entry.png"), encode());
}

main();
