#!/usr/bin/env bash
# Переподпись собранного APK ключом релиза с ротацией (APK Signature Scheme v3).
#
#   bash scripts/sign-release.sh android/app/build/outputs/apk/release/app-release.apk "МГУ Расписание vX.Y.Z.apk"
#
# Зачем. До 2.0.1 приложение подписывалось общедоступным debug.keystore из
# шаблона React Native — подписать «обновление» им мог кто угодно. Ключ сменён
# ротацией: v1/v2-подпись — старым ключом (Android 8 и старше, ставится поверх),
# v3 — новым ключом с родословной old → new (Android 9+ принимает обновление
# без переустановки, а у старого ключа нет права «отката» — APK, подписанный
# только им, поверх больше не встанет).
#
# Gradle подписывает по-прежнему debug.keystore (родословную он не умеет) —
# этот скрипт подписывает заново. Публиковать только выход скрипта.
#
# Папка ключа — НЕ в репозитории: msu-schedule-release.p12, password.txt,
# lineage.bin, old-debug.keystore. Без неё следующее обновление не выпустить.
set -euo pipefail

IN="${1:?путь к APK из gradle}"
OUT="${2:?куда положить подписанный APK}"
KEYDIR="${MSU_SIGNING_DIR:-C:/Users/Suhrob/Documents/msu-schedule-signing}"
SDK="${ANDROID_HOME:-C:/Android/SDK}"

# Последние стабильные build-tools (без -rc): нужен apksigner с --rotation-min-sdk-version
BT="$SDK/build-tools/$(ls "$SDK/build-tools" | grep -v -- '-rc' | sort -V | tail -1)"
APKSIGNER="$BT/apksigner.bat"
[ -x "$APKSIGNER" ] || APKSIGNER="$BT/apksigner"

for f in msu-schedule-release.p12 password.txt lineage.bin old-debug.keystore; do
  [ -f "$KEYDIR/$f" ] || { echo "Нет $KEYDIR/$f — без папки ключа подписать нельзя" >&2; exit 1; }
done

"$APKSIGNER" sign \
  --ks "$KEYDIR/old-debug.keystore" --ks-pass pass:android --ks-key-alias androiddebugkey --key-pass pass:android \
  --next-signer \
  --ks "$KEYDIR/msu-schedule-release.p12" --ks-pass "file:$KEYDIR/password.txt" --ks-key-alias msu-schedule \
  --lineage "$KEYDIR/lineage.bin" \
  --rotation-min-sdk-version 28 \
  --out "$OUT" "$IN"

"$APKSIGNER" verify -v --print-certs "$OUT" | grep -E "Verified using|Signer #1 certificate (DN|SHA-256)" || true
echo "Подписано: $OUT"
