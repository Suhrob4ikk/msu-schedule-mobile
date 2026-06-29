import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { performFullSync, getLastSyncTime, shouldResync, formatSyncTime } from './syncService';

const API_PING = 'https://msu-schedule-backend-production.up.railway.app/api/schedule/groups';
const PING_TIMEOUT_MS = 4000;
const POLL_INTERVAL_MS = 15_000;

async function ping(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
    const res = await fetch(API_PING, { signal: controller.signal, cache: 'no-store' });
    clearTimeout(id);
    return res.ok;
  } catch {
    return false;
  }
}

type SyncState = {
  lastSyncTime: Date | null;
  isSyncing: boolean;
  syncProgress: string;
  isOnline: boolean;
  /** Increments every time we transition offline → online. Use in useEffect deps. */
  onlineAt: number;
  offlineBannerText: string;
};

const SyncContext = createContext<SyncState>({
  lastSyncTime: null,
  isSyncing: false,
  syncProgress: '',
  isOnline: true,
  onlineAt: 0,
  offlineBannerText: '',
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

  const checkOnline = useCallback(async () => {
    const online = await ping();
    const wasOnline = isOnlineRef.current;
    isOnlineRef.current = online;
    setIsOnline(online);
    if (!wasOnline && online) {
      // Just went online — signal screens to re-fetch
      setOnlineAt(Date.now());
    }
  }, []);

  // Poll every 15 seconds
  useEffect(() => {
    checkOnline(); // initial check
    const id = setInterval(checkOnline, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [checkOnline]);

  // Also check when app comes to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') checkOnline();
    });
    return () => sub.remove();
  }, [checkOnline]);

  // Full sync on start if needed
  useEffect(() => {
    if (syncStarted.current) return;
    syncStarted.current = true;

    (async () => {
      const last = await getLastSyncTime();
      setLastSyncTime(last);
      if (!shouldResync(last)) return;

      setIsSyncing(true);
      try {
        await performFullSync(msg => setSyncProgress(msg));
        const now = new Date();
        setLastSyncTime(now);
      } catch {
        // Offline at startup — that's fine
      } finally {
        setIsSyncing(false);
        setSyncProgress('');
      }
    })();
  }, []);

  const offlineBannerText = lastSyncTime
    ? `Офлайн · данные от ${formatSyncTime(lastSyncTime)}`
    : 'Офлайн · нет сохранённых данных';

  return (
    <SyncContext.Provider value={{ lastSyncTime, isSyncing, syncProgress, isOnline, onlineAt, offlineBannerText }}>
      {children}
    </SyncContext.Provider>
  );
}
