// Local tooling: node scripts/side-by-side.mjs a.png b.png out.png
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const [a, b, out] = process.argv.slice(2);
const u = (f) => `data:image/png;base64,${fs.readFileSync(f).toString('base64')}`;
const br = await chromium.launch(); const pg = await br.newPage({ viewport: { width: 1500, height: 1000 } });
await pg.setContent(`<body style="margin:0;display:flex;gap:8px;background:#888"><img src="${u(a)}" style="width:740px"><img src="${u(b)}" style="width:740px"></body>`);
await pg.screenshot({ path: out, fullPage: true }); await br.close();
