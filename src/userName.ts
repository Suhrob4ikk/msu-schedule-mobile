/**
 * Имя пользователя (ключ `user_name`). Обязательно, как на сайте: пустым его
 * не сохранить ни на первом входе, ни в Кабинете; у кого оно пустое с прежних
 * версий — при запуске спросим (app/_layout.tsx, NameRequiredScreen).
 *
 * Где показывается: приветствие в Расписании, напоминания о парах и зачётах,
 * карточка Кабинета. На сервер уходит при регистрации (панель разработчика).
 */
import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const NAME_KEY = 'user_name';
/** Как на сайте (maxLength у поля «Как вас зовут»). */
export const NAME_MAX = 60;
export const NAME_REQUIRED_HINT = 'Введите имя, чтобы открыть расписание';

export const nameOk = (name: string | null | undefined) => !!name && name.trim().length > 0;

/** Обращение — первое слово: «Сухроб Давлатов» → «Сухроб». */
export function firstName(name: string | null | undefined): string {
  return (name ?? '').trim().split(/\s+/)[0] ?? '';
}

let current: string | null = null;
const subs = new Set<() => void>();

export async function getUserName(): Promise<string> {
  if (current == null) current = (await AsyncStorage.getItem(NAME_KEY).catch(() => null)) ?? '';
  return current;
}

/** Сохранить имя: пустое не сохраняется (возвращает false). */
export async function setUserName(name: string): Promise<boolean> {
  const v = name.trim().slice(0, NAME_MAX);
  if (!v) return false;
  await AsyncStorage.setItem(NAME_KEY, v);
  current = v;
  subs.forEach(fn => fn());
  return true;
}

function subscribe(fn: () => void) {
  subs.add(fn);
  if (current == null) getUserName().then(() => fn());
  return () => { subs.delete(fn); };
}

/** Имя для экрана; '' — пока не прочитано или не задано. */
export function useUserName(): string {
  return useSyncExternalStore(subscribe, () => current ?? '');
}
