/**
 * Лист «Профиль» (ТЗ «Кабинет»): имя, направление, курс, «Сохранить ·
 * ПМиИ, 3 курс». Открывается из «Изменить имя или группу» и «Выбрать группу».
 * Системная «Назад» закрывает без сохранения (onRequestClose у Modal).
 *
 * Направления и курсы — из того же списка групп, что и прежний выбор группы
 * (GroupSelector): показываются все направления, курсы 1–4; доступны те,
 * для которых у направления есть группа.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Group, shortGroupName } from '../api';
import { DIR_ORDER } from '../GroupSelector';
import { Tokens, RADIUS, TOUCH_MIN, TYPE } from '../schedule/tokens';
import { Txt } from '../schedule/ui';
import BottomSheet from '../schedule/BottomSheet';
import { Button } from './rows';
import { saveLabel } from './state';
import { NAME_MAX, NAME_REQUIRED_HINT, nameOk } from '../userName';

export default function ProfileSheet({ k, visible, groups, name, group, onClose, onSave }: {
  k: Tokens;
  visible: boolean;
  groups: Group[];
  name: string;
  group: Group | null;
  onClose: () => void;
  onSave: (name: string, group: Group) => Promise<void>;
}) {
  const [draftName, setDraftName] = useState(name);
  const [dir, setDir] = useState<string | null>(group ? shortGroupName(group.name) : null);
  const [year, setYear] = useState<number | null>(group?.year ?? null);
  const [saving, setSaving] = useState(false);

  // Каждое открытие — с текущих значений
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setDraftName(name);
      setDir(group ? shortGroupName(group.name) : null);
      setYear(group?.year ?? null);
    }
  }

  const directions = useMemo(() => {
    const have = new Set(groups.map(g => shortGroupName(g.name)));
    // Сначала — в привычном порядке, потом новые, если появятся на msu.tj
    return [...DIR_ORDER.filter(d => have.has(d)), ...[...have].filter(d => !DIR_ORDER.includes(d)).sort()];
  }, [groups]);

  const years = useMemo(() => {
    const all = [...new Set(groups.map(g => g.year))].sort((a, b) => a - b);
    return all.length ? all : [1, 2, 3, 4];
  }, [groups]);

  const findGroup = (d: string | null, y: number | null) =>
    d && y ? groups.find(g => shortGroupName(g.name) === d && g.year === y) ?? null : null;
  const yearAvailable = (y: number) => !dir || groups.some(g => shortGroupName(g.name) === dir && g.year === y);
  const chosen = findGroup(dir, year);

  const pickDir = (d: string) => {
    Haptics.selectionAsync();
    setDir(d);
    // Курса нет у нового направления — сбрасываем, чтобы не сохранить чужую группу
    if (year && !groups.some(g => shortGroupName(g.name) === d && g.year === year)) setYear(null);
  };

  // Имя обязательно, как на сайте: стереть его в Кабинете нельзя
  const hasName = nameOk(draftName);
  const save = async () => {
    if (!chosen || !hasName || saving) return;
    setSaving(true);
    try { await onSave(draftName.trim(), chosen); } finally { setSaving(false); }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      k={k}
      label="Профиль"
      header={(
        <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: TOUCH_MIN }}>
          <Txt t="sheetTitle" color={k.text} accessibilityRole="header" style={{ flex: 1 }}>Профиль</Txt>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Закрыть"
            style={{ width: TOUCH_MIN, height: TOUCH_MIN, alignItems: 'center', justifyContent: 'center', marginRight: -12 }}
          >
            <Ionicons name="close" size={24} color={k.text} />
          </Pressable>
        </View>
      )}
    >
      <Txt t="overline" color={k.textSecondary} style={{ marginTop: 8, marginBottom: 6 }}>Имя</Txt>
      <TextInput
        value={draftName}
        onChangeText={setDraftName}
        placeholder="Как к вам обращаться"
        placeholderTextColor={k.textSecondary}
        autoFocus
        returnKeyType="done"
        accessibilityLabel="Имя"
        accessibilityHint={hasName ? undefined : NAME_REQUIRED_HINT}
        maxLength={NAME_MAX}
        maxFontSizeMultiplier={TYPE.body.max}
        style={[TYPE.body.style, {
          minHeight: TOUCH_MIN, borderRadius: RADIUS.sm, paddingHorizontal: 14, color: k.text,
          backgroundColor: k.surface2, borderWidth: hasName ? 1 : 2, borderColor: hasName ? k.border : k.statusOffline,
        }]}
      />
      {!hasName && (
        <Txt t="small" color={k.statusOffline} accessibilityLiveRegion="polite" style={{ marginTop: 6 }}>{NAME_REQUIRED_HINT}</Txt>
      )}

      <Txt t="overline" color={k.textSecondary} style={{ marginTop: 16, marginBottom: 6 }}>Направление</Txt>
      <View style={{ borderRadius: RADIUS.sm, borderWidth: 1, borderColor: k.border, overflow: 'hidden' }}>
        {directions.map((d, i) => {
          const sel = d === dir;
          return (
            <Pressable
              key={d}
              onPress={() => pickDir(d)}
              accessibilityRole="radio"
              accessibilityState={{ selected: sel }}
              accessibilityLabel={`Направление ${d}`}
              style={{
                minHeight: TOUCH_MIN, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center',
                backgroundColor: sel ? k.accentSoft : 'transparent',
                borderTopWidth: i > 0 ? 1 : 0, borderTopColor: k.border,
              }}
            >
              <Txt t={sel ? 'button' : 'body'} color={sel ? k.onAccentSoft : k.text} style={{ flex: 1 }}>{d}</Txt>
              {sel && <Ionicons name="checkmark" size={18} color={k.onAccentSoft} />}
            </Pressable>
          );
        })}
      </View>

      <Txt t="overline" color={k.textSecondary} style={{ marginTop: 16, marginBottom: 6 }}>Курс</Txt>
      <View style={{ flexDirection: 'row', columnGap: 8 }}>
        {years.map(y => {
          const sel = y === year;
          const ok = yearAvailable(y);
          return (
            <Pressable
              key={y}
              onPress={() => { Haptics.selectionAsync(); setYear(y); }}
              disabled={!ok}
              accessibilityRole="radio"
              accessibilityState={{ selected: sel, disabled: !ok }}
              accessibilityLabel={ok ? `${y} курс` : `${y} курс, расписания нет`}
              style={{
                flex: 1, minHeight: TOUCH_MIN, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center',
                backgroundColor: sel ? k.accent : k.surface2, opacity: ok ? 1 : 0.4,
              }}
            >
              <Txt t="buttonLg" color={sel ? k.onAccent : k.text}>{String(y)}</Txt>
            </Pressable>
          );
        })}
      </View>

      <View style={{ marginTop: 20 }}>
        <Button
          k={k}
          primary
          title={saving ? 'Сохраняем' : saveLabel(chosen ? dir : null, chosen ? year : null)}
          disabled={!chosen || !hasName || saving}
          busy={saving}
          onPress={save}
        />
      </View>
    </BottomSheet>
  );
}
