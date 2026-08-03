import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { AnalysisResult } from '../domain/analysis';

type ShareableReportCardProps = {
  generatedAt: string;
  result: AnalysisResult;
};

export const ShareableReportCard = forwardRef<View, ShareableReportCardProps>(function ShareableReportCard({ generatedAt, result }, ref) {
  const participantLabels = new Map<string, string>();
  const labelFor = (sender: string) => {
    const existing = participantLabels.get(sender);
    if (existing) return existing;
    const label = `Participant ${participantLabels.size + 1}`;
    participantLabels.set(sender, label);
    return label;
  };

  return (
    <View ref={ref} accessible={false} collapsable={false} importantForAccessibility="no-hide-descendants" style={styles.card} testID="shareable-report-card">
      <Text style={styles.brand}>ConvoAutopsy</Text>
      <Text style={styles.kicker}>Private educational report</Text>
      <Text style={styles.date}>Report date: {new Date(generatedAt).toLocaleDateString()}</Text>

      <View style={styles.estimateBox}>
        <Text style={styles.estimateLabel}>Intensity estimate</Text>
        <Text style={styles.estimateValue}>{result.intensityScore}/100</Text>
        <Text style={styles.conflict}>Conflict-style estimate: {result.conflictMode}</Text>
      </View>

      <Text style={styles.sectionTitle}>Message overview</Text>
      <Text style={styles.redactionNote}>Participant labels are anonymized. Message contents are redacted.</Text>
      {result.messages.slice(0, 6).map((message, index) => (
        <View key={`${message.sender}-${index}`} style={styles.messageRow}>
          <Text style={styles.participant}>{labelFor(message.sender)}</Text>
          <Text style={styles.redacted}>[Message content redacted]</Text>
          <Text style={styles.pattern}>Pattern label: {message.pattern}</Text>
        </View>
      ))}

      <View style={styles.limitationBox}>
        <Text style={styles.limitationTitle}>Educational limitation</Text>
        <Text style={styles.limitation}>This on-device estimate is educational context, not a factual conclusion about people or relationships.</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: { backgroundColor: '#101827', height: 640, padding: 28, width: 360 },
  brand: { color: '#F8FAFC', fontSize: 30, fontWeight: '800', letterSpacing: 0.3 },
  kicker: { color: '#9AC7FF', fontSize: 14, fontWeight: '700', marginTop: 5, textTransform: 'uppercase' },
  date: { color: '#CBD5E1', fontSize: 13, marginTop: 16 },
  estimateBox: { backgroundColor: '#1E293B', borderRadius: 14, marginTop: 18, padding: 16 },
  estimateLabel: { color: '#CBD5E1', fontSize: 13, fontWeight: '700', textTransform: 'uppercase' },
  estimateValue: { color: '#F8FAFC', fontSize: 40, fontWeight: '800', marginTop: 2 },
  conflict: { color: '#BFDBFE', fontSize: 14, fontWeight: '700', marginTop: 6 },
  sectionTitle: { color: '#F8FAFC', fontSize: 18, fontWeight: '800', marginTop: 20 },
  redactionNote: { color: '#CBD5E1', fontSize: 12, lineHeight: 17, marginTop: 4 },
  messageRow: { borderBottomColor: '#334155', borderBottomWidth: StyleSheet.hairlineWidth, marginTop: 8, paddingBottom: 8 },
  participant: { color: '#F8FAFC', fontSize: 13, fontWeight: '700' },
  redacted: { color: '#CBD5E1', fontSize: 12, marginTop: 2 },
  pattern: { color: '#9AC7FF', fontSize: 12, marginTop: 3 },
  limitationBox: { backgroundColor: '#172033', borderColor: '#475569', borderRadius: 12, borderWidth: 1, marginTop: 'auto', padding: 12 },
  limitationTitle: { color: '#F8FAFC', fontSize: 13, fontWeight: '800' },
  limitation: { color: '#CBD5E1', fontSize: 12, lineHeight: 17, marginTop: 3 },
});
