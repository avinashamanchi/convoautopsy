import { render, screen } from '@testing-library/react-native';
import PrivacyScreen from '../app/privacy';
import TermsScreen from '../app/terms';

jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));

describe('customer-visible legal truth', () => {
  it('describes reviewed remote text, backups, RevenueCat, bounded service records, and deletion limits', () => {
    render(<PrivacyScreen />);

    expect(screen.getByText(/reviewed message text is sent through Cloudflare to Groq only after you confirm it and consent/)).toBeTruthy();
    expect(screen.getByText(/may be included in device or iCloud backups/)).toBeTruthy();
    expect(screen.getByText(/pseudonymous app-user ID and purchase and entitlement history/)).toBeTruthy();
    expect(screen.getByText(/cache verified entitlement status for up to five minutes/)).toBeTruthy();
    expect(screen.getByText(/HMAC-derived rate and quota identifiers/)).toBeTruthy();
    expect(screen.getByText(/bounded quota usage rows, a daily provider budget, two-minute recovery leases, short-lived provider-failure and circuit state, and content-free operational metrics/)).toBeTruthy();
    expect(screen.getByText(/does not cancel an App Store subscription/)).toBeTruthy();
    expect(screen.getByText(/does not immediately remove short-lived service safety and accounting records/)).toBeTruthy();
    expect(screen.queryByText(/anonymized speaker labels/i)).toBeNull();
  });

  it('keeps reflection, safety, user-rights, and precise subscription boundaries in app', () => {
    render(<TermsScreen />);

    expect(screen.getByText(/personal reflection and is not medical, legal, relationship, crisis, or other professional advice/)).toBeTruthy();
    expect(screen.getByText(/contact appropriate local emergency or professional services/i)).toBeTruthy();
    expect(screen.getByText(/rights or remedies that cannot legally be excluded/)).toBeTruthy();
    expect(screen.getByText(/automatically renew unless canceled at least 24 hours before/)).toBeTruthy();
    expect(screen.getByText(/Uninstalling the app or deleting app data does not cancel/)).toBeTruthy();
  });
});
