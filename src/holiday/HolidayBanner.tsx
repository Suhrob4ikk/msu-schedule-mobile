/**
 * Праздничная открытка сверху Расписания (src/holiday/holidays.ts) — как на сайте: нарисованная сцена,
 * гирлянда, поздравление. Нажатие — салют/конфетти по всему экрану (HolidayParticles), × — убрать до
 * конца дня. «31 декабря» — отсчёт до полуночи, в ноль — салют. В тестовом режиме вместо × — «тест · выкл.».
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { askBurst, dushanbeNow, isoOf, setTestHoliday, useHoliday } from './holidays';
import { garlandSvg, sceneSvg, SCENE_BG } from './scenes';
import { FONT } from '../schedule/tokens';

const HIDDEN_KEY = 'holiday_hidden';
const H = 172;

/** Флаг Таджикистана на флагштоке сцены «indep» — на сайте он колышется (canvas), здесь — с изгибом ткани. */
const FLAG = '<g transform="translate(73 40)"><path d="M0 0 C40 -6 90 8 150 0 L150 26 C90 34 40 20 0 26Z" fill="#cc0000"/>' +
  '<path d="M0 26 C40 20 90 34 150 26 L150 64 C90 72 40 58 0 64Z" fill="#ffffff"/><path d="M0 64 C40 58 90 72 150 64 L150 90 C90 98 40 84 0 90Z" fill="#006600"/>' +
  '<path d="M61 53 L65 43 L70 49 L75 39 L80 49 L85 43 L89 53Z M61 53 h28 v3 h-28Z" fill="#f8c300"/>' +
  [0, 1, 2, 3, 4, 5, 6].map(i => { const a = Math.PI + (i / 6) * Math.PI; return `<circle cx="${(75 + Math.cos(a) * 21).toFixed(1)}" cy="${(47 + Math.sin(a) * 13).toFixed(1)}" r="1.9" fill="#f8c300"/>`; }).join('') +
  '<path d="M0 0 C40 -6 90 8 150 0 L150 90 C90 98 40 84 0 90Z" fill="#000" opacity=".08"/></g>';

function secondsToMidnight(): number {
  const d = dushanbeNow();
  return 24 * 3600 - (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds());
}

export default function HolidayBanner() {
  const { holiday: h, test } = useHoliday();
  const [hidden, setHidden] = useState(false);
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    setLeft(h?.id === 'nye' ? secondsToMidnight() : null);
    if (!h || test) { setHidden(false); return; }
    AsyncStorage.getItem(HIDDEN_KEY).then(v => setHidden(v === `${h.id}|${isoOf(dushanbeNow())}`)).catch(() => {});
  }, [h, test]);

  useEffect(() => {
    if (left === null) return;
    if (left <= 0) { askBurst('both'); return; }
    const id = setTimeout(() => setLeft(l => (l === null ? null : l - 1)), 1000);
    return () => clearTimeout(id);
  }, [left]);

  const xml = useMemo(() => {
    if (!h) return '';
    const s = sceneSvg(h.scene);
    return h.scene === 'indep' ? s.replace('</svg>', FLAG + '</svg>') : s;
  }, [h]);

  if (!h || hidden) return null;
  const midnight = h.id === 'nye' && left !== null && left <= 0;
  const hh = left !== null ? Math.floor(left / 3600) : 0, mm = left !== null ? Math.floor((left % 3600) / 60) : 0, ss = left !== null ? left % 60 : 0;
  const shadow = { textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 };

  return (
    <Pressable
      onPress={() => askBurst(h.burst ?? (h.fx === 'snow' ? 'confetti' : undefined))}
      accessibilityRole="button"
      accessibilityLabel={`${h.title}. ${h.sub}`}
      style={{ height: H, borderRadius: 24, overflow: 'hidden', marginHorizontal: 16, marginTop: 4, marginBottom: 8, backgroundColor: SCENE_BG[h.scene] }}
    >
      <SvgXml xml={xml} width="100%" height="100%" style={{ position: 'absolute' }} />
      {h.garland && <SvgXml xml={garlandSvg()} width="100%" height={36} style={{ position: 'absolute', top: 0 }} />}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 90, backgroundColor: 'rgba(0,0,0,0.28)' }} />
      <View style={{ position: 'absolute', left: 18, right: 54, bottom: 14 }}>
        {h.id === 'nye' && !midnight ? (
          <>
            <Text style={[{ fontFamily: FONT[800], fontSize: 21, color: '#fff' }, shadow]}>{h.title}</Text>
            <View style={{ flexDirection: 'row', columnGap: 6, marginTop: 6, maxWidth: 240 }}>
              {[[String(hh), 'ч'], [String(mm).padStart(2, '0'), 'мин'], [String(ss).padStart(2, '0'), 'сек']].map(([v, u]) => (
                <View key={u} style={{ flex: 1, alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 12, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' }}>
                  <Text style={{ fontFamily: FONT[800], fontSize: 24, color: '#fff', fontVariant: ['tabular-nums'] }}>{v}</Text>
                  <Text style={{ fontFamily: FONT[500], fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>{u}</Text>
                </View>
              ))}
            </View>
          </>
        ) : (
          <>
            <Text style={[{ fontFamily: FONT[800], fontSize: 21, lineHeight: 25, color: '#fff' }, shadow]}>{midnight ? 'С Новым годом!' : h.title}</Text>
            <Text style={[{ fontFamily: FONT[500], fontSize: 14, color: 'rgba(255,255,255,0.88)', marginTop: 2 }, shadow]}>{midnight ? 'Пусть сессия будет лёгкой, а пары — интересными' : h.sub}</Text>
          </>
        )}
      </View>
      {test ? (
        <Pressable onPress={() => { void setTestHoliday(null); }} hitSlop={8} accessibilityRole="button" accessibilityLabel="Выключить тестовый праздник"
          style={{ position: 'absolute', right: 8, top: h.garland ? 40 : 8, paddingHorizontal: 10, height: 28, borderRadius: 14, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)', borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.6)' }}>
          <Text style={{ fontFamily: FONT[600], fontSize: 12, color: '#fff' }}>тест · выключить</Text>
        </Pressable>
      ) : (
        <Pressable onPress={() => { setHidden(true); AsyncStorage.setItem(HIDDEN_KEY, `${h.id}|${isoOf(dushanbeNow())}`).catch(() => {}); }}
          hitSlop={6} accessibilityRole="button" accessibilityLabel="Убрать до завтра"
          style={{ position: 'absolute', right: 8, bottom: 10, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.3)' }}>
          <Text style={{ fontSize: 22, color: '#fff', lineHeight: 24 }}>×</Text>
        </Pressable>
      )}
    </Pressable>
  );
}
