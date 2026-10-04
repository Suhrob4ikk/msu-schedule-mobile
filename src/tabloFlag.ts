/**
 * Флаг «Новые экраны «Табло»» — переключатель в «Режиме разработчика»
 * (долгое нажатие на эту надпись в Кабинете). Сейчас включает новую вкладку
 * «Аудитории» (src/rooms/); Расписание «Табло» уже основное и от флага не
 * зависит. По умолчанию выключен, пока владелец не скажет «оставляем».
 *
 * Значение нужно сразу в двух местах — на экране и в _layout (своя шапка
 * вместо общей), поэтому оно живёт здесь, с подпиской.
 */
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'tablo_screens';

let value: boolean | null = null;
const listeners = new Set<(v: boolean) => void>();

const loading = AsyncStorage.getItem(KEY)
  .then(v => { value = v === '1'; })
  .catch(() => { value = false; })
  .finally(() => listeners.forEach(l => l(value!)));

export async function setTabloEnabled(on: boolean): Promise<void> {
  value = on;
  listeners.forEach(l => l(on));
  await AsyncStorage.setItem(KEY, on ? '1' : '0').catch(() => null);
}

/** null — ещё не прочитано из хранилища (доли секунды при запуске). */
export function useTabloFlag(): boolean | null {
  const [v, setV] = useState<boolean | null>(value);
  useEffect(() => {
    listeners.add(setV);
    if (value !== null) setV(value);
    else loading.then(() => setV(value));
    return () => { listeners.delete(setV); };
  }, []);
  return v;
}
