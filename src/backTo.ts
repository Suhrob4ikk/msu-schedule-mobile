/**
 * «Назад туда, откуда пришли» между вкладками. Вкладки сами так не умеют:
 * системная «Назад» с любой вкладки ведёт в «Расписание». Общую настройку
 * вкладок (backBehavior) не трогаем — она поменяла бы «Назад» везде.
 *
 * Экран, на который перешли с отметкой «вернуться» (параметр back), вызывает
 * arm(путь). Пока он в фокусе, «Назад» ведёт по этому пути; отметка гаснет,
 * как только человек ушёл с вкладки, и после одного использования. Без
 * отметки «Назад» работает как раньше. Так же устроен «Внешний вид».
 */
import { useCallback, useEffect, useRef } from 'react';
import { BackHandler } from 'react-native';
import { router, useFocusEffect, useNavigation } from 'expo-router';

export type BackTarget = '/teachers' | '/';

export function useBackTo(): (to: BackTarget) => void {
  const target = useRef<BackTarget | null>(null);
  const navigation = useNavigation();

  useEffect(() => navigation.addListener('blur', () => { target.current = null; }), [navigation]);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        const to = target.current;
        if (!to) return false;
        target.current = null;
        router.navigate(to);
        return true;
      });
      return () => sub.remove();
    }, []),
  );

  return useCallback((to: BackTarget) => { target.current = to; }, []);
}
