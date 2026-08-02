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

export interface ReportRepository {
  initialize(): Promise<void>;
  list(query?: string): Promise<SavedReport[]>;
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
