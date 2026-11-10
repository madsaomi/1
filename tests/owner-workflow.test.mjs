import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('owner edits, additions and removals pass the full public-site checks without updating the baseline', () => {
  const base = path.resolve(os.tmpdir());
  const stage = fs.mkdtempSync(path.join(base, 'stanford-owner-workflow-'));
  try {
    for (const file of ['build.mjs', 'index.html', 'results.html', 'career.html', 'content.js', 'script.js',
      'results.js', 'career.js', 'theme-init.js', 'style.css', 'robots.txt', 'Dockerfile', 'Caddyfile',
      'railway.json', '.dockerignore', 'package.json']) {
      fs.copyFileSync(new URL('../' + file, import.meta.url), path.join(stage, file));
    }
    for (const directory of ['assets', 'tests']) {
      fs.cpSync(new URL('../' + directory, import.meta.url), path.join(stage, directory), { recursive: true });
    }
    const content = JSON.parse(fs.readFileSync(new URL('./fixtures/content.json', import.meta.url), 'utf8'));
    content.site = { ...content.site, demoMode: false, city: 'Изменённый город', url: 'https://owner.example' };
    content.courses = [{ id: 'new-owner-course', name: 'Новая программа владельца', category: 'languages',
      description: 'Описание изменено в админке.', skills: ['Новая программа занятий'], price: 345000, target: '#prices' }];
    content.contacts = { verified: false, phones: [], telegrams: [], locations: [] };
    content.results = [];
    content.teachers = [];
    content.stats = [];
    content.faq = [];
    content.cashback = {};
    content.texts['hero.text1'] = 'Совершенно новый текст владельца, которого пока нет в узбекском словаре.';
    content.texts['hero.title1'] = 'Обновлённый заголовок';
    content.texts['career.label1'] = 'Новое имя поля';
    fs.writeFileSync(path.join(stage, 'content.js'), 'window.schoolContent = ' + JSON.stringify(content) + ';\n');
    const run = args => spawnSync(process.execPath, args, {
      cwd: stage, encoding: 'utf8', timeout: 30000, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
    });
    let result = run(['build.mjs']);
    assert.equal(result.status, 0, result.stderr);
    result = run(['build.mjs', '--check']);
    assert.equal(result.status, 0, result.stderr);
    result = run(['--test', 'tests/site.test.mjs', 'tests/i18n.test.mjs', 'tests/design-system.test.mjs']);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const python = spawnSync('python', ['tests/validate_html.py'], { cwd: stage, encoding: 'utf8', timeout: 10000 });
    assert.equal(python.status, 0, python.stdout + python.stderr);
  } finally {
    const resolved = path.resolve(stage);
    assert(resolved.startsWith(base + path.sep) && path.basename(resolved).startsWith('stanford-owner-workflow-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});
