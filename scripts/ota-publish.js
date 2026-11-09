#!/usr/bin/env node
/**
 * Выпуск OTA-обновления (9 ноя 2026): npm run ota:publish -- "Что исправлено"
 * 1) предохранитель версий (check-ota.js) — при расхождении СТОП; 2) проверка типов; 3) eas update в канал production.
 * Публикация = выкладка живым пользователям приложения: только по слову владельца.
 */
const { spawnSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const message = process.argv.slice(2).join(' ').trim();
if (!message) {
  console.error('Нужно описание: npm run ota:publish -- "Что исправлено"');
  process.exit(1);
}
const run = (cmd, args) => {
  console.log(`\n> ${cmd} ${args.join(' ')}`);
  // shell — чтобы на Windows находились npx и tsc; описание передаётся одной строкой в кавычках
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: true });
  if (r.status !== 0) { console.error(`\nСТОП: «${cmd}» завершился с ошибкой ${r.status}`); process.exit(r.status || 1); }
};
const quoted = `"${message.replace(/"/g, "'")}"`;
run('node', ['scripts/check-ota.js']);
run('npx', ['--no-install', 'tsc', '--noEmit', '-p', '.']);
run('npx', ['--no-install', 'eas', 'update', '--channel', 'production', '--environment', 'production', '--platform', 'android', '--non-interactive', '--message', quoted]);
console.log('\nOTA: обновление выпущено в канал production.');
