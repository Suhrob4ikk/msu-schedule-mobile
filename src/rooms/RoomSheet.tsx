/**
 * Лист аудитории: номер, день и пара, статус (один раз), накладка или общее
 * занятие, карточка на каждую группу, «день аудитории». Касание ячейки пары
 * переключает лист; касание группы открывает её расписание, преподавателя —
 * вкладку «Педагоги».
 */
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, Text, View, findNodeHandle } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, Group, Teacher, shortGroupName } from '../api';
import { Tokens, RADIUS, TOUCH_MIN } from '../schedule/tokens';
import { Txt, KindBadge } from '../schedule/ui';
import { dayTitle } from '../schedule/state';
import BottomSheet from '../schedule/BottomSheet';
import {
  Occupant, PAIRS, RoomDay, displayRoom, groupSpan, groupsWord, isNumbered, overlapOf, pairTitle,
  roomStatus, statusText,
} from './state';
import DayCells from './DayCells';

const SLOP = { top: 16, bottom: 16, left: 8, right: 8 };

/** Преподаватели недели — по имени ищем id для перехода во вкладку «Педагоги». */
async function loadTeachers(weekStart: string): Promise<Teacher[]> {
  try {
    const raw = await AsyncStorage.getItem(`cache_teachers_${weekStart}`);
    if (raw) return JSON.parse(raw);
  } catch { /* нет кэша */ }
  try { return await api.getTeachers(weekStart); } catch { return []; }
}

async function loadGroups(): Promise<Group[]> {
  try {
    const raw = await AsyncStorage.getItem('cache_groups');
    if (raw) return JSON.parse(raw);
  } catch { /* нет кэша */ }
  try { return await api.getGroups(); } catch { return []; }
}

function Plaque({ k, bg, fg, dot, text }: { k: Tokens; bg: string; fg: string; dot: boolean; text: string }) {
  return (
    <View style={{ minHeight: TOUCH_MIN, borderRadius: RADIUS.md, backgroundColor: bg, flexDirection: 'row', alignItems: 'center', columnGap: 10, paddingHorizontal: 14, paddingVertical: 10 }}>
      {dot && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: fg }} />}
      <Txt t="statusLg" color={fg} style={{ flex: 1 }}>{text}</Txt>
    </View>
  );
}

function GroupCard({ o, day, pairIdx, k, teacherId, onGroup, onClose }: {
  o: Occupant; day: RoomDay; pairIdx: number; k: Tokens; teacherId: number | null;
  onGroup: (o: Occupant) => void; onClose: () => void;
}) {
  const meta = groupSpan(day, pairIdx, o);
  return (
    <Pressable
      onPress={() => onGroup(o)}
      accessibilityRole="button"
      accessibilityLabel={`${o.group}, ${o.subject}${o.teacher ? `, ${o.teacher}` : ''}, ${meta}. Открыть расписание группы`}
      style={({ pressed }) => ({
        backgroundColor: pressed ? k.border : k.surface2, borderRadius: 16,
        paddingVertical: 12, paddingHorizontal: 14, rowGap: 4,
      })}
    >
      <Txt t="groupTitle" color={k.text}>{o.group}</Txt>
      <Txt t="subject" color={k.text}>{o.subject}</Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 4, marginTop: 2 }}>
        <KindBadge type={o.type} k={k} />
        {o.teacher && (teacherId != null ? (
          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              onClose();
              router.push({ pathname: '/teachers', params: { teacher: String(teacherId) } });
            }}
            hitSlop={SLOP}
            accessibilityRole="link"
            accessibilityLabel={`Расписание преподавателя ${o.teacher}`}
          >
            <Txt t="small" color={k.textSecondary}>{o.teacher}</Txt>
          </Pressable>
        ) : (
          <Txt t="small" color={k.textSecondary}>{o.teacher}</Txt>
        ))}
        <Txt t="small" color={k.textSecondary}>{meta}</Txt>
      </View>
    </Pressable>
  );
}

export default function RoomSheet({ day, initialPair, date, weekStart, k, onClose }: {
  /** null — лист закрыт. */
  day: RoomDay | null;
  initialPair: number;
  date: string;
  weekStart: string;
  k: Tokens;
  onClose: () => void;
}) {
  // Держим последнюю аудиторию, чтобы лист не опустел во время закрытия
  const [shown, setShown] = useState<RoomDay | null>(day);
  const [pairIdx, setPairIdx] = useState(initialPair);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const titleRef = useRef<Text>(null);

  useEffect(() => {
    if (!day) return;
    setShown(day);
    setPairIdx(initialPair);
    loadTeachers(weekStart).then(setTeachers);
    loadGroups().then(setGroups);
    // Фокус экранного диктора — на номер аудитории
    const id = setTimeout(() => {
      const node = titleRef.current ? findNodeHandle(titleRef.current) : null;
      if (node) AccessibilityInfo.setAccessibilityFocus(node);
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day?.room, initialPair, weekStart]);

  const d = day ?? shown;
  if (!d) return <BottomSheet visible={false} onClose={onClose} k={k} label="Аудитория">{null}</BottomSheet>;

  const st = roomStatus(d, pairIdx);
  const occ = d.occupants[pairIdx] ?? [];
  const overlap = overlapOf(occ);

  const teacherId = (name: string | null): number | null => {
    if (!name) return null;
    const t = teachers.find(x => x.name.trim() === name.trim());
    return t ? t.id : null;
  };

  const openGroup = async (o: Occupant) => {
    const g = groups.find(x => x.year === o.course && shortGroupName(x.name) === o.program);
    if (!g) return;
    Haptics.selectionAsync();
    // Тот же механизм, что «просмотр чужой группы» в Расписании
    await AsyncStorage.setItem('schedule_view_group_id', String(g.id)).catch(() => null);
    onClose();
    router.push('/');
  };

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', columnGap: 8, paddingBottom: 12 }}>
      <View style={{ flex: 1 }}>
        <Txt t="overline" color={k.textSecondary}>Аудитория</Txt>
        <Txt ref={titleRef} t="display" color={k.text} numberOfLines={isNumbered(d.room) ? 1 : undefined} accessibilityRole="header">
          {displayRoom(d.room)}
        </Txt>
        <Txt t="small" color={k.textSecondary} style={{ marginTop: 4, fontSize: 14, lineHeight: 19 }}>
          {dayTitle(date)} · {pairTitle(PAIRS[pairIdx])}
        </Txt>
      </View>
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Закрыть"
        style={{ width: TOUCH_MIN, height: TOUCH_MIN, alignItems: 'center', justifyContent: 'center', marginRight: -12 }}
      >
        <Ionicons name="close" size={22} color={k.text} />
      </Pressable>
    </View>
  );

  return (
    <BottomSheet visible={!!day} onClose={onClose} k={k} label={`Аудитория ${displayRoom(d.room)}`} header={header} topGap={64}>
      <View style={{ rowGap: 8 }}>
        <Plaque
          k={k}
          dot
          bg={st.free ? k.roomFreeBg : k.roomBusyBg}
          fg={st.free ? k.roomFreeText : k.roomBusyText}
          text={statusText(st)}
        />
        {overlap.kind === 'conflict' && (
          <Plaque k={k} dot bg={k.roomConflictBg} fg={k.roomConflictText} text={`Накладка в расписании · ${groupsWord(overlap.count)} одновременно`} />
        )}
        {overlap.kind === 'shared' && (
          <Plaque k={k} dot={false} bg={k.surface2} fg={k.textSecondary} text={`Общее занятие · ${groupsWord(overlap.count)}`} />
        )}
        {occ.map((o, i) => (
          <GroupCard
            key={`${o.group}|${i}`}
            o={o}
            day={d}
            pairIdx={pairIdx}
            k={k}
            teacherId={teacherId(o.teacher)}
            onGroup={openGroup}
            onClose={onClose}
          />
        ))}
      </View>

      <Txt t="overline" color={k.textSecondary} style={{ marginTop: 20, marginBottom: 8 }}>День аудитории</Txt>
      <DayCells cells={d.cells} selected={pairIdx} k={k} onPick={setPairIdx} />
    </BottomSheet>
  );
}
