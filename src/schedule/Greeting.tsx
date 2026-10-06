/**
 * Приветствие под шапкой Расписания: «Доброе утро, Сухроб · сегодня 3 пары,
 * первая в 09:45». Только на своей группе и этой неделе. Пары пересчитываются
 * вместе с лентой (now меняется на границах пар), а часть дня — своим тиком
 * раз в минуту: последняя пара в 17:00, а «Добрый вечер» наступает в 18:00.
 */
import React, { memo, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useUserName, firstName } from '../userName';
import { Tokens, GUTTER } from './tokens';
import { Txt } from './ui';
import { DayData, greetingRest, isoOf, partOfDay } from './state';

function Greeting({ k, now, days }: { k: Tokens; now: Date; days: DayData[] }) {
  const name = firstName(useUserName());
  const [part, setPart] = useState(() => partOfDay(new Date()));
  useEffect(() => {
    const id = setInterval(() => setPart(partOfDay(new Date())), 60_000);
    return () => clearInterval(id);
  }, []);
  const hello = name ? `${part}, ${name}` : part;
  const rest = greetingRest(now, days.find(d => d.date === isoOf(now)));
  return (
    <View style={{ paddingHorizontal: GUTTER + 4, paddingBottom: 4 }}>
      <Txt t="small" color={k.textSecondary} accessibilityRole="text">
        <Txt t="smallStrong" color={k.text}>{hello}</Txt>
        {` · ${rest}`}
      </Txt>
    </View>
  );
}

export default memo(Greeting);
