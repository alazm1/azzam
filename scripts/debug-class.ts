import { parseClassName, classifyCell } from '../src/engine/parse/classify';
import { normalizeArabic } from '../src/engine/parse/normalize';
for (const t of process.argv.slice(2)) {
  const c = classifyCell({ row: 0, col: 0, rowSpan: 1, colSpan: 1, x: 0, y: 0, w: 1, h: 1, text: t.replace(/\\n/g, '\n'), ocrConfidence: 80 });
  console.log(JSON.stringify(t), '→', c.kind, c.className ?? '', '|', c.subject ?? '', '| direct:', parseClassName(normalizeArabic(t.replace(/\\n/g, '\n')))?.className ?? '');
}
