import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { performFullSync, getLastSyncTime, shouldResync, formatSyncTime } from './syncService';
import { clearApiCache, API_BASE } from './api';
import { onScheduleUpdated } from './scheduleEvents';

/**
 * Проверка сети.
 *
 * Раньше здесь раз в 15 секунд дёргался /api/schedule/groups — полный список
 * всех групп, 240 запросов в час, только чтобы понять «есть ли интернет».
 * Теперь основной сигнал приходит событием от Android (NET_CAPABILITY_VALIDATED) —
 * своих запросов на это почти нет.
 *
 * «Почти», а не «совсем», по опыту 19–21 сен 2026: на одном телефоне (MIUI)
 * Android трое суток подряд считал, что «интернета нет» — сам, без нашего
 * участия, — хотя сеть и наш бэкенд прекрасно отвечали (Telegram работал,
 * бэкенд отвечал за секунды). Похоже на историю с Megafon TJ и IP Render
 * (см. комментарий у API_BASE в api.ts): устройство не может провалидировать
 * какой-то ЧУЖОЙ адрес, которым Android проверяет интернет вообще, и решает,
 * что сети нет — хотя нужный НАМ адрес доступен. NetInfo с useNativeReachability
 * в такой ситуации даже не смотрит на свой резервный reachabilityUrl — он
 * запускается, только когда нативного ответа нет вовсе, а не когда он есть,
 * но неверный. Поэтому здесь и добавлена собственная перепроверка: если
 * система сказала «офлайн», не верим на слово и стучимся напрямую в наш
 * /health — и только если он тоже недоступен, показываем «офлайн» по-настоящему.
 */
// Бэкенд отдаёт /health и в корне, и под префиксом /api — а ходим мы через
// прокси (/backend/* → /api/*), где доступен только второй. Отсюда просто
// приписанный к базе путь, без вырезания /api, как было раньше.
const HEALTH_URL = `${API_BASE}/health`;
const HEALTH_CHECK_TIMEOUT_MS = 10_000;
// Пока система настаивает на «офлайн» — перепроверяем сами раз в полминуты,
// а не жуём батарею частым опросом.
const HEALTH_RECHECK_INTERVAL_MS = 30_000;

NetInfo.configure({ useNativeReachability: true });

/** true, пока система не сказала обратного: ложный баннер «офлайн» хуже молчания. */
function isOnlineFrom(state: NetInfoState): boolean {
  if (state.isConnected === false) return false;
  // null = «ещё не проверяли». Считаем, что связь есть.
  return state.isInternetReachable !== false;
}

/** GET, не HEAD: на этот бэкенд HEAD то виснет на весь тайм-аут, то отдаёт
 *  405 (роут зарегистрирован только под GET) — обе реакции читались бы как
 *  «сети нет». */
async function isBackendReachable(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
  try {
    const res = await fetch(HEALTH_URL, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Полную синхронизацию не запускаем сразу при старте: в эти же секунды
 * первый экран грузит своё расписание, и тяжёлый bulk-ответ отбирал бы у него
 * канал (а на спящем Render — ещё и место в очереди). Пара секунд форы.
 */
const SYNC_START_DELAY_MS = 3_000;
/** Пауза после push перед синхронизацией: изменения часто приходят пачкой. */
const PUSH_SYNC_DELAY_MS = 5_000;

/** Короткая причина сбоя для человека: без неё «Не удалось обновить» ни о чём не говорит. */
function describeSyncError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.length > 80 ? `${msg.slice(0, 77)}...` : msg;
}

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
  /** Причина последней неудачной синхронизации (для карточки в Кабинете); '' — сбоя не было. */
  syncErrorText: string;
};

const SyncContext = createContext<SyncState>({
  lastSyncTime: null,
  isSyncing: false,
  syncProgress: '',
  isOnline: true,
  onlineAt: 0,
  offlineBannerText: '',
  triggerSync: async () => false,
  syncErrorText: '',
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
  const [syncErrorText, setSyncErrorText] = useState('');

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

  // Сырое мнение системы — может ошибаться (см. комментарий выше), поэтому
  // применяется напрямую только когда оно «онлайн»; «офлайн» ещё проверяется.
  const [nativeOnline, setNativeOnline] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => setNativeOnline(isOnlineFrom(state)));
    NetInfo.fetch().then(state => setNativeOnline(isOnlineFrom(state))).catch(() => null);
    return () => unsubscribe();
  }, []);

  // При возврате в приложение состояние сети могло измениться, пока оно спало.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state !== 'active') return;
      NetInfo.refresh().then(s => setNativeOnline(isOnlineFrom(s))).catch(() => null);
    });
    return () => sub.remove();
  }, []);

  // Система говорит «онлайн» — верим сразу, без лишнего запроса. Говорит
  // «офлайн» — не верим на слово (см. комментарий у isBackendReachable) и
  // спрашиваем сами; пока не отпустит, перепроверяем раз в HEALTH_RECHECK_INTERVAL_MS.
  useEffect(() => {
    if (nativeOnline) {
      applyState(true);
      return;
    }
    let cancelled = false;
    const check = async () => {
      const reachable = await isBackendReachable();
      if (!cancelled) applyState(reachable);
    };
    check();
    const timer = setInterval(check, HEALTH_RECHECK_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [nativeOnline, applyState]);

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
          if (!cancelled) { setLastSyncTime(new Date()); setSyncErrorText(''); }
        } catch (e) {
          // Сеть отвалилась посреди синхронизации — данные на устройстве целы
          if (!cancelled) setSyncErrorText(describeSyncError(e));
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
        if (!cancelled) { setLastSyncTime(new Date()); setSyncErrorText(''); }
      } catch (e) {
        // Связь опять пропала — попробуем в следующий раз
        if (!cancelled) setSyncErrorText(describeSyncError(e));
      } finally {
        isSyncingRef.current = false;
        if (!cancelled) { setIsSyncing(false); setSyncProgress(''); }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlineAt]);

  // Пришёл push об изменении расписания или о новой неделе — обновляем
  // офлайн-кэш сразу, не дожидаясь 4 часов (shouldResync). Иначе педагоги и
  // аудитории только что вышедшей недели появлялись бы на телефоне без сети
  // лишь к вечеру. Несколько push подряд — одна синхронизация (пауза 5 с).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const off = onScheduleUpdated(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        timer = null;
        if (!isOnlineRef.current || isSyncingRef.current) return;
        isSyncingRef.current = true;
        setIsSyncing(true);
        try {
          await performFullSync(msg => setSyncProgress(msg));
          setLastSyncTime(new Date());
          setSyncErrorText('');
        } catch (e) {
          setSyncErrorText(describeSyncError(e));
        } finally {
          isSyncingRef.current = false;
          setIsSyncing(false);
          setSyncProgress('');
        }
      }, PUSH_SYNC_DELAY_MS);
    });
    return () => { off(); if (timer) clearTimeout(timer); };
  }, []);

  // Ручная синхронизация — вызывается кнопкой в профиле.
  const triggerSync = useCallback(async (): Promise<boolean> => {
    if (isSyncingRef.current) return false;
    setIsSyncing(true);
    setSyncProgress('');
    try {
      clearApiCache(); // чтобы тянуть свежие данные, а не из кэша
      await performFullSync(msg => setSyncProgress(msg));
      setLastSyncTime(new Date());
      setSyncErrorText('');
      setOnlineAt(Date.now()); // подталкиваем экраны обновиться
      return true;
    } catch (e) {
      setSyncErrorText(describeSyncError(e));
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
    <SyncContext.Provider value={{ lastSyncTime, isSyncing, syncProgress, isOnline, onlineAt, offlineBannerText, triggerSync, syncErrorText }}>
      {children}
    </SyncContext.Provider>
  );
}
