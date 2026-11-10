// Local tooling: node scripts/pdf-compare-png.mjs ours.pdf word.pdf outDir  -> tpl-ours-pN.png, tpl-word-pN.png, similarity per page
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [ours, word, outDir] = process.argv.slice(2);
const pj = (f) => pathToFileURL(path.resolve('node_modules/pdfjs-dist/build', f)).href;
const b64 = (f) => fs.readFileSync(f).toString('base64');
const html = `<!doctype html><html><body><script type="module">
import * as pdfjs from '${pj('pdf.min.mjs')}';
pdfjs.GlobalWorkerOptions.workerSrc = '${pj('pdf.worker.min.mjs')}';
const load = async (b64) => pdfjs.getDocument({ data: Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)) }).promise;
const render = async (doc, n, scale) => {
  const page = await doc.getPage(n); const vp = page.getViewport({ scale });
  const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise; return c;
};
const gray = (c, k) => { const s = document.createElement('canvas'); s.width = Math.round(c.width / k); s.height = Math.round(c.height / k);
  const x = s.getContext('2d'); x.drawImage(c, 0, 0, s.width, s.height); const d = x.getImageData(0, 0, s.width, s.height).data; const g = new Float32Array(s.width * s.height);
  for (let i = 0; i < g.length; i++) g[i] = (0.3 * d[i * 4] + 0.59 * d[i * 4 + 1] + 0.11 * d[i * 4 + 2]) / 255; return g; };
window.run = async (a, w) => {
  const A = await load(a), W = await load(w); const out = { pages: [A.numPages, W.numPages], png: [], sim: [] };
  for (let n = 1; n <= Math.max(A.numPages, W.numPages); n++) {
    const ca = n <= A.numPages ? await render(A, n, 1.6) : null, cw = n <= W.numPages ? await render(W, n, 1.6) : null;
    out.png.push([ca?.toDataURL('image/png'), cw?.toDataURL('image/png')]);
    if (ca && cw) { const ga = gray(ca, 4), gw = gray(cw, 4); let s = 0; for (let i = 0; i < ga.length; i++) s += Math.abs(ga[i] - gw[i]);
      // ink-weighted: mean abs diff relative to mean ink of Word page
      let ink = 0; for (let i = 0; i < gw.length; i++) ink += 1 - gw[i];
      const g12a = gray(ca, 12), g12w = gray(cw, 12); let s12 = 0, ink12 = 0; for (let i = 0; i < g12a.length; i++) { s12 += Math.abs(g12a[i] - g12w[i]); ink12 += 1 - g12w[i]; }
      out.sim.push({ page: n, blurred12DiffOfInk: +(s12 / Math.max(ink12, 1)).toFixed(3), meanAbsDiff: +(s / ga.length).toFixed(4), similarity: +(1 - s / ga.length).toFixed(4), inkDiffRatio: +(s / Math.max(ink, 1)).toFixed(3) }); }
  }
  return out;
};
window.ready = true;
</script></body></html>`;
const htmlPath = path.join(outDir, '_cmp.html');
fs.writeFileSync(htmlPath, html);
const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('pageerror', e.message));
await page.goto(pathToFileURL(htmlPath).href);
await page.waitForFunction('window.ready === true');
const res = await page.evaluate(([a, w]) => window.run(a, w), [b64(ours), b64(word)]);
res.png.forEach(([a, w], i) => {
  if (a) fs.writeFileSync(path.join(outDir, `tpl-ours-p${i + 1}.png`), Buffer.from(a.split(',')[1], 'base64'));
  if (w) fs.writeFileSync(path.join(outDir, `tpl-word-p${i + 1}.png`), Buffer.from(w.split(',')[1], 'base64'));
});
console.log(JSON.stringify({ pages: res.pages, sim: res.sim }));
await browser.close();
