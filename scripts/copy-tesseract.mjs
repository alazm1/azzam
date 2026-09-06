// Copies the Tesseract.js worker + WASM core into public/ so the app never
// loads them from a third-party CDN (privacy + offline support).
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = join(root, 'public', 'tesseract');
mkdirSync(out, { recursive: true });

const worker = join(root, 'node_modules', 'tesseract.js', 'dist', 'worker.min.js');
const core = join(root, 'node_modules', 'tesseract.js-core');
if (!existsSync(worker) || !existsSync(core)) {
  console.warn('[copy-tesseract] tesseract.js not installed yet; skipping.');
  process.exit(0);
}
cpSync(worker, join(out, 'worker.min.js'));
// Only the LSTM cores are needed (the engine runs in LSTM-only mode).
for (const f of readdirSync(core)) {
  if (/^tesseract-core(-simd|-relaxedsimd)?-lstm\.wasm\.js$/.test(f)) cpSync(join(core, f), join(out, f));
}
console.log('[copy-tesseract] copied worker + LSTM cores to public/tesseract');
