import React from 'react';
import { View, Text, TouchableOpacity, Share, StyleSheet } from 'react-native';
import Constants from 'expo-constants';
import QRCode from 'react-native-qrcode-svg';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from './theme';

// Единственный источник — app.json → expo.extra.webUrl (как API_BASE в api.ts).
const WEB_URL =
  (Constants.expoConfig?.extra?.webUrl as string | undefined) ??
  'https://frontend-ten-nu-80.vercel.app';

/**
 * QR-код + ссылка на сайт — самый быстрый способ позвать одногруппников.
 * Ведёт на сайт, а не на APK: с сайта ничего не нужно устанавливать и
 * разрешать «неизвестные источники», расписание открывается сразу.
 */
export default function InviteCard({ C }: { C: Colors }) {
  const share = () => {
    Share.share({
      message: `МГУ Душанбе — расписание занятий, свободные аудитории и изменения. Заходи: ${WEB_URL}`,
    }).catch(() => {});
  };

  return (
    <View style={[s.card, { backgroundColor: C.card, borderColor: C.border }]}>
      <Text style={[s.title, { color: C.fg }]}>Позвать одногруппников</Text>
      <View style={s.qrBox}>
        <QRCode value={WEB_URL} size={140} color="#111111" backgroundColor="#ffffff" />
      </View>
      <Text style={[s.hint, { color: C.muted }]}>
        Пусть отсканируют камерой телефона — откроется сайт с расписанием, ничего устанавливать не нужно.
      </Text>
      <TouchableOpacity onPress={share} activeOpacity={0.85} style={[s.btn, { backgroundColor: C.primary }]}>
        <Ionicons name="share-outline" size={16} color="#fff" style={{ marginRight: 8 }} />
        <Text style={s.btnText}>Поделиться ссылкой</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, padding: 16, alignItems: 'center', gap: 10, marginBottom: 14 },
  title: { fontSize: 14, fontWeight: '700', alignSelf: 'flex-start' },
  qrBox: { padding: 12, borderRadius: 10, backgroundColor: '#fff' },
  hint: { fontSize: 12, textAlign: 'center', maxWidth: 240 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '100%', paddingVertical: 11, borderRadius: 10 },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
