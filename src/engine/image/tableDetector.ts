import type { BinaryImage, CellBox, Grid } from '../types';
import { lineMinLengths } from './preprocessor';
import { colProjection, dilate, dilateAxis, horizontalLines, rowProjection, subtractBinary, unionBinary, verticalLines } from './morphology';

export interface DetectOptions {
  /** Minimum row height / column width in pixels considered a real cell. */
  minCellSize?: number;
}

export interface DetectResult {
  grid: Grid | null;
  hLines: BinaryImage;
  vLines: BinaryImage;
  /** Ink with the ruling lines removed (text only). */
  textInk: BinaryImage;
}

interface LineCluster {
  pos: number;
  start: number;
  end: number;
  strength: number;
}

/** Clusters consecutive projection peaks into line positions. */
function clusterPeaks(proj: Uint32Array, threshold: number, mergeDistance: number): LineCluster[] {
  const raw: LineCluster[] = [];
  let i = 0;
  while (i < proj.length) {
    if (proj[i] < threshold) {
      i++;
      continue;
    }
    const start = i;
    let sum = 0;
    let weighted = 0;
    let best = 0;
    while (i < proj.length && proj[i] >= threshold) {
      sum += proj[i];
      weighted += i * proj[i];
      best = Math.max(best, proj[i]);
      i++;
    }
    raw.push({ pos: weighted / sum, start, end: i - 1, strength: best });
  }
  // merge double borders / thick lines
  const merged: LineCluster[] = [];
  for (const c of raw) {
    const last = merged[merged.length - 1];
    if (last && c.pos - last.pos < mergeDistance) {
      const total = last.strength + c.strength;
      last.pos = (last.pos * last.strength + c.pos * c.strength) / total;
      last.end = c.end;
      last.strength = Math.max(last.strength, c.strength);
    } else {
      merged.push({ ...c });
    }
  }
  return merged;
}

/** Fraction of the segment [a,b] along a line that is covered by line pixels. */
function separatorCoverage(mask: BinaryImage, vertical: boolean, linePos: number, from: number, to: number, band: number): number {
  const { width: w, height: h, data } = mask;
  const p = Math.round(linePos);
  let covered = 0;
  const len = Math.max(1, to - from);
  for (let t = from; t < to; t++) {
    let hit = 0;
    for (let d = -band; d <= band && !hit; d++) {
      const q = p + d;
      if (vertical) {
        if (q >= 0 && q < w && t >= 0 && t < h && data[t * w + q]) hit = 1;
      } else if (q >= 0 && q < h && t >= 0 && t < w && data[q * w + t]) hit = 1;
    }
    covered += hit;
  }
  return covered / len;
}

/** Longest run (with small gaps bridged) of line pixels within a band of rows/cols. */
function longestRun(mask: BinaryImage, vertical: boolean, from: number, to: number, gapTol: number): number {
  const { width: w, height: h, data } = mask;
  const len = vertical ? h : w;
  let best = 0;
  let run = 0;
  let gap = 0;
  for (let t = 0; t < len; t++) {
    let hit = 0;
    for (let p = from; p <= to && !hit; p++) {
      if (vertical) {
        if (p >= 0 && p < w && data[t * w + p]) hit = 1;
      } else if (p >= 0 && p < h && data[p * w + t]) hit = 1;
    }
    if (hit) {
      run += gap + 1;
      gap = 0;
      if (run > best) best = run;
    } else {
      gap++;
      if (gap > gapTol) {
        run = 0;
        gap = 0;
      }
    }
  }
  return best;
}

class UnionFind {
  parent: Int32Array;
  constructor(n: number) {
    this.parent = new Int32Array(n);
    for (let i = 0; i < n; i++) this.parent[i] = i;
  }
  find(i: number): number {
    while (this.parent[i] !== i) {
      this.parent[i] = this.parent[this.parent[i]];
      i = this.parent[i];
    }
    return i;
  }
  union(a: number, b: number) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[rb] = ra;
  }
}

function buildCells(rowLines: number[], colLines: number[], hMask: BinaryImage, vMask: BinaryImage, band: number): CellBox[] {
  const rows = rowLines.length - 1;
  const cols = colLines.length - 1;
  const uf = new UnionFind(rows * cols);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      // right separator
      if (c + 1 < cols) {
        const cov = separatorCoverage(vMask, true, colLines[c + 1], Math.round(rowLines[r]), Math.round(rowLines[r + 1]), band);
        if (cov < 0.3) uf.union(idx, idx + 1);
      }
      // bottom separator
      if (r + 1 < rows) {
        const cov = separatorCoverage(hMask, false, rowLines[r + 1], Math.round(colLines[c]), Math.round(colLines[c + 1]), band);
        if (cov < 0.3) uf.union(idx, idx + cols);
      }
    }
  }
  const groups = new Map<number, { r0: number; c0: number; r1: number; c1: number }>();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const root = uf.find(r * cols + c);
      const g = groups.get(root);
      if (!g) groups.set(root, { r0: r, c0: c, r1: r, c1: c });
      else {
        g.r0 = Math.min(g.r0, r);
        g.c0 = Math.min(g.c0, c);
        g.r1 = Math.max(g.r1, r);
        g.c1 = Math.max(g.c1, c);
      }
    }
  }
  const cells: CellBox[] = [];
  for (const g of groups.values()) {
    cells.push({
      row: g.r0,
      col: g.c0,
      rowSpan: g.r1 - g.r0 + 1,
      colSpan: g.c1 - g.c0 + 1,
      x: colLines[g.c0],
      y: rowLines[g.r0],
      w: colLines[g.c1 + 1] - colLines[g.c0],
      h: rowLines[g.r1 + 1] - rowLines[g.r0],
    });
  }
  cells.sort((a, b) => a.row - b.row || a.col - b.col);
  return cells;
}

/**
 * Splits a projection profile into content segments separated by gaps of at
 * least `minGap` pixels. Returns boundaries (line positions) between segments.
 */
function segmentsFromProjection(proj: Uint32Array, inkThreshold: number, minGap: number, minSegment: number): number[] {
  const segs: { start: number; end: number }[] = [];
  let i = 0;
  while (i < proj.length) {
    if (proj[i] <= inkThreshold) {
      i++;
      continue;
    }
    const start = i;
    let gap = 0;
    let end = i;
    while (i < proj.length) {
      if (proj[i] > inkThreshold) {
        end = i;
        gap = 0;
      } else {
        gap++;
        if (gap >= minGap) break;
      }
      i++;
    }
    if (end - start + 1 >= minSegment) segs.push({ start, end });
    i = end + gap + 1;
  }
  if (segs.length === 0) return [];
  const lines: number[] = [Math.max(0, segs[0].start - Math.min(minGap, segs[0].start))];
  for (let k = 0; k + 1 < segs.length; k++) lines.push((segs[k].end + segs[k + 1].start) / 2);
  lines.push(Math.min(proj.length - 1, segs[segs.length - 1].end + minGap));
  return lines;
}

/** Fallback for borderless tables: rows/columns from whitespace gaps. */
function projectionGrid(textInk: BinaryImage, minCell: number): Grid | null {
  const { width: w, height: h } = textInk;
  const thick = dilate(textInk, 1);
  const rowProj = rowProjection(thick);
  const rowLines = segmentsFromProjection(rowProj, 1, Math.max(4, Math.round(minCell * 0.35)), Math.max(6, minCell * 0.4));
  if (rowLines.length < 3) return null;
  // Columns: use a horizontally smeared image so words in the same column merge.
  const smear = horizontalSmear(thick, Math.max(6, Math.round(minCell * 0.6)));
  const colProj = colProjection(smear);
  const colLines = segmentsFromProjection(colProj, 1, Math.max(6, Math.round(minCell * 0.5)), Math.max(6, minCell * 0.5));
  if (colLines.length < 3) return null;
  const cells: CellBox[] = [];
  for (let r = 0; r + 1 < rowLines.length; r++) {
    for (let c = 0; c + 1 < colLines.length; c++) {
      cells.push({
        row: r,
        col: c,
        rowSpan: 1,
        colSpan: 1,
        x: colLines[c],
        y: rowLines[r],
        w: colLines[c + 1] - colLines[c],
        h: rowLines[r + 1] - rowLines[r],
      });
    }
  }
  void w;
  void h;
  return { rows: rowLines.length - 1, cols: colLines.length - 1, rowLines, colLines, cells, method: 'projection' };
}

function horizontalSmear(bin: BinaryImage, r: number): BinaryImage {
  const { width: w, height: h, data } = bin;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (!data[row + x]) continue;
      out.fill(1, row + Math.max(0, x - r), row + Math.min(w, x + r + 1));
    }
  }
  return { width: w, height: h, data: out };
}

/**
 * Stage 2 of the engine: recovers the ruling structure of the table and
 * produces a logical grid (including merged cells).
 */
export function detectGrid(binary: BinaryImage, opts: DetectOptions = {}): DetectResult {
  const { width: w, height: h } = binary;
  const dim = Math.max(w, h);
  const minCell = opts.minCellSize ?? Math.max(10, Math.round(dim * 0.012));
  const { h: hMin, v: vMin } = lineMinLengths(w, h);
  // A 1-px dilation across the run direction keeps slightly slanted lines contiguous.
  const hLines = horizontalLines(dilateAxis(binary, 0, 1), hMin, 3);
  const vLines = verticalLines(dilateAxis(binary, 1, 0), vMin, 3);
  const lines = unionBinary(hLines, vLines);
  const textInk = subtractBinary(binary, lines, 1);

  const rowProj = rowProjection(hLines);
  const colProj = colProjection(vLines);
  let rowClusters = clusterPeaks(rowProj, Math.max(hMin, w * 0.15), minCell);
  let colClusters = clusterPeaks(colProj, Math.max(vMin, h * 0.15), minCell);

  // A real ruling line is one long continuous run; rows of bold text can add
  // up to the same pixel count but are broken by word gaps.
  const colSpan = colClusters.length >= 2 ? colClusters[colClusters.length - 1].pos - colClusters[0].pos : w;
  const rowSpan = rowClusters.length >= 2 ? rowClusters[rowClusters.length - 1].pos - rowClusters[0].pos : h;
  const gapTol = Math.max(6, Math.round(minCell * 0.8));
  rowClusters = rowClusters.filter((c) => longestRun(hLines, false, c.start, c.end, gapTol) >= Math.min(colSpan, w) * 0.45);
  colClusters = colClusters.filter((c) => longestRun(vLines, true, c.start, c.end, gapTol) >= Math.min(rowSpan, h) * 0.45);

  let rowLines = rowClusters.map((c) => c.pos);
  let colLines = colClusters.map((c) => c.pos);

  if (rowLines.length >= 3 && colLines.length >= 3) {
    // Add virtual outer lines when text sits outside the outermost ruling.
    rowLines = addVirtualEdges(rowLines, textInk, false, minCell, colLines[0], colLines[colLines.length - 1]);
    colLines = addVirtualEdges(colLines, textInk, true, minCell, rowLines[0], rowLines[rowLines.length - 1]);
    const band = Math.max(3, Math.round(minCell * 0.6));
    const cells = buildCells(rowLines, colLines, hLines, vLines, band);
    const grid: Grid = {
      rows: rowLines.length - 1,
      cols: colLines.length - 1,
      rowLines,
      colLines,
      cells,
      method: 'lines',
    };
    return { grid, hLines, vLines, textInk };
  }

  const grid = projectionGrid(textInk, Math.max(minCell, 14));
  return { grid, hLines, vLines, textInk };
}

function addVirtualEdges(lines: number[], textInk: BinaryImage, vertical: boolean, minCell: number, spanFrom: number, spanTo: number): number[] {
  const out = [...lines];
  const size = vertical ? textInk.width : textInk.height;
  const proj = vertical
    ? colProjection(textInk, Math.round(spanFrom), Math.round(spanTo))
    : rowProjection(textInk, Math.round(spanFrom), Math.round(spanTo));
  const inkBetween = (a: number, b: number) => {
    let n = 0;
    for (let i = Math.max(0, Math.round(a)); i < Math.min(size, Math.round(b)); i++) n += proj[i];
    return n;
  };
  const span = Math.abs(spanTo - spanFrom);
  const first = out[0];
  if (first > minCell && inkBetween(0, first) > span * 1.5) out.unshift(0);
  const last = out[out.length - 1];
  if (size - last > minCell && inkBetween(last, size) > span * 1.5) out.push(size - 1);
  return out;
}
