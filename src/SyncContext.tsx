import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { performFullSync, getLastSyncTime, shouldResync, formatSyncTime } from './syncService';
import { clearApiCache, API_BASE } from './api';

/**
 * Проверка сети.
 *
 * Раньше здесь раз в 15 секунд дёргался /api/schedule/groups — полный список
 * всех групп, 240 запросов в час, только чтобы понять «есть ли интернет».
 * Теперь состояние приходит событием от Android: система и так знает, есть ли
 * у сети выход в интернет (NET_CAPABILITY_VALIDATED), и NetInfo просто
 * пересказывает её ответ. Собственных запросов — ноль.
 */
// Бэкенд отдаёт /health и в корне, и под префиксом /api — а ходим мы через
// прокси (/backend/* → /api/*), где доступен только второй. Отсюда просто
// приписанный к базе путь, без вырезания /api, как было раньше.
const HEALTH_URL = `${API_BASE}/health`;

NetInfo.configure({
  // Ответ от системы. Пока он есть, запасная проверка ниже не запускается вовсе.
  useNativeReachability: true,
  // Запасной путь — если система вдруг не дала ответа. Тогда лучше спросить
  // наш же бэкенд, чем чужой адрес, который может быть недоступен.
  reachabilityUrl: HEALTH_URL,
  reachabilityMethod: 'HEAD',
  reachabilityTest: async (response: Response) => response.status < 400,
  reachabilityLongTimeout: 5 * 60_000,   // всё хорошо — перепроверяем раз в 5 минут
  reachabilityShortTimeout: 30_000,      // офлайн — раз в полминуты
  // Render на бесплатном тарифе просыпается долго; короткий тайм-аут
  // объявил бы спящий сервер мёртвым.
  reachabilityRequestTimeout: 20_000,
});

/** true, пока система не сказала обратного: ложный баннер «офлайн» хуже молчания. */
function isOnlineFrom(state: NetInfoState): boolean {
  if (state.isConnected === false) return false;
  // null = «ещё не проверяли». Считаем, что связь есть.
  return state.isInternetReachable !== false;
}

/**
 * Полную синхронизацию не запускаем сразу при старте: в эти же секунды
 * первый экран грузит своё расписание, и тяжёлый bulk-ответ отбирал бы у него
 * канал (а на спящем Render — ещё и место в очереди). Пара секунд форы.
 */
const SYNC_START_DELAY_MS = 3_000;

type SyncState = {
  lastSyncTime: Date | null;
  isSyncing: boolean;
  syncProgress: string;
  isOnline: boolean;
  /** Increments every time we transition offline → online. Use in useEffect deps. */
  onlineAt: number;
  offlineBannerText: string;
  /** Ручной запуск синхронизации. Возвращает true при успехе, false при ошибке. */
  triggerSync: () => Promise<boolean>;
};

const SyncContext = createContext<SyncState>({
  lastSyncTime: null,
  isSyncing: false,
  syncProgress: '',
  isOnline: true,
  onlineAt: 0,
  offlineBannerText: '',
  triggerSync: async () => false,
});

export function useSyncStatus() {
  return useContext(SyncContext);
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState('');
  const [isOnline, setIsOnline] = useState(true);
  const [onlineAt, setOnlineAt] = useState(0);

  const isOnlineRef = useRef(true);
  const syncStarted = useRef(false);
  const isSyncingRef = useRef(false);
  useEffect(() => { isSyncingRef.current = isSyncing; }, [isSyncing]);

  const applyState = useCallback((online: boolean) => {
    const wasOnline = isOnlineRef.current;
    if (wasOnline === online) return;
    isOnlineRef.current = online;
    setIsOnline(online);
    // Появился интернет — сигнал экранам обновиться.
    if (!wasOnline && online) setOnlineAt(Date.now());
  }, []);

  // Подписка на события сети. Ни одного запроса от нас — состояние
  // присылает система, а редкую проверку /health делает сам NetInfo.
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => applyState(isOnlineFrom(state)));
    NetInfo.fetch().then(state => applyState(isOnlineFrom(state))).catch(() => null);
    return () => unsubscribe();
  }, [applyState]);

  // При возврате в приложение состояние сети могло измениться, пока оно спало.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state !== 'active') return;
      NetInfo.refresh().then(s => applyState(isOnlineFrom(s))).catch(() => null);
    });
    return () => sub.remove();
  }, [applyState]);

  // Полная синхронизация при старте — если пора и если есть сеть.
  useEffect(() => {
    if (syncStarted.current) return;
    syncStarted.current = true;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    (async () => {
      const last = await getLastSyncTime();
      if (cancelled) return;
      setLastSyncTime(last);
      if (!shouldResync(last)) return;

      timer = setTimeout(async () => {
        // Офлайн — не тратим 20 секунд на заведомо мёртвый запрос:
        // синхронизация всё равно запустится, как только сеть вернётся.
        if (cancelled || !isOnlineRef.current) return;
        // Сеть могла вернуться за эти 3 секунды, и «догоняющая» синхронизация
        // ниже уже пошла — второй такой же запуск только дважды перезапишет
        // те же ключи и помигает индикатором.
        if (isSyncingRef.current) return;
        setIsSyncing(true);
        try {
          await performFullSync(msg => setSyncProgress(msg));
          if (!cancelled) setLastSyncTime(new Date());
        } catch {
          // Сеть отвалилась посреди синхронизации — данные на устройстве целы
        } finally {
          if (!cancelled) { setIsSyncing(false); setSyncProgress(''); }
        }
      }, SYNC_START_DELAY_MS);
    })();

    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, []);

  // Сеть вернулась, а синхронизация так и не прошла (были офлайн при старте) —
  // догоняем. Иначе офлайн-кэш обновился бы только при следующем запуске.
  useEffect(() => {
    if (onlineAt === 0 || isSyncingRef.current) return;
    if (!shouldResync(lastSyncTime)) return;
    let cancelled = false;
    (async () => {
      // Ref, а не состояние: между рендерами оно обновляется с задержкой,
      // а стартовая синхронизация проверяет именно ref.
      isSyncingRef.current = true;
      setIsSyncing(true);
      try {
        await performFullSync(msg => setSyncProgress(msg));
        if (!cancelled) setLastSyncTime(new Date());
      } catch {
        // Связь опять пропала — попробуем в следующий раз
      } finally {
        isSyncingRef.current = false;
        if (!cancelled) { setIsSyncing(false); setSyncProgress(''); }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlineAt]);

  // Ручная синхронизация — вызывается кнопкой в профиле.
  const triggerSync = useCallback(async (): Promise<boolean> => {
    if (isSyncingRef.current) return false;
    setIsSyncing(true);
    setSyncProgress('');
    try {
      clearApiCache(); // чтобы тянуть свежие данные, а не из кэша
      await performFullSync(msg => setSyncProgress(msg));
      setLastSyncTime(new Date());
      setOnlineAt(Date.now()); // подталкиваем экраны обновиться
      return true;
    } catch {
      return false;
    } finally {
      setIsSyncing(false);
      setSyncProgress('');
    }
  }, []);

  const offlineBannerText = lastSyncTime
    ? `Офлайн · данные от ${formatSyncTime(lastSyncTime)}`
    : 'Офлайн · нет сохранённых данных';

  return (
    <SyncContext.Provider value={{ lastSyncTime, isSyncing, syncProgress, isOnline, onlineAt, offlineBannerText, triggerSync }}>
      {children}
    </SyncContext.Provider>
  );
}
