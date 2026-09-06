import { join } from 'node:path';
import { preprocess } from '../src/engine/image/preprocessor';
import { detectGrid } from '../src/engine/image/tableDetector';
import { loadRaster, FIXTURES, ROOT, savePng } from '../tests/helpers/node';
import { binaryToGray } from '../src/engine/image/raster';

const name = process.argv[2];
const raster = loadRaster(join(FIXTURES, name));
const pre = preprocess(raster);
const det = detectGrid(pre.binary, {}, pre.lineBinary);
console.log('gray', pre.gray.width, pre.gray.height, 'persp', pre.perspectiveCorrected, 'skew', pre.skewDegrees.toFixed(2), 'quad', JSON.stringify(pre.quad));
console.log('rows', det.grid?.rows, 'cols', det.grid?.cols, det.grid?.method);
console.log('rowLines', det.grid?.rowLines.map((v) => Math.round(v)).join(','));
console.log('colLines', det.grid?.colLines.map((v) => Math.round(v)).join(','));
for (const c of det.grid?.cells ?? []) if (c.rowSpan > 1 || c.colSpan > 1) console.log('span', c.row, c.col, `${c.rowSpan}x${c.colSpan}`);
savePng(join(ROOT, 'tests/output', name.replace(/\.\w+$/, '') + '.bin.png'), binaryToGray(pre.binary));
savePng(join(ROOT, 'tests/output', name.replace(/\.\w+$/, '') + '.lines.png'), binaryToGray({ width: det.hLines.width, height: det.hLines.height, data: det.hLines.data.map((v, i) => v | det.vLines.data[i]) }));
