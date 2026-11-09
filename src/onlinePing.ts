/**
 * «В сети» для панели /dev (9 ноя 2026, как на сайте — components/OnlinePing.tsx): пока приложение открыто на экране,
 * раз в минуту сигнал POST /user/ping. Сервер держит его только в памяти. В фоне сигнал не шлётся.
 * Подключено в app/_layout.tsx.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { API_BASE } from './api';

const EVERY_MS = 60_000;

export function useOnlinePing(): void {
  useEffect(() => {
    let last = 0;
    const ping = async () => {
      if (AppState.currentState !== 'active') return;
      const now = Date.now();
      if (now - last < EVERY_MS - 5_000) return;
      try {
        const [[, dev], [, gid]] = await AsyncStorage.multiGet(['msu_device_id', 'selected_group_id']);
        if (!dev || !gid) return;
        last = now;
        await fetch(`${API_BASE}/user/ping`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ device_id: dev }) });
      } catch { /* нет сети — в следующий раз */ }
    };
    const first = setTimeout(() => void ping(), 3000);
    const id = setInterval(() => void ping(), EVERY_MS);
    const sub = AppState.addEventListener('change', s => { if (s === 'active') void ping(); });
    return () => { clearTimeout(first); clearInterval(id); sub.remove(); };
  }, []);
}
