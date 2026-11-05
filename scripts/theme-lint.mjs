import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const failures = [];
const theme = JSON.parse(readFileSync('theme.json', 'utf8'));
if (Object.keys(theme.tokens ?? {}).some((name) => name.startsWith('--color-'))) {
  failures.push('theme.json must not set inline color tokens: maintain paired light/dark tokens in src/styles/theme.css.');
}
function visit(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) visit(file);
    else if (/\.(css|tsx)$/.test(file) && relative('src/styles', file) !== 'theme.css') {
      if (/#[\da-f]{3,8}\b|\brgba?\(/i.test(readFileSync(file, 'utf8'))) {
        failures.push(`${file}: use centralized semantic color tokens, not literal colors.`);
      }
    }
  }
}
visit('src');

const css = readFileSync('src/styles/theme.css', 'utf8');
const blocks = [...css.matchAll(/\{([^}]+)\}/g)].map((match) => Object.fromEntries(
  [...match[1].matchAll(/(--[\w-]+):\s*(#[\da-f]{6});/gi)].map((entry) => [entry[1], entry[2]]),
));
function luminance(hex) {
  return [0.2126, 0.7152, 0.0722].reduce((sum, weight, index) => {
    const channel = parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) / 255;
    return sum + weight * (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  }, 0);
}
const pairs = [];
for (const [index, tokens] of blocks.entries()) {
  for (const variant of ['primary', 'secondary', 'success', 'danger', 'warning', 'info']) {
    for (const suffix of ['', '-hover', '-active']) {
      const bg = tokens[`--color-${variant}${suffix}`];
      const fg = tokens[`--color-on-${variant}`];
      if (bg && fg) pairs.push([`theme ${index + 1} ${variant}${suffix}`, fg, bg]);
    }
  }
  if (tokens['--color-background']) {
    for (const surface of ['background', 'surface', 'surface-hover', 'surface-sunken']) {
      for (const text of ['primary', 'secondary', 'muted']) pairs.push([
        `theme ${index + 1} text-${text} on ${surface}`,
        tokens[`--color-text-${text}`], tokens[`--color-${surface}`],
      ]);
    }
    pairs.push([`theme ${index + 1} disabled`, tokens['--color-disabled-text'], tokens['--color-disabled-background']]);
  }
  if (tokens['--color-terminal-text']) pairs.push(['terminal', tokens['--color-terminal-text'], tokens['--color-terminal-background']]);
}
for (const [name, fg, bg] of pairs) {
  if (!fg || !bg) { failures.push(`${name}: missing foreground/background pair`); continue; }
  const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  const ratio = (a + 0.05) / (b + 0.05);
  if (ratio < 4.5) failures.push(`${name}: contrast ${ratio.toFixed(2)}:1 is below 4.5:1`);
}
if (!pairs.length) failures.push('No semantic color pairs found');
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`theme-lint: centralized colors; ${pairs.length} semantic foreground/background pairs pass 4.5:1 contrast.`);
