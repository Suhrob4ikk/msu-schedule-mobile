/**
 * Строка педагога: ФИО (переносится, не обрезается) и статус под ним,
 * справа шеврон. Вся строка — одна зона нажатия. Статус берётся из
 * хранилища статусов: строка перерисовывается, только когда он изменился.
 */
import React, { memo } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Teacher } from '../api';
import { Tokens, FONT } from '../schedule/tokens';
import { Txt, Divider } from '../schedule/ui';
import { statusStore, useTeacherStatus } from './data';

function Name({ name, range, k }: { name: string; range?: [number, number] | null; k: Tokens }) {
  return (
    <Txt t="teacherName" color={k.text} android_hyphenationFrequency="full" textBreakStrategy="highQuality">
      {range ? (
        <>
          {name.slice(0, range[0])}
          <Txt t="teacherName" color={k.onAccentSoft} style={{ backgroundColor: k.accentSoft }}>{name.slice(range[0], range[1])}</Txt>
          {name.slice(range[1])}
        </>
      ) : name}
    </Txt>
  );
}

function TeacherRow({ t, k, group, range, onPress }: {
  t: Teacher;
  k: Tokens;
  /** Блок, в котором стоит строка (недавние, буква, поиск) — для окна прокрутки. */
  group: string;
  range?: [number, number] | null;
  onPress: (t: Teacher) => void;
}) {
  const rowKey = `${group}:${t.id}`;
  const st = useTeacherStatus(rowKey, t.id, group);
  const now = st?.kind === 'now';
  const roomPart = st?.room ? `ауд. ${st.room}` : null;

  return (
    <Pressable
      onPress={() => onPress(t)}
      onLayout={e => statusStore.place(rowKey, e.nativeEvent.layout.y, e.nativeEvent.layout.height)}
      accessibilityRole="button"
      accessibilityLabel={st ? `${t.name}. ${st.spoken}` : t.name}
      style={({ pressed }) => ({
        minHeight: 56, flexDirection: 'row', alignItems: 'center', columnGap: 8,
        paddingTop: 10, paddingRight: 8, paddingBottom: 10, paddingLeft: 14,
        backgroundColor: pressed ? k.surface2 : 'transparent',
      })}
    >
      <View style={{ flex: 1, minWidth: 0, rowGap: 2 }}>
        <Name name={t.name} range={range} k={k} />
        {st && now ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', columnGap: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: k.accentText }} />
            <Txt t="teacherStatusNow" color={k.accentText} style={{ flexShrink: 1 }}>
              {'Сейчас'}
              {roomPart ? ' · ауд. ' : ''}
              {st.room ? <Txt t="teacherStatusNow" color={k.accentText} style={{ fontFamily: FONT[800] }}>{st.room}</Txt> : null}
              {` · до ${st.until}`}
            </Txt>
          </View>
        ) : st ? (
          <Txt t="teacherStatus" color={k.textSecondary}>
            {st.kind === 'later' && st.room ? (
              <>
                {st.text.slice(0, st.text.lastIndexOf(st.room))}
                <Txt t="teacherStatus" color={k.text} style={{ fontFamily: FONT[700] }}>{st.room}</Txt>
              </>
            ) : st.text}
          </Txt>
        ) : null}
      </View>
      <View style={{ width: 20, alignItems: 'center' }}>
        <Ionicons name="chevron-forward" size={16} color={k.textSecondary} />
      </View>
    </Pressable>
  );
}

const Row = memo(TeacherRow);
export default Row;

/** Карточка строк (радиус 18) с разделителями; сообщает своё место в ленте. */
export function TeacherCard({ k, group, teachers, ranges, onPress }: {
  k: Tokens;
  group: string;
  teachers: Teacher[];
  ranges?: Map<number, [number, number]>;
  onPress: (t: Teacher) => void;
}) {
  return (
    <View
      onLayout={e => statusStore.setGroupY(group, e.nativeEvent.layout.y)}
      style={{ backgroundColor: k.card, borderRadius: 18, overflow: 'hidden' }}
    >
      {teachers.map((t, i) => (
        <React.Fragment key={t.id}>
          {i > 0 && <Divider k={k} />}
          <Row t={t} k={k} group={group} range={ranges?.get(t.id) ?? null} onPress={onPress} />
        </React.Fragment>
      ))}
    </View>
  );
}
