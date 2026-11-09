#!/usr/bin/env node
/**
 * Предохранитель OTA (9 ноя 2026). OTA-обновление попадает только на APK с той же «версией среды» (runtime version).
 * У нас она = версия приложения (app.json → runtimeVersion.policy "appVersion"). В APK она зашита в
 * android/app/src/main/res/values/strings.xml → expo_runtime_version (prebuild мы не запускаем — правится руками).
 *
 * Если эти числа разойдутся, обновление уйдёт не на тот APK, а это может сломать запуск приложения. Поэтому скрипт
 * сверяет: app.json version == build.gradle versionName == strings.xml expo_runtime_version, и что OTA включено.
 * Запускается перед сборкой APK и перед каждой публикацией обновления (npm run ota:check, npm run ota:publish).
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

const app = JSON.parse(read('app.json')).expo;
const gradle = read('android/app/build.gradle');
const strings = read('android/app/src/main/res/values/strings.xml');
const manifest = read('android/app/src/main/AndroidManifest.xml');

const versionName = (gradle.match(/versionName\s+"([^"]+)"/) || [])[1];
const runtime = (strings.match(/<string name="expo_runtime_version">([^<]+)<\/string>/) || [])[1];
const enabled = /expo\.modules\.updates\.ENABLED"\s+android:value="true"/.test(manifest);
const url = (manifest.match(/expo\.modules\.updates\.EXPO_UPDATE_URL"\s+android:value="([^"]+)"/) || [])[1];
const channel = /expo-channel-name&quot;:&quot;production&quot;/.test(manifest);

const errors = [];
if (app.runtimeVersion?.policy !== 'appVersion') errors.push('app.json: runtimeVersion должен быть { "policy": "appVersion" }');
if (versionName !== app.version) errors.push(`версия расходится: app.json ${app.version}, build.gradle versionName ${versionName}`);
if (runtime !== app.version) errors.push(`версия среды OTA ${runtime} (strings.xml) ≠ версии приложения ${app.version} (app.json)`);
if (!enabled) errors.push('AndroidManifest: expo.modules.updates.ENABLED не true');
if (!url || url !== app.updates?.url) errors.push(`адрес обновлений расходится: манифест ${url}, app.json ${app.updates?.url}`);
if (!channel) errors.push('AndroidManifest: канал обновлений не production');

if (errors.length) {
  console.error('OTA: СТОП — ' + errors.length + ' ошибок:\n  - ' + errors.join('\n  - '));
  process.exit(1);
}
console.log(`OTA: всё сходится — версия ${app.version}, канал production, ${url}`);
