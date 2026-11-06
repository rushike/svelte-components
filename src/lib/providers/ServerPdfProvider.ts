import type {
  PdfProvider,
  SessionRecord,
  DslExecutionResult,
  RenderResult,
  SessionDocument,
} from './PdfProvider';

export class ServerPdfProvider implements PdfProvider {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:9191') {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  async listSessions(): Promise<SessionRecord[]> {
    const res = await fetch(`${this.baseUrl}/api/sessions`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const data = await res.json();
    return data.sessions || [];
  }

  async getSession(id: string): Promise<{ session: SessionRecord; page_count: number }> {
    const res = await fetch(`${this.baseUrl}/api/sessions/${id}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    return await res.json();
  }

  async createSession(
    fileOrPath: File | string | (File | string)[],
    config: any = {}
  ): Promise<{ session: SessionRecord; page_count: number }> {
    let data: any;
    const items = Array.isArray(fileOrPath) ? fileOrPath : [fileOrPath];
    const allStrings = items.every((i) => typeof i === 'string');

    if (allStrings) {
      const res = await fetch(`${this.baseUrl}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_paths: items, config }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      data = await res.json();
    } else {
      const formData = new FormData();
      for (const item of items) {
        if (typeof item !== 'string') {
          formData.append('files', item);
        }
      }
      formData.append('config', JSON.stringify(config));
      const res = await fetch(`${this.baseUrl}/api/sessions/upload`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      data = await res.json();
    }

    const firstItem = items[0];
    const defaultFilePath = typeof firstItem === 'string' ? firstItem : firstItem.name;
    const now = new Date().toISOString();
    return {
      session: {
        id: data.session?.id || data.session_id || data.id,
        file_path: data.session?.file_path || data.file_path || defaultFilePath,
        status: data.session?.status || data.status || 'ready',
        created_at: data.session?.created_at || data.created_at || now,
        updated_at: data.session?.updated_at || data.updated_at || now,
        config: data.session?.config || data.config || config,
        documents: data.session?.config?.documents || [],
        active_document_id: data.session?.config?.active_document_id || null,
      },
      page_count: data.page_count ?? 1,
    };
  }

  async addSessionFiles(sessionId: string, files: (File | string)[]): Promise<SessionDocument[]> {
    const formData = new FormData();
    for (const f of files) {
      if (typeof f === 'string') {
        throw new Error('Server file attachment requires uploaded File object(s)');
      }
      formData.append('files', f);
    }
    const res = await fetch(`${this.baseUrl}/api/sessions/${sessionId}/files`, { method: 'POST', body: formData });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    return await res.json();
  }

  async addSessionFile(sessionId: string, file: File | string): Promise<SessionDocument> {
    const docs = await this.addSessionFiles(sessionId, [file]);
    if (!docs || docs.length === 0) throw new Error('Failed to attach document to session');
    return docs[0];
  }

  async deleteSessionFile(sessionId: string, documentId: string): Promise<{ session: SessionRecord; page_count: number }> {
    const res = await fetch(`${this.baseUrl}/api/sessions/${sessionId}/files/${encodeURIComponent(documentId)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    return await res.json();
  }

  async activateSessionFile(sessionId: string, documentId: string) {
    const res = await fetch(`${this.baseUrl}/api/sessions/${sessionId}/files/${encodeURIComponent(documentId)}/active`, { method: 'POST' });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    return await res.json();
  }

  async deleteSession(id: string): Promise<boolean> {
    const res = await fetch(`${this.baseUrl}/api/sessions/${id}`, {
      method: 'DELETE',
    });
    return res.ok;
  }

  async executeDsl(sessionId: string, code: string, documentId?: string): Promise<DslExecutionResult> {
    const res = await fetch(`${this.baseUrl}/api/sessions/${sessionId}/dsl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, document_id: documentId }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    return await res.json();
  }

  async compileDsl(code: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/dsl/compile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    return await res.json();
  }

  async renderPage(
    sessionId: string,
    page: number,
    dpi: number = 300,
    targetWidth?: number,
    password?: string,
    documentId?: string
  ): Promise<RenderResult> {
    const params = new URLSearchParams({
      page: page.toString(),
      dpi: dpi.toString(),
    });
    if (targetWidth) {
      params.append('target_width', targetWidth.toString());
    }
    if (password) {
      params.append('password', password);
    }
    if (documentId) params.append('document_id', documentId);

    const res = await fetch(`${this.baseUrl}/api/sessions/${sessionId}/render?${params.toString()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);

    let width = Number(res.headers.get('x-render-width') || res.headers.get('X-Render-Width'));
    let height = Number(res.headers.get('x-render-height') || res.headers.get('X-Render-Height'));

    if (!width || !height) {
      await new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => {
          width = img.naturalWidth;
          height = img.naturalHeight;
          resolve();
        };
        img.onerror = () => resolve();
        img.src = url;
      });
    }

    return { url, width: width || 1000, height: height || 1000 };
  }
}
