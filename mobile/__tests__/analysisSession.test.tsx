import { act, render } from '@testing-library/react-native';
import { useEffect } from 'react';
import {
  AnalysisSessionProvider,
  type AnalysisSessionValue,
  useAnalysisSession,
} from '../src/state/AnalysisSession';
import type { AnalysisResult, ParsedMessage } from '../src/domain/analysis';

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

const reviewedMessages: ParsedMessage[] = [
  { id: 'line-1', sender: 'Person A', text: 'Email [EMAIL]', sourceLine: 1 },
];

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

it('copies and freezes the confirmed reviewed array used by the remote attempt', () => {
  let session: AnalysisSessionValue | undefined;
  const mutableInput = reviewedMessages.map((message) => ({ ...message }));
  render(
    <AnalysisSessionProvider>
      <SessionHarness onReady={(value) => { session = value; }} />
    </AnalysisSessionProvider>,
  );

  let attempt: ReturnType<AnalysisSessionValue['startRemote']> | undefined;
  act(() => {
    session?.confirmRemoteReview(mutableInput);
    mutableInput[0].text = 'mutated raw text';
    attempt = session?.startRemote();
  });

  expect(session?.reviewedRemoteMessages?.[0].text).toBe('Email [EMAIL]');
  expect(attempt?.messages[0].text).toBe('Email [EMAIL]');
  expect(attempt?.messages).toBe(session?.reviewedRemoteMessages);
  expect(Object.isFrozen(attempt?.messages)).toBe(true);
  expect(Object.isFrozen(attempt?.messages[0])).toBe(true);
});

it('refuses to start remote analysis without a confirmed reviewed snapshot', () => {
  let session: AnalysisSessionValue | undefined;
  render(
    <AnalysisSessionProvider>
      <SessionHarness onReady={(value) => { session = value; }} />
    </AnalysisSessionProvider>,
  );

  expect(() => session?.startRemote()).toThrow('REMOTE_REVIEW_REQUIRED');
});

it('clears reviewed remote text on draft change, preview preparation, and local analysis', () => {
  let session: AnalysisSessionValue | undefined;
  render(
    <AnalysisSessionProvider>
      <SessionHarness onReady={(value) => { session = value; }} />
    </AnalysisSessionProvider>,
  );

  act(() => { session?.confirmRemoteReview(reviewedMessages); });
  act(() => { session?.setDraft('Alex: First draft'); });
  expect(session?.reviewedRemoteMessages).toBeNull();

  act(() => { session?.confirmRemoteReview(reviewedMessages); });
  act(() => { session?.preparePreview(); });
  expect(session?.reviewedRemoteMessages).toBeNull();

  act(() => { session?.confirmRemoteReview(reviewedMessages); });
  act(() => { session?.runLocal(); });
  expect(session?.reviewedRemoteMessages).toBeNull();
});

it('clears reviewed remote text on cancellation and reset', () => {
  let session: AnalysisSessionValue | undefined;
  render(
    <AnalysisSessionProvider>
      <SessionHarness onReady={(value) => { session = value; }} />
    </AnalysisSessionProvider>,
  );

  act(() => { session?.confirmRemoteReview(reviewedMessages); });
  act(() => { session?.cancel(); });
  expect(session?.reviewedRemoteMessages).toBeNull();

  act(() => { session?.confirmRemoteReview(reviewedMessages); });
  act(() => { session?.reset(); });
  expect(session?.reviewedRemoteMessages).toBeNull();
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
    session?.confirmRemoteReview(reviewedMessages);
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
    session?.confirmRemoteReview(reviewedMessages);
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
    session?.confirmRemoteReview(reviewedMessages);
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
    session?.confirmRemoteReview(reviewedMessages);
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
