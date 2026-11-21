// news-image-20261121 — one image summing up Saturday 21 November 2026.
// Draws a newspaper front page in pure Node stdlib: a hand-rolled RGBA
// canvas, a 5x7 bitmap font, and a small PNG encoder (zlib deflate +
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

// ---------------------------------------------------------------- canvas

const W = 1024;
const H = 1024;
const px = new Uint8Array(W * H * 4); // RGBA, row-major

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

function setPixel(x: number, y: number, c: RGB): void {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  px[i] = c[0];
  px[i + 1] = c[1];
  px[i + 2] = c[2];
  px[i + 3] = 255;
}

function fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
  x = Math.round(x);
  y = Math.round(y);
  w = Math.round(w);
  h = Math.round(h);
  if (x < 0) { w += x; x = 0; }
  if (y < 0) { h += y; y = 0; }
  if (x + w > W) w = W - x;
  if (y + h > H) h = H - y;
  if (w <= 0 || h <= 0) return;
  const r = c[0], g = c[1], b = c[2];
  for (let yy = y; yy < y + h; yy++) {
    let i = (yy * W + x) * 4;
    const end = i + w * 4;
    for (; i < end; i += 4) {
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
      px[i + 3] = 255;
    }
  }
}

function rect(x: number, y: number, w: number, h: number, c: RGB, t = 1): void {
  fillRect(x, y, w, t, c);
  fillRect(x, y + h - t, w, t, c);
  fillRect(x, y, t, h, c);
  fillRect(x + w - t, y, t, h, c);
}

function fillCircle(cx: number, cy: number, r: number, c: RGB): void {
  cx = Math.round(cx);
  cy = Math.round(cy);
  r = Math.round(r);
  for (let y = cy - r; y <= cy + r; y++) {
    const dx = Math.floor(Math.sqrt(Math.max(0, r * r - (y - cy) * (y - cy))));
    for (let x = cx - dx; x <= cx + dx; x++) setPixel(x, y, c);
  }
}

function circleOutline(cx: number, cy: number, r: number, c: RGB, t = 2): void {
  cx = Math.round(cx);
  cy = Math.round(cy);
  r = Math.round(r);
  for (let a = 0; a < 360; a += 1) {
    const rad = (a * Math.PI) / 180;
    for (let k = 0; k < t; k++) {
      setPixel(
        Math.round(cx + (r - k) * Math.cos(rad)),
        Math.round(cy + (r - k) * Math.sin(rad)),
        c,
      );
    }
  }
}

// Bresenham line, thickness t (square brush). Inputs rounded first.
function line(x0: number, y0: number, x1: number, y1: number, c: RGB, t = 2): void {
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    fillRect(x - Math.floor(t / 2), y - Math.floor(t / 2), t, t, c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}

// ------------------------------------------------------- 5x7 bitmap font
// Each glyph: 7 rows of 5 cells, '#' = ink.

const FONT: Record<string, string[]> = {
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

function textWidth(text: string, scale: number): number {
  return text.length * 6 * scale - scale;
}

function drawText(
  text: string,
  x: number,
  y: number,
  scale: number,
  c: RGB,
  align: "left" | "center" = "left",
): void {
  const upper = text.toUpperCase();
  let startX = x;
  if (align === "center") startX = x - Math.floor(textWidth(upper, scale) / 2);
  let cx = startX;
  for (const ch of upper) {
    const glyph = FONT[ch] ?? FONT["?"];
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (glyph[row][col] === "#") {
          fillRect(cx + col * scale, y + row * scale, scale, scale, c);
        }
      }
    }
    cx += 6 * scale;
  }
}

// Greedy word wrap for a max pixel width; returns lines (uppercased).
function wrap(text: string, maxWidth: number, scale: number): string[] {
  const words = text.toUpperCase().split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = cur === "" ? w : cur + " " + w;
    if (textWidth(trial, scale) <= maxWidth || cur === "") {
      cur = trial;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}

function drawBlock(
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  scale: number,
  c: RGB,
  lineGap = 3,
): number {
  const lines = wrap(text, maxWidth, scale);
  let yy = y;
  for (const ln of lines) {
    drawText(ln, x, yy, scale, c);
    yy += 7 * scale + lineGap;
  }
  return yy;
}

// ------------------------------------------------------------ PNG encoder

const CRC_TABLE: number[] = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(): Buffer {
  const raw = Buffer.alloc(H * (1 + W * 4));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 4)] = 0; // filter: none
    raw.set(px.subarray(y * W * 4, (y + 1) * W * 4), y * (1 + W * 4) + 1);
  }
  const idat = deflateSync(raw, { level: 6 });
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
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------------ icons
// Each icon is drawn centred at (cx, cy) inside a square of side s.

function iconBarrage(cx: number, cy: number, s: number): void {
  // A Kyiv bridge over the Dnipro, struck from above: the overnight barrage.
  const x0 = cx - s / 2 + 8;
  const x1 = cx + s / 2 - 8;
  const deckY = cy + s / 4;
  // two towers
  fillRect(x0 + 14, cy - s / 2 + 18, 7, s / 2 + 4, NAVY);
  fillRect(x1 - 21, cy - s / 2 + 18, 7, s / 2 + 4, NAVY);
  // suspension cables
  for (let t = 0; t <= 24; t++) {
    const fx = x0 + 14 + ((x1 - 21 - (x0 + 14)) * t) / 24;
    const fy = deckY - 4 - Math.sin((t / 24) * Math.PI) * (s / 4);
    setPixel(Math.round(fx), Math.round(fy), NAVY);
    setPixel(Math.round(fx), Math.round(fy) + 1, NAVY);
  }
  // deck
  fillRect(x0, deckY, x1 - x0, 6, NAVY);
  // river
  for (let i = 0; i < 3; i++) {
    line(x0 + 8 + i * 5, deckY + 18 + i * 9, x1 - 12 - i * 7, deckY + 18 + i * 9, SKY, 2);
  }
  // missile streaks from top right
  line(cx + s / 2 - 2, cy - s / 2 + 2, cx + 6, cy - 6, RED, 4);
  line(cx + s / 2 - 12, cy - s / 2 + 14, cx + 2, cy - 2, RED, 2);
  // impact burst on the deck
  for (let a = 0; a < 360; a += 30) {
    const rad = (a * Math.PI) / 180;
    line(
      cx + 6, cy - 6,
      Math.round(cx + 6 + 15 * Math.cos(rad)),
      Math.round(cy - 6 + 15 * Math.sin(rad)),
      GOLD, 3,
    );
  }
  fillCircle(cx + 6, cy - 6, 5, RED);
}

function iconScales(cx: number, cy: number, s: number): void {
  // Scales of justice, centred at (cx, cy), size s: the Hague ruling.
  const pole = Math.round(s * 0.06);
  fillRect(cx - Math.floor(pole / 2), cy - s / 2, pole, s, NAVY);
  fillCircle(cx, cy - s / 2 - 4, 5, GOLD);
  fillRect(cx - s / 2, cy - s / 2 + 8, s, pole, NAVY);
  fillRect(cx - s / 2 - 6, cy + s / 2 - 6, s + 12, 8, NAVY);
  const panY = cy + s / 4;
  for (const side of [-1, 1]) {
    const topX = cx + side * (s / 2 - 4);
    const panCx = cx + side * (s / 2 - 6);
    line(topX, cy - s / 2 + 10, panCx - 16, panY, NAVY, 2);
    line(topX, cy - s / 2 + 10, panCx + 16, panY, NAVY, 2);
    for (let a = 0; a <= 180; a += 6) {
      const rad = (a * Math.PI) / 180;
      setPixel(Math.round(panCx + 16 * Math.cos(rad)), Math.round(panY + 8 * Math.sin(rad)), GOLD);
      setPixel(Math.round(panCx + 16 * Math.cos(rad)), Math.round(panY + 8 * Math.sin(rad)) + 1, GOLD);
    }
    line(panCx - 16, panY, panCx + 16, panY, GOLD, 2);
  }
}

function iconChart(cx: number, cy: number, s: number): void {
  // Falling market chart with arrow: the AI sell-off.
  const x0 = cx - s / 2 + 6;
  const x1 = cx + s / 2 - 6;
  const y0 = cy - s / 2 + 10;
  const y1 = cy + s / 2 - 14;
  line(x0, y0, x0, y1, NAVY, 3);
  line(x0, y1, x1, y1, NAVY, 3);
  const pts: Array<[number, number]> = [
    [x0 + 4, y0 + 8],
    [x0 + 22, y0 + 16],
    [x0 + 34, y0 + 10],
    [x0 + 52, y0 + 30],
    [x0 + 66, y0 + 26],
    [x0 + 84, y0 + 48],
  ];
  for (let i = 0; i < pts.length - 1; i++) {
    line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], RED, 4);
  }
  const [ax, ay] = pts[pts.length - 1];
  line(ax, ay, ax - 12, ay - 2, RED, 4);
  line(ax, ay, ax - 2, ay - 12, RED, 4);
}

function iconGlobe(cx: number, cy: number, s: number): void {
  // Globe with a leaf: COP31 climate talks.
  const r = Math.round(s * 0.36);
  circleOutline(cx, cy, r, NAVY, 3);
  line(cx - r + 4, cy - Math.round(r / 2), cx + r - 4, cy - Math.round(r / 2), NAVY, 2);
  line(cx - r + 4, cy + Math.round(r / 2), cx + r - 4, cy + Math.round(r / 2), NAVY, 2);
  line(cx, cy - r, cx, cy + r, NAVY, 2);
  const lx = cx + Math.round(r * 0.55);
  const ly = cy + Math.round(r * 0.45);
  fillCircle(lx, ly, 9, GREEN);
  line(lx - 8, ly + 8, lx + 8, ly - 8, GREEN, 2);
}

function iconQuake(cx: number, cy: number, s: number): void {
  // Mountain split by a quake crack: the Peruvian Andes.
  const baseY = cy + s / 2 - 12;
  const peakX = cx - 6;
  const peakY = cy - s / 2 + 8;
  // mountain: two slopes
  line(cx - s / 2 + 6, baseY, peakX, peakY, NAVY, 4);
  line(peakX, peakY, cx + s / 2 - 6, baseY, NAVY, 4);
  line(cx - s / 2 + 6, baseY, cx + s / 2 - 6, baseY, NAVY, 4);
  // snow cap
  fillRect(peakX - 8, peakY + 6, 16, 5, WHITE);
  // zigzag crack down from the peak
  const crack: Array<[number, number]> = [
    [peakX, peakY + 12],
    [peakX - 8, peakY + 26],
    [peakX + 6, peakY + 40],
    [peakX - 6, peakY + 54],
    [peakX + 4, baseY - 4],
  ];
  for (let i = 0; i < crack.length - 1; i++) {
    line(crack[i][0], crack[i][1], crack[i + 1][0], crack[i + 1][1], RED, 3);
  }
  // falling rocks
  fillCircle(cx + s / 2 - 16, baseY - 18, 4, GREY);
  fillCircle(cx - s / 2 + 18, baseY - 10, 3, GREY);
}

function iconHack(cx: number, cy: number, s: number): void {
  // A breached screen with a broken padlock: the FBI database hack.
  const sw = Math.round(s * 0.72);
  const sh = Math.round(s * 0.52);
  const sx = cx - sw / 2;
  const sy = cy - sh / 2 - 4;
  fillRect(sx, sy, sw, sh, NAVY);
  fillRect(sx + 4, sy + 4, sw - 8, sh - 8, [12, 20, 40]);
  // screen stand
  fillRect(cx - 3, sy + sh, 6, 12, NAVY);
  fillRect(cx - 20, sy + sh + 12, 40, 4, NAVY);
  // padlock body
  const lx = cx;
  const ly = sy + sh / 2 + 2;
  fillRect(lx - 14, ly, 28, 20, GOLD);
  fillCircle(lx, ly + 10, 3, NAVY);
  fillRect(lx - 1, ly + 10, 2, 6, NAVY);
  // shackle, snapped open
  line(lx - 10, ly, lx - 10, ly - 12, GOLD, 3);
  line(lx - 10, ly - 12, lx - 2, ly - 14, GOLD, 3);
  line(lx + 10, ly, lx + 10, ly - 8, GOLD, 3);
  // red warning slash across the screen
  line(sx + 6, sy + sh - 6, sx + sw - 6, sy + 6, RED, 3);
}

function iconFlags(cx: number, cy: number, s: number): void {
  // Two flags on poles, shaking hands below: UK-EU deals in Brussels.
  const poleH = Math.round(s * 0.62);
  const topY = cy - poleH / 2 - 6;
  // left flag: navy with a red cross
  fillRect(cx - s / 2 + 4, topY, 3, poleH, NAVY);
  fillRect(cx - s / 2 + 7, topY, 30, 20, NAVY2);
  fillRect(cx - s / 2 + 7, topY + 8, 30, 4, RED);
  fillRect(cx - s / 2 + 20, topY, 4, 20, RED);
  // right flag: blue with gold stars
  fillRect(cx + s / 2 - 7, topY, 3, poleH, NAVY);
  fillRect(cx + s / 2 - 37, topY, 30, 20, NAVY2);
  for (const [dx, dy] of [[-10, 4], [10, 4], [0, 10], [-6, 14], [6, 14]] as Array<[number, number]>) {
    fillCircle(cx + s / 2 - 22 + dx, topY + dy, 2, GOLD);
  }
  // handshake: two clasped shapes
  const hy = cy + s / 2 - 22;
  fillRect(cx - 26, hy, 52, 10, GOLD);
  fillRect(cx - 26, hy + 10, 20, 8, NAVY);
  fillRect(cx + 6, hy + 10, 20, 8, NAVY);
  line(cx - 26, hy, cx - 34, hy - 8, NAVY, 3);
  line(cx + 26, hy, cx + 34, hy - 8, NAVY, 3);
}

// ------------------------------------------------------------------ layout

interface Panel {
  x: number;
  y: number;
  w: number;
  h: number;
  kicker: string;
  headline: string;
  sub: string;
  icon: (cx: number, cy: number, s: number) => void;
  tint: RGB;
}

function drawPanel(p: Panel): void {
  fillRect(p.x, p.y, p.w, p.h, p.tint);
  rect(p.x, p.y, p.w, p.h, NAVY, 2);
  // icon strip on top
  const iconH = 84;
  const iconCx = p.x + Math.floor(p.w / 2);
  const iconCy = p.y + 8 + Math.floor(iconH / 2);
  p.icon(iconCx, iconCy, 76);
  fillRect(p.x + 14, p.y + iconH + 8, p.w - 28, 2, RED);
  let y = p.y + iconH + 16;
  drawText(p.kicker, p.x + 14, y, 2, RED);
  y += 7 * 2 + 8;
  y = drawBlock(p.headline, p.x + 14, y, p.w - 28, 3, INK, 4);
  y += 6;
  drawBlock(p.sub, p.x + 14, y, p.w - 28, 2, GREY, 3);
}

function main(): void {
  // paper
  fillRect(0, 0, W, H, PAPER);
  rect(8, 8, W - 16, H - 16, NAVY, 4);
  rect(16, 16, W - 32, H - 32, NAVY, 1);

  // ---- masthead
  fillRect(20, 20, W - 40, 108, NAVY);
  drawText("THE WORLD IN ONE DAY", W / 2, 30, 2, GOLD, "center");
  drawText("SATURDAY 21 NOVEMBER 2026", W / 2, 56, 5, WHITE, "center");
  fillRect(20, 128, W - 40, 5, RED);

  // ---- lead story: the overnight barrage, and Poland
  const leadX = 24;
  const leadY = 144;
  const leadW = W - 48;
  const leadH = 248;
  fillRect(leadX, leadY, leadW, leadH, [232, 224, 200]);
  rect(leadX, leadY, leadW, leadH, NAVY, 2);
  iconBarrage(leadX + 130, leadY + 132, 150);
  drawText("KYIV \u00b7 WARSAW \u00b7 WAR", leadX + 272, leadY + 26, 2, RED);
  let y = drawBlock(
    "RUSSIA'S BIGGEST BARRAGE HITS KYIV - MISSILES LAND IN POLAND",
    leadX + 272,
    leadY + 58,
    leadW - 300,
    4,
    INK,
    5,
  );
  y += 8;
  drawBlock(
    "400+ drones and 110 missiles overnight; bridges hit, 8 killed in Kyiv. Two missiles and a drone crash in Poland; Warsaw calls it a deliberate provocation.",
    leadX + 272,
    y,
    leadW - 300,
    2,
    GREY,
    3,
  );

  // ---- row 2: Hague, markets, COP31
  const row2Y = 404;
  const rowH = 260;
  const colW = 312;
  const gap = 16;
  const panels2: Panel[] = [
    {
      x: 24, y: row2Y, w: colW, h: rowH,
      kicker: "THE HAGUE \u00b7 JUSTICE",
      headline: "WORLD COURT: MYANMAR GUILTY OF GENOCIDE",
      sub: "First state found guilty of genocide against the Rohingya.",
      icon: iconScales,
      tint: [226, 232, 238],
    },
    {
      x: 24 + colW + gap, y: row2Y, w: colW, h: rowH,
      kicker: "NEW YORK \u00b7 MARKETS",
      headline: "AI SELL-OFF SINKS MARKETS",
      sub: "S&P 500 -3.7%, Nasdaq -5.3% as the AI rout deepens.",
      icon: iconChart,
      tint: [238, 226, 220],
    },
    {
      x: 24 + 2 * (colW + gap), y: row2Y, w: colW, h: rowH,
      kicker: "ANTALYA \u00b7 CLIMATE",
      headline: "COP31 RUNS INTO OVERTIME",
      sub: "Nearly 200 nations deadlocked as draft drops fossil fuels.",
      icon: iconGlobe,
      tint: [230, 234, 222],
    },
  ];
  for (const p of panels2) drawPanel(p);

  // ---- row 3: Peru, FBI hack, UK-EU
  const row3Y = 676;
  const panels3: Panel[] = [
    {
      x: 24, y: row3Y, w: colW, h: rowH,
      kicker: "PERU \u00b7 QUAKE",
      headline: "6.9 QUAKE SHAKES PERUVIAN ANDES",
      sub: "Strong tremor rattles the Andes; damage reports coming in.",
      icon: iconQuake,
      tint: [232, 228, 214],
    },
    {
      x: 24 + colW + gap, y: row3Y, w: colW, h: rowH,
      kicker: "WASHINGTON \u00b7 CYBER",
      headline: "FBI DATABASE HACKED",
      sub: "US computer outages continue as FBI criminal database is breached.",
      icon: iconHack,
      tint: [222, 230, 226],
    },
    {
      x: 24 + 2 * (colW + gap), y: row3Y, w: colW, h: rowH,
      kicker: "BRUSSELS \u00b7 EUROPE",
      headline: "UK AND EU SIGN POST-BREXIT DEALS",
      sub: "Biggest step since Brexit: food trade, carbon, youth mobility.",
      icon: iconFlags,
      tint: [236, 226, 226],
    },
  ];
  for (const p of panels3) drawPanel(p);

  // ---- also today strip
  const stripY = 948;
  fillRect(24, stripY, W - 48, 60, NAVY);
  drawText("ALSO TODAY:", 40, stripY + 7, 2, GOLD);
  drawBlock(
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
  writeFileSync(join(outDir, "entry.png"), encodePng());
}

main();
