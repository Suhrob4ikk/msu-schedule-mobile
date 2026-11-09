/**
 * «Написать разработчику» — как на сайте (frontend/src/lib/devMessages.ts в репозитории сайта, 11 окт 2026):
 * вопрос, ошибка или идея без Telegram владельца. Сервер — backend/app/services/dev_messages.py: сообщение
 * привязано к устройству (msu_device_id регистрации), ответ владелец пишет в панели /dev, он приходит push-ом
 * (kind «dev-reply») и баннером «Ответ разработчика» (DevReplyToast).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE } from './api';

/** Сообщение переписки: своё или разработчика (`from_dev`), по порядку. `edited` — разработчик исправил текст. */
export type DevMessage = {
  id: number;
  text: string;
  from_dev: boolean;
  anonymous: boolean;
  created_at: string | null;
  edited: boolean;
};

export type UnreadInfo = { unread: number; id?: number; text?: string };

export const MAX_LEN = 2000;

/** Устройство, если человек уже выбрал группу (без регистрации сервер сообщение не примет). */
export async function myDeviceId(): Promise<string> {
  try {
    const [[, dev], [, gid]] = await AsyncStorage.multiGet(['msu_device_id', 'selected_group_id']);
    return dev && gid ? dev : '';
  } catch { return ''; }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 20_000);
  try {
    const r = await fetch(`${API_BASE}${path}`, { ...init, signal: ctl.signal });
    if (!r.ok) {
      let text = 'Не удалось отправить — проверьте интернет';
      try { const j = await r.json(); if (typeof j.detail === 'string') text = j.detail; } catch { /* не JSON */ }
      throw new Error(text);
    }
    return (await r.json()) as T;
  } catch (e) {
    if (e instanceof Error && e.name !== 'AbortError' && !/Network request failed/.test(e.message)) throw e;
    throw new Error('Не удалось отправить — проверьте интернет');
  } finally {
    clearTimeout(t);
  }
}

const post = (body: unknown): RequestInit => ({
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

export const loadMessages = (device: string) =>
  call<DevMessage[]>(`/user/messages?device_id=${encodeURIComponent(device)}`);

export const sendMessage = (device: string, text: string, anonymous: boolean) =>
  call<DevMessage>('/user/messages', post({ device_id: device, text, anonymous }));

/** Сколько ответов не прочитано и текст последнего — сервер держит это в памяти, базу не будит. */
export const unreadInfo = (device: string) =>
  call<UnreadInfo>(`/user/messages/unread?device_id=${encodeURIComponent(device)}`).catch((): UnreadInfo => ({ unread: 0 }));

export const markRepliesSeen = (device: string) =>
  call<{ ok: boolean }>('/user/messages/seen', post({ device_id: device })).catch(() => null);

/** Ответ, баннер о котором уже показан или закрыт, — «id:начало текста» (как на сайте). */
export const REPLY_BANNER_KEY = 'dev_reply_banner';

/** «Ждёт ответа» — под последним своим сообщением, если после него разработчик ещё не писал.
 *  Анонимные — своя переписка: ответ на вопрос с именем не отвечает анонимному. */
export function waiting(list: DevMessage[], i: number): boolean {
  const m = list[i];
  if (m.from_dev) return false;
  return !list.slice(i + 1).some(n => n.anonymous === m.anonymous);
}

/** Время сервера — UTC без «Z». */
export function parseServerTime(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(s) ? s : s + 'Z');
  return isNaN(+d) ? null : d;
}

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const pad = (n: number) => String(n).padStart(2, '0');

/** «14:05» сегодня, иначе «8 ноя, 14:05» (Hermes не везде знает ru-RU — собираем сами). */
export function fmtMessageTime(d: Date | null): string {
  if (!d) return '';
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (d.toDateString() === new Date().toDateString()) return time;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${time}`;
}

// Пришёл push с ответом — открытый экран переписки и баннер перечитывают себя
const listeners = new Set<() => void>();
export function onDevReply(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function emitDevReply(): void { listeners.forEach(fn => fn()); }
