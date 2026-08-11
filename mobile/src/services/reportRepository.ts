import type { AnalysisResult, ResponseDraft } from '../domain/analysis';

export type SavedReport = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  sourceText: string | null;
  result: AnalysisResult;
  responseDrafts: ResponseDraft[];
};

export type SavedReportListItem = Pick<SavedReport, 'id' | 'title' | 'createdAt' | 'updatedAt'>;

export type ReportCursor = Readonly<{
  updatedAt: string;
  id: string;
}>;

export type ReportPageRequest = Readonly<{
  query?: string;
  cursor?: ReportCursor;
  limit?: number;
}>;

export type ReportPage = Readonly<{
  items: readonly SavedReportListItem[];
  nextCursor: ReportCursor | null;
}>;

export type TrendSummary = Readonly<{
  reportCount: number;
  averageIntensity: number | null;
  conflictModes: Readonly<Partial<Record<AnalysisResult['conflictMode'], number>>>;
  patterns: Readonly<Partial<Record<AnalysisResult['messages'][number]['pattern'], number>>>;
}>;

export interface ReportRepository {
  initialize(): Promise<void>;
  listPage(request?: ReportPageRequest): Promise<ReportPage>;
  count(): Promise<number>;
  getTrendSummary(fromInclusive: string, toExclusive: string): Promise<TrendSummary>;
  get(id: string): Promise<SavedReport | null>;
  save(report: SavedReport): Promise<void>;
  delete(id: string): Promise<void>;
  deleteAll(): Promise<void>;
}

export interface PreferenceStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  deleteAll(): Promise<void>;
}
