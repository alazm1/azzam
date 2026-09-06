import type { BinaryImage, GrayImage, Point, Raster, Rect } from '../types';
import { connectedComponents } from './components';
import { distance, warpPerspective } from './geometry';
import { dilate, erode, open } from './morphology';
import { blur3, cropGray, downscaleGray, resizeGray, stretchContrast, toGray } from './raster';
import { adaptiveThreshold, globalThreshold, otsuThreshold } from './threshold';

export interface PreprocessOptions {
  /** Longest side of the working image, in pixels. */
  maxDimension?: number;
  /** Set to false to skip perspective/skew correction. */
  correctPerspective?: boolean;
}

export interface PreprocessResult {
  /** Corrected working image. */
  gray: GrayImage;
  /** Ink mask of the corrected image. */
  binary: BinaryImage;
  /** Quadrilateral of the table in *working* (pre-warp) coordinates, if found. */
  quad: Point[] | null;
  perspectiveCorrected: boolean;
  /** Approximate skew (degrees) that was removed. */
  skewDegrees: number;
  /** Working-image scale relative to the original raster. */
  scale: number;
}

/**
 * Adaptive binarisation with dark-region handling: large solid dark areas
 * (coloured header bars, inverted cells, a dark desk around the paper) are
 * thresholded in the opposite direction so their light text and light
 * separator lines become regular ink, and their outline is kept as a ruling
 * line (the edge of a header bar is usually also the table border).
 */
export function binarize(gray: GrayImage): BinaryImage {
  const dim = Math.max(gray.width, gray.height);
  let win = Math.max(15, Math.round(dim / 40));
  if (win % 2 === 0) win += 1;
  const dark = adaptiveThreshold(gray, win, 10);
  const r = Math.max(4, Math.round(dim * 0.004));
  const t = Math.min(otsuThreshold(gray), 150);
  const solid = open(globalThreshold(gray, t), r);
  const out = new Uint8Array(dark.data);
  let solidCount = 0;
  for (let i = 0; i < solid.data.length; i++) solidCount += solid.data[i];
  if (solidCount > 0) {
    const inverted = new Uint8Array(gray.data.length);
    for (let i = 0; i < inverted.length; i++) inverted[i] = 255 - gray.data[i];
    const light = adaptiveThreshold({ width: gray.width, height: gray.height, data: inverted }, win, 10);
    const outer = dilate(solid, 2);
    const inner = erode(solid, 2);
    for (let i = 0; i < out.length; i++) {
      if (inner.data[i]) out[i] = light.data[i];
      if (outer.data[i] && !inner.data[i]) out[i] = 1;
    }
  }
  return { width: gray.width, height: gray.height, data: out };
}

export function lineMinLengths(width: number, height: number): { h: number; v: number } {
  return {
    h: Math.max(40, Math.round(width * 0.05)),
    v: Math.max(30, Math.round(height * 0.05)),
  };
}

/** Coverage (0..1) of ink along the segment a→b within a band of ±band px. */
function edgeCoverage(bin: BinaryImage, a: Point, b: Point, band: number): number {
  const len = Math.max(1, Math.round(distance(a, b)));
  let hit = 0;
  for (let i = 0; i <= len; i += 2) {
    const t = i / len;
    const x = Math.round(a.x + (b.x - a.x) * t);
    const y = Math.round(a.y + (b.y - a.y) * t);
    let found = 0;
    for (let dy = -band; dy <= band && !found; dy++) {
      for (let dx = -band; dx <= band && !found; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < bin.width && yy < bin.height && bin.data[yy * bin.width + xx]) found = 1;
      }
    }
    hit += found;
  }
  return hit / (Math.floor(len / 2) + 1);
}

/**
 * Finds the table (or the sheet of paper it is printed on) as a quadrilateral:
 * the largest connected structure of the slightly dilated ink. Ruling lines
 * connect every cell, so the whole table becomes one component whose extreme
 * points are its corners — regardless of skew or perspective.
 */
export function findTableQuad(binary: BinaryImage, skipFullFrame = false): { quad: Point[]; bbox: Rect; framed: boolean } | null {
  const { width: w, height: h } = binary;
  const comps = connectedComponents(dilate(binary, 1), 400);
  const imgArea = w * h;
  for (const c of comps) {
    const bw = c.x1 - c.x0 + 1;
    const bh = c.y1 - c.y0 + 1;
    if (bw * bh < imgArea * 0.12) break; // sorted by bbox area desc
    if (bw < w * 0.3 || bh < h * 0.15) continue;
    // The outline of the sheet of paper already fills the image: look for the table inside it.
    if (skipFullFrame && bw >= w * 0.9 && bh >= h * 0.9) continue;
    const quad = [c.tl, c.tr, c.br, c.bl];
    const top = distance(quad[0], quad[1]);
    const bottom = distance(quad[3], quad[2]);
    const left = distance(quad[0], quad[3]);
    const right = distance(quad[1], quad[2]);
    if (Math.min(top, bottom) / Math.max(top, bottom) < 0.6) continue;
    if (Math.min(left, right) / Math.max(left, right) < 0.6) continue;
    const band = Math.max(2, Math.round(Math.max(w, h) * 0.003));
    const coverage = [
      edgeCoverage(binary, quad[0], quad[1], band),
      edgeCoverage(binary, quad[1], quad[2], band),
      edgeCoverage(binary, quad[2], quad[3], band),
      edgeCoverage(binary, quad[3], quad[0], band),
    ];
    const framed = coverage.filter((v) => v >= 0.6).length >= 3;
    return { quad, bbox: { x: c.x0, y: c.y0, w: bw, h: bh }, framed };
  }
  return null;
}

function expandQuad(quad: Point[], marginPx: number, w: number, h: number): Point[] {
  const cx = quad.reduce((s, p) => s + p.x, 0) / 4;
  const cy = quad.reduce((s, p) => s + p.y, 0) / 4;
  return quad.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const len = Math.hypot(dx, dy) || 1;
    return {
      x: Math.max(0, Math.min(w - 1, p.x + (dx / len) * marginPx)),
      y: Math.max(0, Math.min(h - 1, p.y + (dy / len) * marginPx)),
    };
  });
}

function quadSkewDegrees(quad: Point[]): number {
  const topAngle = Math.atan2(quad[1].y - quad[0].y, quad[1].x - quad[0].x);
  const bottomAngle = Math.atan2(quad[2].y - quad[3].y, quad[2].x - quad[3].x);
  return (((topAngle + bottomAngle) / 2) * 180) / Math.PI;
}

/**
 * Stage 1 of the engine: normalises the input photo into a clean, upright,
 * cropped grayscale image plus its ink mask.
 */
export function preprocess(raster: Raster, opts: PreprocessOptions = {}): PreprocessResult {
  const maxDimension = opts.maxDimension ?? 2000;
  let gray = toGray(raster);
  const dim = Math.max(gray.width, gray.height);
  let scale = 1;
  if (dim > maxDimension) {
    const factor = dim / maxDimension;
    gray = downscaleGray(gray, factor);
    scale = 1 / factor;
  } else if (dim < 900) {
    // Tiny screenshots: upscale so that lines/text have enough pixels to work with.
    const factor = 900 / dim;
    gray = resizeGray(gray, gray.width * factor, gray.height * factor);
    scale = factor;
  }
  if (Math.max(gray.width, gray.height) > 1200) gray = blur3(gray);
  gray = stretchContrast(gray);

  let binary = binarize(gray);
  let quad: Point[] | null = null;
  let perspectiveCorrected = false;
  let skewDegrees = 0;

  if (opts.correctPerspective !== false) {
    for (let iteration = 0; iteration < 2; iteration++) {
      const found = findTableQuad(binary, iteration > 0);
      if (!found) break;
      const bbox = found.bbox;
      const corners = [
        { x: bbox.x, y: bbox.y },
        { x: bbox.x + bbox.w - 1, y: bbox.y },
        { x: bbox.x + bbox.w - 1, y: bbox.y + bbox.h - 1 },
        { x: bbox.x, y: bbox.y + bbox.h - 1 },
      ];
      const maxDev = Math.max(...found.quad.map((p, i) => distance(p, corners[i])));
      const tolerance = Math.max(4, Math.max(gray.width, gray.height) * 0.006);
      const margin = Math.max(10, Math.round(Math.max(bbox.w, bbox.h) * 0.015));
      if (maxDev > tolerance && found.framed && !perspectiveCorrected) {
        quad = found.quad;
        skewDegrees = quadSkewDegrees(quad);
        const expanded = expandQuad(quad, margin, gray.width, gray.height);
        const outW = Math.round(Math.max(distance(expanded[0], expanded[1]), distance(expanded[3], expanded[2])));
        const outH = Math.round(Math.max(distance(expanded[0], expanded[3]), distance(expanded[1], expanded[2])));
        const warped = warpPerspective(gray, expanded, outW, outH);
        if (!warped) break;
        gray = warped;
        binary = binarize(gray);
        perspectiveCorrected = true;
        continue; // second pass tightens the crop on the rectified image
      }
      // Axis aligned (or unframed): a plain crop keeps full fidelity.
      const alreadyTight = bbox.x <= margin * 2 && bbox.y <= margin * 2 && gray.width - (bbox.x + bbox.w) <= margin * 2 && gray.height - (bbox.y + bbox.h) <= margin * 2;
      if (alreadyTight) break;
      if (!quad) quad = found.quad;
      const rect: Rect = { x: bbox.x - margin, y: bbox.y - margin, w: bbox.w + margin * 2, h: bbox.h + margin * 2 };
      gray = cropGray(gray, rect);
      binary = binarize(gray);
      break;
    }
  }

  return { gray, binary, quad, perspectiveCorrected, skewDegrees, scale };
}
