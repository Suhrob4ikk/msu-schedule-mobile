/**
 * Обновление внутри приложения (просьба владельца, 7 окт 2026): APK качается
 * здесь же, с процентами, а «Установить» сразу открывает системную установку —
 * без браузера и папки «Загрузки».
 *
 * Состояние — на уровне модуля, а не компонента: загрузка продолжается, если
 * карточку закрыли или перешли на другую вкладку. Закрыли приложение совсем —
 * загрузка обрывается; скачанное до конца остаётся (метка DONE_KEY) и при
 * следующем «Обновить» не качается заново.
 *
 * Установка: content:// ссылка от expo-file-system (File.contentUri) + действие
 * VIEW с типом APK. Разрешение REQUEST_INSTALL_PACKAGES — в манифесте; если
 * пользователь ещё не разрешил «установку из этого источника», Android сам
 * предложит включить. Подпись проверяет система: чужой APK поверх не встанет.
 */
import { useSyncExternalStore } from 'react';
import { Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { startActivityAsync } from 'expo-intent-launcher';

export type UpdatePhase = 'idle' | 'downloading' | 'ready' | 'error';

export interface UpdateState {
  phase: UpdatePhase;
  version: string | null;
  /** Скачано, байт. */
  received: number;
  /** Всего, байт (0 — сервер не сообщил). */
  total: number;
  error: string | null;
}

/** «Скачано до конца»: { version, size } — чтобы не качать повторно. */
const DONE_KEY = 'update_downloaded';
const APK_MIME = 'application/vnd.android.package-archive';
/** Intent.FLAG_GRANT_READ_URI_PERMISSION — установщик должен прочитать наш файл. */
const FLAG_GRANT_READ = 1;

let state: UpdateState = { phase: 'idle', version: null, received: 0, total: 0, error: null };
let abort: AbortController | null = null;
let url: string | null = null;
const subs = new Set<() => void>();
const set = (patch: Partial<UpdateState>) => {
  state = { ...state, ...patch };
  subs.forEach(fn => fn());
};

const dir = () => new Directory(Paths.cache, 'updates');
const apkFile = (version: string) => new File(dir(), `MSU-Schedule-${version}.apk`);

/** Карточка показала новую версию: если она уже скачана — сразу «Установить». */
export async function prepareUpdate(version: string, downloadUrl: string | null): Promise<void> {
  url = downloadUrl;
  if (state.version === version && state.phase !== 'idle') return;
  set({ phase: 'idle', version, received: 0, total: 0, error: null });
  try {
    const raw = await AsyncStorage.getItem(DONE_KEY);
    const done = raw ? (JSON.parse(raw) as { version: string; size: number }) : null;
    const f = apkFile(version);
    if (done?.version === version && f.exists && f.size === done.size) {
      set({ phase: 'ready', received: done.size, total: done.size });
    }
  } catch { /* нет метки — качаем как обычно */ }
}

export async function startDownload(): Promise<void> {
  const version = state.version;
  if (!version || !url || state.phase === 'downloading') return;
  set({ phase: 'downloading', received: 0, total: 0, error: null });
  abort = new AbortController();
  try {
    // Старые и недокачанные APK — долой: каждый ~45 МБ
    const d = dir();
    if (d.exists) d.delete();
    d.create({ intermediates: true });
    const dest = apkFile(version);
    const task = File.createDownloadTask(url, dest, {
      signal: abort.signal,
      onProgress: ({ bytesWritten, totalBytes }) => {
        // Не чаще, чем на 1 %: иначе карточка перерисовывается сотни раз
        const step = totalBytes > 0 ? totalBytes / 100 : 512 * 1024;
        if (bytesWritten - state.received >= step || bytesWritten === totalBytes) {
          set({ received: bytesWritten, total: totalBytes > 0 ? totalBytes : 0 });
        }
      },
    });
    const file = await task.downloadAsync();
    if (!file || !file.exists) throw new Error('файл не сохранился');
    await AsyncStorage.setItem(DONE_KEY, JSON.stringify({ version, size: file.size }));
    set({ phase: 'ready', received: file.size, total: file.size });
  } catch (e) {
    if (abort?.signal.aborted) {
      set({ phase: 'idle', received: 0, total: 0 });
    } else {
      set({ phase: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  } finally {
    abort = null;
  }
}

export function cancelDownload(): void {
  abort?.abort();
}

/** Открыть системную установку скачанного APK. Не вышло — ссылка в браузере. */
export async function installUpdate(): Promise<void> {
  const version = state.version;
  if (!version) return;
  try {
    const f = apkFile(version);
    if (!f.exists) { set({ phase: 'idle' }); return; }
    await startActivityAsync('android.intent.action.VIEW', {
      data: f.contentUri,
      type: APK_MIME,
      flags: FLAG_GRANT_READ,
    });
  } catch {
    if (url) Linking.openURL(url).catch(() => null);
  }
}

/** Скачать по ссылке в браузере — запасной путь, если в приложении не получается. */
export function openInBrowser(): void {
  if (url) Linking.openURL(url).catch(() => null);
}

function subscribe(fn: () => void) {
  subs.add(fn);
  return () => { subs.delete(fn); };
}

export function useUpdateState(): UpdateState {
  return useSyncExternalStore(subscribe, () => state);
}

/** «15 из 45 МБ» */
export function sizeLabel(received: number, total: number): string {
  const mb = (b: number) => (b / 1048576).toFixed(b >= 10 * 1048576 ? 0 : 1).replace('.', ',');
  return total > 0 ? `${mb(received)} из ${mb(total)} МБ` : `${mb(received)} МБ`;
}
