import { useMemo, useState } from 'react';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { Screen } from '../../src/components/Screen';
import { createConsentStore } from '../../src/services/consentStore';
import { deleteAllAppData, nativeCacheArtifactStore, type DeleteAllOutcome } from '../../src/services/deleteAllAppData';
import { useReportRepository } from '../../src/services/reportRepositoryContext';
import { useAnalysisSession } from '../../src/state/AnalysisSession';
import { tokens } from '../../src/theme/tokens';

type DeleteStatus = 'idle' | 'deleting' | 'success' | { failed: DeleteAllOutcome & { ok: false } };

export default function SettingsScreen() {
  const { repository, preferences } = useReportRepository();
  const session = useAnalysisSession();
  const consent = useMemo(() => createConsentStore({ preferences }), [preferences]);
  const [phrase, setPhrase] = useState('');
  const [deleteStatus, setDeleteStatus] = useState<DeleteStatus>('idle');
  const [consentStatus, setConsentStatus] = useState<'idle' | 'revoked' | 'failed'>('idle');

  const deleteData = async () => {
    setDeleteStatus('deleting');
    const outcome = await deleteAllAppData({
      repository,
      preferences,
      consent,
      cache: nativeCacheArtifactStore,
      session,
    });
    setDeleteStatus(outcome.ok ? 'success' : { failed: outcome });
  };

  const revokeConsent = async () => {
    setConsentStatus('idle');
    try {
      await consent.revokeConsent();
      setConsentStatus('revoked');
    } catch {
      setConsentStatus('failed');
    }
  };

  const canDelete = phrase === 'DELETE' && deleteStatus !== 'deleting';

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.container}>
        <Text accessibilityRole="header" style={styles.title}>Settings</Text>

        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.heading}>Privacy and retention</Text>
          <Text style={styles.copy}>Reports remain on this device unless you explicitly share them. AI-assisted analysis is optional and on-device analysis never needs a network connection.</Text>
          <PrimaryButton label="Privacy and retention" onPress={() => router.push('/privacy')} />
          <PrimaryButton label="Revoke AI consent" onPress={() => { void revokeConsent(); }} />
          {consentStatus === 'revoked' ? <Text accessibilityLiveRegion="polite" style={styles.status}>AI consent was revoked. Future AI-assisted analysis will ask again.</Text> : null}
          {consentStatus === 'failed' ? <Text accessibilityRole="alert" style={styles.error}>Could not revoke AI consent. Please try again.</Text> : null}
        </View>

        <View style={[styles.section, styles.dangerSection]}>
          <Text accessibilityRole="header" style={styles.dangerHeading}>Delete all app data</Text>
          <Text style={styles.copy}>This attempts to remove saved reports, preferences, AI consent, the local installation token, ConvoAutopsy cache files, and this in-memory analysis session. It cannot undo data already shared outside the app.</Text>
          <Text style={styles.label}>Type DELETE to permanently erase local ConvoAutopsy data.</Text>
          <TextInput
            accessibilityLabel="Type DELETE to confirm"
            autoCapitalize="characters"
            onChangeText={setPhrase}
            placeholder="DELETE"
            placeholderTextColor={tokens.colors.textSecondary}
            style={styles.input}
            value={phrase}
          />
          <PrimaryButton disabled={!canDelete} label={deleteStatus === 'deleting' ? 'Deleting app data…' : 'Delete all app data'} onPress={() => { void deleteData(); }} />
          {deleteStatus === 'success' ? <Text accessibilityLiveRegion="polite" style={styles.status}>All ConvoAutopsy data was deleted from this device.</Text> : null}
          {typeof deleteStatus === 'object' ? (
            <View style={styles.failure}>
              <Text accessibilityRole="alert" style={styles.error}>Could not completely delete your app data. Failed: {deleteStatus.failed.failed.join(', ')}. Nothing has been reported as fully deleted; retry to attempt the remaining cleanup again.</Text>
              <PrimaryButton label="Retry deleting app data" onPress={() => { void deleteData(); }} />
            </View>
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { gap: tokens.spacing.lg, paddingBottom: tokens.spacing.xl },
  title: { color: tokens.colors.textPrimary, fontSize: 32, fontWeight: '700' },
  section: { backgroundColor: tokens.colors.surface, borderRadius: tokens.radius.md, gap: tokens.spacing.sm, padding: tokens.spacing.md },
  dangerSection: { borderColor: tokens.colors.error, borderWidth: 1 },
  heading: { color: tokens.colors.textPrimary, fontSize: 20, fontWeight: '700' },
  dangerHeading: { color: tokens.colors.error, fontSize: 20, fontWeight: '700' },
  copy: { color: tokens.colors.textSecondary, fontSize: 15, lineHeight: 22 },
  label: { color: tokens.colors.textPrimary, fontSize: 15, fontWeight: '700' },
  input: { borderColor: tokens.colors.textSecondary, borderRadius: tokens.radius.md, borderWidth: 1, color: tokens.colors.textPrimary, fontSize: 16, minHeight: tokens.minTouchTarget, paddingHorizontal: tokens.spacing.sm },
  status: { color: tokens.colors.textSecondary, fontSize: 14, lineHeight: 20 },
  error: { color: tokens.colors.error, fontSize: 14, lineHeight: 20 },
  failure: { gap: tokens.spacing.sm },
});
