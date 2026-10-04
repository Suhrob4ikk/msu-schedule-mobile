/**
 * Лист пары: подробности (предмет, время, преподаватель, аудитория) и —
 * если включены в Кабинете — «Отметить пропуск» и заметка. У сдвоенной пары
 * пропуск и заметка свои у каждого слота.
 *
 * Формат хранения не меняется — ключи из src/studyData.ts, общие с сайтом.
 */
import React, { useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Lesson } from '../api';
import { skipKey, noteWeeklyKey, noteDatedKey, isPastLesson } from '../studyData';
import { Tokens, RADIUS, TOUCH_MIN, type as typeStyle } from './tokens';
import { Block, attendanceApplies, dayTitle, pairsLabel } from './state';
import { Txt, KindBadge, Divider } from './ui';
import BottomSheet from './BottomSheet';
import { openRoom, openTeacher } from './LessonRow';

function InfoRow({ k, icon, label, value, onPress }: {
  k: Tokens; icon: React.ComponentProps<typeof Ionicons>['name']; label: string; value: string; onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'link' : 'text'}
      accessibilityLabel={`${label}: ${value}`}
      style={({ pressed }) => ({
        minHeight: TOUCH_MIN, flexDirection: 'row', alignItems: 'center', columnGap: 12,
        paddingVertical: 8, paddingHorizontal: 4, borderRadius: RADIUS.sm,
        backgroundColor: pressed ? k.surface2 : 'transparent',
      })}
    >
      <Ionicons name={icon} size={20} color={k.textSecondary} />
      <View style={{ flex: 1 }}>
        <Txt t="caption" color={k.textSecondary}>{label}</Txt>
        <Txt t="body" color={k.text}>{value}</Txt>
      </View>
      {onPress && <Ionicons name="chevron-forward" size={18} color={k.textSecondary} />}
    </Pressable>
  );
}

function SlotActions({ lesson, k, showAttendance, showNotes, slotLabel, onChanged }: {
  lesson: Lesson; k: Tokens; showAttendance: boolean; showNotes: boolean; slotLabel?: string; onChanged: () => void;
}) {
  const gid = lesson.group?.id ?? 'g';
  const date = lesson.lesson_date;
  const kSkip = date ? skipKey(gid, date, lesson.pair_number) : null;
  const kWeekly = noteWeeklyKey(gid, lesson.day_of_week, lesson.pair_number);
  const kDated = date ? noteDatedKey(gid, date, lesson.pair_number) : null;

  const [skipped, setSkipped] = useState(false);
  const [note, setNote] = useState('');
  const [repeatWeekly, setRepeatWeekly] = useState(true);

  useEffect(() => {
    if (showAttendance && kSkip) AsyncStorage.getItem(kSkip).then(v => setSkipped(v !== null));
    if (showNotes) {
      (async () => {
        // Разовая заметка на эту дату важнее еженедельной
        const dated = kDated ? await AsyncStorage.getItem(kDated) : null;
        if (dated !== null) { setNote(dated); setRepeatWeekly(false); }
        else { setNote((await AsyncStorage.getItem(kWeekly)) ?? ''); setRepeatWeekly(true); }
      })();
    }
  }, [kSkip, kWeekly, kDated, showAttendance, showNotes]);

  // Пропуск — только у прошедшей пары и не на экзамене/зачёте/консультации
  const canSkip = showAttendance && !!kSkip && attendanceApplies(lesson.lesson_type) && isPastLesson(date);

  const toggleSkip = () => {
    if (!kSkip) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (skipped) { setSkipped(false); AsyncStorage.removeItem(kSkip).then(onChanged); }
    else { setSkipped(true); AsyncStorage.setItem(kSkip, lesson.subject).then(onChanged); }
  };

  /** Пишем в один ключ и чистим второй, чтобы заметка не задвоилась. */
  const persistNote = async (text: string, repeat: boolean) => {
    if (kDated) await AsyncStorage.removeItem(kDated);
    await AsyncStorage.removeItem(kWeekly);
    if (text.trim()) await AsyncStorage.setItem(repeat || !kDated ? kWeekly : kDated, text);
    onChanged();
  };

  if (!canSkip && !showNotes) return null;

  return (
    <View style={{ marginTop: 12, rowGap: 10 }}>
      {slotLabel && <Txt t="overline" color={k.textSecondary}>{slotLabel}</Txt>}
      {canSkip && (
        <Pressable
          onPress={toggleSkip}
          accessibilityRole="switch"
          accessibilityState={{ checked: skipped }}
          accessibilityLabel={skipped ? 'Пропуск отмечен' : 'Отметить пропуск'}
          style={{
            minHeight: TOUCH_MIN, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 8,
            borderRadius: RADIUS.sm, borderWidth: 1,
            borderColor: skipped ? k.statusOffline : k.border,
            backgroundColor: skipped ? k.statusOfflineBg : 'transparent',
          }}
        >
          <Ionicons name={skipped ? 'close-circle' : 'remove-circle-outline'} size={18} color={skipped ? k.statusOffline : k.textSecondary} />
          <Txt t="labelStrong" color={skipped ? k.statusOffline : k.text}>{skipped ? 'Пропущено' : 'Отметить пропуск'}</Txt>
        </Pressable>
      )}
      {showNotes && (
        <View style={{ rowGap: 8 }}>
          <TextInput
            value={note}
            onChangeText={t => { setNote(t); persistNote(t, repeatWeekly); }}
            placeholder="Заметка"
            placeholderTextColor={k.textSecondary}
            multiline
            maxFontSizeMultiplier={2}
            accessibilityLabel="Заметка к паре"
            style={[typeStyle(15, 20, 500), {
              color: k.text, backgroundColor: k.surface2, borderRadius: RADIUS.sm,
              paddingHorizontal: 12, paddingVertical: 10, minHeight: TOUCH_MIN * 2, textAlignVertical: 'top',
            }]}
          />
          {kDated && (
            <Pressable
              onPress={() => { const next = !repeatWeekly; setRepeatWeekly(next); persistNote(note, next); }}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: repeatWeekly }}
              style={{ minHeight: TOUCH_MIN, flexDirection: 'row', alignItems: 'center', columnGap: 10 }}
            >
              <Ionicons name={repeatWeekly ? 'checkbox' : 'square-outline'} size={22} color={repeatWeekly ? k.accentText : k.textSecondary} />
              <Txt t="body" color={k.text}>Повторять каждую неделю</Txt>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

export default function LessonSheet({ block, onClose, k, showAttendance, showNotes, onChanged }: {
  block: Block | null;
  onClose: () => void;
  k: Tokens;
  showAttendance: boolean;
  showNotes: boolean;
  onChanged: () => void;
}) {
  // Держим последнюю пару, чтобы лист не опустел во время закрытия
  const [shown, setShown] = useState<Block | null>(block);
  useEffect(() => { if (block) setShown(block); }, [block]);
  const b = block ?? shown;
  const l = b?.lessons[0];

  return (
    <BottomSheet visible={!!block} onClose={onClose} k={k} label="Подробности пары">
      {b && l && (
        <View style={{ paddingTop: 8 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 8, rowGap: 6, marginBottom: 6 }}>
            <KindBadge type={l.lesson_type} k={k} />
          </View>
          <Txt t="titleCard" color={k.text} accessibilityRole="header">{l.subject}</Txt>
          <View style={{ marginTop: 8 }}>
            <InfoRow
              k={k}
              icon="time-outline"
              label={`${dayTitle(b.date)} · ${pairsLabel(b)}`}
              value={b.lessons.map(x => `${x.pair_time_start}–${x.pair_time_end}`).join(', ')}
            />
            {l.teacher && (
              <InfoRow k={k} icon="person-outline" label="Преподаватель" value={l.teacher.name}
                onPress={() => { onClose(); openTeacher(l); }} />
            )}
            <InfoRow k={k} icon="location-outline" label="Аудитория" value={l.room?.name ?? '—'}
              onPress={l.room ? () => { onClose(); openRoom(l); } : undefined} />
          </View>
          {(showAttendance || showNotes) && <View style={{ marginTop: 8 }}><Divider k={k} /></View>}
          {b.lessons.map(x => (
            <SlotActions
              key={x.id}
              lesson={x}
              k={k}
              showAttendance={showAttendance}
              showNotes={showNotes}
              slotLabel={b.lessons.length > 1 ? `${x.pair_number} пара · ${x.pair_time_start}–${x.pair_time_end}` : undefined}
              onChanged={onChanged}
            />
          ))}
        </View>
      )}
    </BottomSheet>
  );
}
