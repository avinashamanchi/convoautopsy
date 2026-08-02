import { act, render } from '@testing-library/react-native';
import { useEffect } from 'react';
import {
  AnalysisSessionProvider,
  type AnalysisSessionValue,
  useAnalysisSession,
} from '../src/state/AnalysisSession';

function SessionHarness({ onReady }: { onReady: (session: AnalysisSessionValue) => void }) {
  const session = useAnalysisSession();

  useEffect(() => {
    onReady(session);
  }, [onReady, session]);

  return null;
}

it('runs a prepared conversation through the local analyzer', () => {
  let session: AnalysisSessionValue | undefined;

  render(
    <AnalysisSessionProvider>
      <SessionHarness onReady={(value) => { session = value; }} />
    </AnalysisSessionProvider>,
  );

  act(() => {
    session?.setDraft('Alex: Why do you always do this?\nJordan: Whatever. I am done.');
  });
  act(() => {
    session?.preparePreview();
  });
  act(() => {
    session?.runLocal();
  });

  expect(session?.activeResult?.mode).toBe('local');
});
