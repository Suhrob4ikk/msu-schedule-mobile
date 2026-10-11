/**
 * Имя преподавателя со стрелкой: «Джумаев Э.Х. ⌄» → «Джумаев Эраж Хакназарович ⌃» (с 2.0.5,
 * как на сайте — components/tablo/names/TeacherName.tsx). Раскрывается каждый раз заново —
 * ничего не запоминается (решение владельца). Полного имени нет — просто текст, без стрелки.
 */
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { FullNamesData } from '../api';
import { expandName, hasFullName } from '../fullNames';
import type { Tokens } from '../schedule/tokens';
import { Txt } from '../schedule/ui';

type TxtKind = React.ComponentProps<typeof Txt>['t'];

export default function TeacherName({ name, data, k, t, color, iconSize = 20 }: {
  name: string;
  data: FullNamesData | null;
  k: Tokens;
  t: TxtKind;
  color: string;
  iconSize?: number;
}) {
  const [open, setOpen] = useState(false);
  if (!hasFullName(name, data)) return <Txt t={t} color={color}>{name}</Txt>;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 2 }}>
      <Txt t={t} color={color} style={{ flexShrink: 1 }} android_hyphenationFrequency="full">
        {open ? expandName(name, data) : name}
      </Txt>
      <Pressable
        onPress={() => setOpen(o => !o)}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={open ? 'Свернуть имя' : 'Раскрыть полное имя'}
        style={({ pressed }) => ({ padding: 4, borderRadius: 999, backgroundColor: pressed ? k.surface2 : 'transparent' })}
      >
        {/* открыто — стрелка вверх, свёрнуто — вниз (просьба владельца) */}
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={iconSize} color={k.accentText} />
      </Pressable>
    </View>
  );
}
