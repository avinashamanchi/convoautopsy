import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { AnalysisResult } from '../domain/analysis';

type ShareableReportCardProps = {
  generatedAt: string;
  result: AnalysisResult;
};

export const ShareableReportCard = forwardRef<View, ShareableReportCardProps>(function ShareableReportCard({ generatedAt, result }, ref) {
  const modeLabel = result.mode === 'ai' ? 'AI-assisted estimate' : 'On-device estimate';
  const participantLabels = new Map<string, string>();
  const labelFor = (sender: string) => {
    const existing = participantLabels.get(sender);
    if (existing) return existing;
    const label = `Participant ${participantLabels.size + 1}`;
    participantLabels.set(sender, label);
    return label;
  };

  return (
    <View ref={ref} accessible={false} collapsable={false} importantForAccessibility="no-hide-descendants" style={styles.card} testID="shareable-report-canvas">
      <Text numberOfLines={1} style={styles.brand}>ConvoAutopsy</Text>
      <Text numberOfLines={1} style={styles.kicker}>Private educational report</Text>
      <Text numberOfLines={1} style={styles.date}>Report date: {new Date(generatedAt).toLocaleDateString()}</Text>
      <Text numberOfLines={1} style={styles.mode}>Analysis mode: {modeLabel}</Text>

      <View style={styles.estimateBox}>
        <Text numberOfLines={1} style={styles.estimateLabel}>Intensity estimate</Text>
        <Text numberOfLines={1} style={styles.estimateValue}>{result.intensityScore}/100</Text>
        <Text numberOfLines={1} style={styles.conflict}>Conflict-style estimate: {result.conflictMode}</Text>
      </View>

      <Text numberOfLines={1} style={styles.sectionTitle}>Message overview</Text>
      <Text numberOfLines={1} style={styles.redactionNote}>Participant labels are anonymized. Message contents are redacted.</Text>
      {result.messages.slice(0, 6).map((message, index) => (
        <View key={`${message.sender}-${index}`} style={styles.messageRow} testID="shareable-report-row">
          <Text numberOfLines={1} style={styles.participant}>{labelFor(message.sender)}</Text>
          <Text numberOfLines={1} style={styles.redacted}>[Message content redacted]</Text>
          <Text numberOfLines={1} style={styles.pattern}>Pattern label: {message.pattern}</Text>
        </View>
      ))}

      <View style={styles.limitationBox} testID="shareable-report-limitation">
        <Text numberOfLines={1} style={styles.limitationTitle}>Educational limitation</Text>
        <Text numberOfLines={3} style={styles.limitation}>This educational estimate may be incomplete or wrong and is not a factual conclusion about people or relationships.</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: { backgroundColor: '#101827', height: 640, overflow: 'hidden', padding: 18, width: 360 },
  brand: { color: '#F8FAFC', fontSize: 26, fontWeight: '800', letterSpacing: 0.3, lineHeight: 30 },
  kicker: { color: '#9AC7FF', fontSize: 11, fontWeight: '700', lineHeight: 14, marginTop: 2, textTransform: 'uppercase' },
  date: { color: '#CBD5E1', fontSize: 11, lineHeight: 14, marginTop: 8 },
  mode: { color: '#BFDBFE', fontSize: 10, fontWeight: '700', lineHeight: 12, marginTop: 2 },
  estimateBox: { backgroundColor: '#1E293B', borderRadius: 12, height: 68, marginTop: 10, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 8 },
  estimateLabel: { color: '#CBD5E1', fontSize: 10, fontWeight: '700', lineHeight: 11, textTransform: 'uppercase' },
  estimateValue: { color: '#F8FAFC', fontSize: 24, fontWeight: '800', lineHeight: 27 },
  conflict: { color: '#BFDBFE', fontSize: 10, fontWeight: '700', lineHeight: 13 },
  sectionTitle: { color: '#F8FAFC', fontSize: 14, fontWeight: '800', lineHeight: 17, marginTop: 10 },
  redactionNote: { color: '#CBD5E1', fontSize: 10, lineHeight: 12, marginTop: 2 },
  messageRow: { borderBottomColor: '#334155', borderBottomWidth: StyleSheet.hairlineWidth, height: 39, maxHeight: 39, overflow: 'hidden', paddingTop: 1 },
  participant: { color: '#F8FAFC', fontSize: 11, fontWeight: '700', lineHeight: 12 },
  redacted: { color: '#CBD5E1', fontSize: 10, lineHeight: 12 },
  pattern: { color: '#9AC7FF', fontSize: 9, lineHeight: 11 },
  limitationBox: { backgroundColor: '#172033', borderColor: '#475569', borderRadius: 10, borderWidth: 1, height: 62, marginTop: 'auto', overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 7 },
  limitationTitle: { color: '#F8FAFC', fontSize: 11, fontWeight: '800', lineHeight: 13 },
  limitation: { color: '#CBD5E1', fontSize: 9, lineHeight: 12, marginTop: 2 },
});
