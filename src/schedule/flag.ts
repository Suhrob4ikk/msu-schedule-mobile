/**
 * Флаг «Новый экран расписания» — переключатель в «Режиме разработчика»
 * (долгое нажатие на эту надпись в Кабинете). По умолчанию выключен: пока
 * владелец не скажет «оставляем», основным остаётся старый экран.
 *
 * Значение нужно сразу в двух местах — на экране расписания и в _layout
 * (своя шапка вместо общей), поэтому оно живёт здесь, с подпиской.
 */
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'new_schedule_screen';

let value: boolean | null = null;
const listeners = new Set<(v: boolean) => void>();

const loading = AsyncStorage.getItem(KEY)
  .then(v => { value = v === '1'; })
  .catch(() => { value = false; })
  .finally(() => listeners.forEach(l => l(value!)));

export async function setNewScheduleEnabled(on: boolean): Promise<void> {
  value = on;
  listeners.forEach(l => l(on));
  await AsyncStorage.setItem(KEY, on ? '1' : '0').catch(() => null);
}

/** null — ещё не прочитано из хранилища (доли секунды при запуске). */
export function useNewScheduleFlag(): boolean | null {
  const [v, setV] = useState<boolean | null>(value);
  useEffect(() => {
    listeners.add(setV);
    if (value !== null) setV(value);
    else loading.then(() => setV(value));
    return () => { listeners.delete(setV); };
  }, []);
  return v;
}
