import React, { useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
} from 'react-native';
import { Group, shortGroupName } from './api';
import { Colors } from './theme';

const DIR_ORDER = ['ПМиИ', 'ХФММ', 'Геология', 'МО', 'Лингвистика', 'ГМУ'];

interface Props {
  groups: Group[];
  value: Group | null;
  onChange: (group: Group) => void;
  C: Colors;
}

export default function GroupSelector({ groups, value, onChange, C }: Props) {
  const [pendingDir, setPendingDir] = useState<string | null>(null);

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

  const onDir = (dir: string) => {
    if (dir === valueDir) {
      setPendingDir(null);
    } else {
      setPendingDir(dir);
      const ys = [...new Set(
        groups.filter(g => shortGroupName(g.name) === dir).map(g => g.year)
      )];
      if (ys.length === 1) {
        const g = groups.find(g => shortGroupName(g.name) === dir && g.year === ys[0]);
        if (g) { onChange(g); setPendingDir(null); }
      }
    }
  };

  const onYear = (year: number) => {
    if (!activeDir) return;
    const g = groups.find(g => shortGroupName(g.name) === activeDir && g.year === year);
    if (g) { onChange(g); setPendingDir(null); }
  };

  return (
    <View>
      <Text style={[s.label, { color: C.muted }]}>НАПРАВЛЕНИЕ</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.chipRow}
      >
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
      </ScrollView>

      {activeDir && years.length > 0 && (
        <>
          <Text style={[s.label, { color: C.muted, marginTop: 14 }]}>КУРС</Text>
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
    marginBottom: 8,
  },
  chipRow: { flexDirection: 'row', gap: 8, paddingBottom: 2 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  yearRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  yearChip: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  chipText: { fontSize: 14, fontWeight: '600' },
});
