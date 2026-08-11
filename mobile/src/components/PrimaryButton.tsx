import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { tokens } from '../theme/tokens';

type PrimaryButtonProps = Pick<ComponentProps<typeof Pressable>, 'onPress' | 'testID'> & {
  label: string;
  disabled?: boolean;
  selected?: boolean;
};

export function PrimaryButton({ label, disabled = false, selected = false, onPress, testID }: PrimaryButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        selected && styles.selected,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
      testID={testID}
    >
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: tokens.colors.accent,
    borderRadius: tokens.radius.md,
    justifyContent: 'center',
    minHeight: tokens.minTouchTarget,
    paddingHorizontal: tokens.spacing.md,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.8,
  },
  selected: {
    borderColor: tokens.colors.textPrimary,
    borderWidth: 2,
  },
  label: {
    color: tokens.colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
});
