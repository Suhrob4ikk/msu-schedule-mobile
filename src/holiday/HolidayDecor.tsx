/**
 * Праздничное оформление вокруг расписания — части для экранов (рисунки — src/holiday/decor.ts, как на сайте):
 * фон экрана (`HolidayBackdrop`), гирлянда под шапкой (`HolidayGarland`), украшение над нижним меню
 * (`HolidayNavDeco`), шапочка над активной вкладкой (`HolidayHat`), орнамент у дня недели (`HolidayOrn`),
 * иней в нижних углах карточки «Следующая пара» (`HolidayFrost`). Нажатия не ловят. Без праздника — ничего.
 */
import { memo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useTokens } from '../schedule/tokens';
import { useHoliday } from './holidays';
import { decorFor, frostSvg, type Decor } from './decor';

/** Оформление текущего праздника для текущей темы; null — праздника нет (или выключен во «Внешнем виде»). */
export function useDecor(): Decor | null {
  const { holiday } = useHoliday();
  const k = useTokens();
  return holiday ? decorFor(holiday.scene, k.mode !== 'light') : null;
}

/** Фон экрана — первым ребёнком корневого View экрана. */
export const HolidayBackdrop = memo(function HolidayBackdrop() {
  const d = useDecor();
  if (!d) return null;
  return <LinearGradient pointerEvents="none" colors={d.bg.colors} locations={d.bg.locations} style={StyleSheet.absoluteFill} />;
});

/** Полоса из повторяющихся кусков по 360 dp (как background repeat-x на сайте): лампочки не растягиваются. */
function Strip({ xml, height }: { xml: string; height: number }) {
  const { width } = useWindowDimensions();
  const n = Math.ceil(width / 360) + 1;
  return (
    <View style={{ flexDirection: 'row', height, overflow: 'hidden' }}>
      {Array.from({ length: n }, (_, i) => <SvgXml key={i} xml={xml} width={360} height={height} />)}
    </View>
  );
}

/** Гирлянда — в самом низу шапки, свисает на 18 dp ниже неё (родитель — шапка, position relative). */
export const HolidayGarland = memo(function HolidayGarland() {
  const d = useDecor();
  if (!d) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: -18, height: 24, zIndex: 5, elevation: 5 }}>
      <Strip xml={d.gar} height={24} />
    </View>
  );
});

/** Сугроб / трава / лента над нижним меню. bottom — высота меню. */
export const HolidayNavDeco = memo(function HolidayNavDeco({ bottom }: { bottom: number }) {
  const d = useDecor();
  if (!d) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: bottom - 1, height: 26, zIndex: 30, elevation: 30 }}>
      <Strip xml={d.nav} height={26} />
    </View>
  );
});

/** Шапочка (или цветок, звезда…) над значком активной вкладки — кладётся рядом со значком. */
export function HolidayHat() {
  const d = useDecor();
  if (!d) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: -7, left: 12, width: 22, height: 18 }}>
      <SvgXml xml={d.hat} width={22} height={18} />
    </View>
  );
}

/** Орнамент по бокам названия дня (размер — от шрифта названия). */
export function HolidayOrn({ size }: { size: number }) {
  const d = useDecor();
  if (!d) return null;
  return <SvgXml xml={d.orn} width={size} height={size} style={{ marginHorizontal: size * 0.42 }} />;
}

/** Новый год: иней в нижних углах карточки «Следующая пара» — первым ребёнком карточки. */
export function HolidayFrost({ radius }: { radius: number }) {
  const { holiday } = useHoliday();
  const k = useTokens();
  if (holiday?.scene !== 'ny') return null;
  const dark = k.mode !== 'light';
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}>
      <SvgXml xml={frostSvg(dark)} width={70} height={70} style={{ position: 'absolute', left: 0, bottom: 0 }} />
      <SvgXml xml={frostSvg(dark, true)} width={70} height={70} style={{ position: 'absolute', right: 0, bottom: 0 }} />
    </View>
  );
}
