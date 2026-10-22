import type {
  PdfProvider,
  SessionRecord,
  DslExecutionResult,
  RenderResult,
} from './PdfProvider';

export interface WasmProviderOptions {
  db?: any;         // SQLiteClient from @rushike/sqlite3-client
  myfs?: any;       // MyFS instance from @rushike/myfs
  wasmModule?: any; // WASM module containing compileDsl, executeDsl, and render
}

const STORAGE_KEY_SESSIONS = 'mypdfutils_wasm_sessions';

export class WasmPdfProvider implements PdfProvider {
  private db: any;
  private myfs: any;
  private wasm: any;
  private localFallbackSessions: Map<string, SessionRecord> = new Map();
  private localFiles: Map<string, Uint8Array> = new Map();
  private sessionPasswords: Map<string, string> = new Map();
  private initialized: boolean = false;

  constructor(options: WasmProviderOptions = {}) {
    this.db = options.db;
    this.myfs = options.myfs;
    this.wasm = options.wasmModule;
    this.loadFromLocalStorage();
  }

  private loadFromLocalStorage() {
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(STORAGE_KEY_SESSIONS);
        if (raw) {
          const list: SessionRecord[] = JSON.parse(raw);
          for (const s of list) {
            if (s && s.id && !this.localFallbackSessions.has(s.id)) {
              this.localFallbackSessions.set(s.id, s);
            }
          }
        }
      } catch (_) {}
    }
  }

  private persistToLocalStorage() {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(
          STORAGE_KEY_SESSIONS,
          JSON.stringify(Array.from(this.localFallbackSessions.values()))
        );
      } catch (_) {}
    }
  }

  private async ensureInitialized() {
    if (this.initialized) return;
    this.loadFromLocalStorage();

    if (this.db) {
      try {
        if (typeof this.db.init === 'function') {
          await this.db.init();
        }
        if (typeof this.db.sql === 'function') {
          await this.db.sql`
            CREATE TABLE IF NOT EXISTS sessions (
              id TEXT PRIMARY KEY,
              file_path TEXT NOT NULL,
              config TEXT NOT NULL,
              status TEXT NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
          `.run();
        } else if (typeof this.db.run === 'function') {
          await this.db.run(`
            CREATE TABLE IF NOT EXISTS sessions (
              id TEXT PRIMARY KEY,
              file_path TEXT NOT NULL,
              config TEXT NOT NULL,
              status TEXT NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
          `);
        }
      } catch (err) {
        console.warn('[WasmPdfProvider] DB initialization error, relying on local storage:', err);
      }
    }
    this.initialized = true;
  }

  async listSessions(): Promise<SessionRecord[]> {
    await this.ensureInitialized();
    if (this.db) {
      try {
        let rows: any[] | null = null;
        if (typeof this.db.sql === 'function') {
          rows = await this.db.sql`SELECT * FROM sessions ORDER BY created_at DESC`.all();
        } else if (typeof this.db.all === 'function') {
          rows = await this.db.all('SELECT * FROM sessions ORDER BY created_at DESC');
        }
        if (rows && rows.length > 0) {
          for (const r of rows) {
            const rec: SessionRecord = {
              ...r,
              config: typeof r.config === 'string' ? JSON.parse(r.config || '{}') : r.config,
            };
            this.localFallbackSessions.set(rec.id, rec);
          }
          this.persistToLocalStorage();
        }
      } catch (err) {
        console.warn('[WasmPdfProvider] listSessions query error:', err);
      }
    }
    return Array.from(this.localFallbackSessions.values());
  }

  async getSession(id: string): Promise<{ session: SessionRecord; page_count: number }> {
    await this.ensureInitialized();
    let session: SessionRecord | undefined;

    if (this.db) {
      try {
        let rows: any[] | null = null;
        if (typeof this.db.sql === 'function') {
          rows = await this.db.sql`SELECT * FROM sessions WHERE id = ${id} LIMIT 1`.all();
        } else if (typeof this.db.all === 'function') {
          rows = await this.db.all('SELECT * FROM sessions WHERE id = ? LIMIT 1', [id]);
        }
        if (rows && rows.length > 0) {
          const r = rows[0];
          session = {
            ...r,
            config: typeof r.config === 'string' ? JSON.parse(r.config || '{}') : r.config,
          };
          this.localFallbackSessions.set(session.id, session);
        }
      } catch (err) {
        console.warn('[WasmPdfProvider] getSession query error:', err);
      }
    }

    if (!session) {
      session = this.localFallbackSessions.get(id);
    }

    if (!session) {
      this.loadFromLocalStorage();
      session = this.localFallbackSessions.get(id);
    }

    if (!session) {
      throw new Error(`Session not found: ${id}`);
    }

    return { session, page_count: 1 };
  }

  private async extractBytes(res: any): Promise<Uint8Array | null> {
    if (!res) return null;
    if (res instanceof Uint8Array) {
      return res.length > 0 ? res : null;
    }
    if (res instanceof ArrayBuffer) {
      const u8 = new Uint8Array(res);
      return u8.length > 0 ? u8 : null;
    }
    if (typeof res.arrayBuffer === 'function') {
      const buf = await res.arrayBuffer();
      const u8 = new Uint8Array(buf);
      return u8.length > 0 ? u8 : null;
    }
    if (ArrayBuffer.isView(res)) {
      const u8 = new Uint8Array(res.buffer, res.byteOffset, res.byteLength);
      return u8.length > 0 ? u8 : null;
    }
    return null;
  }

  private async resolveFileBytes(path: string, session?: SessionRecord): Promise<Uint8Array | null> {
    if (!path) return null;

    // 1. Direct hit in local cache (must have non-zero length)
    if (this.localFiles.has(path) && this.localFiles.get(path)!.length > 0) {
      return this.localFiles.get(path)!;
    }

    // 2. Basename matching in local cache
    const clean = path.replace(/^opfs:\/\/*/, '').replace(/^\/+/, '');
    const cleanName = clean.split('/').pop() || clean;

    if (this.localFiles.has(cleanName) && this.localFiles.get(cleanName)!.length > 0) {
      return this.localFiles.get(cleanName)!;
    }

    for (const [key, val] of this.localFiles.entries()) {
      if (val && val.length > 0 && (key === path || key.endsWith('/' + cleanName) || cleanName.endsWith('/' + key))) {
        return val;
      }
    }

    // 3. Try reading via MyFS safely
    if (this.myfs) {
      const candidates: string[] = [];

      if (path.startsWith('opfs://')) {
        candidates.push(path);
        candidates.push(`opfs:///${clean}`);
        candidates.push(`opfs:///documents/${cleanName}`);
      } else if (path.includes('://')) {
        candidates.push(path);
      } else {
        candidates.push(`opfs:///documents/${clean}`);
        candidates.push(`opfs:///${clean}`);
        candidates.push(`opfs:///documents/${cleanName}`);
        candidates.push(`opfs:///${cleanName}`);
      }

      if (session && session.file_path) {
        if (session.file_path.includes('://')) {
          candidates.push(session.file_path);
        } else {
          const sClean = session.file_path.replace(/^opfs:\/\/*/, '').replace(/^\/+/, '');
          candidates.push(`opfs:///documents/${sClean}`);
          candidates.push(`opfs:///${sClean}`);
        }
      }

      for (const uri of candidates) {
        try {
          const res = await this.myfs.readFile(uri);
          const bytes = await this.extractBytes(res);
          if (bytes && bytes.length > 0) {
            this.localFiles.set(path, bytes);
            this.localFiles.set(cleanName, bytes);
            this.localFiles.set(uri, bytes);
            return bytes;
          }
        } catch (_) {}
      }
    }

    // 4. Try network fetch (useful for static sample PDFs or hosted docs)
    if (typeof fetch !== 'undefined') {
      const fetchUrls: string[] = [];
      if (path.startsWith('http')) {
        fetchUrls.push(path);
      } else {
        fetchUrls.push(`/${clean}`);
        fetchUrls.push(`/documents/${clean}`);
      }
      for (const url of fetchUrls) {
        try {
          const res = await fetch(url);
          if (res.ok) {
            const buf = await res.arrayBuffer();
            const bytes = new Uint8Array(buf);
            if (bytes.length > 0) {
              this.localFiles.set(path, bytes);
              this.localFiles.set(cleanName, bytes);
              return bytes;
            }
          }
        } catch (_) {}
      }
    }

    // 5. Fallback to active session's file bytes if available
    if (session && session.file_path) {
      const sessionClean = session.file_path.replace(/^opfs:\/\/*/, '').replace(/^\/+/, '');
      const sBase = sessionClean.split('/').pop() || sessionClean;

      for (const [key, val] of this.localFiles.entries()) {
        if (val && val.length > 0 && (key === session.file_path || key.endsWith('/' + sBase))) {
          return val;
        }
      }
    }

    // 6. If only 1 valid file is in localFiles, use it as fallback
    for (const val of this.localFiles.values()) {
      if (val && val.length > 0) {
        return val;
      }
    }

    return null;
  }

  async createSession(
    fileOrPath: File | string,
    config: any = {}
  ): Promise<{ session: SessionRecord; page_count: number }> {
    await this.ensureInitialized();
    const id = (typeof crypto !== 'undefined' && crypto.randomUUID) 
      ? crypto.randomUUID() 
      : 'sess_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

    let filePath = '';
    let bytes: Uint8Array | null = null;

    if (typeof fileOrPath === 'string') {
      filePath = fileOrPath.includes('://')
        ? fileOrPath
        : `opfs:///documents/${fileOrPath.replace(/^\/+/, '')}`;
      bytes = await this.resolveFileBytes(filePath);
      if (bytes && bytes.length > 0) {
        this.localFiles.set(filePath, bytes);
        const base = filePath.split('/').pop();
        if (base) this.localFiles.set(base, bytes);
      }
    } else {
      filePath = `opfs:///documents/${fileOrPath.name}`;
      bytes = new Uint8Array(await fileOrPath.arrayBuffer());
      if (this.myfs) {
        try {
          await this.myfs.writeFile(filePath, bytes);
        } catch (_) {}
      }
      this.localFiles.set(filePath, bytes);
      this.localFiles.set(fileOrPath.name, bytes);
    }

    const now = new Date().toISOString();
    const record: SessionRecord = {
      id,
      file_path: filePath,
      status: 'Active',
      created_at: now,
      updated_at: now,
      config,
    };

    this.localFallbackSessions.set(id, record);
    this.persistToLocalStorage();

    if (this.db) {
      try {
        const configStr = JSON.stringify(config);
        if (typeof this.db.sql === 'function') {
          await this.db.sql`
            INSERT INTO sessions (id, file_path, config, status, created_at, updated_at)
            VALUES (${id}, ${filePath}, ${configStr}, 'Active', ${now}, ${now})
          `.run();
        } else if (typeof this.db.run === 'function') {
          await this.db.run(
            `INSERT INTO sessions (id, file_path, config, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
            [id, filePath, configStr, 'Active', now, now]
          );
        }
      } catch (err) {
        console.warn('[WasmPdfProvider] DB insert error, using local storage:', err);
      }
    }

    let pageCount = 1;
    if (bytes && bytes.length > 0 && typeof globalThis !== 'undefined') {
      const p = (globalThis as any).__pdfium || (globalThis as any).Module;
      if (p && typeof p._FPDF_LoadMemDocument === 'function' && typeof p._FPDF_GetPageCount === 'function') {
        try {
          const ptr = p._malloc(bytes.length);
          p.HEAPU8.set(bytes, ptr);
          const doc = p._FPDF_LoadMemDocument(ptr, bytes.length, 0);
          if (doc) {
            pageCount = p._FPDF_GetPageCount(doc) || 1;
            p._FPDF_CloseDocument(doc);
          }
          p._free(ptr);
        } catch (_) {}
      }
    }

    return { session: record, page_count: pageCount };
  }

  async deleteSession(id: string): Promise<boolean> {
    await this.ensureInitialized();
    this.localFallbackSessions.delete(id);
    this.persistToLocalStorage();

    if (this.db) {
      try {
        if (typeof this.db.sql === 'function') {
          await this.db.sql`DELETE FROM sessions WHERE id = ${id}`.run();
        } else if (typeof this.db.run === 'function') {
          await this.db.run('DELETE FROM sessions WHERE id = ?', [id]);
        }
      } catch (err) {
        console.warn('[WasmPdfProvider] DB delete error:', err);
      }
    }
    return true;
  }

  async executeDsl(sessionId: string, code: string): Promise<DslExecutionResult> {
    if (!this.wasm || typeof this.wasm.executeDsl !== 'function') {
      throw new Error('executeDsl is not available in WASM bundle');
    }

    let session: SessionRecord | undefined;
    if (sessionId) {
      try {
        const res = await this.getSession(sessionId);
        session = res.session;
      } catch (_) {}
    }

    const fileLoader = async (path: string) => {
      try {
        const bytes = await this.resolveFileBytes(path, session);
        if (bytes && bytes.length > 0) {
          return bytes;
        }
      } catch (err: any) {
        console.warn(`[WasmPdfProvider] fileLoader error resolving ${path}:`, err);
      }
      throw new Error(`File loader: unable to resolve path "${path}" in virtual filesystem`);
    };

    // If DSL contains password, cache it for this session and persist to session config
    const pwdMatch = code && code.match(/WITH\s+PASSWORD\s+(?:=\s*)?["']([^"']+)["']/i);
    if (pwdMatch && sessionId) {
      const pwd = pwdMatch[1];
      this.sessionPasswords.set(sessionId, pwd);
      if (session) {
        if (!session.config) session.config = {};
        session.config.password = pwd;
        this.localFallbackSessions.set(sessionId, session);
        this.persistToLocalStorage();
      }
    }

    const result = await this.wasm.executeDsl(code, fileLoader);
    if (result && result.results && result.results instanceof Map) {
      result.results = Object.fromEntries(result.results);
    }
    return result;
  }

  async compileDsl(code: string): Promise<any> {
    if (this.wasm && typeof this.wasm.compileDsl === 'function') {
      return this.wasm.compileDsl(code);
    }
    return await this.executeDsl('', code);
  }

  async renderPage(
    sessionId: string,
    page: number,
    dpi: number = 300,
    targetWidth?: number,
    password?: string
  ): Promise<RenderResult> {
    if (!this.wasm || typeof this.wasm.render !== 'function') {
      throw new Error('render is not available in WASM bundle');
    }

    const { session } = await this.getSession(sessionId);
    const bytes = await this.resolveFileBytes(session.file_path, session);
    if (!bytes || bytes.length === 0) {
      throw new Error(`Cannot render page: file bytes not found for ${session.file_path}`);
    }

    const scale = dpi / 72;
    const pwd = password || this.sessionPasswords.get(sessionId) || session?.config?.password || session?.config?.pdf?.password;
    
    let pngBytes: Uint8Array;
    try {
      pngBytes = this.wasm.render(bytes, page, scale, targetWidth, pwd);
    } catch (err: any) {
      const msg = typeof err === 'string' ? err : err?.message || String(err);
      throw new Error(msg);
    }

    const blob = new Blob([pngBytes], { type: 'image/png' });
    const url = URL.createObjectURL(blob);

    let width = targetWidth;
    let height: number | undefined;

    if (!width) {
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
