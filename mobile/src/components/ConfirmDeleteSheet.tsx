import { useEffect, useState } from 'react';
import { AccessibilityInfo, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { tokens } from '../theme/tokens';

type ConfirmDeleteSheetProps = {
  title: string;
  visible: boolean;
  onCancel(): void;
  onConfirm(): void;
};

export function ConfirmDeleteSheet({ title, visible, onCancel, onConfirm }: ConfirmDeleteSheetProps) {
  const [reduceMotion, setReduceMotion] = useState(true);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setReduceMotion(enabled);
    }).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { active = false; subscription.remove(); };
  }, []);

  return (
    <Modal animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={onCancel} transparent visible={visible}>
      <View style={styles.backdrop}>
        <View accessibilityRole="alert" style={styles.sheet}>
          <Text style={styles.title}>Delete “{title}”?</Text>
          <Text style={styles.body}>This permanently removes this saved analysis from this device.</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`Confirm delete ${title}`} onPress={onConfirm} style={styles.delete}>
            <Text style={styles.deleteText}>Delete permanently</Text>
          </Pressable>
          <Pressable accessibilityLabel="Cancel deletion" accessibilityRole="button" onPress={onCancel} style={styles.cancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.55)', flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: tokens.colors.surface, borderTopLeftRadius: tokens.radius.lg, borderTopRightRadius: tokens.radius.lg, gap: tokens.spacing.md, padding: tokens.spacing.lg },
  title: { color: tokens.colors.textPrimary, fontSize: 20, fontWeight: '700' },
  body: { color: tokens.colors.textSecondary, fontSize: 16, lineHeight: 24 },
  delete: { alignItems: 'center', backgroundColor: tokens.colors.error, borderRadius: tokens.radius.md, justifyContent: 'center', minHeight: tokens.minTouchTarget },
  deleteText: { color: tokens.colors.textPrimary, fontSize: 16, fontWeight: '700' },
  cancel: { alignItems: 'center', justifyContent: 'center', minHeight: tokens.minTouchTarget },
  cancelText: { color: tokens.colors.textPrimary, fontSize: 16, fontWeight: '700' },
});
