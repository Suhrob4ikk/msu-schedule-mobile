/**
 * Переходы «Уведомлений» и «Истории». Оба экрана — скрытые вкладки поверх
 * текущей (ТЗ: «стек»): внизу подсвечена вкладка, из которой их открыли,
 * «Назад» возвращает туда же. История, открытая из Уведомлений, возвращает
 * в Уведомления.
 */
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';

export type TabPath = '/' | '/teachers' | '/rooms' | '/profile';
export type OverlayPath = '/notifications' | '/changes';

let origin: TabPath = '/';
let historyBack: TabPath | '/notifications' = '/profile';
/** Растёт при каждом открытии Уведомлений «с нуля» — экран сбрасывает фильтр на «Все». */
let openSeq = 0;

/** Вкладка, к которой относится путь; null — это сами Уведомления или История. */
export function tabOf(path: string): TabPath | null {
  if (path === '/' || path === '/index') return '/';
  if (path === '/teachers' || path === '/rooms' || path === '/profile') return path;
  if (path === '/appearance' || path === '/compare') return '/profile';
  return null;
}

export const isOverlay = (path: string) => path === '/notifications' || path === '/changes';
export const overlayOrigin = () => origin;
export const notificationsOpenSeq = () => openSeq;

export function openNotifications(from: string) {
  const t = tabOf(from);
  if (t) origin = t;
  openSeq += 1;
  router.navigate('/notifications');
}

export function openHistory(from: string) {
  const t = tabOf(from);
  if (t) { origin = t; historyBack = t; } else if (from === '/notifications') historyBack = '/notifications';
  router.navigate('/changes');
}

export const backFromNotifications = () => router.navigate(origin);
export const backFromHistory = () => router.navigate(historyBack);

/**
 * Строка → «Расписание» этой группы на этом дне; пара открывается листом.
 * back — системная «Назад» на Расписании вернёт сюда (src/backTo.ts).
 */
export function openInSchedule(p: {
  group: number; weekStart?: string | null; date?: string | null; pair?: string | null; back: 'notifications' | 'changes';
}) {
  Haptics.selectionAsync();
  router.navigate({
    pathname: '/',
    params: {
      group: String(p.group), week_start: p.weekStart ?? '', date: p.date ?? '', pair: p.pair ?? '', back: p.back,
    },
  });
}
