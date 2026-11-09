export interface SessionDocument {
  id: string;
  file_path: string;
  name: string;
}

export interface SessionRecord {
  id: string;
  file_path: string;
  status: string;
  created_at: string | number;
  updated_at: string | number;
  config?: any;
  documents?: SessionDocument[];
  active_document_id?: string | null;
}

export interface DslExecutionResult {
  success: boolean;
  error?: string;
  ast?: any;
  logical_plan?: any;
  physical_plan?: any;
  pdf_width?: number;
  pdf_height?: number;
  config?: any;
  results?: {
    words?: any[];
    lines?: any[];
    sentences?: any[];
    rows?: any[];
    columns?: any[];
    boxes?: any[];
    allLines?: any[];
    [key: string]: any;
  };
}

export interface RenderResult {
  url: string;
  width: number;
  height: number;
}

export interface PdfProvider {
  listSessions(): Promise<SessionRecord[]>;
  getSession(id: string): Promise<{ session: SessionRecord; page_count: number }>;
  createSession(
    fileOrPath: File | string | (File | string)[],
    config?: any
  ): Promise<{ session: SessionRecord; page_count: number }>;
  addSessionFile(sessionId: string, file: File | string): Promise<SessionDocument>;
  addSessionFiles(sessionId: string, files: (File | string)[]): Promise<SessionDocument[]>;
  activateSessionFile(sessionId: string, documentId: string): Promise<{ session: SessionRecord; page_count: number }>;
  deleteSessionFile(sessionId: string, documentId: string): Promise<{ session: SessionRecord; page_count: number }>;
  deleteSession(id: string): Promise<boolean>;
  executeDsl(sessionId: string, code: string, documentId?: string): Promise<DslExecutionResult>;
  compileDsl(code: string): Promise<any>;
  renderPage(
    sessionId: string,
    page: number,
    dpi?: number,
    targetWidth?: number,
    password?: string,
    documentId?: string,
    targetFile?: string
  ): Promise<RenderResult>;
}
