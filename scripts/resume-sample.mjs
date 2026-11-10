// Local tooling (not CI): npm run resume:sample -- [profile.json] [outPrefix]
// Bundles src/resume with esbuild, generates DOCX+PDF and prints the plan.
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

const src = process.argv[2] ?? 'src/portfolio/profile.snapshot.json';
const prefix = process.argv[3] ?? 'C:/Users/sarav/AppData/Local/Temp/opencode/tpl-resume';
const out = path.join(os.tmpdir(), `resume-bundle-${process.pid}.mjs`);
await build({ entryPoints: ['src/resume/index.ts', 'src/portfolio/types.ts'], bundle: true, splitting: true, outdir: path.dirname(out) + '/rb' + process.pid, format: 'esm', platform: 'node', mainFields: ['module', 'main'], logLevel: 'error', external: [] });
const dir = path.dirname(out) + '/rb' + process.pid;
const { generateResume, planResume } = await import(pathToFileURL(path.join(dir, 'resume/index.js')).href);
const { normalizeEnvelope } = await import(pathToFileURL(path.join(dir, 'portfolio/types.js')).href);
let json = JSON.parse(fs.readFileSync(src, 'utf8'));
if (!json.profile) json = { profile: json };
const profile = normalizeEnvelope(json).profile;
const plan = planResume(profile);
console.log(JSON.stringify({ tier: plan.tier, maxPages: plan.maxPages, pages: plan.pages, docxPages: plan.docxPages, lastPageFill: +plan.lastPageFill.toFixed(2), fits: plan.fits }));
for (const f of ['docx', 'pdf']) {
  const r = await generateResume(profile, f);
  fs.writeFileSync(`${prefix}.${f}`, r.bytes);
  console.log(f, r.bytes.length, 'pages', r.pages);
}
fs.writeFileSync(`${prefix}.plan.json`, JSON.stringify(plan.lines.map((l) => ({ p: l.para, page: l.page, top: +l.top.toFixed(2), style: l.style, text: l.segs.map((s) => s.text).join(''), w: +(l.segs.reduce((a, s) => a + s.w, 0) + l.indent).toFixed(1) }))));
