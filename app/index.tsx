import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Pressable,
  StyleSheet, StatusBar, RefreshControl, PanResponder, Animated, TextInput,
  KeyboardAvoidingView, Platform, Alert, LayoutAnimation, UIManager, useWindowDimensions,
  AppState,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import {
  api, invalidateApiCache, Group, Lesson, TodayItem, WeekInfo, Stats,
  DAYS_ORDER, DAY_LABELS, breakLabel, gapBetween, leadingGap, humanDuration, shortGroupName,
} from '../src/api';
import ScheduleShareCard from '../src/ScheduleShareCard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../src/theme';
import { useSyncStatus } from '../src/SyncContext';
import {
  scheduleExamReminders, scheduleLessonReminders,
  NOTIF_PREF_KEY, LESSON_NOTIF_PREF_KEY,
} from '../src/examNotifications';
import GroupSelector from '../src/GroupSelector';
import RadialProgress from '../src/RadialProgress';
import { Ionicons } from '@expo/vector-icons';
import { featuresUnlocked } from '../src/features';
import { writeWidgetData } from '../src/widgetData';
import { refreshLiveLesson } from '../src/liveLesson';
import { skipKey, noteWeeklyKey, noteDatedKey, isPastLesson, todayIso } from '../src/studyData';
import FeatureHint from '../src/FeatureHint';
import CourseCheckBanner from '../src/CourseCheckBanner';

// На старой архитектуре Android LayoutAnimation работает только после этого
// вызова; на новой (Fabric, включена по умолчанию в этом проекте) метод
// может отсутствовать — проверяем перед вызовом, чтобы не упасть.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Порядок листания свайпом/кнопками: «вся неделя» → пн → вт → …
const DAY_SWIPE_ORDER = ['all', ...DAYS_ORDER];

// msu.tj присылает сокращение "ЛК", а не полное слово "ЛЕКЦИЯ" — раньше
// оно не входило в карту, и лекция получала цвет по умолчанию (тот же
// синий, что и вообще любой нераспознанный тип). Прописано явно, тем же
// синим, что теперь на вебе (lesson-tag-lecture в globals.css) — раньше
// был зелёный, тот же, что у активной кнопки, и полоса не читалась как
// «это именно лекция».
const TYPE_COLORS: Record<string, string> = {
  ЗАЧЕТ: '#d43a40', ЭКЗАМЕН: '#d43a40', ПРАКТИКА: '#5650d6', ПЗ: '#5650d6',
  ЛК: '#2563eb', ЛЕКЦИЯ: '#2563eb',
};
const TYPE_LABELS: Record<string, string> = {
  ЗАЧЕТ: 'Зачёт', ЭКЗАМЕН: 'Экзамен', ПРАКТИКА: 'Практика', ПЗ: 'Практика',
  ЛК: 'Лекция', ЛЕКЦИЯ: 'Лекция',
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

function dayDateObj(dayName: string, weekStart: string): Date | null {
  const idx = DAYS_ORDER.indexOf(dayName);
  if (idx === -1 || !weekStart) return null;
  const d = new Date(weekStart + 'T00:00:00');
  d.setDate(d.getDate() + idx);
  return d;
}

const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

function getDayDate(dayName: string, weekStart: string): string {
  const d = dayDateObj(dayName, weekStart);
  return d ? `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}` : '';
}

/** Сегодняшний ли день недели в этой конкретной неделе — для отметки на
 *  пилюле фильтра, даже когда у дня нет ни одной пары. */
function isTodayDay(dayName: string, weekStart: string): boolean {
  const d = dayDateObj(dayName, weekStart);
  if (!d) return false;
  const t = new Date();
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
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
        // У первой пары дня сравнивать не с чем — leadingGap меряет от
        // начала дня (I пара), а не от предыдущего занятия.
        const gap = i > 0
          ? gapBetween(lessons[i - 1].pair_number, l.pair_number)
          : leadingGap(l.pair_number);
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
                  links
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

/** Заглушка выбора группы на время первой загрузки списка групп — форма
 *  повторяет GroupSelector (подпись + ряд пилюль-направлений), чтобы не
 *  смешивать на одном экране два разных языка загрузки (спиннер + skeleton). */
function GroupSelectorSkeleton({ C }: { C: ReturnType<typeof useTheme> }) {
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
    <Animated.View style={{ opacity }}>
      <View style={{ height: 11, width: 96, borderRadius: 4, backgroundColor: C.border, marginBottom: 10 }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {[64, 58, 76, 50, 70, 56].map((w, i) => (
          <View key={i} style={{ height: 42, width: w, borderRadius: 14, backgroundColor: C.border }} />
        ))}
      </View>
    </Animated.View>
  );
}

function LessonCard({ lesson, C, showAttendance, showNotes, compactTime, current, links }: {
  lesson: Lesson;
  C: ReturnType<typeof useTheme>;
  showAttendance?: boolean;
  showNotes?: boolean;
  /** Внутри таймлайна время показано на рельсе слева — здесь не дублируем. */
  compactTime?: boolean;
  /** Пара идёт прямо сейчас — подсвечиваем рамку. */
  current?: boolean;
  /** Делать ФИО и аудиторию тапабельными: ФИО → расписание преподавателя,
   *  аудитория → кто ещё занят в это время. Включаем только в расписании
   *  группы: на экране преподавателя ссылка вела бы на него же. */
  links?: boolean;
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

  // Галочка «повторять каждую неделю» не просто появляется/пропадает —
  // выскакивает с лёгким перелётом, чтобы подтверждение ощущалось.
  const checkScale = useRef(new Animated.Value(repeatWeekly ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(checkScale, {
      toValue: repeatWeekly ? 1 : 0,
      friction: 5,
      tension: 300,
      useNativeDriver: true,
    }).start();
  }, [repeatWeekly, checkScale]);

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
        {/* ФИО и аудитория — быстрые переходы. Тапабельны только они, а не вся
            карточка: внутри неё есть кнопка пропуска и поле заметки, и тап по
            карточке целиком превратился бы в угадайку «куда я нажал». */}
        {lesson.teacher && (
          links ? (
            <TouchableOpacity
              onPress={() => {
                Haptics.selectionAsync();
                router.push({ pathname: '/teachers', params: { teacher: String(lesson.teacher!.id) } });
              }}
              accessibilityRole="link"
              accessibilityLabel={`Расписание преподавателя ${lesson.teacher.name}`}
              hitSlop={6}
            >
              <Text style={[cardStyles.metaText, cardStyles.metaLink, { color: C.primary }]}>
                Преп.: {lesson.teacher.name}
              </Text>
            </TouchableOpacity>
          ) : (
            <Text style={[cardStyles.metaText, { color: C.muted }]}>Преп.: {lesson.teacher.name}</Text>
          )
        )}
        {lesson.room && (
          links ? (
            <TouchableOpacity
              onPress={() => {
                Haptics.selectionAsync();
                router.push({
                  pathname: '/rooms',
                  params: { day: lesson.day_of_week, pair: lesson.pair_number },
                });
              }}
              accessibilityRole="link"
              accessibilityLabel="Кто ещё занят в это время"
              hitSlop={6}
            >
              <Text style={[cardStyles.metaText, cardStyles.metaLink, { color: C.primary }]}>
                Ауд. {lesson.room.name}
              </Text>
            </TouchableOpacity>
          ) : (
            <Text style={[cardStyles.metaText, { color: C.muted }]}>Ауд. {lesson.room.name}</Text>
          )
        )}
      </View>

      {/* Пропуск: отмечаем только то, что пропустили */}
      {showAttendance && canMarkSkip && (
        <View style={[cardStyles.attRow, { borderTopColor: C.border }]}>
          <Pressable
            onPress={toggleSkip}
            accessibilityRole="button"
            accessibilityState={{ selected: skipped }}
            accessibilityLabel={skipped ? 'Пропуск отмечен, нажми чтобы убрать' : 'Отметить пропуск'}
            style={({ pressed }) => [cardStyles.attBtn, {
              backgroundColor: skipped ? '#ef4444' : 'transparent',
              borderColor: skipped ? '#ef4444' : C.border,
              flexDirection: 'row', alignItems: 'center', gap: 5,
              transform: [{ scale: pressed ? 0.96 : 1 }],
            }]}
          >
            {skipped && <Ionicons name="close-circle" size={13} color="#fff" />}
            <Text style={[cardStyles.attBtnText, { color: skipped ? '#fff' : C.muted }]}>
              {skipped ? 'Пропустил' : 'Отметить пропуск'}
            </Text>
          </Pressable>
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
                <Pressable
                  onPress={toggleRepeat}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: repeatWeekly }}
                  style={({ pressed }) => ({
                    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8,
                    transform: [{ scale: pressed ? 0.96 : 1 }],
                  })}
                >
                  <View style={{
                    width: 15, height: 15, borderRadius: 4, borderWidth: 1,
                    alignItems: 'center', justifyContent: 'center',
                    borderColor: repeatWeekly ? C.primary : C.border,
                    backgroundColor: repeatWeekly ? C.primary : 'transparent',
                  }}>
                    <Animated.View style={{ transform: [{ scale: checkScale }] }}>
                      <Ionicons name="checkmark" size={11} color="#fff" />
                    </Animated.View>
                  </View>
                  <Text style={{ fontSize: 11.5, color: repeatWeekly ? C.primary : C.muted }}>
                    Повторять каждую неделю
                  </Text>
                </Pressable>
              )}
            </>
          ) : note ? (
            // Компактная строка-индикатор: заметка видна, тап — редактирование
            <Pressable
              onPress={() => { Haptics.selectionAsync(); setEditingNote(true); }}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'flex-start', gap: 6,
                transform: [{ scale: pressed ? 0.96 : 1 }],
              })}
            >
              <Ionicons name="pencil" size={13} color={C.primary} style={{ marginTop: 1 }} />
              <Text style={{ fontSize: 12.5, color: C.fg, flex: 1 }} numberOfLines={2}>{note}</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => { Haptics.selectionAsync(); setEditingNote(true); }}
              style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.96 : 1 }] })}
            >
              <Text style={[cardStyles.addNoteText, { color: C.muted }]}>+ Добавить заметку</Text>
            </Pressable>
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
  // Пунктирное подчёркивание — намёк, что это ссылка, а не просто текст
  metaLink: { textDecorationLine: 'underline', textDecorationStyle: 'dotted' },
  attRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 0.5 },
  attLabel: { fontSize: 12, marginRight: 4 },
  attBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  attBtnText: { fontSize: 12, fontWeight: '600' },
  notesRow: { marginTop: 10, paddingTop: 10, borderTopWidth: 0.5 },
  noteInput: { borderRadius: 8, padding: 8, fontSize: 12, borderWidth: 1, minHeight: 48, textAlignVertical: 'top' },
  addNoteText: { fontSize: 12 },
});

/**
 * Какую неделю показывать: явно запрошенную → ту, что смотрели → текущую по
 * календарю → последнюю. Вынесено из loadSchedule, потому что тот же выбор
 * нужен и при отрисовке из офлайн-кэша, до всякой сети.
 */
/** Высота липкой плашки дня. Она же — порог, за которым день считается текущим. */
const STICKY_DAY_H = 46;

function pickWeek(
  wks: WeekInfo[],
  weekId?: number,
  preferredStart?: string,
): WeekInfo | null {
  if (!wks.length) return null;
  if (weekId) {
    const byId = wks.find(w => w.id === weekId);
    if (byId) return byId;
  }
  if (preferredStart) {
    const byStart = wks.find(w => w.week_start === preferredStart);
    if (byStart) return byStart;
  }
  const today = new Date().toISOString().slice(0, 10);
  const current = wks.find(w => {
    const end = new Date(w.week_start + 'T00:00:00');
    end.setDate(end.getDate() + 6);
    return today >= w.week_start && today <= end.toISOString().slice(0, 10);
  });
  return current ?? wks.find(w => w.is_latest) ?? wks[0];
}

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
  const groupsLoadedRef = useRef(false);
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

  /**
   * Пересобрать локальные напоминания (зачёты + «за 10 минут до пары»).
   *
   * Сигнатура нужна, чтобы не гонять пересборку впустую: каждый вызов снимает
   * все свои уведомления и ставит их заново — это несколько десятков вызовов
   * в нативный планировщик, а фокус на вкладке случается постоянно.
   * Пересобираем, только когда реально что-то поменялось: переключатель в
   * кабинете, неделя или набор пар.
   */
  const remindersSigRef = useRef('');
  const applyReminders = useCallback(async (ls: Lesson[], weekStart: string) => {
    try {
      const prefs = await AsyncStorage.multiGet([NOTIF_PREF_KEY, LESSON_NOTIF_PREF_KEY]);
      // В подпись входит всё, что попадает в текст уведомления: поменялась
      // аудитория или предмет — напоминание должно перестроиться, даже если
      // число пар осталось прежним.
      const body = ls
        .map(l => `${l.lesson_date ?? l.day_of_week}${l.pair_number}${l.subject}${l.room?.name ?? ''}${l.lesson_type ?? ''}`)
        .join('|');
      const sig = `${prefs[0][1]}|${prefs[1][1]}|${weekStart}|${body}`;
      if (sig === remindersSigRef.current) return;
      remindersSigRef.current = sig;
      await scheduleExamReminders(ls, weekStart);
      await scheduleLessonReminders(ls, weekStart);
    } catch {
      // Разрешения нет или планировщик недоступен — не критично
      remindersSigRef.current = '';
    }
  }, []);

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
  // Пользователь сам переключил неделю кнопками? Пока нет — неделю всегда
  // выбираем по сегодняшней дате. Иначе экран, нарисованный по кэшу недельной
  // давности, «прилипал» бы к прошлой неделе: свежий список пришёл, а мы ищем
  // в нём ту же неделю, что показали из кэша.
  const userPickedWeekRef = useRef(false);
  const lessonsRef = useRef<Lesson[]>([]);
  useEffect(() => { lessonsRef.current = lessons; }, [lessons]);

  const preferredWeekStart = useCallback(
    () => (userPickedWeekRef.current ? selectedWeekRef.current?.week_start : undefined),
    [],
  );

  /**
   * Мгновенная отрисовка из офлайн-кэша: те же ключи AsyncStorage, что
   * заполняет полная синхронизация (syncService.ts). Раньше кэш читался
   * только когда сеть УЖЕ упала — то есть после 15 секунд ожидания, а на
   * спящем Render и того дольше. Теперь наоборот: сначала показываем то,
   * что есть, потом молча обновляем.
   */
  const paintFromCache = useCallback(async (group: Group, weekId?: number): Promise<WeekInfo | null> => {
    try {
      const rawWeeks = await AsyncStorage.getItem(`cache_weeks_${group.id}`);
      if (!rawWeeks) return null;
      const wks: WeekInfo[] = JSON.parse(rawWeeks);
      if (!wks.length) return null;
      const target = pickWeek(wks, weekId, preferredWeekStart());
      if (!target) return null;
      const rawSched = await AsyncStorage.getItem(`cache_schedule_${group.id}_${target.id}`);
      if (!rawSched) return null;
      setWeeks(wks);
      weeksRef.current = wks;
      setSelectedWeek(target);
      setLessons(JSON.parse(rawSched));
      return target;
    } catch {
      return null;
    }
  }, [preferredWeekStart]);

  const loadSchedule = useCallback(async (group: Group, weekId?: number, silent = false) => {
    setError(null);
    setIsOffline(false);

    // 1. Сначала — то, что уже лежит на устройстве. Экран заполняется за
    //    миллисекунды, а не за время ответа сервера.
    let cachedWeek: WeekInfo | null = null;
    if (!silent) {
      cachedWeek = await paintFromCache(group, weekId);
      setLoading(!cachedWeek);
    }

    try {
      // 2. Свежие данные. Если неделя уже известна из кэша, расписание
      //    запрашивается ПАРАЛЛЕЛЬНО со списком недель, а не после него —
      //    минус один round-trip на каждое открытие экрана.
      const weeksPromise = api.getGroupWeeks(group.id);
      const fastSchedule = cachedWeek ? api.getGroupSchedule(group.id, cachedWeek.id) : null;
      const nowPromise = api.getNow(group.id);
      const statsPromise = api.getStats(group.id).catch(() => null);
      // Запросы уходят до того, как мы решим, кого ждать. Пустой catch —
      // страховка от «unhandled promise rejection», сам результат он не съедает:
      // Promise.all ниже всё равно увидит отказ.
      nowPromise.catch(() => null);
      fastSchedule?.catch(() => null);

      const wks = await weeksPromise;
      setWeeks(wks);
      weeksRef.current = wks;
      AsyncStorage.setItem(`cache_weeks_${group.id}`, JSON.stringify(wks)).catch(() => null);

      const targetWeek = pickWeek(wks, weekId, preferredWeekStart());
      if (targetWeek) setSelectedWeek(targetWeek);

      // Сервер подтвердил ту же неделю, что была в кэше — используем уже
      // летящий запрос; если неделя другая, спрашиваем заново.
      const schedPromise =
        fastSchedule && targetWeek && targetWeek.id === cachedWeek?.id
          ? fastSchedule
          : api.getGroupSchedule(group.id, targetWeek?.id);

      const [sched, now, st] = await Promise.all([schedPromise, nowPromise, statsPromise]);
      setLessons(sched);
      setNowItems(now);
      if (st) setStats(st);

      if (targetWeek) {
        await AsyncStorage.setItem(
          `cache_schedule_${group.id}_${targetWeek.id}`,
          JSON.stringify(sched)
        );
        // Напоминания, виджет и данные строки «идёт пара» — только для МОЕЙ
        // группы и только по ТЕКУЩЕЙ неделе.
        //
        // Про неделю важно: напоминания пересобираются «снять все свои и
        // поставить заново», а из архивной недели ставить нечего — все пары
        // в прошлом. То есть достаточно было заглянуть в расписание прошлой
        // недели, чтобы молча остаться без напоминаний о завтрашнем зачёте
        // и без «за 10 минут до пары» на сегодня.
        if (group.id === myGroupIdRef.current && isCurrentWeek(targetWeek.week_start)) {
          applyReminders(sched, targetWeek.week_start);
          writeWidgetData(group, sched, targetWeek.week_start)
            .then(() => refreshLiveLesson())
            .catch(() => null);
        }
      }
      return true;
    } catch {
      // Сети нет. Если экран уже нарисован из кэша — просто помечаем офлайн
      // и ничего не портим.
      if (cachedWeek) {
        setIsOffline(true);
        return false;
      }
      let wks = weeksRef.current;
      if (wks.length === 0) {
        const cachedWks = await AsyncStorage.getItem(`cache_weeks_${group.id}`);
        if (cachedWks) {
          wks = JSON.parse(cachedWks);
          setWeeks(wks);
          weeksRef.current = wks;
        }
      }
      const targetWeek = pickWeek(wks, weekId, preferredWeekStart());
      const cached = targetWeek
        ? await AsyncStorage.getItem(`cache_schedule_${group.id}_${targetWeek.id}`)
        : null;
      if (targetWeek && cached) {
        setLessons(JSON.parse(cached));
        setSelectedWeek(targetWeek);
        setIsOffline(true);
      } else if (!silent || lessonsRef.current.length === 0) {
        // При тихом обновлении молчим — но только если на экране что-то есть.
        setError('Нет соединения с сервером');
      }
      return false;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [paintFromCache, preferredWeekStart, applyReminders]);

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
    userPickedWeekRef.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedWeek(week);
    setSelectedDay('all');
    loadSchedule(selectedGroup, week.id);
  }, [selectedGroup, selectedWeek, loadSchedule]);

  // Свайп листает ДНИ (как на сайте); недели переключаются кнопками сверху.
  // Новый день выезжает с той стороны, куда тянули.
  const slideX = useRef(new Animated.Value(0)).current;
  const switchDayByOffset = useCallback((offset: 1 | -1) => {
    const idx = DAY_SWIPE_ORDER.indexOf(selectedDay);
    const next = DAY_SWIPE_ORDER[idx + offset];
    if (idx < 0 || !next) return;   // край списка — дальше листать некуда
    Haptics.selectionAsync();
    setSelectedDay(next);
    slideX.setValue(offset === 1 ? 24 : -24);
    Animated.timing(slideX, { toValue: 0, duration: 220, useNativeDriver: true }).start();
  }, [selectedDay, slideX]);

  const switchDayByOffsetRef = useRef(switchDayByOffset);
  useEffect(() => { switchDayByOffsetRef.current = switchDayByOffset; }, [switchDayByOffset]);
  // Для панжеста: та же проблема устаревшего closure, что и у switchDayByOffset выше.
  const selectedDayRef = useRef(selectedDay);
  useEffect(() => { selectedDayRef.current = selectedDay; }, [selectedDay]);

  // Подтверждение после pull-to-refresh: без него неясно, обновилось ли
  // что-то на самом деле, особенно пока бэкенд просыпается (холодный старт
  // Render — 600–1300мс). Показываем только на настоящем успехе, не на
  // офлайн-фолбэке — иначе «Обновлено» было бы неправдой.
  const [refreshToast, setRefreshToast] = useState(false);
  const refreshToastOpacity = useRef(new Animated.Value(0)).current;
  const showRefreshToast = useCallback(() => {
    setRefreshToast(true);
    refreshToastOpacity.setValue(0);
    Animated.sequence([
      Animated.timing(refreshToastOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(1400),
      Animated.timing(refreshToastOpacity, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start(({ finished }) => { if (finished) setRefreshToast(false); });
  }, [refreshToastOpacity]);

  const onRefresh = useCallback(() => {
    if (!selectedGroup) return;
    setRefreshing(true);
    // Сбрасываем кэш в памяти: иначе повторный жест в течение TTL отдавал бы
    // те же данные и всё равно рисовал галочку «Обновлено». Трогаем только
    // расписание — проверка версии приложения пусть живёт своей жизнью.
    invalidateApiCache('/schedule/');
    loadSchedule(selectedGroup, selectedWeek?.id, true).then(ok => { if (ok) showRefreshToast(); });
  }, [selectedGroup, selectedWeek, loadSchedule, showRefreshToast]);

  // Когда интернет появился — тихо обновляем данные и снимаем офлайн-баннер
  useEffect(() => {
    if (onlineAt === 0) return;
    const g = selectedGroupRef.current;
    const w = selectedWeekRef.current;
    if (g) loadSchedule(g, w?.id, true);
  }, [onlineAt]);

  // Загружаем группы — сначала из кэша, потом с сервера.
  // Порядок важен: пока список групп не загружен, useFocusEffect ниже не
  // начинает грузить расписание. Раньше это значило, что на холодном старте
  // экран ждал ответа сервера дважды подряд; теперь список берётся с диска
  // мгновенно, а свежий подъезжает следом.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cached = await AsyncStorage.getItem('cache_groups');
        if (cached && !cancelled) {
          const gs: Group[] = JSON.parse(cached);
          if (gs.length) { setGroups(gs); groupsLoadedRef.current = true; setGroupsLoaded(true); }
        }
      } catch { /* битый кэш — просто подождём сервер */ }

      try {
        const gs = await api.getGroups();
        if (cancelled) return;
        setGroups(gs);
        groupsLoadedRef.current = true;
        setGroupsLoaded(true);
        AsyncStorage.setItem('cache_groups', JSON.stringify(gs)).catch(() => null);
      } catch {
        if (cancelled) return;
        if (groupsLoadedRef.current) setIsOffline(true);
        else setError('Нет соединения с сервером');
      }
    })();
    return () => { cancelled = true; };
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

  // Переключатели уведомлений живут в кабинете, а ставятся напоминания здесь,
  // при загрузке расписания. Но возврат на эту вкладку расписание НЕ
  // перезагружает (группа та же), и подсказка кабинета «открой расписание,
  // чтобы напоминания встали» не сбывалась: включил — и ничего не произошло
  // до перезапуска приложения. Поэтому на фокусе пересобираем напоминания из
  // уже загруженных пар (applyReminders сам ничего не делает, если ничего
  // не изменилось).
  useFocusEffect(
    useCallback(() => {
      const g = selectedGroupRef.current;
      const w = selectedWeekRef.current;
      const ls = lessonsRef.current;
      if (!g || !w || !ls.length) return;
      if (g.id !== myGroupIdRef.current || !isCurrentWeek(w.week_start)) return;
      applyReminders(ls, w.week_start);
    }, [applyReminders])
  );

  // «Идёт сейчас», «перемена» и «на сегодня всё» считает сервер по текущей
  // минуте, а Android держит приложение в памяти сутками: без обновления
  // утренняя пара так и висела бы «идёт сейчас» вечером, а отсчёт до конца
  // замирал на нуле. Обновляем при возврате в приложение и раз в минуту, пока
  // экран открыт. Ответ моложе минуты берётся из кэша, лишних запросов нет.
  useFocusEffect(
    useCallback(() => {
      const refreshNow = () => {
        if (AppState.currentState !== 'active') return;
        const g = selectedGroupRef.current;
        if (!g) return;
        api.getNow(g.id).then(setNowItems).catch(() => null);
      };
      refreshNow();   // вернулись с другой вкладки — данные могли протухнуть
      const id = setInterval(refreshNow, 60_000);
      const sub = AppState.addEventListener('change', st => {
        if (st === 'active') refreshNow();
      });
      return () => { clearInterval(id); sub.remove(); };
    }, [])
  );

  // Свайп по расписанию (через ref, чтобы не было stale closure).
  // Карточки едут за пальцем в реальном времени (onPanResponderMove), а не
  // только «щёлкают» по отпусканию — так жест ощущается отзывчивым. На
  // границе списка (первый/последний день) — резиновое сопротивление
  // вместо тишины: палец тянет, экран чуть поддаётся и не пускает дальше.
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > 25 && Math.abs(gs.dy) < Math.abs(gs.dx),
      onPanResponderMove: (_, gs) => {
        const idx = DAY_SWIPE_ORDER.indexOf(selectedDayRef.current);
        let dx = gs.dx;
        if (dx > 0 && idx <= 0) dx *= 0.3;                          // край: «Вся неделя»
        if (dx < 0 && idx === DAY_SWIPE_ORDER.length - 1) dx *= 0.3; // край: последний день
        slideX.setValue(dx);
      },
      onPanResponderRelease: (_, gs) => {
        const idx = DAY_SWIPE_ORDER.indexOf(selectedDayRef.current);
        const canNext = gs.dx < -40 && idx < DAY_SWIPE_ORDER.length - 1;
        const canPrev = gs.dx > 40 && idx > 0;
        if (canNext) switchDayByOffsetRef.current(1);
        else if (canPrev) switchDayByOffsetRef.current(-1);
        // Порог не пройден или граница — плавно возвращаем на место, иначе
        // slideX так и останется сдвинутым, а следующий день «прыгнет».
        else Animated.spring(slideX, { toValue: 0, useNativeDriver: true, friction: 7, tension: 80 }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(slideX, { toValue: 0, useNativeDriver: true, friction: 7, tension: 80 }).start();
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

  // Автопрокрутка к сегодняшнему дню в режиме «Вся неделя»: координаты
  // берём из onLayout блока дня (см. рендер ниже), scrollRef — сам скролл.
  //
  // ⚠️ onLayout даёт y ОТНОСИТЕЛЬНО РОДИТЕЛЯ, а блоки дней лежат внутри
  // Animated.View, который начинается далеко не сверху: над ним карточка
  // группы, кнопки, статистика и полоса недели. Сравнивать такой y напрямую
  // с contentOffset.y нельзя — разница в сотни пикселей. Поэтому отдельно
  // запоминаем, где начинается сам список дней, и складываем.
  const scrollRef = useRef<ScrollView>(null);
  const todayYRef = useRef<number | null>(null);
  const listYRef = useRef(0);
  const dayYRef = useRef<Record<string, number>>({});
  const dayAbsY = (day: string): number | null => {
    const y = dayYRef.current[day];
    return y == null ? null : listYRef.current + y;
  };
  const { height: winHeight } = useWindowDimensions();
  useEffect(() => {
    if (selectedDay !== 'all' || loading) return;
    const hasToday = Object.values(byDay).some(dl => dl[0]?.lesson_date === nowTick.date);
    if (!hasToday) return;
    // onLayout ещё не успел отработать в этот же тик — ждём кадр.
    const id = setTimeout(() => {
      if (todayYRef.current != null) {
        const y = listYRef.current + todayYRef.current;
        // Минус высота липкой плашки — иначе заголовок дня уезжает прямо под неё.
        scrollRef.current?.scrollTo({ y: Math.max(0, y - STICKY_DAY_H - 8), animated: true });
      }
    }, 50);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDay, loading]);

  // Полоса дней: держим активную кнопку на виду. День меняется не только
  // тапом по кнопке, но и свайпом по расписанию, — а свайп полосу не двигал.
  // Долистав свайпом до «Вся неделя», человек видел полосу, начинающуюся с
  // «Пн»: какой режим включён, приходилось выяснять, прокручивая её рукой.
  const dayBarRef = useRef<ScrollView>(null);
  const dayBarWRef = useRef(0);           // ширина видимой части полосы
  const dayBarXRef = useRef(0);           // текущая прокрутка полосы
  const dayChipRef = useRef<Record<string, { x: number; w: number }>>({});
  useEffect(() => {
    // onLayout кнопок мог ещё не отработать в этот же тик — ждём кадр.
    const id = setTimeout(() => {
      const chip = dayChipRef.current[selectedDay];
      const viewW = dayBarWRef.current;
      if (!chip || !viewW) return;
      const PAD = 12;                     // чтобы кнопка не липла к краю
      const left = dayBarXRef.current;
      const right = left + viewW;
      let target: number | null = null;
      if (chip.x - PAD < left) target = chip.x - PAD;
      else if (chip.x + chip.w + PAD > right) target = chip.x + chip.w + PAD - viewW;
      // Уже целиком видна — не дёргаем полосу без нужды.
      if (target == null) return;
      dayBarRef.current?.scrollTo({ x: Math.max(0, target), animated: true });
    }, 50);
    return () => clearTimeout(id);
  }, [selectedDay]);

  // Липкий заголовок дня в режиме «Вся неделя»: у ScrollView в RN нет
  // CSS position:sticky, поэтому сами следим за прокруткой и держим
  // название текущего дня плашкой поверх контента (см. handleScroll).
  const [stickyDay, setStickyDay] = useState<string | null>(null);
  const handleScroll = useCallback((e: { nativeEvent: { contentOffset: { y: number } } }) => {
    if (selectedDay !== 'all') return;
    const y = e.nativeEvent.contentOffset.y;
    // Показываем тот день, чей заголовок уже ушёл под плашку. Пока ни один
    // не ушёл (мы ещё наверху, над списком) — плашки нет вовсе.
    let current: string | null = null;
    for (const day of Object.keys(byDay)) {
      const top = dayAbsY(day);
      if (top != null && top <= y + STICKY_DAY_H) current = day;
    }
    setStickyDay(prev => (prev === current ? prev : current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDay, byDay]);
  useEffect(() => {
    if (selectedDay !== 'all') setStickyDay(null);
  }, [selectedDay]);

  const shareCardRef = useRef<View>(null);
  const [sharingImg, setSharingImg] = useState(false);
  const handleShareImage = async () => {
    if (!selectedGroup || sharingImg) return;
    if (Object.keys(byDay).length === 0) {
      Alert.alert('Нет пар', 'Выберите день или неделю с занятиями.');
      return;
    }
    setSharingImg(true);
    try {
      const uri = await captureRef(shareCardRef, { format: 'png', quality: 1 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Расписание' });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {
      Alert.alert('Ошибка', 'Не получилось создать картинку. Попробуйте ещё раз.');
    } finally {
      setSharingImg(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
    <ScrollView
      ref={scrollRef}
      style={[s.container, { backgroundColor: C.bg }]}
      contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled"
      onScroll={handleScroll}
      scrollEventThrottle={32}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={C.primary}
          colors={[C.primary]} progressBackgroundColor={C.card}
        />
      }
    >
      <StatusBar barStyle="light-content" backgroundColor={C.primary} />

      {/* Баннер офлайн-режима */}
      {isOffline && (
        <View style={s.offlineBanner}>
          <Text style={s.offlineText}>{offlineBannerText}</Text>
        </View>
      )}

      {/* Новый учебный год — курс не сдвигается сам, просим проверить */}
      <CourseCheckBanner />

      {/* Подсказка — только до выбора группы */}
      {!selectedGroup && (
        <View style={[s.hint, { backgroundColor: C.tag, borderColor: C.border }]}>
          <Text style={[s.hintText, { color: C.muted }]}>Выберите группу ниже и нажмите на день недели. Листайте дни свайпом.</Text>
        </View>
      )}

      {/* Выбор группы */}
      <View style={[s.groupCard, { backgroundColor: C.card, borderColor: C.border }]}>
        {!groupsLoaded ? (
          <GroupSelectorSkeleton C={C} />
        ) : (
          <GroupSelector groups={groups} value={selectedGroup} onChange={loadGroup} C={C} collapsible />
        )}
      </View>

      {/* Поделиться расписанием картинкой */}
      {selectedGroup && Object.keys(byDay).length > 0 && (
        <TouchableOpacity
          onPress={handleShareImage}
          disabled={sharingImg}
          activeOpacity={0.7}
          style={[s.backToMine, {
            backgroundColor: C.card, borderColor: C.border, opacity: sharingImg ? 0.6 : 1,
            flexDirection: 'row', justifyContent: 'center',
          }]}
        >
          <Ionicons name="share-outline" size={15} color={C.muted} style={{ marginRight: 6 }} />
          <Text style={{ color: C.muted, fontSize: 14, fontWeight: '600' }}>
            {sharingImg ? 'Готовим картинку...' : 'Поделиться картинкой'}
          </Text>
        </TouchableOpacity>
      )}

      {/* Невидимая карточка для снимка — за пределами экрана, но смонтирована */}
      {selectedGroup && (
        <View style={{ position: 'absolute', left: -9999, top: 0 }} pointerEvents="none">
          <ScheduleShareCard
            ref={shareCardRef}
            groupLabel={`${shortGroupName(selectedGroup.name)} · ${selectedGroup.year} курс`}
            weekLabel={selectedWeek ? weekRangeStr(selectedWeek.week_start) : ''}
            lessonsByDay={byDay}
          />
        </View>
      )}

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
            Неделя{selectedWeek ? ` · ${weekRangeStr(selectedWeek.week_start)}` : ''}
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
            <LinearGradient
              colors={[C.greenBg, C.card]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[s.nowCard, { borderLeftColor: C.green }]}
            >
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
                // Прогресс пары: сколько прошло из 90 минут — тающее кольцо вместо полоски
                const [sh, sm] = currentItem.pair_time_start.split(':').map(Number);
                const [eh, em] = currentItem.pair_time_end.split(':').map(Number);
                const st = new Date(nowMs); st.setHours(sh, sm, 0, 0);
                const en = new Date(nowMs); en.setHours(eh, em, 0, 0);
                const p = (nowMs - st.getTime()) / (en.getTime() - st.getTime());
                const left = Math.max(0, Math.ceil((en.getTime() - nowMs) / 60000));
                return (
                  <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <RadialProgress progress={1 - p} size={34} stroke={3.5} color={C.green} track={C.card}>
                      <Text style={{ fontSize: 10, fontWeight: '800', color: C.green, fontVariant: ['tabular-nums'] }}>{left}</Text>
                    </RadialProgress>
                    <Text style={{ fontSize: 12, color: C.muted, flex: 1 }}>
                      осталось <Text style={{ color: C.fg, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{left} мин</Text> до конца пары
                    </Text>
                  </View>
                );
              })()}
            </LinearGradient>
          )}
          {nextItem && (() => {
            // Прогресс перемены — тает по мере приближения к следующей паре
            let breakProgress: number | null = null;
            if (nextItem.break_minutes != null && nextItem.break_minutes > 0) {
              const [bh, bm] = nextItem.pair_time_start.split(':').map(Number);
              const start = new Date(nowMs);
              start.setHours(bh, bm, 0, 0);
              const leftMs = start.getTime() - nowMs;
              const totalMs = nextItem.break_minutes * 60000;
              breakProgress = Math.min(1, Math.max(0, leftMs / totalMs));
            }
            return (
              <LinearGradient
                colors={[C.blueBg, C.card]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[s.nowCard, { borderLeftColor: C.primary }]}
              >
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
                  {countdown ? (
                    breakProgress != null ? (
                      <View style={{ marginLeft: 'auto' }}>
                        <RadialProgress progress={breakProgress} size={46} stroke={4} color={C.primary} track={C.card}>
                          <Text style={{ fontSize: 10.5, fontWeight: '800', color: C.primary, fontVariant: ['tabular-nums'] }}>{countdown}</Text>
                        </RadialProgress>
                      </View>
                    ) : (
                      <Text style={[s.countdown, { color: C.primary }]}>{countdown}</Text>
                    )
                  ) : null}
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
              </LinearGradient>
            );
          })()}
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
        <ScrollView
          ref={dayBarRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.dayBar}
          onLayout={(e) => { dayBarWRef.current = e.nativeEvent.layout.width; }}
          onScroll={(e) => { dayBarXRef.current = e.nativeEvent.contentOffset.x; }}
          scrollEventThrottle={32}
        >
          {DAY_SWIPE_ORDER.map(day => {
            const active = selectedDay === day;
            const hasLessons = day !== 'all' && lessons.some(l => l.day_of_week === day);
            const dateObj = day !== 'all' && selectedWeek ? dayDateObj(day, selectedWeek.week_start) : null;
            const isToday = !!dateObj && isTodayDay(day, selectedWeek!.week_start);
            return (
              <TouchableOpacity
                key={day}
                // Координата и ширина кнопки — чтобы прокрутить полосу к ней
                // (см. эффект выше). x здесь уже в системе координат содержимого
                // ScrollView, то есть ровно то, что ждёт scrollTo.
                onLayout={(e) => {
                  const { x, width } = e.nativeEvent.layout;
                  dayChipRef.current[day] = { x, w: width };
                }}
                onPress={() => {
                  if (selectedDay === day) return;
                  Haptics.selectionAsync();
                  // Карточки пар нового дня появляются каскадом, а не скачком —
                  // тот же приём, что уже есть у веба (см. audit 1.2).
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setSelectedDay(day);
                }}
                style={[
                  s.dayBtn,
                  {
                    backgroundColor: active ? C.primary : C.card,
                    borderColor: active ? C.primary : isToday ? C.primary : C.border,
                    borderWidth: !active && isToday ? 1.5 : 1,
                  },
                ]}
              >
                {isToday && !active && (
                  <Text style={[s.dayTodayTag, { color: C.primary, backgroundColor: C.bg }]}>сегодня</Text>
                )}
                <Text style={[s.dayBtnText, { color: active ? '#fff' : C.fg }]}>
                  {day === 'all' ? 'Вся неделя' : DAY_LABELS[day]}
                </Text>
                {dateObj && (
                  <Text style={[s.dayBtnDate, { color: active ? 'rgba(255,255,255,0.85)' : C.muted }]}>
                    {dateObj.getDate()}
                  </Text>
                )}
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

      {/* Расписание — со свайпом для переключения дней. minHeight растягивает
          зону жеста на весь экран, а не только на высоту карточек — иначе
          в пустой день (короткое сообщение «занятий нет») свайпать было
          негде: палец ниже текста уже не попадал по Animated.View. */}
      {!loading && (
        <Animated.View
          {...panResponder.panHandlers}
          // Начало списка дней внутри скролла — база для координат из onLayout
          // блоков дня (см. dayAbsY выше).
          onLayout={(e) => { listYRef.current = e.nativeEvent.layout.y; }}
          style={{ transform: [{ translateX: slideX }], minHeight: winHeight * 0.55 }}
        >
          {Object.entries(byDay).map(([day, dayLessons]) => {
            const isToday = dayLessons[0]?.lesson_date === nowTick.date;
            return (
              <View
                key={day}
                // Координата нужна для автопрокрутки к сегодняшнему дню и
                // для липкого заголовка при прокрутке (handleScroll выше).
                onLayout={(e) => {
                  dayYRef.current[day] = e.nativeEvent.layout.y;
                  if (isToday) todayYRef.current = e.nativeEvent.layout.y;
                }}
              >
                {/* Отступы держит строка, у самого текста они сняты — иначе
                    плашка «сегодня» выравнивалась бы по краю отступа, не по тексту */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 4, marginBottom: 8 }}>
                  <Text style={[s.dayHeader, { color: C.primary, marginTop: 0, marginBottom: 0 }]}>
                    {day.charAt(0).toUpperCase() + day.slice(1)}
                    {selectedWeek ? `, ${getDayDate(day, selectedWeek.week_start)}` : ''}
                  </Text>
                  {isToday && (
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
            );
          })}

          {selectedGroup && Object.keys(byDay).length === 0 && (
            <View style={s.emptyState}>
              <Text style={[s.emptyTitle, { color: C.fg }]}>Занятий не найдено</Text>
              <Text style={[s.emptyText, { color: C.muted }]}>
                {selectedDay !== 'all' ? 'В этот день пар нет' : 'На этой неделе занятий нет'}
              </Text>
            </View>
          )}
          {!selectedGroup && (
            <View style={s.emptyState}>
              <Text style={[s.emptyTitle, { color: C.fg }]}>Выберите группу выше</Text>
              <Text style={[s.emptyText, { color: C.muted }]}>Чтобы увидеть расписание</Text>
            </View>
          )}
        </Animated.View>
      )}
    </ScrollView>

    {/* Липкий заголовок дня (см. handleScroll) — RN ScrollView не умеет
        CSS position:sticky, поэтому рисуем плашку поверх контента сами. */}
    {stickyDay && selectedWeek && (
      <View pointerEvents="none" style={[s.stickyDayBar, { backgroundColor: C.bg, borderBottomColor: C.border }]}>
        <Text style={[s.dayHeader, { color: C.primary, marginTop: 0, marginBottom: 0 }]}>
          {stickyDay.charAt(0).toUpperCase() + stickyDay.slice(1)}
        </Text>
        <Text style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>
          {getDayDate(stickyDay, selectedWeek.week_start)}
        </Text>
      </View>
    )}

    {/* Подтверждение после pull-to-refresh — гаснет само, ничего нажимать не нужно */}
    {refreshToast && (
      <View pointerEvents="none" style={{ position: 'absolute', top: 14, left: 0, right: 0, alignItems: 'center' }}>
        <Animated.View
          style={{
            opacity: refreshToastOpacity,
            backgroundColor: C.primary, borderRadius: 999,
            paddingHorizontal: 14, paddingVertical: 7,
          }}
        >
          <Text style={{ color: '#fff', fontSize: 12.5, fontWeight: '700' }}>✓ Обновлено</Text>
        </Animated.View>
      </View>
    )}
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
  countdown: { marginLeft: 'auto', fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  nowSubject: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  nowMeta: { fontSize: 12 },
  roomRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 },
  roomChip: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 },
  roomChipText: { fontSize: 13, fontWeight: '700' },

  dayBar: { marginTop: 8, marginBottom: 12 },
  dayBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, marginRight: 8, borderWidth: 1, alignItems: 'center' },
  dayDot: { width: 5, height: 5, borderRadius: 3, marginTop: 3 },
  dayBtnText: { fontSize: 12, fontWeight: '500' },
  dayBtnDate: { fontSize: 13, fontWeight: '700', marginTop: 1 },
  dayTodayTag: {
    position: 'absolute', top: -8, alignSelf: 'center',
    fontSize: 8, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3,
    paddingHorizontal: 4,
  },

  dayHeader: {
    fontSize: 12, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: 8, marginTop: 4,
  },
  stickyDayBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    height: STICKY_DAY_H, justifyContent: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
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
  statNum: { fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: 10, marginTop: 2 },
  statDivider: { width: 0.5, height: 32 },
});
