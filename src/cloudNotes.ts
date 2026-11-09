/**
 * Заметки в облаке (9 ноя 2026) — награда огонька за 7 дней с заходом, как на сайте (frontend/src/lib/cloudNotes.ts).
 * Сервер — backend/app/services/cloud_notes.py, POST /user/notes/sync.
 *
 * Заметки по-прежнему лежат в AsyncStorage (ключи — src/studyData.ts, общие с сайтом). Синхронизация сравнивает их с
 * тем, что было при прошлой синхронизации (`notes_synced`): изменённые и стёртые здесь уходят на сервер, остальное
 * берётся с сервера (заметки с других связанных устройств; стёртые там — пустой строкой). Пока 7 дней не набрано,
 * сервер отвечает `allowed: false` — заметки остаются только на телефоне, как раньше.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { useEffect, useState } from 'react';
import { API_BASE } from './api';

const SNAP_KEY = 'notes_synced';
const STATE_KEY = 'notes_cloud';
const MIN_GAP_MS = 10 * 60_000;

export type CloudNotesState = { allowed: boolean; total: number; need: number; at: number };

const isNoteKey = (k: string) => k.startsWith('note2_') || k.startsWith('noted_');

// Пришли правки с другого устройства — расписание и открытая пара перечитывают заметки
const listeners = new Set<() => void>();
export function onNotesSynced(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }

async function readLocal(): Promise<Record<string, string>> {
  const keys = (await AsyncStorage.getAllKeys()).filter(isNoteKey);
  const out: Record<string, string> = {};
  for (const [k, v] of await AsyncStorage.multiGet(keys)) out[k] = v ?? '';
  return out;
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try { const v = await AsyncStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}

export const cloudNotesState = () => readJson<CloudNotesState | null>(STATE_KEY, null);

let running: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

export function syncNotes(force = false): Promise<void> {
  if (running) return running;
  running = (async () => {
    try {
      const [[, device], [, gid], [, on]] = await AsyncStorage.multiGet(['msu_device_id', 'selected_group_id', 'feature_notes']);
      if (!device || !gid || on !== '1') return;           // заметки не включены — синхронизировать нечего
      const st = await cloudNotesState();
      if (!force && st && Date.now() - st.at < MIN_GAP_MS) return;
      const local = await readLocal();
      const snap = await readJson<Record<string, string>>(SNAP_KEY, {});
      const changes: Record<string, string> = {};
      for (const [k, t] of Object.entries(local)) if (snap[k] !== t) changes[k] = t;
      for (const k of Object.keys(snap)) if (!(k in local)) changes[k] = '';
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 20_000);
      const r = await fetch(`${API_BASE}/user/notes/sync`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctl.signal,
        body: JSON.stringify({ device_id: device, changes: st?.allowed ? changes : {} }),
      }).finally(() => clearTimeout(t));
      if (!r.ok) return;
      const res: { allowed: boolean; total: number; need: number; notes?: Record<string, string> } = await r.json();
      if (res.allowed && !st?.allowed && Object.keys(changes).length) {
        // только что открылось: первый раз отправляем всё, что есть на телефоне
        await AsyncStorage.setItem(STATE_KEY, JSON.stringify({ allowed: true, total: res.total, need: res.need, at: 0 }));
        running = null;
        return syncNotes(true);
      }
      await AsyncStorage.setItem(STATE_KEY, JSON.stringify({ allowed: res.allowed, total: res.total, need: res.need, at: Date.now() }));
      if (!res.allowed || !res.notes) { listeners.forEach(f => f()); return; }
      const set: [string, string][] = [];
      const del: string[] = [];
      for (const [k, txt] of Object.entries(res.notes)) {
        if (!isNoteKey(k) || k in changes) continue;          // своё только что отправили
        if (txt && local[k] !== txt) set.push([k, txt]);
        else if (!txt && k in local) del.push(k);
      }
      if (set.length) await AsyncStorage.multiSet(set);
      if (del.length) await AsyncStorage.multiRemove(del);
      await AsyncStorage.setItem(SNAP_KEY, JSON.stringify(await readLocal()));
      listeners.forEach(f => f());
    } catch { /* нет сети — в следующий раз */ }
  })().finally(() => { running = null; });
  return running;
}

/** Заметку поменяли — отправить через 4 секунды (пока печатают, сервер не дёргаем). */
export function scheduleNotesSync(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    cloudNotesState().then(st => { if (st?.allowed) void syncNotes(true); }).catch(() => null);
  }, 4000);
}

/** Запуск: через 6 с после старта и при возврате в приложение (не чаще раза в 10 минут). Зовётся из app/_layout.tsx. */
export function useCloudNotesSync(): void {
  useEffect(() => {
    const t = setTimeout(() => void syncNotes(), 6000);
    const sub = AppState.addEventListener('change', s => { if (s === 'active') void syncNotes(); });
    return () => { clearTimeout(t); sub.remove(); };
  }, []);
}

/** Открыты ли заметки в облаке — для подписи в Кабинете. */
export function useNotesCloud(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const read = () => { cloudNotesState().then(st => setOn(!!st?.allowed)).catch(() => null); };
    read();
    return onNotesSynced(read);
  }, []);
  return on;
}
