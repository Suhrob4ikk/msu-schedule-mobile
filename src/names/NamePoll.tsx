/**
 * Опрос «Знаете полное имя преподавателя?» на экране педагога (с 2.0.5, как на сайте —
 * components/tablo/names/NamePoll.tsx).
 *
 * Не мешает: свёрнут в одну строку с крестиком, раскрывается по нажатию. Крестик прячет на
 * неделю — только на телефоне. Ответа «Не знаю» нет (решение владельца). После ответа —
 * голоса других (сервер отдаёт их только ответившему). Своё имя проверяется по буквам
 * инициалов сразу при вводе — та же проверка, что на сервере.
 */
import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
// поле ввода — общее: понимает узкий шрифт на выбор (src/fontChoice.ts)
import { TextInput } from '../OnestText';
import { Ionicons } from '@expo/vector-icons';
import { api, type NameResults } from '../api';
import {
  answerOf, hideFor, myDeviceId, plural, proposalError, refreshFullNames, rememberAnswer, tidyName, type Answer,
} from '../fullNames';
import { RADIUS, TOUCH_MIN, type Tokens, FONT } from '../schedule/tokens';
import { Txt } from '../schedule/ui';

type Choice = { kind: 'variant'; id: number } | { kind: 'own' } | null;

export default function NamePoll({ teacher, variants, k, named, ownGroup, onHide }: {
  teacher: string;
  variants: Array<{ id: number; name: string }>;
  k: Tokens;
  /** в записи на нескольких — имя прямо в строке */
  named: boolean;
  /** ведёт ли он у группы пользователя — от этого только текст вопроса */
  ownGroup: boolean;
  onHide: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [answered, setAnswered] = useState<Answer | null>(null);
  const [res, setRes] = useState<NameResults | null>(null);
  const [editing, setEditing] = useState(false);
  const [choice, setChoice] = useState<Choice>(null);
  const [own, setOwn] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { answerOf(teacher).then(setAnswered); }, [teacher]);

  // Уже отвечал и раскрыл — подтянуть голоса
  useEffect(() => {
    if (!open || !answered || res || editing) return;
    let alive = true;
    myDeviceId().then(dev => {
      if (!dev) return;
      api.nameResults(dev, teacher).then(r => {
        if (!alive || !r) return;
        if (!r.answered) { rememberAnswer(teacher, null); setAnswered(null); return; }
        setRes(r);
      }).catch(() => {});
    });
    return () => { alive = false; };
  }, [open, answered, res, editing, teacher]);

  const ownErr = choice?.kind === 'own' ? proposalError(teacher, own) : null;
  const canSend = !busy && !!choice && !(choice.kind === 'own' && ownErr !== null);

  const send = async () => {
    const dev = await myDeviceId();
    if (!dev || !choice) { setErr('Сначала выберите группу в Кабинете'); return; }
    setBusy(true); setErr(null);
    try {
      const r = await api.voteName({
        device_id: dev, teacher,
        ...(choice.kind === 'variant' ? { variant_id: choice.id } : {}),
        ...(choice.kind === 'own' ? { proposal: tidyName(own) } : {}),
      });
      const a: Answer = r.pending ? 'pending' : 'voted';
      await rememberAnswer(teacher, a);
      setAnswered(a); setRes(r); setEditing(false); setChoice(null); setOwn('');
      refreshFullNames();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Не получилось отправить ответ');
    }
    setBusy(false);
  };

  const showForm = !answered || editing;
  const total = res ? res.variants.reduce((s, v) => s + (v.votes ?? 0), 0) : 0;
  const initials = teacher.replace(/^.*?\s+(?=[А-ЯЁ][а-яё]?\.)/, '');

  const Option = ({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) => (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      style={({ pressed }) => ({
        minHeight: TOUCH_MIN, flexDirection: 'row', alignItems: 'center', columnGap: 10, paddingHorizontal: 12,
        borderRadius: RADIUS.sm, borderWidth: 1.5, borderColor: on ? k.accent : k.border,
        backgroundColor: on ? k.accentSoft : pressed ? k.surface2 : 'transparent',
      })}
    >
      <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={20} color={on ? k.accentText : k.textSecondary} />
      <Txt t="body" color={on ? k.onAccentSoft : k.text} style={{ flexShrink: 1 }}>{label}</Txt>
    </Pressable>
  );

  return (
    <View style={{ backgroundColor: k.card, borderRadius: RADIUS.card, marginBottom: 10, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable
          onPress={() => setOpen(o => !o)}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          style={({ pressed }) => ({
            flex: 1, minHeight: TOUCH_MIN + 4, flexDirection: 'row', alignItems: 'center', columnGap: 10,
            paddingLeft: 14, paddingRight: 8, paddingVertical: 10, backgroundColor: pressed ? k.surface2 : 'transparent',
          })}
        >
          <Ionicons name="person-outline" size={20} color={k.accentText} />
          <Txt t="smallSemi" color={k.text} style={{ flex: 1 }}>
            {named ? <Txt t="smallStrong" color={k.text}>{teacher} · </Txt> : null}
            {answered && !editing
              ? (named ? 'Вы ответили · что ответили другие' : 'Вы ответили про полное имя · что ответили другие')
              : (named ? 'Знаете полное имя?' : 'Знаете полное имя преподавателя? Помогите другим')}
          </Txt>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={k.textSecondary} />
        </Pressable>
        {!answered && (
          <Pressable
            onPress={() => { hideFor(teacher).then(onHide); }}
            accessibilityRole="button"
            accessibilityLabel="Скрыть на неделю"
            style={{ width: TOUCH_MIN, height: TOUCH_MIN, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="close" size={20} color={k.textSecondary} />
          </Pressable>
        )}
      </View>

      {open && showForm && (
        <View style={{ paddingHorizontal: 14, paddingBottom: 14, rowGap: 8 }}>
          <Txt t="bodySmall" color={k.textSecondary}>
            {ownGroup
              ? <>У вашей группы ведёт пары <Txt t="bodySmall" color={k.text} style={{ fontFamily: FONT[700] }}>{teacher}</Txt>. Полное имя преподавателя есть в журнале группы.</>
              : <>Знаете, как полностью зовут <Txt t="bodySmall" color={k.text} style={{ fontFamily: FONT[700] }}>{teacher}</Txt>? Подскажите — это поможет тем, у кого этот преподаватель ведёт пары.</>}
          </Txt>
          {variants.map(v => (
            <Option key={v.id} on={choice?.kind === 'variant' && choice.id === v.id} label={v.name} onPress={() => setChoice({ kind: 'variant', id: v.id })} />
          ))}
          <Option on={choice?.kind === 'own'} label="Предложить своё" onPress={() => setChoice({ kind: 'own' })} />
          {choice?.kind === 'own' && (
            <View style={{ rowGap: 4 }}>
              <TextInput
                autoFocus
                value={own}
                onChangeText={setOwn}
                maxLength={60}
                placeholder="Имя Отчество"
                placeholderTextColor={k.textSecondary}
                autoCapitalize="words"
                style={{
                  minHeight: TOUCH_MIN, paddingHorizontal: 12, borderRadius: RADIUS.sm, borderWidth: 1.5,
                  borderColor: ownErr ? k.statusOffline : k.border, color: k.text, fontFamily: FONT[500], fontSize: 16,
                }}
              />
              <Txt t="caption" color={ownErr ? k.statusOffline : own.trim() ? k.roomFreeText : k.textSecondary}>
                {ownErr || (own.trim() ? 'Подходит. Другие увидят вариант, когда его проверит администратор.' : `Имя и отчество — на «${initials}»`)}
              </Txt>
            </View>
          )}
          {err && <Txt t="caption" color={k.statusOffline}>{err}</Txt>}
          <View style={{ flexDirection: 'row', alignItems: 'center', columnGap: 14, marginTop: 4 }}>
            <Pressable
              onPress={send}
              disabled={!canSend}
              accessibilityRole="button"
              style={({ pressed }) => ({
                minHeight: TOUCH_MIN, paddingHorizontal: 22, borderRadius: RADIUS.pill, alignItems: 'center', justifyContent: 'center',
                backgroundColor: k.accent, opacity: !canSend ? 0.45 : pressed ? 0.85 : 1,
              })}
            >
              <Txt t="button" color={k.onAccent}>{busy ? 'Отправляем…' : 'Ответить'}</Txt>
            </Pressable>
            {editing && (
              <Pressable onPress={() => setEditing(false)} accessibilityRole="button" hitSlop={8}>
                <Txt t="link" color={k.accentText}>Отмена</Txt>
              </Pressable>
            )}
          </View>
        </View>
      )}

      {open && !showForm && (
        <View style={{ paddingHorizontal: 14, paddingBottom: 14, rowGap: 10 }}>
          {res ? (
            <>
              {res.variants.length > 0 && (
                <Txt t="bodySmall" color={k.textSecondary}>
                  Ответили {total} {plural(total, 'человек', 'человека', 'человек')}. Имя появится у всех, когда его утвердит администратор.
                </Txt>
              )}
              {res.variants.map(v => {
                const pct = total ? Math.round(((v.votes ?? 0) / total) * 100) : 0;
                const mine = res.mine === v.id;
                return (
                  <View key={v.id} style={{ rowGap: 4 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', columnGap: 8 }}>
                      <Txt t="smallStrong" color={mine ? k.accentText : k.text} style={{ flexShrink: 1 }}>
                        {v.name}{mine ? ' · ваш ответ' : ''}
                      </Txt>
                      <Txt t="small" color={k.textSecondary}>{v.votes ?? 0} · {pct}%</Txt>
                    </View>
                    <View style={{ height: 6, borderRadius: 3, backgroundColor: k.surface2, overflow: 'hidden' }}>
                      <View style={{ width: `${pct}%`, height: 6, borderRadius: 3, backgroundColor: mine ? k.accent : k.textSecondary }} />
                    </View>
                  </View>
                );
              })}
              {res.pending && (
                <Txt t="caption" color={k.textSecondary}>
                  Ваш вариант «{res.pending}» на проверке. Другие его пока не видят — появится у всех, когда его одобрит администратор.
                </Txt>
              )}
            </>
          ) : (
            <Txt t="bodySmall" color={k.textSecondary}>Загружаем…</Txt>
          )}
          <Pressable onPress={() => { setEditing(true); setRes(null); }} accessibilityRole="button" hitSlop={8} style={{ alignSelf: 'flex-start' }}>
            <Txt t="link" color={k.accentText}>Изменить ответ</Txt>
          </Pressable>
        </View>
      )}
    </View>
  );
}
