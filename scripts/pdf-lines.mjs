// Local tooling: node scripts/pdf-lines.mjs file.pdf  -> JSON lines {page, y(top-based pt), x, size, text}
import fs from 'node:fs';
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(process.argv[2])), verbosity: 0 }).promise;
const out = [];
for (let p = 1; p <= doc.numPages; p++) {
  const pg = await doc.getPage(p);
  const H = pg.getViewport({ scale: 1 }).height;
  const items = (await pg.getTextContent()).items.filter((i) => i.str.trim());
  const rows = [];
  for (const it of items) {
    const y = +(H - it.transform[5]).toFixed(1);
    let r = rows.find((r) => Math.abs(r.y - y) < 1.5);
    if (!r) rows.push((r = { page: p, y, x: it.transform[4], size: Math.round(Math.hypot(it.transform[0], it.transform[1]) * 10) / 10, text: '' }));
    r.text += it.str;
    r.x = Math.min(r.x, it.transform[4]);
  }
  out.push(...rows.sort((a, b) => a.y - b.y).map((r) => ({ ...r, x: +r.x.toFixed(1) })));
}
console.log(JSON.stringify(out));
