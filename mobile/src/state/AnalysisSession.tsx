import { createContext, useContext, useRef, useState, type PropsWithChildren } from 'react';
import type { AnalysisResult, ParsedMessage, ParseResult } from '../domain/analysis';
import { analyzeLocally } from '../domain/localAnalyzer';
import { parseConversation } from '../domain/parser';

export type AnalysisSessionValue = {
  draft: string;
  parsed: ParseResult | null;
  activeResult: AnalysisResult | null;
  reviewedRemoteMessages: readonly Readonly<ParsedMessage>[] | null;
  status: 'idle' | 'preview' | 'analyzing-local' | 'analyzing-ai' | 'result';
  requestId: number;
  setDraft(value: string): void;
  preparePreview(): ParseResult;
  runLocal(): AnalysisResult;
  confirmRemoteReview(messages: ParsedMessage[]): readonly Readonly<ParsedMessage>[];
  setRemoteResult(result: AnalysisResult, requestId: number): void;
  startRemote(): { requestId: number; signal: AbortSignal; messages: readonly Readonly<ParsedMessage>[] };
  cancel(): void;
  reset(): void;
};

const AnalysisSessionContext = createContext<AnalysisSessionValue | null>(null);

export function AnalysisSessionProvider({ children }: PropsWithChildren) {
  const [draft, setDraftState] = useState('');
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [activeResult, setActiveResult] = useState<AnalysisResult | null>(null);
  const [reviewedRemoteMessages, setReviewedRemoteMessages] = useState<readonly Readonly<ParsedMessage>[] | null>(null);
  const [status, setStatus] = useState<AnalysisSessionValue['status']>('idle');
  const [requestId, setRequestId] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeRemoteRequestIdRef = useRef<number | null>(null);
  const requestIdRef = useRef(0);
  const reviewedRemoteMessagesRef = useRef<readonly Readonly<ParsedMessage>[] | null>(null);

  const clearReviewedRemoteMessages = () => {
    reviewedRemoteMessagesRef.current = null;
    setReviewedRemoteMessages(null);
  };

  const invalidateRemoteRequest = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    activeRemoteRequestIdRef.current = null;
    requestIdRef.current += 1;
    setRequestId(requestIdRef.current);
    clearReviewedRemoteMessages();
  };

  const value: AnalysisSessionValue = {
    draft,
    parsed,
    activeResult,
    reviewedRemoteMessages,
    status,
    requestId,
    setDraft(value) {
      invalidateRemoteRequest();
      setDraftState(value);
      setParsed(null);
      setActiveResult(null);
      setStatus('idle');
    },
    preparePreview() {
      invalidateRemoteRequest();
      const nextParsed = parseConversation(draft);
      setParsed(nextParsed);
      setActiveResult(null);
      setStatus('preview');
      return nextParsed;
    },
    runLocal() {
      invalidateRemoteRequest();
      const nextParsed = parsed ?? parseConversation(draft);
      const result = analyzeLocally(nextParsed.messages);
      setParsed(nextParsed);
      setStatus('analyzing-local');
      setActiveResult(result);
      setStatus('result');
      return result;
    },
    confirmRemoteReview(messages) {
      invalidateRemoteRequest();
      const snapshot = Object.freeze(messages.map((message) => Object.freeze({ ...message })));
      reviewedRemoteMessagesRef.current = snapshot;
      setReviewedRemoteMessages(snapshot);
      return snapshot;
    },
    setRemoteResult(result, resultRequestId) {
      if (
        resultRequestId !== requestIdRef.current ||
        resultRequestId !== activeRemoteRequestIdRef.current ||
        !abortControllerRef.current ||
        abortControllerRef.current.signal.aborted
      ) {
        return;
      }
      abortControllerRef.current = null;
      activeRemoteRequestIdRef.current = null;
      setActiveResult(result);
      setStatus('result');
    },
    startRemote() {
      const messages = reviewedRemoteMessagesRef.current;
      if (!messages) throw new Error('REMOTE_REVIEW_REQUIRED');
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      requestIdRef.current += 1;
      activeRemoteRequestIdRef.current = requestIdRef.current;
      setRequestId(requestIdRef.current);
      setStatus('analyzing-ai');
      return { requestId: requestIdRef.current, signal: controller.signal, messages };
    },
    cancel() {
      invalidateRemoteRequest();
      setStatus(parsed ? 'preview' : 'idle');
    },
    reset() {
      invalidateRemoteRequest();
      setDraftState('');
      setParsed(null);
      setActiveResult(null);
      setStatus('idle');
    },
  };

  return <AnalysisSessionContext.Provider value={value}>{children}</AnalysisSessionContext.Provider>;
}

export function useAnalysisSession(): AnalysisSessionValue {
  const session = useContext(AnalysisSessionContext);
  if (!session) {
    throw new Error('useAnalysisSession must be used within AnalysisSessionProvider');
  }
  return session;
}
