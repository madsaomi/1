import { cpSync, existsSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
const marker = '/site/.local-initialized';
if (!existsSync(marker)) {
  for (const path of ['build.mjs', 'content.js', 'index.html', 'results.html', 'career.html', 'teachers.html', 'results.js', 'career.js', 'script.js', 'theme-init.js', 'style.css', 'robots.txt', 'assets']) {
    cpSync(`/source/${path}`, `/site/${path}`, { recursive: true });
  }
  writeFileSync(marker, 'Local isolated site copy\n');
}
// Refresh presentation sources on every rebuild; content and uploads stay in the volume.
for (const path of ['build.mjs', 'index.html', 'results.html', 'career.html', 'teachers.html', 'results.js', 'career.js', 'script.js', 'theme-init.js', 'style.css', 'robots.txt']) {
  cpSync(`/source/${path}`, `/site/${path}`);
}
console.log('Local site volume ready; repository files are read-only.');
// Refresh code and bundled artwork, but never overwrite CMS uploads or translations.
for (const entry of readdirSync('/source/assets')) {
  if (entry === 'uploads' || entry === 'i18n') continue;
  cpSync(`/source/assets/${entry}`, `/site/assets/${entry}`, { recursive: true });
}
cpSync('/source/assets/i18n/language.js', '/site/assets/i18n/language.js');
// Refresh dictionary code and add new defaults, retaining every published owner translation.
const stringsBlock = /(\bstrings:\s*\{\n)([\s\S]*?)(\n  \},\s*\n(?:\s*\/\/[^\n]*\n)*\s*patterns:)/;
const dictionary = source => {
  const context = { window: {} };
  vm.runInNewContext(source, context, { timeout: 1000 });
  return Object.values(context.window)[0].strings;
};
for (const language of ['uz', 'kaa']) {
  const source = readFileSync(`/source/assets/i18n/${language}.js`, 'utf8');
  const target = `/site/assets/i18n/${language}.js`;
  if (!existsSync(target)) { writeFileSync(target, source); continue; }
  const merged = { ...dictionary(source), ...dictionary(readFileSync(target, 'utf8')) };
  const lines = Object.entries(merged).map(([key, value]) => `    ${JSON.stringify(key)}: ${JSON.stringify(value)}`).join(',\n');
  if (!stringsBlock.test(source)) throw new Error(`Missing translation block: ${language}`);
  writeFileSync(target, source.replace(stringsBlock, (_, before, _old, after) => before + lines + after));
}
