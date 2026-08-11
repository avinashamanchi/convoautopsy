import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type {
  InvalidatingReportRepository,
} from './reportRepositoryCoordinator';
import type { ReportCursor, SavedReportListItem } from './reportRepository';

const PAGE_SIZE = 50;

type PaginationState = Readonly<{
  items: readonly SavedReportListItem[];
  status: 'loading' | 'ready' | 'error';
  loadingMore: boolean;
  pageError: boolean;
}>;

export function useReportPagination({
  repository,
  query,
  revision,
  deletingAll,
}: Readonly<{
  repository: InvalidatingReportRepository;
  query?: string;
  revision: number;
  deletingAll: boolean;
}>) {
  const [state, setState] = useState<PaginationState>({
    items: [], status: 'loading', loadingMore: false, pageError: false,
  });
  const generationRef = useRef(0);
  const nextCursorRef = useRef<ReportCursor | null>(null);
  const loadingGenerationRef = useRef<number | null>(null);

  const requestPage = useCallback(async (generation: number, cursor: ReportCursor | undefined, append: boolean) => {
    if (generation !== generationRef.current || loadingGenerationRef.current === generation) return;
    loadingGenerationRef.current = generation;
    setState((current) => append
      ? { ...current, loadingMore: true, pageError: false }
      : { items: [], status: 'loading', loadingMore: false, pageError: false });
    try {
      const page = await repository.listPage({ query, cursor, limit: PAGE_SIZE });
      if (generation !== generationRef.current) return;
      nextCursorRef.current = page.nextCursor;
      setState((current) => {
        const existing = append ? new Set(current.items.map((item) => item.id)) : new Set<string>();
        const additions = page.items.filter((item) => !existing.has(item.id));
        return {
          items: append ? [...current.items, ...additions] : [...additions],
          status: 'ready',
          loadingMore: false,
          pageError: false,
        };
      });
    } catch {
      if (generation !== generationRef.current) return;
      setState((current) => append
        ? { ...current, loadingMore: false, pageError: true }
        : { ...current, status: 'error', loadingMore: false, pageError: false });
    } finally {
      if (loadingGenerationRef.current === generation) loadingGenerationRef.current = null;
    }
  }, [query, repository]);

  useFocusEffect(useCallback(() => {
    void revision;
    const generation = ++generationRef.current;
    loadingGenerationRef.current = null;
    nextCursorRef.current = null;
    if (deletingAll) {
      setState({ items: [], status: 'ready', loadingMore: false, pageError: false });
    } else {
      void requestPage(generation, undefined, false);
    }
    return () => {
      if (generationRef.current === generation) generationRef.current += 1;
      if (loadingGenerationRef.current === generation) loadingGenerationRef.current = null;
    };
  }, [deletingAll, requestPage, revision]));

  const loadMore = useCallback(() => {
    const cursor = nextCursorRef.current;
    const generation = generationRef.current;
    if (!cursor || state.status !== 'ready' || state.loadingMore || state.pageError) return;
    void requestPage(generation, cursor, true);
  }, [requestPage, state.loadingMore, state.pageError, state.status]);

  const retry = useCallback(() => {
    const generation = generationRef.current;
    if (state.pageError && nextCursorRef.current) {
      void requestPage(generation, nextCursorRef.current, true);
    } else if (state.status === 'error') {
      void requestPage(generation, undefined, false);
    }
  }, [requestPage, state.pageError, state.status]);

  return { ...state, hasMore: nextCursorRef.current !== null, loadMore, retry };
}
