import { cpSync, existsSync, writeFileSync } from 'node:fs';
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
