/**
 * Карточки пар в настроении праздника — как на сайте (app/tablo-holiday.css): снег лежит на карточке и
 * иней по краю (Новый год), веточка абрикоса (Навруз), мимоза (8 Марта), конфетти (День знаний, конец
 * сессии), полоска флага (День независимости), золотой полумесяц (Иди). Кладётся первым ребёнком в
 * карточку, поверх фона и под текстом, нажатия не ловит. Украшения в углах не заходят на время пары:
 * в списке — в левом верхнем углу над номером пары, в карточке идущей пары — в правом нижнем.
 */
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { useHoliday } from './holidays';

const SNOW = "<svg viewBox='0 0 200 16' preserveAspectRatio='none'><path d='M0 0H200V8C192 13 186 9 178 11C168 14 162 9 152 10C142 12 136 15 126 11C116 8 108 13 98 12C88 11 82 15 72 11C62 8 54 13 44 12C34 11 28 14 18 10C10 8 4 12 0 10Z' fill='#ffffff'/><path d='M0 10C4 12 10 8 18 10C28 14 34 11 44 12C54 13 62 8 72 11C82 15 88 11 98 12C108 13 116 8 126 11C136 15 142 12 152 10C162 9 168 14 178 11C186 9 192 13 200 8' fill='none' stroke='#b9cfe8' stroke-width='1.2'/></svg>";
const BLOSSOM = "<svg viewBox='0 0 70 50'><path d='M70 2C56 8 46 16 34 22M52 10C48 18 42 26 38 32M62 6C64 14 62 22 58 28' stroke='#6d4c41' stroke-width='2' fill='none' stroke-linecap='round'/><g fill='#fde4ec' stroke='#f8bbd0' stroke-width='.6'><circle cx='34' cy='22' r='4.2'/><circle cx='46' cy='15' r='4.6'/><circle cx='38' cy='32' r='3.8'/><circle cx='58' cy='28' r='4'/><circle cx='60' cy='9' r='3.6'/></g><g fill='#f06292'><circle cx='34' cy='22' r='1.2'/><circle cx='46' cy='15' r='1.3'/><circle cx='38' cy='32' r='1.1'/><circle cx='58' cy='28' r='1.1'/><circle cx='60' cy='9' r='1'/></g></svg>";
const MIMOSA = "<svg viewBox='0 0 60 44'><path d='M58 4C44 14 30 24 14 36' stroke='#7cb342' stroke-width='1.6' fill='none'/><path d='M46 12l-6 8M36 20l-7 6M26 27l-6 6' stroke='#8bc34a' stroke-width='1.2'/><g fill='#ffd54f' stroke='#f9a825' stroke-width='.5'><circle cx='54' cy='8' r='3'/><circle cx='49' cy='12' r='3.2'/><circle cx='44' cy='16' r='2.9'/><circle cx='39' cy='20' r='3.1'/><circle cx='34' cy='24' r='2.8'/><circle cx='29' cy='28' r='3'/><circle cx='52' cy='4' r='2.5'/><circle cx='46' cy='6' r='2.7'/><circle cx='41' cy='10' r='2.6'/><circle cx='24' cy='32' r='2.6'/></g></svg>";
const CONFETTI = "<svg viewBox='0 0 140 90'><g opacity='.75'><rect x='10' y='8' width='6' height='3' rx='1' fill='#ff5f6d' transform='rotate(25 13 9)'/><rect x='48' y='18' width='6' height='3' rx='1' fill='#70a1ff' transform='rotate(-30 51 19)'/><rect x='96' y='6' width='6' height='3' rx='1' fill='#ffc371' transform='rotate(60 99 7)'/><rect x='124' y='30' width='6' height='3' rx='1' fill='#7bed9f' transform='rotate(15 127 31)'/><rect x='70' y='44' width='6' height='3' rx='1' fill='#a55eea' transform='rotate(-50 73 45)'/><rect x='22' y='60' width='6' height='3' rx='1' fill='#70a1ff' transform='rotate(40 25 61)'/><rect x='110' y='70' width='6' height='3' rx='1' fill='#ff5f6d' transform='rotate(-20 113 71)'/><circle cx='36' cy='36' r='1.6' fill='#ffc371'/><circle cx='86' cy='26' r='1.5' fill='#ff5f6d'/><circle cx='60' cy='76' r='1.6' fill='#7bed9f'/><circle cx='132' cy='56' r='1.4' fill='#a55eea'/></g></svg>";
const MOON = "<svg viewBox='0 0 40 40'><path d='M24 6A14 14 0 1 0 24 34A11 11 0 1 1 24 6Z' fill='#e8c070'/><path d='M31 12l.9 2.4 2.5.1-2 1.5.7 2.4-2.1-1.4-2.1 1.4.7-2.4-2-1.5 2.5-.1z' fill='#e8c070'/></svg>";

function HolidayCardDeco({ place, radius }: { place: 'list' | 'focus'; radius: number }) {
  const { holiday } = useHoliday();
  if (!holiday) return null;
  const corner = place === 'list' ? { left: 4, top: 3 } : { right: 10, bottom: 8 };
  const fill = StyleSheet.absoluteFill;
  switch (holiday.scene) {
    case 'ny':
      return (
        <View pointerEvents="none" style={[fill, { borderRadius: radius, borderWidth: 1, borderColor: 'rgba(170,210,255,0.35)' }]}>
          <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 34, backgroundColor: 'rgba(190,225,255,0.10)' }} />
          <SvgXml xml={SNOW} width="100%" height={14} style={{ position: 'absolute', top: 0 }} />
        </View>
      );
    case 'navruz':
    case 'mar8':
      return (
        <View pointerEvents="none" style={fill}>
          <View style={[fill, { backgroundColor: 'rgba(255,185,205,0.08)' }]} />
          <SvgXml xml={holiday.scene === 'navruz' ? BLOSSOM : MIMOSA} width={place === 'list' ? 40 : 58} height={place === 'list' ? 29 : 42} style={{ position: 'absolute', ...corner }} />
        </View>
      );
    case 'sep1':
      return <View pointerEvents="none" style={fill}><SvgXml xml={CONFETTI} width="100%" height="100%" preserveAspectRatio="xMidYMid slice" /></View>;
    case 'indep':
      if (holiday.id === 'session') return <View pointerEvents="none" style={fill}><SvgXml xml={CONFETTI} width="100%" height="100%" preserveAspectRatio="xMidYMid slice" /></View>;
      return (
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0 }}>
          <View style={{ height: 2, backgroundColor: '#CC0000' }} /><View style={{ height: 2, backgroundColor: '#FFFFFF' }} /><View style={{ height: 2, backgroundColor: '#006600' }} />
        </View>
      );
    case 'eid':
      return (
        <View pointerEvents="none" style={[fill, { borderRadius: radius, borderWidth: 1, borderColor: 'rgba(232,192,112,0.45)' }]}>
          <SvgXml xml={MOON} width={place === 'list' ? 22 : 30} height={place === 'list' ? 22 : 30} style={{ position: 'absolute', ...(place === 'list' ? { left: 8, top: 6 } : { right: 12, bottom: 10 }) }} />
        </View>
      );
  }
}

export default memo(HolidayCardDeco);
