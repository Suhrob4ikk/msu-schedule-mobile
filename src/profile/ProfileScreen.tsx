/**
 * Вкладка «Кабинет» в стиле «Табло» — по ТЗ «вкладка „Кабинет“». Порядок:
 * профиль, Учёба, Разделы, Напоминания, Оформление, Синхронизация, Позвать
 * одногруппников, подвал. Прежний экран удалён; его последняя версия — в git
 * по метке before-cleanup.
 */
import { useLastFetchOk } from '../api';
import { otaLabel } from '../otaUpdates';
import { openWhatsNew } from '../WhatsNew';
import { useEarlyAccess } from '../newFeatures';
import VoteCard from './VoteCard';
import { syncNotes, useNotesCloud } from '../cloudNotes';
import { HolidayBackdrop, HolidayGarland, HolidayNavDeco, useDecor } from '../holiday/HolidayDecor';
import { usePrizeUnlocked } from '../prizes/prizes';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, Share, StatusBar, View, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import QRCode from 'react-native-qrcode-svg';
import { api, Group, shortGroupName, rememberGroup } from '../api';
import { useThemeMode, useAppearanceSettings } from '../theme';
import { appearanceSummary } from '../appearanceModel';
import { useSyncStatus } from '../SyncContext';
import { isOfflineDataComplete } from '../offline/state';
import { setUserName } from '../userName';
import { markGroupChosen } from '../features';
import { ATTENDANCE_ON, collectSkips, collectNotes, type SkipStats } from '../studyData';
import { useTokens, Tokens, RADIUS, GUTTER, HEADER_H, TOUCH_MIN } from '../schedule/tokens';
import { Txt } from '../schedule/ui';
import { StatusPill, Bell, linkState } from '../schedule/ScheduleHeader';
import { Card, SectionTitle, SwitchRow, NavRow, ActionRow, Button } from './rows';
import ProfileSheet from './ProfileSheet';
import {
  useExamReminders, useLessonReminders, useLiveLessonRow, useBackgroundWork, useFeatureFlag,
} from './reminders';
import {
  skipRows, skipsSpoken, totalLabel, profileLine, avatarLetter, pluralPairs,
} from './state';
import TestModeSheet from '../TestModeSheet';
import { myDeviceId, unreadInfo } from '../devMessages';
import { StreakAvatar, StreakInline, StreakSheetHost } from '../streak/FlameChip';
import { noteStreakHit, useStreak } from '../streak/streak';

// Источник — app.json → expo.extra.webUrl (та же логика, что и API_BASE в src/api.ts)
const WEB_URL =
  (Constants.expoConfig?.extra?.webUrl as string | undefined) ??
  'https://frontend-ten-nu-80.vercel.app';
/** Версия — из настроек приложения (app.json), а не вписанная руками. */
const VERSION = Constants.expoConfig?.version ?? '';

const HINT_KEY = 'hint_seen_tips_reminders_widget';

async function shareMyData() {
  const st: SkipStats = ATTENDANCE_ON ? await collectSkips() : { total: 0, bySubject: [] };
  const notes = await collectNotes();
  const lines: string[] = ['МГУ Расписание — мои данные', ''];
  if (st.total > 0) {
    lines.push(`Пропущено: ${st.total} ${pluralPairs(st.total)}`);
    skipRows(st.bySubject).forEach(r => lines.push(`  ${r.subject} — ${r.count}`));
    lines.push('');
  }
  if (notes.length > 0) {
    lines.push('Заметки к парам:');
    notes.forEach(n => lines.push('• ' + n.slot + ': ' + n.text));
  }
  if (st.total === 0 && notes.length === 0) lines.push(ATTENDANCE_ON ? 'Пока нет ни пропусков, ни заметок.' : 'Пока нет заметок.');
  try { await Share.share({ message: lines.join('\n') }); } catch { /* закрыли меню */ }
}

/** Приз «Ранний доступ» (достижение «Следопыт») — значок под именем, как на сайте. */
function EarlyBadge({ k }: { k: Tokens }) {
  const on = useEarlyAccess();   // «Следопыт» или 30+ дней с заходом (src/newFeatures.tsx, 9 ноя 2026)
  if (!on) return null;
  return (
    <View style={{ alignSelf: 'flex-start', marginTop: 4, paddingHorizontal: 8, height: 22, borderRadius: 11, justifyContent: 'center', backgroundColor: k.accentSoft }}>
      <Txt t="captionStrong" color={k.onAccentSoft}>Ранний доступ</Txt>
    </View>
  );
}

// ─── Профиль ────────────────────────────────────────────────────────────────

function Avatar({ k, letter, muted }: { k: Tokens; letter: string | null; muted?: boolean }) {
  return (
    <View style={{
      width: 52, height: 52, borderRadius: 26, flexShrink: 0, alignItems: 'center', justifyContent: 'center',
      backgroundColor: muted ? k.surface2 : k.accentSoft,
    }}
    >
      {letter
        ? <Txt t="avatar" color={k.onAccentSoft}>{letter}</Txt>
        : <Ionicons name="person-outline" size={24} color={muted ? k.textSecondary : k.onAccentSoft} />}
    </View>
  );
}

function ProfileCard({ k, name, group, onEdit }: { k: Tokens; name: string; group: Group | null; onEdit: () => void }) {
  const line = group ? profileLine(shortGroupName(group.name), group.year) : '';
  const title = name.trim() || line || 'Профиль';
  const sub = name.trim() ? line : '';
  // огонёк серии — пламя на аватаре и «N дней подряд» под группой (вариант В, владелец 8 ноя 2026)
  return (
    <Card k={k}>
      <View style={{ flexDirection: 'row', alignItems: 'center', columnGap: 12, paddingHorizontal: 16, paddingVertical: 14 }}>
        <StreakAvatar k={k}><Avatar k={k} letter={avatarLetter(name)} /></StreakAvatar>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt t="titleScreen" color={k.text}>{title}</Txt>
          {sub ? <Txt t="rowValue" color={k.textSecondary}>{sub}</Txt> : null}
          <StreakInline k={k} />
          <EarlyBadge k={k} />
        </View>
      </View>
      <ActionRow k={k} title="Изменить имя или группу" onPress={onEdit} />
    </Card>
  );
}

/** Первый вход (группа не выбрана или стёрта после переименования на msu.tj). */
function SetupCard({ k, onChoose }: { k: Tokens; onChoose: () => void }) {
  return (
    <View style={{ backgroundColor: k.card, borderRadius: RADIUS.lg, borderWidth: 2, borderColor: k.accentText, padding: 16, rowGap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', columnGap: 12 }}>
        <Avatar k={k} letter={null} muted />
        <Txt t="titleScreen" color={k.text} style={{ flex: 1 }}>Группа не выбрана</Txt>
      </View>
      <Button k={k} primary title="Выбрать группу" onPress={onChoose} />
    </View>
  );
}

/**
 * На телефоне не хватает чего-то для работы без интернета (на экране загрузки
 * нажали «Позже», не было сети, загрузка оборвалась) — см. src/offline/state.ts.
 */
function OfflineCard({ k, busy, offline, onPress }: { k: Tokens; busy: boolean; offline: boolean; onPress: () => void }) {
  return (
    <View style={{ backgroundColor: k.card, borderRadius: RADIUS.lg, borderWidth: 2, borderColor: k.accentText, padding: 16, rowGap: 12, marginTop: 12 }}>
      <View style={{ flexDirection: 'row', columnGap: 12 }}>
        <Ionicons name="cloud-download-outline" size={22} color={k.accentText} style={{ marginTop: 2 }} />
        <View style={{ flex: 1, rowGap: 2 }}>
          <Txt t="titleCard" color={k.text}>Расписание скачано не полностью</Txt>
          <Txt t="small" color={k.textSecondary}>
            {offline
              ? 'Нужен интернет. Как только он появится, скачаем сами.'
              : 'Докачайте — и расписание, педагоги и аудитории откроются без интернета.'}
          </Txt>
        </View>
      </View>
      {busy ? (
        <Button k={k} primary title="Скачиваем..." disabled busy onPress={onPress}>
          <ActivityIndicator size="small" color={k.textSecondary} />
        </Button>
      ) : (
        <Button k={k} primary title="Докачать" icon="download-outline" disabled={offline} onPress={onPress} />
      )}
    </View>
  );
}

// ─── Учёба ───────────────────────────────────────────────────────────────────

function SkipStatsBlock({ k, st }: { k: Tokens; st: SkipStats }) {
  const rows = skipRows(st.bySubject);
  if (st.total === 0) {
    return (
      <View style={{ paddingHorizontal: 14, paddingVertical: 14 }}>
        <Txt t="rowTitle" color={k.textSecondary}>Пропусков нет</Txt>
      </View>
    );
  }
  return (
    <View accessible accessibilityLabel={skipsSpoken(st.total, rows)} style={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 14 }}>
      {/* Число — цветом text: пропуски — сведения, а не ошибка (красный в приложении — «нет сети», «занята») */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 8 }}>
        <Txt t="bigCount" color={k.text} numberOfLines={1}>{totalLabel(st.total)}</Txt>
        <Txt t="body" color={k.textSecondary}>пропущено всего</Txt>
      </View>
      <View style={{ rowGap: 10, marginTop: 8 }}>
        {rows.map(r => (
          <View key={r.subject}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', columnGap: 12 }}>
              <Txt t="rowValue" color={k.text} style={{ flex: 1, minWidth: 0 }}>{r.subject}</Txt>
              <Txt t="countNum" color={k.text} numberOfLines={1} style={{ flexShrink: 0 }}>{String(r.count)}</Txt>
            </View>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: k.surface2, marginTop: 4, overflow: 'hidden' }}>
              <View style={{ height: 6, width: `${Math.round(r.share * 100)}%`, borderRadius: 3, backgroundColor: k.accentText }} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Подсказка про виджет: одна строка, один раз ─────────────────────────────

function WidgetHint({ k }: { k: Tokens }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { AsyncStorage.getItem(HINT_KEY).then(v => setVisible(v !== '1')).catch(() => null); }, []);
  if (!visible) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', columnGap: 8, paddingLeft: 4, marginBottom: 4 }}>
      <Ionicons name="bulb-outline" size={16} color={k.accentText} />
      <Txt t="small" color={k.textSecondary} style={{ flex: 1 }}>
        Есть виджет: на рабочем столе нажмите и удерживайте → «Виджеты» → МГУ Расписание
      </Txt>
      <Pressable
        onPress={() => { setVisible(false); AsyncStorage.setItem(HINT_KEY, '1').catch(() => null); }}
        accessibilityRole="button"
        accessibilityLabel="Скрыть подсказку"
        style={{ width: TOUCH_MIN, height: TOUCH_MIN, alignItems: 'center', justifyContent: 'center', marginVertical: -12 }}
      >
        <Ionicons name="close" size={16} color={k.textSecondary} />
      </Pressable>
    </View>
  );
}

function Plaque({ k, text }: { k: Tokens; text: string }) {
  return (
    <View accessibilityLiveRegion="polite" style={{ backgroundColor: k.statusOfflineBg, borderRadius: RADIUS.sm, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', columnGap: 8, alignItems: 'center' }}>
      <Ionicons name="cloud-offline-outline" size={16} color={k.statusOffline} />
      <Txt t="smallSemi" color={k.statusOffline} style={{ flex: 1 }}>{text}</Txt>
    </View>
  );
}

// ─── Экран ───────────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const k = useTokens();
  const { mode } = useThemeMode();
  const appearance = useAppearanceSettings();
  const insets = useSafeAreaInsets();
  const decor = useDecor();   // праздник: шапка цветом праздника, гирлянда (src/holiday/HolidayDecor.tsx)
  // Правая колонка блока QR растёт со шрифтом: при крупном шрифте колонки встают друг под друга
  const { fontScale } = useWindowDimensions();
  const qrTextMin = Math.round(140 * Math.min(Math.max(fontScale, 1), 2));
  const { isSyncing, isOnline, lastSyncTime, triggerSync, syncErrorText } = useSyncStatus();
  const lastOk = useLastFetchOk();   // «обновлено» — и по последнему удачному ответу сервера

  const [groups, setGroups] = useState<Group[]>([]);
  const [testOpen, setTestOpen] = useState(false);
  const [name, setName] = useState('');
  const [groupId, setGroupId] = useState<number | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [syncError, setSyncError] = useState(false);
  const [skips, setSkips] = useState<SkipStats | null>(null);
  // null — ещё не проверили; перепроверяем при входе на вкладку и после каждой синхронизации
  const [offlineOk, setOfflineOk] = useState<boolean | null>(null);

  const attendance = useFeatureFlag('feature_attendance');
  const notes = useFeatureFlag('feature_notes');
  const notesCloud = useNotesCloud();   // заметки в облаке — награда огонька за 7 дней (src/cloudNotes.ts)
  const streakSt = useStreak();   // «Что нового» — когда огонёк виден (src/WhatsNew.tsx)
  const exams = useExamReminders();
  const lessons = useLessonReminders();
  const live = useLiveLessonRow();
  const background = useBackgroundWork();

  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    // Список групп — сначала с диска (иначе в офлайне выбор пустой), затем с сервера
    (async () => {
      try {
        const cached = await AsyncStorage.getItem('cache_groups');
        if (cached) {
          const gs: Group[] = JSON.parse(cached);
          if (gs.length) setGroups(gs);
        }
      } catch { /* битый кэш — подождём сервер */ }
      try {
        const gs = await api.getGroups();
        setGroups(gs);
        AsyncStorage.setItem('cache_groups', JSON.stringify(gs)).catch(() => null);
      } catch { /* офлайн — остаёмся на кэше */ }
    })();
  }, []);

  // Профиль и пропуски — при каждом возврате: выбор группы может стереться
  // (группу переименовали на msu.tj, см. repairSavedGroup в src/api.ts),
  // а пропуски отмечают в Расписании.
  useFocusEffect(
    useCallback(() => {
      AsyncStorage.multiGet(['user_name', 'selected_group_id']).then(pairs => {
        setName(pairs[0][1] ?? '');
        setGroupId(pairs[1][1] ? Number(pairs[1][1]) : null);
        setProfileLoaded(true);
      });
      collectSkips().then(setSkips).catch(() => null);
    }, []),
  );

  useFocusEffect(
    useCallback(() => {
      if (!isSyncing) isOfflineDataComplete().then(setOfflineOk);
    }, [isSyncing, lastSyncTime, lastOk]),
  );

  useFocusEffect(
    useCallback(() => {
      StatusBar.setBarStyle(mode === 'dark' ? 'light-content' : 'dark-content');
      return () => { StatusBar.setBarStyle(k.onAccent === '#FFFFFF' ? 'light-content' : 'dark-content'); };
    }, [mode, k.onAccent]),
  );

  const group = groups.find(g => g.id === groupId) ?? null;
  const noGroup = profileLoaded && groupId == null;

  const sync = async () => {
    if (isSyncing || !isOnline) return;
    setSyncError(false);
    const ok = await triggerSync();
    if (!ok) setSyncError(true);
  };

  const saveProfile = async (newName: string, g: Group) => {
    if (!(await setUserName(newName))) return; // пустое имя лист не пропускает
    await AsyncStorage.setItem('selected_group_id', String(g.id));
    // Рядом с номером — название и курс: если номер разойдётся со списком, восстановимся по ним
    await rememberGroup(g);
    // Новичков про смену курса после начала учебного года не спрашиваем
    await markGroupChosen();
    // Сменили СВОЮ группу — расписание откроется на новой
    await AsyncStorage.removeItem('schedule_view_group_id');
    let deviceId = await AsyncStorage.getItem('msu_device_id');
    if (!deviceId) {
      deviceId = Math.random().toString(36).slice(2) + Date.now().toString(36);
      await AsyncStorage.setItem('msu_device_id', deviceId);
    }
    api.registerUser(deviceId, newName || 'Аноним', g.id).catch(() => null);
    setName(newName);
    setGroupId(g.id);
    setSheetOpen(false);
    // ТЗ: после сохранения — сразу синхронизация расписания новой группы
    if (isOnline) {
      setSyncError(false);
      triggerSync().then(ok => { if (!ok) setSyncError(true); });
    }
    router.navigate('/');
  };

  const link = linkState({ syncing: isSyncing, offline: !isOnline, stamps: [lastSyncTime, lastOk], now: new Date() });
  const showShare = (ATTENDANCE_ON && attendance.on) || notes.on;

  return (
    <View style={{ flex: 1, backgroundColor: k.bg }}>
      <HolidayBackdrop />
      {/* Шапка 60 dp: статус связи (касание — обновить расписание) и колокольчик */}
      <View style={{ paddingTop: insets.top, backgroundColor: decor ? decor.top : k.bg, zIndex: decor ? 5 : undefined }}>
        {decor && <HolidayGarland />}
        <View style={{ minHeight: HEADER_H, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingRight: GUTTER - 8 }}>
          <Pressable
            onPress={() => void sync()}
            accessibilityRole="button"
            accessibilityHint="Обновить расписание"
            style={{ minHeight: TOUCH_MIN, justifyContent: 'center' }}
          >
            <StatusPill s={link} k={k} />
          </Pressable>
          <Bell k={k} />
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: insets.bottom + 24 }}
      >
        {/* Профиль */}
        {noGroup
          ? <SetupCard k={k} onChoose={() => setSheetOpen(true)} />
          : <ProfileCard k={k} name={name} group={group} onEdit={() => setSheetOpen(true)} />}
        {offlineOk === false && !noGroup ? <OfflineCard k={k} busy={isSyncing} offline={!isOnline} onPress={sync} /> : null}

        {/* Оформление */}
        {/* Голосование за следующую функцию — только когда идёт и человеку 21+ день (src/profile/VoteCard.tsx) */}
        <VoteCard k={k} />

        <SectionTitle k={k}>Оформление</SectionTitle>
        <Card k={k}>
          <NavRow k={k} icon="color-palette-outline" title="Внешний вид" value={appearanceSummary(appearance)} onPress={() => router.push('/appearance')} />
        </Card>

        {/* Учёба */}
        <SectionTitle k={k}>Учёба</SectionTitle>
        <Card k={k}>
          {/* Пропуски спрятаны до следующего семестра (владелец, 9 ноя 2026) — ATTENDANCE_ON в src/studyData.ts */}
          {ATTENDANCE_ON ? <SwitchRow k={k} title="Пропуски" subtitle="Отмечайте только пропущенные пары" on={attendance.on} onPress={attendance.toggle} /> : null}
          {ATTENDANCE_ON && attendance.on && !noGroup && skips ? <SkipStatsBlock k={k} st={skips} /> : null}
          <SwitchRow k={k} title="Заметки к парам" subtitle={notesCloud ? 'Домашка и что принести · хранятся в облаке' : 'Домашка и что принести'} on={notes.on}
            onPress={() => { notes.toggle(); setTimeout(() => void syncNotes(true), 300); }} />
          {showShare ? <ActionRow k={k} icon="share-outline" title={ATTENDANCE_ON ? 'Поделиться заметками и пропусками' : 'Поделиться заметками'} onPress={shareMyData} /> : null}
        </Card>

        {/* Разделы */}
        <SectionTitle k={k}>Разделы</SectionTitle>
        <Card k={k}>
          <NavRow k={k} icon="swap-vertical-outline" title="Сравнить с другой группой" onPress={() => router.push('/compare')} />
        </Card>

        {/* Напоминания */}
        <SectionTitle k={k}>Напоминания</SectionTitle>
        <WidgetHint k={k} />
        <Card k={k}>
          <SwitchRow k={k} title="Уведомления о зачётах и экзаменах" subtitle={exams.subtitle} on={exams.on} onPress={exams.toggle} />
          <SwitchRow k={k} title="Напоминать перед парой" subtitle="За 10 минут до пары" on={lessons.on} onPress={lessons.toggle} />
          <SwitchRow k={k} title="Показывать текущую пару" subtitle="Строка в шторке, пока идёт пара" on={live.on} onPress={live.toggle} />
          {background.available ? (
            <NavRow
              k={k}
              title="Разрешить работу в фоне"
              value={background.exempt ? 'Разрешено' : 'Не разрешено'}
              valueColor={background.exempt ? k.textSecondary : k.statusSync}
              valueStrong={!background.exempt}
              hint="Открыть системные настройки"
              onPress={background.open}
            />
          ) : null}
        </Card>

        {/* «Синхронизация» убрана (9 ноя 2026, как на сайте): обновить — нажатием на «обновлено …» в шапке */}
        {isOnline && syncError && !isSyncing ? (
          <View style={{ marginTop: 16 }}>
            <Plaque k={k} text={syncErrorText ? `Не удалось обновить: ${syncErrorText}` : 'Не удалось обновить'} />
          </View>
        ) : null}

        {/* Позвать одногруппников */}
        <SectionTitle k={k}>Позвать одногруппников</SectionTitle>
        <Card k={k}>
          <View style={{ padding: 14, flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 12, alignItems: 'center' }}>
            {/* QR — всегда тёмный на белом, в любой теме: иначе камеры его не читают */}
            <View
              accessible
              accessibilityRole="image"
              accessibilityLabel="QR-код со ссылкой на сайт"
              style={{ padding: 10, borderRadius: RADIUS.sm, backgroundColor: '#FFFFFF', flexShrink: 0 }}
            >
              <QRCode value={WEB_URL} size={120} color="#0B0D12" backgroundColor="#FFFFFF" />
            </View>
            <View style={{ flexGrow: 1, flexBasis: qrTextMin, minWidth: qrTextMin, rowGap: 6 }}>
              <Txt t="buttonLg" color={k.text}>Сайт расписания</Txt>
              <Txt t="small" color={k.textSecondary}>{WEB_URL.replace(/^https?:\/\//, '')}</Txt>
              <View style={{ marginTop: 4 }}>
                <Button
                  k={k}
                  title="Поделиться ссылкой"
                  icon="share-outline"
                  onPress={() => {
                    void noteStreakHit('share');   // «Позвал своих» (огонёк)
                    Share.share({ message: `МГУ Душанбе — расписание занятий, свободные аудитории и изменения. Заходите: ${WEB_URL}` }).catch(() => null);
                  }}
                />
              </View>
            </View>
          </View>
        </Card>

        {/* Связь с разработчиком — переписка в приложении, как на сайте (src/profile/MessagesScreen.tsx) */}
        <Card k={k} style={{ marginTop: 16 }}>
          {streakSt ? <NavRow k={k} icon="sparkles-outline" title="Что нового" onPress={openWhatsNew} /> : null}
          <MessagesRow k={k} />
        </Card>

        {/* Подвал */}
        <View style={{ alignItems: 'center', marginTop: 20, rowGap: 2 }}>
          {/* Ссылку «Режим разработчика» убрали совсем (владелец, 9 ноя 2026): панель — по прямому адресу сайта /dev */}
          <Txt t="smallSemi" color={k.text}>МГУ Душанбе · Расписание</Txt>
          <Txt t="small" color={k.textSecondary}>Данные с msu.tj</Txt>
          {/* Долгое нажатие на версию (15 с, чтобы студент не открыл случайно) — «Тестовый режим» (праздники и огонёк, src/TestModeSheet.tsx) */}
          {VERSION ? (
            <Pressable onLongPress={() => setTestOpen(true)} delayLongPress={15000} accessibilityRole="text">
              <Txt t="small" color={k.textSecondary} numberOfLines={1}>v{VERSION}{otaLabel() ? ` · ${otaLabel()}` : ''}</Txt>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
      <HolidayNavDeco bottom={0} />
      <TestModeSheet visible={testOpen} onClose={() => setTestOpen(false)} k={k} />
      <StreakSheetHost k={k} />

      <ProfileSheet
        k={k}
        visible={sheetOpen}
        groups={groups}
        name={name}
        group={group}
        onClose={() => setSheetOpen(false)}
        onSave={saveProfile}
      />
    </View>
  );
}

/** «Написать разработчику»; справа — «Новый ответ», если разработчик ответил (счётчик сервер держит в памяти). */
function MessagesRow({ k }: { k: Tokens }) {
  const [unread, setUnread] = useState(0);
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      myDeviceId().then(dev => (dev ? unreadInfo(dev) : { unread: 0 })).then(r => { if (alive) setUnread(r.unread); }).catch(() => null);
      return () => { alive = false; };
    }, []),
  );
  return (
    <NavRow
      k={k}
      icon="chatbubble-ellipses-outline"
      title="Написать разработчику"
      value={unread > 0 ? (unread === 1 ? 'Новый ответ' : `Ответов: ${unread}`) : undefined}
      valueColor={k.accentText}
      valueStrong
      onPress={() => router.push('/messages')}
    />
  );
}
