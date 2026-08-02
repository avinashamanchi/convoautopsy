import { createContext, useContext, useRef, useState, type PropsWithChildren } from 'react';
import type { AnalysisResult, ParseResult } from '../domain/analysis';
import { analyzeLocally } from '../domain/localAnalyzer';
import { parseConversation } from '../domain/parser';

export type AnalysisSessionValue = {
  draft: string;
  parsed: ParseResult | null;
  activeResult: AnalysisResult | null;
  status: 'idle' | 'preview' | 'analyzing-local' | 'analyzing-ai' | 'result';
  requestId: number;
  setDraft(value: string): void;
  preparePreview(): ParseResult;
  runLocal(): AnalysisResult;
  setRemoteResult(result: AnalysisResult, requestId: number): void;
  startRemote(): { requestId: number; signal: AbortSignal };
  cancel(): void;
  reset(): void;
};

const AnalysisSessionContext = createContext<AnalysisSessionValue | null>(null);

export function AnalysisSessionProvider({ children }: PropsWithChildren) {
  const [draft, setDraftState] = useState('');
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [activeResult, setActiveResult] = useState<AnalysisResult | null>(null);
  const [status, setStatus] = useState<AnalysisSessionValue['status']>('idle');
  const [requestId, setRequestId] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const invalidateRemoteRequest = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    requestIdRef.current += 1;
    setRequestId(requestIdRef.current);
  };

  const value: AnalysisSessionValue = {
    draft,
    parsed,
    activeResult,
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
      const nextParsed = parseConversation(draft);
      setParsed(nextParsed);
      setActiveResult(null);
      setStatus('preview');
      return nextParsed;
    },
    runLocal() {
      const nextParsed = parsed ?? parseConversation(draft);
      const result = analyzeLocally(nextParsed.messages);
      setParsed(nextParsed);
      setStatus('analyzing-local');
      setActiveResult(result);
      setStatus('result');
      return result;
    },
    setRemoteResult(result, resultRequestId) {
      if (resultRequestId !== requestIdRef.current) {
        return;
      }
      abortControllerRef.current = null;
      setActiveResult(result);
      setStatus('result');
    },
    startRemote() {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      requestIdRef.current += 1;
      setRequestId(requestIdRef.current);
      setStatus('analyzing-ai');
      return { requestId: requestIdRef.current, signal: controller.signal };
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
