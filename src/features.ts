import AsyncStorage from '@react-native-async-storage/async-storage';

// Автооткрытие функций «Посещаемость» и «Заметки к парам».
// Проверка по дате устройства: 1 сентября 2026 функции откроются сами,
// без обновления приложения. Значение совпадает с веб (lib/features.ts).
export const FEATURES_UNLOCK_AT = new Date('2026-09-01T00:00:00');

export const featuresUnlocked = (): boolean =>
  Date.now() >= FEATURES_UNLOCK_AT.getTime();

/** Сколько полных дней осталось до открытия (для отсчёта в кабинете). */
export const daysUntilUnlock = (): number =>
  Math.max(0, Math.ceil((FEATURES_UNLOCK_AT.getTime() - Date.now()) / 86_400_000));

/* ─────────────────────────────────────────────────────────────────────────
   Смена учебного года
   Группа в базе — это связка «направление + курс», и строка эта из года в
   год одна и та же: 1 сентября в «ПМиИ · 1 курс» оказываются пары новых
   первокурсников. Значит у всех, кто выбрал группу в прошлом учебном году,
   сохранён курс на единицу меньше нужного — и расписание они увидят чужое,
   ничего при этом не заподозрив. Поэтому один раз просим проверить курс.
   Та же логика на сайте (lib/features.ts).
   ───────────────────────────────────────────────────────────────────────── */

/** Начало учебного года — с этого момента курс у всех сдвинулся.
 *
 * 2027, а не 2026: к сентябрю 2026 приложением ещё никто не пользовался
 * прошлый учебный год, у всех курс заведомо свежий, и подсказка была бы
 * пустым беспокойством. Сдвигать эту дату на год вперёд — ежегодная ручная
 * работа; забудете — подсказка просто не появится, чужого расписания это не
 * покажет. */
export const NEW_YEAR_AT = new Date('2027-09-01T00:00:00');

/** Когда пользователь выбрал группу (ставится при сохранении). */
export const GROUP_CHOSEN_AT_KEY = 'group_chosen_at';
/** Что подсказку уже показали и закрыли. */
export const COURSE_CHECK_DISMISSED_KEY = 'course_check_dismissed';

/** Запомнить момент выбора группы — чтобы не спрашивать новичков. */
export async function markGroupChosen(): Promise<void> {
  await AsyncStorage.setItem(GROUP_CHOSEN_AT_KEY, new Date().toISOString());
}

/**
 * Пора ли попросить проверить курс.
 *
 * Спрашиваем только тех, кто выбирал группу ДО начала учебного года: у
 * новичков, поставивших приложение в сентябре, курс заведомо верный.
 * Отсутствие отметки = выбирал давно, до того как мы начали её ставить.
 */
export async function shouldAskCourseCheck(): Promise<boolean> {
  if (Date.now() < NEW_YEAR_AT.getTime()) return false;
  if ((await AsyncStorage.getItem(COURSE_CHECK_DISMISSED_KEY)) === '1') return false;
  const chosenAt = await AsyncStorage.getItem(GROUP_CHOSEN_AT_KEY);
  if (!chosenAt) return true;
  return new Date(chosenAt).getTime() < NEW_YEAR_AT.getTime();
}
