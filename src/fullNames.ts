/**
 * Полные имена преподавателей и опрос студентов (с 2.0.5; на сайте — с 8 окт 2026,
 * frontend/src/lib/fullNames.ts, сервер — backend/app/services/full_names.py).
 *
 * Решения владельца:
 * - в расписании «Джумаев Э.Х.» остаётся, полное имя раскрывается стрелкой — каждый раз
 *   заново, ничего не запоминается;
 * - своё имя — на буквы инициалов («Э.Х.» → «Э…», «Х…»), окончания не проверяем;
 * - ответа «Не знаю» нет — не знаешь, жмёшь крестик (скрыто на неделю, только на телефоне).
 *
 * Список имён кладём ещё и на диск (cache_full_names) — без сети имена остаются.
 */
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, type FullNamesData } from './api';

const CACHE_KEY = 'cache_full_names';
const ANSWERED_KEY = 'fn_answered';   // { teacher: "voted" | "pending" }
const HIDDEN_KEY = 'fn_hidden';       // { teacher: ISO-дата, до которой не показывать }
const HIDE_DAYS = 7;

// ── данные ────────────────────────────────────────────────────────────────
let _data: FullNamesData | null = null;
const _subs = new Set<(d: FullNamesData) => void>();

function publish(d: FullNamesData) {
  _data = d;
  _subs.forEach(f => f(d));
}

/** С диска сразу, с сервера следом. Нет сети — то, что было. */
export function useFullNames(): FullNamesData | null {
  const [data, setData] = useState<FullNamesData | null>(_data);
  useEffect(() => {
    _subs.add(setData);
    if (!_data) {
      AsyncStorage.getItem(CACHE_KEY).then(s => {
        if (s && !_data) { try { publish(JSON.parse(s)); } catch { /* битый кэш */ } }
      }).catch(() => {});
    }
    refreshFullNames();
    return () => { _subs.delete(setData); };
  }, []);
  return data;
}

/** Перечитать с сервера (после ответа в опросе — тоже). */
export function refreshFullNames(): Promise<void> {
  return api.getFullNames().then(d => {
    publish(d);
    AsyncStorage.setItem(CACHE_KEY, JSON.stringify(d)).catch(() => {});
  }).catch(() => { /* нет сети — без изменений */ });
}

// ── имена ─────────────────────────────────────────────────────────────────
const SHORT_RE = /^(.*?)\s+((?:[А-ЯЁ][а-яё]?\.\s*)+)$/;

/** «Одинабеков Дж.М.» → ["Дж", "М"] */
export function initialsOf(short: string): string[] {
  const m = short.trim().match(SHORT_RE);
  return m ? m[2].match(/[А-ЯЁ][а-яё]?/g) ?? [] : [];
}

/** Настоящие ФИО по отдельности: «Балхова С.Я., Собко В.И.» → два человека. Коды кафедр — мимо. */
export function personsOf(name: string | null | undefined): string[] {
  return (name ?? '').split(',').map(p => p.trim()).filter(p => /[А-ЯЁ][а-яё]?\./.test(p));
}

/** Имя целиком: составное — по частям, где полного имени нет — как было. */
export function expandName(name: string, data: FullNamesData | null): string {
  if (!data) return name;
  return name.split(',').map(p => p.trim()).map(p => data.names[p] ?? p).join(', ');
}

export function hasFullName(name: string, data: FullNamesData | null): boolean {
  return !!data && personsOf(name).some(p => data.names[p]);
}

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е');

export function tidyName(text: string): string {
  return text.trim().replace(/\s+/g, ' ').split(' ').filter(Boolean)
    .map(w => w.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join('-'))
    .join(' ');
}

/** Та же проверка, что на сервере (check_proposal): null — подходит, иначе подсказка. */
export function proposalError(short: string, text: string): string | null {
  const value = tidyName(text);
  if (!value) return '';
  if (value.length > 60) return 'Слишком длинно';
  if (/[^А-Яа-яЁё\- ]/.test(value)) return 'Только русские буквы';
  const ini = initialsOf(short);
  const words = value.split(' ');
  if (!ini.length) return null;
  if (words.length < ini.length) return ini.length > 1 ? 'Впишите имя и отчество' : 'Впишите имя';
  for (let i = 0; i < ini.length; i++) {
    if (!norm(words[i]).startsWith(norm(ini[i]))) {
      return `${i === 0 ? 'Имя' : 'Отчество'} должно начинаться на «${ini[i]}» — как в «${ini.join('.')}.»`;
    }
  }
  return null;
}

// ── что уже ответил и что спрятал (только на телефоне) ────────────────────
async function readMap(key: string): Promise<Record<string, string>> {
  try { return JSON.parse((await AsyncStorage.getItem(key)) || '{}') ?? {}; } catch { return {}; }
}
async function writeMap(key: string, m: Record<string, string>): Promise<void> {
  try { await AsyncStorage.setItem(key, JSON.stringify(m)); } catch { /* хранилище недоступно */ }
}

export type Answer = 'voted' | 'pending';

export async function answerOf(teacher: string): Promise<Answer | null> {
  const a = (await readMap(ANSWERED_KEY))[teacher];
  return a === 'voted' || a === 'pending' ? a : null;
}
export async function rememberAnswer(teacher: string, a: Answer | null): Promise<void> {
  const m = await readMap(ANSWERED_KEY);
  if (a) m[teacher] = a; else delete m[teacher];
  await writeMap(ANSWERED_KEY, m);
}

export async function isHidden(teacher: string): Promise<boolean> {
  const until = (await readMap(HIDDEN_KEY))[teacher];
  return !!until && new Date(until) > new Date();
}
export async function hideFor(teacher: string): Promise<void> {
  const m = await readMap(HIDDEN_KEY);
  m[teacher] = new Date(Date.now() + HIDE_DAYS * 86_400_000).toISOString();
  await writeMap(HIDDEN_KEY, m);
}

export async function myDeviceId(): Promise<string | null> {
  try { return await AsyncStorage.getItem('msu_device_id'); } catch { return null; }
}

export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}
