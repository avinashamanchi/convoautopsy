import { act, render } from '@testing-library/react-native';
import { useEffect } from 'react';
import {
  AnalysisSessionProvider,
  type AnalysisSessionValue,
  useAnalysisSession,
} from '../src/state/AnalysisSession';
import type { AnalysisResult } from '../src/domain/analysis';

const remoteResult: AnalysisResult = {
  schemaVersion: 1,
  mode: 'ai',
  intensityScore: 85,
  conflictMode: 'Competing',
  messages: [
    {
      sender: 'Person A',
      text: 'This is a remote result.',
      pattern: 'Criticism',
      egoState: 'Parent',
      possibleInterpretation: 'This may be a possible remote interpretation.',
    },
  ],
};

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

it('rejects a stale remote completion after local analysis starts', () => {
  let session: AnalysisSessionValue | undefined;

  render(
    <AnalysisSessionProvider>
      <SessionHarness onReady={(value) => { session = value; }} />
    </AnalysisSessionProvider>,
  );

  act(() => {
    session?.setDraft('Alex: Why do you always do this?\nJordan: Whatever. I am done.');
  });
  let remoteAttempt: ReturnType<AnalysisSessionValue['startRemote']> | undefined;
  act(() => {
    remoteAttempt = session?.startRemote();
  });
  act(() => {
    session?.runLocal();
  });
  act(() => {
    if (remoteAttempt) {
      session?.setRemoteResult(remoteResult, remoteAttempt.requestId);
    }
  });

  expect(remoteAttempt?.signal.aborted).toBe(true);
  expect(session?.activeResult?.mode).toBe('local');
});

it('rejects a stale remote completion after preparing a new preview', () => {
  let session: AnalysisSessionValue | undefined;

  render(
    <AnalysisSessionProvider>
      <SessionHarness onReady={(value) => { session = value; }} />
    </AnalysisSessionProvider>,
  );

  act(() => {
    session?.setDraft('Alex: Can we talk?\nJordan: Yes.');
  });
  let remoteAttempt: ReturnType<AnalysisSessionValue['startRemote']> | undefined;
  act(() => {
    remoteAttempt = session?.startRemote();
  });
  act(() => {
    session?.preparePreview();
  });
  act(() => {
    if (remoteAttempt) {
      session?.setRemoteResult(remoteResult, remoteAttempt.requestId);
    }
  });

  expect(remoteAttempt?.signal.aborted).toBe(true);
  expect(session?.status).toBe('preview');
  expect(session?.activeResult).toBeNull();
});

it('rejects a remote completion after cancellation', () => {
  let session: AnalysisSessionValue | undefined;

  render(
    <AnalysisSessionProvider>
      <SessionHarness onReady={(value) => { session = value; }} />
    </AnalysisSessionProvider>,
  );

  let remoteAttempt: ReturnType<AnalysisSessionValue['startRemote']> | undefined;
  act(() => {
    remoteAttempt = session?.startRemote();
  });
  act(() => {
    session?.cancel();
  });
  act(() => {
    if (remoteAttempt) {
      session?.setRemoteResult(remoteResult, remoteAttempt.requestId);
    }
  });

  expect(remoteAttempt?.signal.aborted).toBe(true);
  expect(session?.status).toBe('idle');
  expect(session?.activeResult).toBeNull();
});

it('rejects the older completion after a remote attempt is superseded', () => {
  let session: AnalysisSessionValue | undefined;

  render(
    <AnalysisSessionProvider>
      <SessionHarness onReady={(value) => { session = value; }} />
    </AnalysisSessionProvider>,
  );

  let firstAttempt: ReturnType<AnalysisSessionValue['startRemote']> | undefined;
  let secondAttempt: ReturnType<AnalysisSessionValue['startRemote']> | undefined;
  act(() => {
    firstAttempt = session?.startRemote();
  });
  act(() => {
    secondAttempt = session?.startRemote();
  });
  act(() => {
    if (firstAttempt) {
      session?.setRemoteResult(remoteResult, firstAttempt.requestId);
    }
  });

  expect(firstAttempt?.signal.aborted).toBe(true);
  expect(secondAttempt?.signal.aborted).toBe(false);
  expect(session?.status).toBe('analyzing-ai');
  expect(session?.activeResult).toBeNull();
});
