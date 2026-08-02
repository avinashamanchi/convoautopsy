import { StyleSheet, Text, View } from 'react-native';
import type { ParseResult } from '../domain/analysis';
import { tokens } from '../theme/tokens';

export function ParsedMessageList({ parsed }: { parsed: ParseResult }) {
  return (
    <View style={styles.container}>
      <Text accessibilityRole="header" style={styles.heading}>Parsed messages</Text>
      {parsed.messages.map((message) => (
        <View key={message.id} style={styles.message}>
          <Text style={styles.sender}>{message.sender}</Text>
          <Text style={styles.text}>{message.text}</Text>
        </View>
      ))}
      {parsed.rejected.length ? (
        <View style={styles.rejected}>
          <Text accessibilityRole="header" style={styles.rejectedHeading}>Rejected lines</Text>
          {parsed.rejected.map((line) => (
            <View key={line.sourceLine} style={styles.rejectedLine}>
              <Text style={styles.rejectedText}>Line {line.sourceLine}: {line.text}</Text>
              <Text style={styles.reason}>{line.reason}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: tokens.spacing.sm },
  heading: { color: tokens.colors.textPrimary, fontSize: 22, fontWeight: '700' },
  message: { backgroundColor: tokens.colors.surface, borderRadius: tokens.radius.md, gap: tokens.spacing.xs, padding: tokens.spacing.md },
  sender: { color: tokens.colors.accent, fontSize: 14, fontWeight: '700' },
  text: { color: tokens.colors.textPrimary, fontSize: 16, lineHeight: 22 },
  rejected: { gap: tokens.spacing.sm, marginTop: tokens.spacing.md },
  rejectedHeading: { color: tokens.colors.warning, fontSize: 18, fontWeight: '700' },
  rejectedLine: { borderColor: tokens.colors.warning, borderLeftWidth: 3, gap: tokens.spacing.xs, paddingLeft: tokens.spacing.sm },
  rejectedText: { color: tokens.colors.textPrimary, fontSize: 14 },
  reason: { color: tokens.colors.textSecondary, fontSize: 13 },
});
