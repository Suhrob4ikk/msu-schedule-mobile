/**
 * Достижения огонька — те же, что на сайте (frontend/src/lib/achievements.ts репозитория сайта; названия — черновик
 * владельца, менять в обоих местах). Получено ли и сколько уже сделано — считает сервер (`summary.achievements`).
 * Призы открываются достижениями: 21 день — Табло, 30 — Другой огонёк, 40 — Живое небо, 50 — Волна (бывшая «Живая рамка», 9 ноя 2026).
 */
import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

export type PrizeId = 'flip' | 'early' | 'final' | 'flame' | 'sky' | 'frame' | 'wrap';
export const PRIZE_NAMES: Record<PrizeId, string> = {
  flip: 'Табло', early: 'Ранний доступ', final: 'Финал недели', flame: 'Другой огонёк',
  sky: 'Живое небо', frame: 'Волна', wrap: 'Итоги семестра',
};

export interface AchDef {
  id: string;
  name: string;
  how: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  prize?: PrizeId;
  secret?: boolean;
}

export const ACHIEVEMENTS: AchDef[] = [
  { id: 'weeks3', name: 'Три недели', how: 'Открыть расписание в 21 день — не обязательно подряд', icon: 'flame-outline', prize: 'flip' },
  { id: 'early', name: 'Раньше звонка', how: 'Открыть расписание до 7:30 в пять разных дней', icon: 'sunny-outline' },
  { id: 'rooms', name: 'Ключ от аудитории', how: 'Заглядывать во вкладку «Аудитории» в пять разных дней', icon: 'key-outline' },
  { id: 'teacher', name: 'Кто ведёт?', how: 'Открыть расписание трёх преподавателей, которые ведут у разных групп, — и один из них должен вести у вашей', icon: 'school-outline' },
  { id: 'explorer', name: 'Следопыт', how: 'Побывать везде: Расписание, Педагоги, Аудитории, Изменения, Сравнение и Кабинет', icon: 'compass-outline', prize: 'early' },
  { id: 'share', name: 'Позвал своих', how: 'Поделиться ссылкой на расписание в три разных дня', icon: 'link-outline' },
  { id: 'names', name: 'Летописец', how: 'Помочь узнать полные имена трёх преподавателей — ответить в опросе на сайте', icon: 'create-outline', prize: 'final' },
  { id: 'd50', name: 'Месяц с расписанием', how: 'Открыть расписание в 30 дней — не обязательно подряд', icon: 'calendar-outline', prize: 'flame' },
  { id: 'd75', name: 'Небо над Душанбе', how: 'Открыть расписание в 40 дней — не обязательно подряд', icon: 'partly-sunny-outline', prize: 'sky' },
  { id: 'd100', name: 'Полсотни', how: 'Открыть расписание в 50 дней — не обязательно подряд', icon: 'trophy-outline', prize: 'frame' },
  { id: 'term', name: 'До сессии', how: 'В первый день сессии огонёк горит, и серия — не меньше 21 дня', icon: 'flag-outline', prize: 'wrap' },
  { id: 'zero', name: 'Нулевая пара', how: 'Открыть расписание ровно в полночь', icon: 'moon-outline', secret: true },
];

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export const fmtDay = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
