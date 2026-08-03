import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  StyleSheet, StatusBar, RefreshControl, PanResponder, Animated, TextInput,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  api, Group, Lesson, TodayItem, WeekInfo, Stats,
  DAYS_ORDER, DAY_LABELS, breakLabel, gapBetween, humanDuration,
} from '../src/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../src/theme';
import { useSyncStatus } from '../src/SyncContext';
import { scheduleExamReminders, scheduleLessonReminders } from '../src/examNotifications';
import GroupSelector from '../src/GroupSelector';
import { Ionicons } from '@expo/vector-icons';
import { featuresUnlocked } from '../src/features';
import { writeWidgetData } from '../src/widgetData';
import { skipKey, noteWeeklyKey, noteDatedKey, isPastLesson, todayIso } from '../src/studyData';
import FeatureHint from '../src/FeatureHint';

// Июль и август — каникулы: пустое расписание в это время не ошибка
const isVacation = () => [6, 7].includes(new Date().getMonth());

const TYPE_COLORS: Record<string, string> = {
  ЗАЧЕТ: '#d43a40', ЭКЗАМЕН: '#d43a40', ПРАКТИКА: '#5650d6', ПЗ: '#5650d6', ЛЕКЦИЯ: '#0e9b72',
};
const TYPE_LABELS: Record<string, string> = {
  ЗАЧЕТ: 'Зачёт', ЭКЗАМЕН: 'Экзамен', ПРАКТИКА: 'Практика', ПЗ: 'Практика', ЛЕКЦИЯ: 'Лекция',
};

function weekRangeStr(weekStart: string): string {
  const start = new Date(weekStart + 'T00:00:00');
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (d: Date) =>
    `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}`;
  return `${fmt(start)} – ${fmt(end)}`;
}

function weekLabel(w: WeekInfo): string {
  const start = new Date(w.week_start + 'T00:00:00');
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (today >= start && today <= end) return 'Эта неделя';
  const dateStr = `${start.getDate()} ${['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'][start.getMonth()]}`;
  if (start > today && start.getTime() - today.getTime() <= 8 * 86400000)
    return `Следующая · ${dateStr}`;
  return dateStr;
}

function isCurrentWeek(weekStart: string): boolean {
  const start = new Date(weekStart + 'T00:00:00');
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today >= start && today <= end;
}

function getDayDate(dayName: string, weekStart: string): string {
  const start = new Date(weekStart + 'T00:00:00');
  const idx = DAYS_ORDER.indexOf(dayName);
  if (idx === -1) return '';
  const d = new Date(start);
  d.setDate(start.getDate() + idx);
  return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}`;
}

/* ─────────────────────────────────────────────────────────────────────────
   ТАЙМЛАЙН ДНЯ
   Слева время и «рельса» с точками-станциями: прошедшие пары приглушены,
   текущая горит пульсирующей точкой, окна разрывают линию пунктиром, между
   парами едет маркер текущего времени. Смысл не в красоте — окна и перемены
   видно глазами, не читая текст. То же самое сделано на сайте.

   Три колонки вместо абсолютных отрицательных отступов: на Android так
   надёжнее — вылезающие за границы родителя элементы там иногда обрезаются.
   ───────────────────────────────────────────────────────────────────────── */
const TIME_W = 36;  // колонка со временем
const RAIL_W = 22;  // колонка с линией и точками

/** Минуты от начала суток из строки «08:30». */
const toMin = (t: string): number => {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

const pad2 = (n: number) => String(n).padStart(2, '0');

type LessonState = 'past' | 'current' | 'future';

/** Точка идущей пары: кольцо расходится под точкой. */
function PulseDot({ C }: { C: ReturnType<typeof useTheme> }) {
  const v = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(v, { toValue: 1, duration: 1800, useNativeDriver: true })
    );
    anim.start();
    return () => anim.stop();
  }, [v]);

  return (
    <View style={{ width: 12, height: 12, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={{
          position: 'absolute', width: 12, height: 12, borderRadius: 6,
          backgroundColor: C.primary,
          transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }) }],
          opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
        }}
      />
      <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: C.primary }} />
    </View>
  );
}

/**
 * Колонка-рельса: сплошная или пунктирная линия во всю высоту строки.
 * Вынесена на верхний уровень намеренно: объявленный внутри DayTimeline
 * компонент пересоздавался бы при каждом тике таймера, React считал бы его
 * новым типом и размонтировал поддерево — пульсация точки сбрасывалась бы.
 */
function Rail({ C, dashed, children }: {
  C: ReturnType<typeof useTheme>;
  dashed?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <View style={{ width: RAIL_W, alignItems: 'center' }}>
      {dashed ? (
        // Пунктир набран короткими штрихами, а не borderStyle: 'dashed':
        // вертикальный dashed-бордюр Android рисует непредсказуемо.
        // Лишние штрихи обрезает overflow, поэтому высота строки не важна.
        <View style={{ position: 'absolute', left: 10, top: 0, bottom: 0, width: 2, overflow: 'hidden' }}>
          {Array.from({ length: 14 }).map((_, k) => (
            <View
              key={k}
              style={{ width: 2, height: 4, marginBottom: 3, borderRadius: 1, backgroundColor: C.border }}
            />
          ))}
        </View>
      ) : (
        <View
          style={{ position: 'absolute', left: 10, top: 0, bottom: 0, width: 2, backgroundColor: C.border }}
        />
      )}
      {children}
    </View>
  );
}

function DayTimeline({
  lessons, C, todayDate, nowMinutes, dimPast, showAttendance, showNotes,
}: {
  lessons: Lesson[];
  C: ReturnType<typeof useTheme>;
  /** Сегодняшняя дата YYYY-MM-DD */
  todayDate: string;
  /** Минуты от полуночи */
  nowMinutes: number;
  /** Приглушать отработанные пары. Только для текущей недели — в архивной
   *  прошло всё, и приглушённым стал бы весь экран. */
  dimPast: boolean;
  showAttendance?: boolean;
  showNotes?: boolean;
}) {
  const states: LessonState[] = lessons.map(l => {
    if (!l.lesson_date) return 'future';
    if (l.lesson_date < todayDate) return 'past';
    if (l.lesson_date > todayDate) return 'future';
    if (nowMinutes >= toMin(l.pair_time_end)) return 'past';
    if (nowMinutes >= toMin(l.pair_time_start)) return 'current';
    return 'future';
  });

  // Перед какой парой встанет маркер «сейчас». Только МЕЖДУ парами: про
  // «день не начался» и «на сегодня всё» и так говорят карточки наверху.
  const isToday = lessons[0]?.lesson_date === todayDate;
  const markerIdx = (() => {
    if (!isToday || states.includes('current')) return -1;
    const idx = lessons.findIndex(l => toMin(l.pair_time_start) > nowMinutes);
    return idx > 0 ? idx : -1;
  })();

  const nowLabel = `${pad2(Math.floor(nowMinutes / 60))}:${pad2(nowMinutes % 60)}`;

  return (
    <View>
      {lessons.map((l, i) => {
        const gap = i > 0 ? gapBetween(lessons[i - 1].pair_number, l.pair_number) : null;
        const state = states[i];

        return (
          <View key={l.id}>
            {gap && (
              <View style={{ flexDirection: 'row' }}>
                <View style={{ width: TIME_W }} />
                <Rail C={C} dashed />
                <View style={{ flex: 1, paddingVertical: 7, justifyContent: 'center' }}>
                  <Text style={{ fontSize: 11, color: C.muted }}>
                    окно {humanDuration(gap.minutes)} · свободн{gap.pairs.length > 1 ? 'ы' : 'а'}{' '}
                    {gap.pairs.join(', ')} пар{gap.pairs.length > 1 ? 'ы' : 'а'}
                  </Text>
                </View>
              </View>
            )}

            {markerIdx === i && (
              <View style={{ flexDirection: 'row' }}>
                <View style={{ width: TIME_W, alignItems: 'flex-end', paddingRight: 6, paddingTop: 4 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: C.primary }}>{nowLabel}</Text>
                </View>
                <Rail C={C}>
                  <View
                    style={{
                      marginTop: 6, width: 8, height: 8, borderRadius: 4,
                      backgroundColor: C.primary,
                    }}
                  />
                </Rail>
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 4 }}>
                  <View style={{ flex: 1, height: 1, backgroundColor: C.primary, opacity: 0.35 }} />
                  <Text style={{ fontSize: 11, color: C.muted }}>сейчас</Text>
                </View>
              </View>
            )}

            <View
              style={{
                flexDirection: 'row',
                opacity: dimPast && state === 'past' ? 0.5 : 1,
              }}
            >
              {/* Время живёт здесь, поэтому в карточке его прячем (compactTime) */}
              <View style={{ width: TIME_W, alignItems: 'flex-end', paddingRight: 6, paddingTop: 17 }}>
                <Text
                  style={{
                    fontSize: 11, fontWeight: '600',
                    color: state === 'current' ? C.primary : C.fg,
                  }}
                >
                  {l.pair_time_start}
                </Text>
                <Text style={{ fontSize: 11, color: C.muted, opacity: 0.7 }}>{l.pair_time_end}</Text>
              </View>
              <Rail C={C}>
                <View style={{ marginTop: 19 }}>
                  {state === 'current' ? (
                    <PulseDot C={C} />
                  ) : (
                    <View
                      style={{
                        width: 12, height: 12, borderRadius: 6, borderWidth: 2,
                        borderColor: state === 'past' ? C.border : C.primary,
                        backgroundColor: state === 'past' ? C.border : C.card,
                      }}
                    />
                  )}
                </View>
              </Rail>
              <View style={{ flex: 1 }}>
                <LessonCard
                  lesson={l}
                  C={C}
                  compactTime
                  current={state === 'current'}
                  showAttendance={showAttendance}
                  showNotes={showNotes}
                />
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function SkeletonCard({ C }: { C: ReturnType<typeof useTheme> }) {
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return (
    <Animated.View style={[{ backgroundColor: C.card, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 0.5, borderColor: C.border }, { opacity }]}>
      <View style={{ height: 12, backgroundColor: C.border, borderRadius: 4, width: '60%', marginBottom: 8 }} />
      <View style={{ height: 16, backgroundColor: C.border, borderRadius: 4, width: '85%', marginBottom: 8 }} />
      <View style={{ height: 12, backgroundColor: C.border, borderRadius: 4, width: '45%' }} />
    </Animated.View>
  );
}

function LessonCard({ lesson, C, showAttendance, showNotes, compactTime, current }: {
  lesson: Lesson;
  C: ReturnType<typeof useTheme>;
  showAttendance?: boolean;
  showNotes?: boolean;
  /** Внутри таймлайна время показано на рельсе слева — здесь не дублируем. */
  compactTime?: boolean;
  /** Пара идёт прямо сейчас — подсвечиваем рамку. */
  current?: boolean;
}) {
  const color = lesson.lesson_type ? (TYPE_COLORS[lesson.lesson_type] || '#3b82f6') : '#6b7280';
  const label = lesson.lesson_type ? (TYPE_LABELS[lesson.lesson_type] || lesson.lesson_type) : null;
  // Цвет левой полосы карточки по типу пары (как на вебе)
  const lt = lesson.lesson_type ?? '';
  const accent = /зач|экз/i.test(lt) ? C.examAccent
    : /пз|практ/i.test(lt) ? C.practiceAccent
    : lt ? C.lectureAccent : C.border;
  // На экзаменах/зачётах/консультациях посещаемость не отмечают
  const attendanceApplicable = !/экзамен|зач|конс/i.test(lt);

  // Ключи НЕ по lesson.id (он меняется при каждой синхронизации), а по стабильным
  // признакам — см. src/studyData.ts.
  const gid = lesson.group?.id ?? 'g';
  const date = lesson.lesson_date;
  const kSkip = date ? skipKey(gid, date, lesson.pair_number) : null;
  const kWeekly = noteWeeklyKey(gid, lesson.day_of_week, lesson.pair_number);
  const kDated = date ? noteDatedKey(gid, date, lesson.pair_number) : null;

  const [skipped, setSkipped] = useState(false);
  const [note, setNote] = useState('');
  const [repeatWeekly, setRepeatWeekly] = useState(true);
  const [editingNote, setEditingNote] = useState(false);

  useEffect(() => {
    if (showAttendance && kSkip) {
      AsyncStorage.getItem(kSkip).then(v => setSkipped(v !== null));
    }
    if (showNotes) {
      // Разовая заметка на эту дату важнее еженедельной
      (async () => {
        const dated = kDated ? await AsyncStorage.getItem(kDated) : null;
        if (dated !== null) { setNote(dated); setRepeatWeekly(false); }
        else { setNote((await AsyncStorage.getItem(kWeekly)) ?? ''); setRepeatWeekly(true); }
      })();
    }
  }, [kSkip, kWeekly, kDated, showAttendance, showNotes]);

  // Отмечать пропуск можно только у уже прошедшей пары
  const canMarkSkip = attendanceApplicable && !!kSkip && isPastLesson(date);

  const toggleSkip = () => {
    if (!kSkip) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (skipped) {
      setSkipped(false);
      AsyncStorage.removeItem(kSkip);
    } else {
      setSkipped(true);
      // В значении — предмет, чтобы в кабинете считать пропуски по предметам
      AsyncStorage.setItem(kSkip, lesson.subject);
    }
  };

  /** Пишем в один ключ и чистим второй, чтобы заметка не задвоилась. */
  const persistNote = async (text: string, repeat: boolean) => {
    if (kDated) await AsyncStorage.removeItem(kDated);
    await AsyncStorage.removeItem(kWeekly);
    if (!text.trim()) return;
    await AsyncStorage.setItem(repeat || !kDated ? kWeekly : kDated, text);
  };

  const saveNote = (text: string) => {
    setNote(text);
    persistNote(text, repeatWeekly);
  };

  const toggleRepeat = () => {
    const next = !repeatWeekly;
    setRepeatWeekly(next);
    persistNote(note, next);
  };

  return (
    <View style={[cardStyles.card, { backgroundColor: C.card, borderWidth: 1, borderColor: current ? C.primary : C.border, borderLeftWidth: 4, borderLeftColor: accent }]}>
      <View style={cardStyles.header}>
        <View style={[cardStyles.pairBadge, { backgroundColor: C.blueBg }]}>
          <Text style={[cardStyles.pairText, { color: C.primary }]}>
            {lesson.pair_number} пара
            {!compactTime && ` · ${lesson.pair_time_start}–${lesson.pair_time_end}`}
          </Text>
        </View>
        {label && (
          <View style={[cardStyles.typeBadge, { backgroundColor: color + '20' }]}>
            <Text style={[cardStyles.typeText, { color }]}>{label}</Text>
          </View>
        )}
      </View>
      <Text style={[cardStyles.subject, { color: C.fg }]}>{lesson.subject}</Text>
      <View style={cardStyles.meta}>
        {lesson.teacher && (
          <Text style={[cardStyles.metaText, { color: C.muted }]}>Преп.: {lesson.teacher.name}</Text>
        )}
        {lesson.room && (
          <Text style={[cardStyles.metaText, { color: C.muted }]}>Ауд. {lesson.room.name}</Text>
        )}
      </View>

      {/* Пропуск: отмечаем только то, что пропустили */}
      {showAttendance && canMarkSkip && (
        <View style={[cardStyles.attRow, { borderTopColor: C.border }]}>
          <TouchableOpacity
            onPress={toggleSkip}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityState={{ selected: skipped }}
            accessibilityLabel={skipped ? 'Пропуск отмечен, нажми чтобы убрать' : 'Отметить пропуск'}
            style={[cardStyles.attBtn, {
              backgroundColor: skipped ? '#ef4444' : 'transparent',
              borderColor: skipped ? '#ef4444' : C.border,
              flexDirection: 'row', alignItems: 'center', gap: 5,
            }]}
          >
            {skipped && <Ionicons name="close-circle" size={13} color="#fff" />}
            <Text style={[cardStyles.attBtnText, { color: skipped ? '#fff' : C.muted }]}>
              {skipped ? 'Пропустил' : 'Отметить пропуск'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {showNotes && (
        <View style={[cardStyles.notesRow, { borderTopColor: C.border }]}>
          {editingNote ? (
            <>
              <TextInput
                style={[cardStyles.noteInput, { backgroundColor: C.tag, borderColor: C.border, color: C.fg }]}
                placeholder="Что задали? Что принести на пару?"
                placeholderTextColor={C.muted}
                multiline
                autoFocus
                value={note}
                onChangeText={saveNote}
                onBlur={() => setEditingNote(false)}
              />
              {/* Заметка либо висит на этой паре каждую неделю, либо только на эту дату */}
              {kDated && (
                <TouchableOpacity
                  onPress={toggleRepeat}
                  activeOpacity={0.7}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: repeatWeekly }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}
                >
                  <View style={{
                    width: 15, height: 15, borderRadius: 4, borderWidth: 1,
                    alignItems: 'center', justifyContent: 'center',
                    borderColor: repeatWeekly ? C.primary : C.border,
                    backgroundColor: repeatWeekly ? C.primary : 'transparent',
                  }}>
                    {repeatWeekly && <Ionicons name="checkmark" size={11} color="#fff" />}
                  </View>
                  <Text style={{ fontSize: 11.5, color: repeatWeekly ? C.primary : C.muted }}>
                    Повторять каждую неделю
                  </Text>
                </TouchableOpacity>
              )}
            </>
          ) : note ? (
            // Компактная строка-индикатор: заметка видна, тап — редактирование
            <TouchableOpacity
              onPress={() => setEditingNote(true)}
              activeOpacity={0.7}
              style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}
            >
              <Ionicons name="pencil" size={13} color={C.primary} style={{ marginTop: 1 }} />
              <Text style={{ fontSize: 12.5, color: C.fg, flex: 1 }} numberOfLines={2}>{note}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => setEditingNote(true)}>
              <Text style={[cardStyles.addNoteText, { color: C.muted }]}>+ Добавить заметку</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: { borderRadius: 16, padding: 14, marginBottom: 10, elevation: 1, shadowOpacity: 0.05, shadowRadius: 5 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' },
  pairBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  pairText: { fontSize: 12, fontWeight: '700' },
  typeBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5 },
  typeText: { fontSize: 11, fontWeight: '600' },
  subject: { fontSize: 15.5, fontWeight: '700', marginBottom: 4 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metaText: { fontSize: 13 },
  attRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 0.5 },
  attLabel: { fontSize: 12, marginRight: 4 },
  attBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  attBtnText: { fontSize: 12, fontWeight: '600' },
  notesRow: { marginTop: 10, paddingTop: 10, borderTopWidth: 0.5 },
  noteInput: { borderRadius: 8, padding: 8, fontSize: 12, borderWidth: 1, minHeight: 48, textAlignVertical: 'top' },
  addNoteText: { fontSize: 12 },
});

export default function ScheduleScreen() {
  const C = useTheme();
  const { offlineBannerText, onlineAt } = useSyncStatus();
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [weeks, setWeeks] = useState<WeekInfo[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<WeekInfo | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [nowItems, setNowItems] = useState<TodayItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [selectedDay, setSelectedDay] = useState(() => {
    const jsDay = new Date().getDay();
    if (jsDay === 0) return 'all';
    return DAYS_ORDER[(jsDay + 6) % 7];
  });
  const [featureAttendance, setFeatureAttendance] = useState(false);
  const [featureNotes, setFeatureNotes] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Текущая дата и время в минутах — для таймлайна (что прошло, где маркер
  // «сейчас»). Обновляем раз в полминуты: маркер двигается по минутам.
  const [nowTick, setNowTick] = useState(() => {
    const d = new Date();
    return { date: todayIso(), minutes: d.getHours() * 60 + d.getMinutes() };
  });
  useEffect(() => {
    const id = setInterval(() => {
      const d = new Date();
      setNowTick({ date: todayIso(), minutes: d.getHours() * 60 + d.getMinutes() });
    }, 30_000);
    return () => clearInterval(id);
  }, []);
  const [isOffline, setIsOffline] = useState(false);
  const [groupsLoaded, setGroupsLoaded] = useState(false);
  const [countdown, setCountdown] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Ref to current group+week for use in the online-recovery effect
  const selectedGroupRef = useRef<Group | null>(null);
  const selectedWeekRef = useRef<WeekInfo | null>(null);
  useEffect(() => { selectedGroupRef.current = selectedGroup; }, [selectedGroup]);
  useEffect(() => { selectedWeekRef.current = selectedWeek; }, [selectedWeek]);
  // МОЯ группа (из профиля) — чтобы показать «вернуться» при просмотре чужой
  const [myGroupId, setMyGroupId] = useState<number | null>(null);
  const myGroupIdRef = useRef<number | null>(null);
  useEffect(() => { myGroupIdRef.current = myGroupId; }, [myGroupId]);

  const nextItem = nowItems.find(i => i.is_next);
  const currentItem = nowItems.find(i => i.is_current);
  // На сегодня всё — бэкенд прислал первую пару следующего учебного дня
  const tomorrowItem = nowItems.find(i => i.is_tomorrow);

  const [nowMs, setNowMs] = useState(Date.now());
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!nextItem && !currentItem) { setCountdown(''); return; }
    const tick = () => {
      const now = new Date();
      setNowMs(now.getTime()); // тик для прогресса текущей пары
      if (!nextItem) { setCountdown(''); return; }
      const [h, m] = nextItem.pair_time_start.split(':').map(Number);
      const target = new Date(now);
      target.setHours(h, m, 0, 0);
      const diff = target.getTime() - now.getTime();
      if (diff <= 0) { setCountdown(''); return; }
      const totalMin = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      const hrs = Math.floor(totalMin / 60);
      const mins = totalMin % 60;
      setCountdown(hrs > 0 ? `${hrs}ч ${mins}м` : `${mins}:${String(secs).padStart(2, '0')}`);
    };
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [nextItem, currentItem]);

  const weeksRef = useRef<WeekInfo[]>([]);
  useEffect(() => { weeksRef.current = weeks; }, [weeks]);

  const loadSchedule = useCallback(async (group: Group, weekId?: number, silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    setIsOffline(false);

    try {
      let wks = weeksRef.current;
      if (wks.length === 0 || selectedGroup?.id !== group.id) {
        wks = await api.getGroupWeeks(group.id);
        setWeeks(wks);
        weeksRef.current = wks;
        await AsyncStorage.setItem(`cache_weeks_${group.id}`, JSON.stringify(wks));
      }

      let targetWeek: WeekInfo | undefined;
      if (weekId) {
        targetWeek = wks.find(w => w.id === weekId);
      } else if (selectedWeekRef.current) {
        targetWeek = wks.find(w => w.week_start === selectedWeekRef.current!.week_start);
      }
      if (!targetWeek) {
        const today = new Date().toISOString().slice(0, 10);
        targetWeek = wks.find(w => {
          const end = new Date(w.week_start + 'T00:00:00');
          end.setDate(end.getDate() + 6);
          return today >= w.week_start && today <= end.toISOString().slice(0, 10);
        }) ?? wks.find(w => w.is_latest) ?? wks[0];
      }
      if (targetWeek) setSelectedWeek(targetWeek);

      const [sched, now, st] = await Promise.all([
        api.getGroupSchedule(group.id, targetWeek?.id),
        api.getNow(group.id),
        api.getStats(group.id).catch(() => null),
      ]);
      setLessons(sched);
      setNowItems(now);
      if (st) setStats(st);

      if (targetWeek) {
        await AsyncStorage.setItem(
          `cache_schedule_${group.id}_${targetWeek.id}`,
          JSON.stringify(sched)
        );
        // Напоминания о зачётах и данные виджета — только для МОЕЙ группы
        if (group.id === myGroupIdRef.current) {
          scheduleExamReminders(sched, targetWeek.week_start).catch(() => null);
          scheduleLessonReminders(sched, targetWeek.week_start).catch(() => null);
          writeWidgetData(group, sched, targetWeek.week_start).catch(() => null);
        }
      }
    } catch {
      let wks = weeksRef.current;
      if (wks.length === 0) {
        const cachedWks = await AsyncStorage.getItem(`cache_weeks_${group.id}`);
        if (cachedWks) {
          wks = JSON.parse(cachedWks);
          setWeeks(wks);
          weeksRef.current = wks;
        }
      }
      const targetWeek = wks.find(w => w.id === weekId) ?? wks.find(w => w.is_latest);
      if (targetWeek) {
        const cached = await AsyncStorage.getItem(`cache_schedule_${group.id}_${targetWeek.id}`);
        if (cached) {
          setLessons(JSON.parse(cached));
          setSelectedWeek(targetWeek);
          setIsOffline(true);
        } else {
          setError('Нет соединения с сервером');
        }
      } else {
        setError('Нет соединения с сервером');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedGroup]);

  const loadGroup = useCallback(async (group: Group, haptic = true) => {
    if (haptic) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedGroup(group);
    setWeeks([]);
    setSelectedDay('all');
    setStats(null);
    // Сохраняем только «какую группу смотрю» — МОЯ группа (selected_group_id)
    // задаётся в профиле/онбординге и при просмотре чужих не меняется.
    await AsyncStorage.setItem('schedule_view_group_id', String(group.id));
    await loadSchedule(group);
  }, [loadSchedule]);

  const switchWeek = useCallback((week: WeekInfo) => {
    if (!selectedGroup || selectedWeek?.id === week.id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedWeek(week);
    setSelectedDay('all');
    loadSchedule(selectedGroup, week.id);
  }, [selectedGroup, selectedWeek, loadSchedule]);

  const switchWeekByOffset = useCallback((offset: number) => {
    if (!selectedGroup || weeks.length === 0) return;
    const currentIdx = weeks.findIndex(w => w.id === selectedWeek?.id);
    const nextIdx = currentIdx + offset;
    if (nextIdx >= 0 && nextIdx < weeks.length) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      switchWeek(weeks[nextIdx]);
    }
  }, [selectedGroup, weeks, selectedWeek, switchWeek]);

  // Ref для PanResponder (фиксим stale closure)
  const switchWeekByOffsetRef = useRef(switchWeekByOffset);
  useEffect(() => { switchWeekByOffsetRef.current = switchWeekByOffset; }, [switchWeekByOffset]);

  const onRefresh = useCallback(() => {
    if (!selectedGroup) return;
    setRefreshing(true);
    loadSchedule(selectedGroup, selectedWeek?.id, true);
  }, [selectedGroup, selectedWeek, loadSchedule]);

  // Когда интернет появился — тихо обновляем данные и снимаем офлайн-баннер
  useEffect(() => {
    if (onlineAt === 0) return;
    const g = selectedGroupRef.current;
    const w = selectedWeekRef.current;
    if (g) loadSchedule(g, w?.id, true);
  }, [onlineAt]);

  // Загружаем группы (с кэшем для офлайн)
  useEffect(() => {
    api.getGroups()
      .then(gs => {
        setGroups(gs);
        setGroupsLoaded(true);
        AsyncStorage.setItem('cache_groups', JSON.stringify(gs));
      })
      .catch(async () => {
        const cached = await AsyncStorage.getItem('cache_groups');
        if (cached) {
          setGroups(JSON.parse(cached));
          setGroupsLoaded(true);
          setIsOffline(true);
        } else {
          setError('Нет соединения с сервером');
        }
      });
  }, []);

  // При фокусе — загружаем сохранённую группу и фичи-флаги
  useFocusEffect(
    useCallback(() => {
      if (featuresUnlocked()) {
        AsyncStorage.multiGet(['feature_attendance', 'feature_notes']).then(pairs => {
          setFeatureAttendance(pairs[0][1] === '1');
          setFeatureNotes(pairs[1][1] === '1');
        });
      }
      if (!groupsLoaded || groups.length === 0) return;
      AsyncStorage.multiGet(['selected_group_id', 'schedule_view_group_id']).then(pairs => {
        const myId = pairs.find(([k]) => k === 'selected_group_id')?.[1];
        const viewId = pairs.find(([k]) => k === 'schedule_view_group_id')?.[1];
        if (myId) setMyGroupId(Number(myId));
        const target = Number(viewId ?? myId);
        if (!target) return;
        if (selectedGroup?.id === target) return;
        const g = groups.find(x => x.id === target);
        if (g) loadGroup(g, false);
      });
    }, [groupsLoaded, groups, selectedGroup, loadGroup])
  );

  // Свайп для переключения недели (через ref, чтобы не было stale closure)
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > 25 && Math.abs(gs.dy) < Math.abs(gs.dx),
      onPanResponderRelease: (_, gs) => {
        if (gs.dx < -40) switchWeekByOffsetRef.current(1);
        else if (gs.dx > 40) switchWeekByOffsetRef.current(-1);
      },
    })
  ).current;

  // Отметки и заметки — только на расписании СВОЕЙ группы (на чужих не нужны)
  const isMyGroup = selectedGroup != null && myGroupId != null && selectedGroup.id === myGroupId;

  const filtered = selectedDay === 'all'
    ? lessons
    : lessons.filter(l => l.day_of_week === selectedDay);

  const byDay = DAYS_ORDER.reduce((acc, day) => {
    const dl = filtered.filter(l => l.day_of_week === day);
    if (dl.length) acc[day] = dl;
    return acc;
  }, {} as Record<string, Lesson[]>);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
    <ScrollView
      style={[s.container, { backgroundColor: C.bg }]}
      contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={C.primary}
          colors={[C.primary]}
        />
      }
    >
      <StatusBar barStyle="light-content" backgroundColor="#0d9488" />

      {/* Баннер офлайн-режима */}
      {isOffline && (
        <View style={s.offlineBanner}>
          <Text style={s.offlineText}>{offlineBannerText}</Text>
        </View>
      )}

      {/* Подсказка — только до выбора группы */}
      {!selectedGroup && (
        <View style={[s.hint, { backgroundColor: C.tag, borderColor: C.border }]}>
          <Text style={[s.hintText, { color: C.muted }]}>Выберите группу ниже и нажмите на день недели. Листайте недели свайпом.</Text>
        </View>
      )}

      {/* Выбор группы */}
      <View style={[s.groupCard, { backgroundColor: C.card, borderColor: C.border }]}>
        {!groupsLoaded ? (
          <ActivityIndicator color={C.primary} />
        ) : (
          <GroupSelector groups={groups} value={selectedGroup} onChange={loadGroup} C={C} collapsible />
        )}
      </View>

      {/* Смотрим чужую группу — кнопка возврата к своей */}
      {selectedGroup && myGroupId != null && selectedGroup.id !== myGroupId && (
        <TouchableOpacity
          onPress={() => {
            const g = groups.find(x => x.id === myGroupId);
            if (g) loadGroup(g);
          }}
          activeOpacity={0.7}
          style={[s.backToMine, { backgroundColor: C.card, borderColor: C.border }]}
        >
          <Text style={{ color: C.primary, fontSize: 14, fontWeight: '600' }}>
            ← Вернуться к моей группе
          </Text>
        </TouchableOpacity>
      )}

      {error && <Text style={s.error}>{error}</Text>}

      {/* Переключатель недель (диапазон дат — в заголовке, отдельный баннер не нужен) */}
      {selectedGroup && weeks.length > 1 && (
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: C.muted }]}>
            Неделя{selectedWeek ? ` · ${weekRangeStr(selectedWeek.week_start)}` : ''} · свайп для переключения
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {weeks.map(w => {
              const active = selectedWeek?.id === w.id;
              const current = isCurrentWeek(w.week_start);
              return (
                <TouchableOpacity
                  key={w.id}
                  onPress={() => switchWeek(w)}
                  style={[
                    s.weekBtn,
                    { backgroundColor: active ? C.primary : C.card, borderColor: active ? C.primary : C.border },
                  ]}
                >
                  <Text style={[s.weekBtnText, { color: active ? '#fff' : C.fg }]}>
                    {weekLabel(w)}
                  </Text>
                  {current && (
                    <View style={[s.weekDot, { backgroundColor: active ? 'rgba(255,255,255,0.7)' : C.primary }]} />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Что идёт сейчас — показываем только когда есть текущая или следующая пара */}
      {/* На сегодня занятия кончились — показываем ближайший учебный день */}
      {selectedGroup && !loading && tomorrowItem && (
        <View style={[s.nowCard, { backgroundColor: C.greenBg, borderLeftColor: C.green, marginBottom: 12 }]}>
          <View style={s.nowCardTop}>
            <Ionicons name="checkmark-circle" size={15} color={C.green} />
            <Text style={[s.nowTitle, { color: C.fg }]}>НА СЕГОДНЯ ВСЁ</Text>
            <View style={[s.nowPairBadge, { backgroundColor: C.card, marginLeft: 'auto' }]}>
              <Text style={[s.nowPairText, { color: C.primary }]}>{tomorrowItem.pair_number} пара</Text>
            </View>
          </View>
          <Text style={{ fontSize: 11.5, color: C.muted, marginBottom: 4 }}>
            {tomorrowItem.day_label} в {tomorrowItem.pair_time_start} — первая пара:
          </Text>
          <Text style={[s.nowSubject, { color: C.fg }]}>{tomorrowItem.subject}</Text>
          <View style={s.roomRow}>
            {tomorrowItem.room && (
              <View style={[s.roomChip, { backgroundColor: C.blueBg }]}>
                <Text style={[s.roomChipText, { color: C.primary }]}>ауд. {tomorrowItem.room}</Text>
              </View>
            )}
            {tomorrowItem.teacher && (
              <Text style={[s.nowMeta, { color: C.muted }]}>{tomorrowItem.teacher}</Text>
            )}
          </View>
        </View>
      )}

      {selectedGroup && !loading && (currentItem || nextItem) && (
        <View style={s.nowRow}>
          {currentItem && (
            <View style={[s.nowCard, { backgroundColor: C.greenBg, borderLeftColor: C.green }]}>
              <View style={s.nowCardTop}>
                <View style={[s.nowDot, { backgroundColor: C.green }]} />
                <Text style={[s.nowTitle, { color: C.fg }]}>ИДЁТ СЕЙЧАС</Text>
                <View style={[s.nowPairBadge, { backgroundColor: C.card }]}>
                  <Text style={[s.nowPairText, { color: C.primary }]}>{currentItem.pair_number} пара</Text>
                </View>
              </View>
              <Text style={[s.nowSubject, { color: C.fg }]}>{currentItem.subject}</Text>
              <Text style={[s.nowMeta, { color: C.muted }]}>
                {currentItem.pair_time_start}–{currentItem.pair_time_end}
                {currentItem.teacher ? ` · ${currentItem.teacher}` : ''}
                {currentItem.room ? ` · ауд. ${currentItem.room}` : ''}
              </Text>
              {(() => {
                // Прогресс пары: сколько прошло из 90 минут
                const [sh, sm] = currentItem.pair_time_start.split(':').map(Number);
                const [eh, em] = currentItem.pair_time_end.split(':').map(Number);
                const st = new Date(nowMs); st.setHours(sh, sm, 0, 0);
                const en = new Date(nowMs); en.setHours(eh, em, 0, 0);
                const p = Math.min(1, Math.max(0, (nowMs - st.getTime()) / (en.getTime() - st.getTime())));
                const left = Math.max(0, Math.ceil((en.getTime() - nowMs) / 60000));
                return (
                  <View style={{ marginTop: 8 }}>
                    <View style={{ height: 5, borderRadius: 3, backgroundColor: C.card, overflow: 'hidden' }}>
                      <View style={{ width: `${p * 100}%`, height: 5, borderRadius: 3, backgroundColor: C.green }} />
                    </View>
                    <Text style={{ fontSize: 11, color: C.muted, marginTop: 3, textAlign: 'right' }}>
                      осталось {left} мин
                    </Text>
                  </View>
                );
              })()}
            </View>
          )}
          {nextItem && (
            <View style={[s.nowCard, { backgroundColor: C.blueBg, borderLeftColor: C.primary }]}>
              <View style={s.nowCardTop}>
                {/* Во время перемены важнее сказать «идёт перемена», чем «следующая» */}
                <Text style={[s.nowTitle, { color: C.fg }]}>
                  {nextItem.break_minutes != null
                    ? breakLabel(nextItem.break_minutes).toUpperCase()
                    : 'СЛЕДУЮЩАЯ'}
                </Text>
                <View style={[s.nowPairBadge, { backgroundColor: C.card }]}>
                  <Text style={[s.nowPairText, { color: C.primary }]}>{nextItem.pair_number} пара</Text>
                </View>
                {countdown ? <Text style={[s.countdown, { color: C.primary }]}>{countdown}</Text> : null}
              </View>
              {nextItem.break_minutes != null && (
                <Text style={{ fontSize: 11.5, color: C.muted, marginBottom: 4 }}>
                  {nextItem.break_minutes <= 20
                    ? 'Не уходи далеко — скоро начнётся:'
                    : 'Дальше по расписанию:'}
                </Text>
              )}
              <Text style={[s.nowSubject, { color: C.fg }]}>{nextItem.subject}</Text>
              {/* Аудиторию — отдельно и крупно: на перемене это главный вопрос */}
              <View style={s.roomRow}>
                {nextItem.room && (
                  <View style={[s.roomChip, { backgroundColor: C.card }]}>
                    <Text style={[s.roomChipText, { color: C.primary }]}>ауд. {nextItem.room}</Text>
                  </View>
                )}
                <Text style={[s.nowMeta, { color: C.muted }]}>
                  {nextItem.pair_time_start}–{nextItem.pair_time_end}
                  {nextItem.teacher ? ` · ${nextItem.teacher}` : ''}
                </Text>
              </View>
              {/* Прогресс перемены — видно, сколько от неё осталось */}
              {nextItem.break_minutes != null && nextItem.break_minutes > 0 && (() => {
                const [bh, bm] = nextItem.pair_time_start.split(':').map(Number);
                const start = new Date(nowMs);
                start.setHours(bh, bm, 0, 0);
                const leftMs = start.getTime() - nowMs;
                const totalMs = nextItem.break_minutes * 60000;
                const p = Math.min(1, Math.max(0, 1 - leftMs / totalMs));
                return (
                  <View style={{ marginTop: 8, height: 5, borderRadius: 3, backgroundColor: C.card, overflow: 'hidden' }}>
                    <View style={{ width: `${p * 100}%`, height: 5, borderRadius: 3, backgroundColor: C.primary }} />
                  </View>
                );
              })()}
            </View>
          )}
        </View>
      )}

      {/* Статистика недели */}
      {stats && stats.total_lessons_week >= 3 && (
        <View style={[s.statsRow, { backgroundColor: C.card, borderColor: C.border }]}>
          <View style={s.statItem}>
            <Text style={[s.statNum, { color: C.primary }]}>{stats.total_lessons_week}</Text>
            <Text style={[s.statLabel, { color: C.muted }]}>пар</Text>
          </View>
          <View style={[s.statDivider, { backgroundColor: C.border }]} />
          <View style={s.statItem}>
            <Text style={[s.statNum, { color: C.primary }]}>{stats.unique_subjects}</Text>
            <Text style={[s.statLabel, { color: C.muted }]}>предметов</Text>
          </View>
          <View style={[s.statDivider, { backgroundColor: C.border }]} />
          <View style={s.statItem}>
            <Text style={[s.statNum, { color: C.primary }]}>{stats.unique_teachers}</Text>
            <Text style={[s.statLabel, { color: C.muted }]}>педагогов</Text>
          </View>
          {stats.most_loaded_day && (
            <>
              <View style={[s.statDivider, { backgroundColor: C.border }]} />
              <View style={s.statItem}>
                <Text style={[s.statNum, { color: C.primary }]}>
                  {DAY_LABELS[stats.most_loaded_day] ?? stats.most_loaded_day.slice(0, 2).toUpperCase()}
                </Text>
                <Text style={[s.statLabel, { color: C.muted }]}>загружен</Text>
              </View>
            </>
          )}
        </View>
      )}

      {/* Одноразовая подсказка — только когда функции включены и только своей группе */}
      {isMyGroup && (featureAttendance || featureNotes) && (
        <FeatureHint skips={featureAttendance} notes={featureNotes} />
      )}

      {/* Фильтр по дню */}
      {selectedGroup && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.dayBar}>
          {['all', ...DAYS_ORDER].map(day => {
            const active = selectedDay === day;
            const hasLessons = day !== 'all' && lessons.some(l => l.day_of_week === day);
            return (
              <TouchableOpacity
                key={day}
                onPress={() => {
                  if (selectedDay !== day) Haptics.selectionAsync();
                  setSelectedDay(day);
                }}
                style={[
                  s.dayBtn,
                  { backgroundColor: active ? C.primary : C.card, borderColor: active ? C.primary : C.border },
                ]}
              >
                <Text style={[s.dayBtnText, { color: active ? '#fff' : C.fg }]}>
                  {day === 'all' ? 'Вся неделя' : DAY_LABELS[day]}
                </Text>
                {hasLessons && (
                  <View style={[s.dayDot, { backgroundColor: active ? 'rgba(255,255,255,0.8)' : C.primary }]} />
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Скелетон загрузки */}
      {loading && (
        <View>
          {[1, 2, 3].map(i => <SkeletonCard key={i} C={C} />)}
        </View>
      )}

      {/* Расписание — со свайпом для переключения недель */}
      {!loading && (
        <View {...panResponder.panHandlers}>
          {Object.entries(byDay).map(([day, dayLessons]) => (
            <View key={day}>
              {/* Отступы держит строка, у самого текста они сняты — иначе
                  плашка «сегодня» выравнивалась бы по краю отступа, не по тексту */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 4, marginBottom: 8 }}>
                <Text style={[s.dayHeader, { color: C.primary, marginTop: 0, marginBottom: 0 }]}>
                  {day.charAt(0).toUpperCase() + day.slice(1)}
                  {selectedWeek ? `, ${getDayDate(day, selectedWeek.week_start)}` : ''}
                </Text>
                {dayLessons[0]?.lesson_date === nowTick.date && (
                  <View style={{ backgroundColor: C.blueBg, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 }}>
                    <Text style={{ fontSize: 9.5, fontWeight: '800', color: C.primary, letterSpacing: 0.4 }}>
                      СЕГОДНЯ
                    </Text>
                  </View>
                )}
              </View>
              <DayTimeline
                lessons={dayLessons}
                C={C}
                todayDate={nowTick.date}
                nowMinutes={nowTick.minutes}
                dimPast={selectedWeek ? isCurrentWeek(selectedWeek.week_start) : false}
                showAttendance={featureAttendance && isMyGroup}
                showNotes={featureNotes && isMyGroup}
              />
            </View>
          ))}

          {selectedGroup && Object.keys(byDay).length === 0 && (
            <View style={s.emptyState}>
              {isVacation() && lessons.length === 0 ? (
                <>
                  <Ionicons name="sunny-outline" size={44} color={C.primary} style={{ marginBottom: 10 }} />
                  <Text style={[s.emptyTitle, { color: C.fg }]}>Каникулы!</Text>
                  <Text style={[s.emptyText, { color: C.muted, textAlign: 'center', paddingHorizontal: 24 }]}>
                    Занятий нет — отдыхаем. Расписание появится ближе к 1 сентября.
                  </Text>
                </>
              ) : (
                <>
                  <Text style={[s.emptyTitle, { color: C.fg }]}>Занятий не найдено</Text>
                  <Text style={[s.emptyText, { color: C.muted }]}>
                    {selectedDay !== 'all' ? 'В этот день пар нет' : 'На этой неделе занятий нет'}
                  </Text>
                </>
              )}
            </View>
          )}
          {!selectedGroup && (
            <View style={s.emptyState}>
              <Text style={[s.emptyTitle, { color: C.fg }]}>Выберите группу выше</Text>
              <Text style={[s.emptyText, { color: C.muted }]}>Чтобы увидеть расписание</Text>
            </View>
          )}
        </View>
      )}
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },

  hint: { borderRadius: 10, padding: 10, marginBottom: 12, borderWidth: 1 },
  hintText: { fontSize: 12, lineHeight: 17 },

  offlineBanner: {
    backgroundColor: '#f59e0b',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  offlineText: { fontSize: 12, color: '#fff', fontWeight: '600', textAlign: 'center' },

  section: { marginBottom: 12 },
  sectionTitle: { fontSize: 11, fontWeight: '600', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },

  groupCard: { borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 0.5 },
  backToMine: {
    borderRadius: 12, borderWidth: 1, paddingVertical: 11,
    alignItems: 'center', marginTop: -4, marginBottom: 12,
  },

  weekBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 10, marginRight: 8, borderWidth: 1,
  },
  weekBtnText: { fontSize: 13, fontWeight: '500' },
  weekDot: { width: 6, height: 6, borderRadius: 3 },

  nowRow: { gap: 10, marginBottom: 12 },
  nowCard: { borderRadius: 12, padding: 14, borderLeftWidth: 3 },
  nowCardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' },
  nowDot: { width: 8, height: 8, borderRadius: 4 },
  nowTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  nowPairBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  nowPairText: { fontSize: 11, fontWeight: '600' },
  countdown: { marginLeft: 'auto', fontSize: 18, fontWeight: '800' },
  nowSubject: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  nowMeta: { fontSize: 12 },
  roomRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 },
  roomChip: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 },
  roomChipText: { fontSize: 13, fontWeight: '700' },

  dayBar: { marginBottom: 12 },
  dayBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, marginRight: 8, borderWidth: 1, alignItems: 'center' },
  dayDot: { width: 5, height: 5, borderRadius: 3, marginTop: 3 },
  dayBtnText: { fontSize: 12, fontWeight: '500' },

  dayHeader: {
    fontSize: 12, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: 8, marginTop: 4,
  },

  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyTitle: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  emptyText: { fontSize: 13 },

  error: { color: '#dc2626', textAlign: 'center', marginVertical: 12 },

  statsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
    borderRadius: 12, borderWidth: 0.5, paddingVertical: 12, marginBottom: 12,
  },
  statItem: { alignItems: 'center', flex: 1 },
  statNum: { fontSize: 22, fontWeight: '700' },
  statLabel: { fontSize: 10, marginTop: 2 },
  statDivider: { width: 0.5, height: 32 },
});
