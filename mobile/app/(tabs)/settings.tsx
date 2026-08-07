import { useMemo, useRef, useState, useEffect } from 'react';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { Screen } from '../../src/components/Screen';
import { ConsentPreferenceUnavailableError, createConsentStore } from '../../src/services/consentStore';
import { deleteAllAppData, nativeCacheArtifactStore, type DeleteAllOutcome } from '../../src/services/deleteAllAppData';
import { useReportRepository } from '../../src/services/reportRepositoryContext';
import { useAnalysisSession } from '../../src/state/AnalysisSession';
import { tokens } from '../../src/theme/tokens';

type DeleteStatus = 'idle' | 'deleting' | 'success' | { failed: DeleteAllOutcome & { ok: false } };
type SettingsScreenProps = { onDeleteStatusCommit?: (status: 'deleting' | 'success' | 'failed') => void };

export default function SettingsScreen({ onDeleteStatusCommit }: SettingsScreenProps) {
  const { repository, preferences } = useReportRepository();
  const session = useAnalysisSession();
  const consent = useMemo(() => createConsentStore({ preferences }), [preferences]);
  const [phrase, setPhrase] = useState('');
  const [deleteStatus, setDeleteStatus] = useState<DeleteStatus>('idle');
  const [consentStatus, setConsentStatus] = useState<'idle' | 'revoked' | 'failed' | 'preference-failed'>('idle');
  const deletingRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const deleteData = async () => {
    if (deletingRef.current) return;
    deletingRef.current = true;
    setDeleteStatus('deleting');
    onDeleteStatusCommit?.('deleting');
    const outcome = await deleteAllAppData({
      repository,
      preferences,
      secureStore: consent,
      cache: nativeCacheArtifactStore,
      session,
    });
    deletingRef.current = false;
    if (mountedRef.current) {
      setDeleteStatus(outcome.ok ? 'success' : { failed: outcome });
      onDeleteStatusCommit?.(outcome.ok ? 'success' : 'failed');
    }
  };

  const revokeConsent = async () => {
    setConsentStatus('idle');
    try {
      await consent.revokeConsent();
      setConsentStatus('revoked');
    } catch (error) {
      setConsentStatus(error instanceof ConsentPreferenceUnavailableError ? 'preference-failed' : 'failed');
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
          <PrimaryButton label="Privacy, terms, and support" onPress={() => router.push('/privacy')} />
          <PrimaryButton label="Revoke AI consent" onPress={() => { void revokeConsent(); }} />
          {consentStatus === 'revoked' ? <Text accessibilityLiveRegion="polite" style={styles.status}>AI consent was revoked. Future AI-assisted analysis will ask again.</Text> : null}
          {consentStatus === 'failed' ? <Text accessibilityRole="alert" style={styles.error}>Could not revoke AI consent. Please try again.</Text> : null}
          {consentStatus === 'preference-failed' ? <Text accessibilityRole="alert" style={styles.error}>Could not remove your AI consent preference. Please try again.</Text> : null}
        </View>

        <View style={[styles.section, styles.dangerSection]}>
          <Text accessibilityRole="header" style={styles.dangerHeading}>Delete all app data</Text>
          <Text style={styles.copy}>This best-effort action attempts to remove saved reports, drafts, preferences, AI consent, the local installation token, ConvoAutopsy cache files, and this in-memory analysis session. It cannot recall shared or backed-up data, remove provider data, or immediately remove short-lived service safety and accounting records. It does not cancel an App Store subscription.</Text>
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
          {deleteStatus === 'success' ? <Text accessibilityLiveRegion="polite" style={styles.status}>ConvoAutopsy finished its best-effort local deletion. Backups, data already shared, provider records, short-lived service safety and accounting records, and App Store subscriptions may remain.</Text> : null}
          {typeof deleteStatus === 'object' ? (
            <View style={styles.failure}>
              <Text accessibilityRole="alert" style={styles.error}>Could not completely delete your app data. Failed: {deleteStatus.failed.failed.join(', ')}. Nothing has been reported as fully deleted; retry to attempt the remaining cleanup again.</Text>
              <PrimaryButton label="Retry deleting app data" onPress={() => { void deleteData(); }} />
            </View>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.heading}>Convo Pro</Text>
          <Text style={styles.copy}>Convo Pro removes the 10-report cap and includes 75 remote AI analyses and 150 remote AI-assisted drafts per UTC calendar month. On-device analyses and drafts remain unlimited on both plans.</Text>
          <PrimaryButton label="Convo Pro" onPress={() => router.push('/upgrade?source=settings')} />
          <PrimaryButton label="Restore Purchases" onPress={() => router.push('/upgrade?source=restore')} />
          <PrimaryButton label="Privacy" onPress={() => router.push('/privacy')} />
          <PrimaryButton label="Terms of Use" onPress={() => router.push('/terms')} />
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
