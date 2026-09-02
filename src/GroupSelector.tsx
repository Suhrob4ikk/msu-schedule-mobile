import React, { useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Group, shortGroupName } from './api';
import { Colors } from './theme';

const DIR_ORDER = ['ПМиИ', 'ХФММ', 'Геология', 'МО', 'Лингвистика', 'ГМУ'];

interface Props {
  groups: Group[];
  value: Group | null;
  onChange: (group: Group) => void;
  C: Colors;
  /** Компактный режим: когда группа выбрана — одна строка, чипы раскрываются по нажатию */
  collapsible?: boolean;
  /**
   * Раскрыт ли выбор группы. Нужен экрану расписания: в режиме недели он
   * отключает собственную прокрутку (её забирает листалка дней), и без этого
   * сигнала до раскрытого списка групп было не докрутить.
   */
  onExpandedChange?: (expanded: boolean) => void;
}

export default function GroupSelector({ groups, value, onChange, C, collapsible, onExpandedChange }: Props) {
  const [pendingDir, setPendingDir] = useState<string | null>(null);
  const [expandedRaw, setExpandedRaw] = useState(false);
  const expanded = expandedRaw;
  const setExpanded = (v: boolean) => {
    setExpandedRaw(v);
    onExpandedChange?.(v);
  };

  const directions = useMemo(() => {
    const dirs = new Set<string>();
    groups.forEach(g => dirs.add(shortGroupName(g.name)));
    return DIR_ORDER.filter(d => dirs.has(d));
  }, [groups]);

  const valueDir = value ? shortGroupName(value.name) : null;
  const activeDir = pendingDir ?? valueDir;

  const years = useMemo(() => {
    if (!activeDir) return [];
    return [...new Set(
      groups.filter(g => shortGroupName(g.name) === activeDir).map(g => g.year)
    )].sort((a, b) => a - b);
  }, [groups, activeDir]);

  const activeYear = (pendingDir == null || pendingDir === valueDir) ? value?.year : undefined;

  // После выбора группы в компактном режиме — сворачиваемся
  const pick = (g: Group) => {
    onChange(g);
    setPendingDir(null);
    if (collapsible) setExpanded(false);
  };

  // Выбор в два шага: направление → курс (без автовыбора курса, иначе
  // «ПМиИ 3 → ХФММ 2» требовал бы лишний круг через «изменить»).
  const onDir = (dir: string) => {
    if (dir === valueDir) {
      setPendingDir(null); // своё направление: показываем его курсы, текущий подсвечен
      return;
    }
    setPendingDir(dir);
    const ys = [...new Set(
      groups.filter(g => shortGroupName(g.name) === dir).map(g => g.year)
    )];
    // Курс всего один — выбирать нечего, берём сразу
    if (ys.length === 1) {
      const g = groups.find(g => shortGroupName(g.name) === dir && g.year === ys[0]);
      if (g) pick(g);
    }
  };

  const onYear = (year: number) => {
    if (!activeDir) return;
    const g = groups.find(g => shortGroupName(g.name) === activeDir && g.year === year);
    if (g) pick(g);
  };

  // ── Компактная строка (группа выбрана, чипы спрятаны) ──
  if (collapsible && value && !expanded) {
    return (
      <TouchableOpacity
        onPress={() => setExpanded(true)}
        activeOpacity={0.7}
        style={s.compactRow}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[s.label, { color: C.muted, marginBottom: 2 }]}>ГРУППА</Text>
          <Text style={[s.compactValue, { color: C.fg }]} numberOfLines={1}>
            {valueDir} · {value.year} курс
          </Text>
        </View>
        <View style={s.compactHint}>
          <Text style={{ color: C.muted, fontSize: 13 }}>изменить</Text>
          <Ionicons name="chevron-down" size={16} color={C.muted} />
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View>
      <View style={s.labelRow}>
        <Text style={[s.label, { color: C.muted }]}>НАПРАВЛЕНИЕ</Text>
        {collapsible && value && (
          <TouchableOpacity
            onPress={() => { setPendingDir(null); setExpanded(false); }}
            style={s.collapseBtn}
            activeOpacity={0.7}
          >
            <Text style={{ color: C.muted, fontSize: 12 }}>Свернуть</Text>
            <Ionicons name="chevron-up" size={14} color={C.muted} />
          </TouchableOpacity>
        )}
      </View>
      <View style={s.chipRow}>
        {directions.map(dir => {
          const active = activeDir === dir;
          return (
            <TouchableOpacity
              key={dir}
              onPress={() => onDir(dir)}
              style={[
                s.chip,
                {
                  backgroundColor: active ? C.primary : C.card,
                  borderColor: active ? C.primary : C.border,
                },
              ]}
              activeOpacity={0.7}
            >
              <Text style={[s.chipText, { color: active ? '#fff' : C.fg }]}>{dir}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {activeDir && years.length > 0 && (
        <>
          <Text style={[s.label, { color: C.muted, marginTop: 14, marginBottom: 8 }]}>КУРС</Text>
          <View style={s.yearRow}>
            {years.map(year => {
              const active = activeYear === year;
              return (
                <TouchableOpacity
                  key={year}
                  onPress={() => onYear(year)}
                  style={[
                    s.yearChip,
                    {
                      backgroundColor: active ? C.primary : C.card,
                      borderColor: active ? C.primary : C.border,
                    },
                  ]}
                  activeOpacity={0.7}
                >
                  <Text style={[s.chipText, { color: active ? '#fff' : C.fg }]}>
                    {year} курс
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  collapseBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, padding: 2 },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  compactValue: { fontSize: 17, fontWeight: '700' },
  compactHint: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 2 },
  chip: {
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  yearRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  yearChip: {
    paddingHorizontal: 24,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  chipText: { fontSize: 15, fontWeight: '600' },
});
