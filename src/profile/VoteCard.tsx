/**
 * Голосование за следующую функцию (9 ноя 2026) — награда огонька за 21 день с заходом, как на сайте
 * (components/VoteCard.tsx). Сервер — GET/POST /user/vote (services/votes.py). Видна в Кабинете, только когда
 * голосование идёт и человеку можно голосовать. Проценты — после своего голоса, передумать можно, пока идёт.
 * Push «Голосование» (`kind: vote`) открывает Кабинет.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { API_BASE } from '../api';
import { RADIUS, type Tokens } from '../schedule/tokens';
import { Txt } from '../schedule/ui';

type Idea = { id: number; title: string; desc: string };
type Poll = { id: number; question: string; ideas: Idea[]; my: number | null; results?: Record<string, number> };
type VoteState = { allowed: boolean; need: number; total: number; poll: Poll | null };

export default function VoteCard({ k }: { k: Tokens }) {
  const [st, setSt] = useState<VoteState | null>(null);
  const [device, setDevice] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // При каждом заходе в Кабинет: голосование могли открыть или закрыть (ответ сервера — из памяти, базу не будит)
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        const [[, dev], [, gid]] = await AsyncStorage.multiGet(['msu_device_id', 'selected_group_id']);
        if (!dev || !gid) return;
        setDevice(dev);
        const r = await fetch(`${API_BASE}/user/vote?device_id=${encodeURIComponent(dev)}`);
        if (r.ok && alive) setSt(await r.json());
      })().catch(() => null);
      return () => { alive = false; };
    }, []),
  );

  const vote = async (idea: number) => {
    if (!st?.poll || busy) return;
    setBusy(true); setErr('');
    try {
      const r = await fetch(`${API_BASE}/user/vote`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: device, poll_id: st.poll.id, idea_id: idea }),
      });
      if (!r.ok) {
        let t = 'Не получилось — проверьте интернет';
        try { const j = await r.json(); if (typeof j.detail === 'string') t = j.detail; } catch { /* не JSON */ }
        throw new Error(t);
      }
      setSt(await r.json());
    } catch (e) { setErr(e instanceof Error && !/Network request failed/.test(e.message) ? e.message : 'Не получилось — проверьте интернет'); }
    setBusy(false);
  };

  const p = st?.poll;
  if (!st?.allowed || !p) return null;
  const voted = p.my != null;
  return (
    <View style={{ marginTop: 16, padding: 16, rowGap: 8, backgroundColor: k.card, borderRadius: RADIUS.card, borderWidth: 1, borderColor: k.border }}>
      <Txt t="overline" color={k.accentText}>Голосование</Txt>
      <Txt t="titleCard" color={k.text}>{p.question}</Txt>
      <Txt t="small" color={k.textSecondary}>{voted ? 'Ваш голос учтён. Передумать можно, пока голосование идёт.' : 'Выберите идею, которую сделать первой.'}</Txt>
      <View style={{ rowGap: 8, marginTop: 2 }}>
        {p.ideas.map(i => {
          const pct = p.results?.[String(i.id)] ?? 0;
          const mine = p.my === i.id;
          return (
            <Pressable key={i.id} onPress={() => void vote(i.id)} disabled={busy} accessibilityRole="button" accessibilityState={{ selected: mine }}
              accessibilityLabel={`${i.title}. ${i.desc}${voted ? `. ${pct} процентов${mine ? ', ваш голос' : ''}` : ''}`}
              style={({ pressed }) => ({ overflow: 'hidden', borderRadius: 14, backgroundColor: k.surface2, opacity: pressed ? 0.85 : 1,
                borderWidth: 2, borderColor: mine ? k.accentText : 'transparent' })}>
              {voted ? <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, backgroundColor: k.accentSoft }} /> : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', columnGap: 10, paddingHorizontal: 12, paddingVertical: 10 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt t="titleRow" color={k.text}>{i.title}</Txt>
                  <Txt t="small" color={k.textSecondary} style={{ marginTop: 2 }}>{i.desc}</Txt>
                </View>
                {voted ? <Txt t="smallStrong" color={mine ? k.accentText : k.textSecondary}>{mine ? `${pct}% · ваш` : `${pct}%`}</Txt> : null}
              </View>
            </Pressable>
          );
        })}
      </View>
      {err ? <Txt t="small" color={k.statusOffline}>{err}</Txt> : null}
    </View>
  );
}
