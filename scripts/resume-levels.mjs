// Local tooling: node scripts/resume-levels.mjs profile.json  -> pages (exact/safe) and last-page fill per content level
import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const dir = path.join(os.tmpdir(), `rl${process.pid}`);
await build({ entryPoints: ['src/resume/layout.ts', 'src/resume/model.ts', 'src/portfolio/types.ts'], bundle: true, splitting: true, outdir: dir, format: 'esm', platform: 'node', logLevel: 'error' });
const imp = (f) => import(pathToFileURL(path.join(dir, f)).href);
const { layoutBlocks, SAFETY_MARGIN } = await imp('resume/layout.js'); const { buildBlocks, tierAt } = await imp('resume/model.js'); const { normalizeEnvelope } = await imp('portfolio/types.js');
let j = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')); if (!j.profile) j = { profile: j };
const p = normalizeEnvelope(j).profile;
const cap = 841.9 - 50.4 - 43.2;
for (let i = 0; i < 10; i++) { const t = tierAt(i), b = buildBlocks(p, t); const e = layoutBlocks(b), s = layoutBlocks(b, cap * (1 - SAFETY_MARGIN)); console.log(t.name, 'exact', e.pages, e.lastPageFill.toFixed(2), 'safe', s.pages, s.lastPageFill.toFixed(2)); }

const t0 = tierAt(0), b0 = buildBlocks(p, t0), r0 = layoutBlocks(b0);
for (let pg = 0; pg < r0.pages; pg++) { const ls = r0.lines.filter((l) => l.page === pg); const f = ls[0], l = ls.at(-1); console.log('page', pg + 1, 'lines', ls.length, 'first:', f.segs.map((s) => s.text).join('').slice(0, 40), '| last:', l.segs.map((s) => s.text).join('').slice(0, 40), 'bottom', (l.top + l.lh).toFixed(0), '/ 748'); }
