import type {
  PdfProvider,
  SessionRecord,
  SessionDocument,
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

    if (!session.config) session.config = {};
    if (!session.config.documents?.length) {
      const document: SessionDocument = {
        id: `${session.id}:0`,
        file_path: session.file_path,
        name: session.file_path.split('/').pop() || session.file_path,
      };
      session.config.documents = [document];
      session.config.active_document_id = document.id;
      session.documents = [document];
      session.active_document_id = document.id;
      this.localFallbackSessions.set(session.id, session);
      this.persistToLocalStorage();
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

  /**
   * Directly read file bytes from the Origin Private File System (OPFS)
   * using the standard Web API navigator.storage.getDirectory().
   */
  private async readFromOpfsDirect(cleanPath: string, cleanName: string): Promise<Uint8Array | null> {
    if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) {
      return null;
    }
    try {
      const root = await navigator.storage.getDirectory();
      const segments = cleanPath.split('/').filter(Boolean);
      const fileName = cleanName || segments[segments.length - 1];
      if (!fileName) return null;

      // 1. Direct path lookup if multiple segments (e.g. "document/hsbc-credit-stmt.pdf")
      if (segments.length > 1) {
        try {
          let dir: any = root;
          for (let i = 0; i < segments.length - 1; i++) {
            dir = await dir.getDirectoryHandle(segments[i]);
          }
          const fileHandle = await dir.getFileHandle(segments[segments.length - 1]);
          const file = await fileHandle.getFile();
          const buf = await file.arrayBuffer();
          if (buf.byteLength > 0) return new Uint8Array(buf);
        } catch (_) {}
      }

      // 2. Direct lookup in common root directories: document/, documents/, root
      const prefixes = ['document', 'documents', ''];
      for (const prefix of prefixes) {
        try {
          let dir: any = root;
          if (prefix) {
            dir = await dir.getDirectoryHandle(prefix);
          }
          const fileHandle = await dir.getFileHandle(fileName);
          const file = await fileHandle.getFile();
          const buf = await file.arrayBuffer();
          if (buf.byteLength > 0) return new Uint8Array(buf);
        } catch (_) {}
      }

      // 3. Recursive directory search in OPFS for fileName
      async function walkDir(dirHandle: any): Promise<Uint8Array | null> {
        try {
          for await (const [name, handle] of dirHandle.entries()) {
            if (handle.kind === 'file') {
              if (
                name === fileName ||
                name.toLowerCase() === fileName.toLowerCase() ||
                name.endsWith(fileName)
              ) {
                const file = await handle.getFile();
                const buf = await file.arrayBuffer();
                if (buf.byteLength > 0) return new Uint8Array(buf);
              }
            } else if (handle.kind === 'directory') {
              const res = await walkDir(handle);
              if (res) return res;
            }
          }
        } catch (_) {}
        return null;
      }

      return await walkDir(root);
    } catch (_) {
      return null;
    }
  }

  /**
   * Directly writes file bytes to opfs://sessions/<session-id>/<file-name>
   */
  async writeToOpfsSession(sessionId: string, fileName: string, bytes: Uint8Array): Promise<string> {
    const cleanFileName = fileName.replace(/^opfs:\/\/*/, '').split('/').pop() || fileName;
    const uri = `opfs:///sessions/${sessionId}/${cleanFileName}`;
    const relPath = `sessions/${sessionId}/${cleanFileName}`;

    // Cache in local memory
    this.localFiles.set(uri, bytes);
    this.localFiles.set(relPath, bytes);
    this.localFiles.set(cleanFileName, bytes);

    // Write directly to native OPFS filesystem
    if (typeof navigator !== 'undefined' && navigator.storage?.getDirectory) {
      try {
        const root = await navigator.storage.getDirectory();
        const sessionsDir = await root.getDirectoryHandle('sessions', { create: true });
        const sessionDir = await sessionsDir.getDirectoryHandle(sessionId, { create: true });
        const fileHandle = await sessionDir.getFileHandle(cleanFileName, { create: true });
        const writable = await (fileHandle as any).createWritable();
        await writable.write(bytes);
        await writable.close();
      } catch (err) {
        console.warn(`[WasmPdfProvider] Native OPFS write failed for ${uri}:`, err);
      }
    }

    // Also write via MyFS if available
    if (this.myfs && typeof this.myfs.writeFile === 'function') {
      try {
        await this.myfs.writeFile(uri, bytes);
      } catch (_) {}
    }

    return uri;
  }

  /**
   * Reads file bytes specifically from opfs://sessions/<session-id>/<file-name>
   */
  async readFromOpfsSession(sessionId: string, fileName: string): Promise<Uint8Array | null> {
    const cleanFileName = fileName.replace(/^opfs:\/\/*/, '').split('/').pop() || fileName;
    const sessionUri = `opfs:///sessions/${sessionId}/${cleanFileName}`;
    const sessionRel = `sessions/${sessionId}/${cleanFileName}`;

    if (this.localFiles.has(sessionUri) && this.localFiles.get(sessionUri)!.length > 0) {
      return this.localFiles.get(sessionUri)!;
    }
    if (this.localFiles.has(sessionRel) && this.localFiles.get(sessionRel)!.length > 0) {
      return this.localFiles.get(sessionRel)!;
    }

    if (typeof navigator !== 'undefined' && navigator.storage?.getDirectory) {
      try {
        const root = await navigator.storage.getDirectory();
        const sessionsDir = await root.getDirectoryHandle('sessions');
        const sessionDir = await sessionsDir.getDirectoryHandle(sessionId);
        const fileHandle = await sessionDir.getFileHandle(cleanFileName);
        const file = await fileHandle.getFile();
        const buf = await file.arrayBuffer();
        if (buf.byteLength > 0) {
          const bytes = new Uint8Array(buf);
          this.localFiles.set(sessionUri, bytes);
          this.localFiles.set(sessionRel, bytes);
          this.localFiles.set(cleanFileName, bytes);
          return bytes;
        }
      } catch (_) {}
    }

    if (this.myfs && typeof this.myfs.readFile === 'function') {
      try {
        const res = await this.myfs.readFile(sessionUri);
        const bytes = await this.extractBytes(res);
        if (bytes && bytes.length > 0) {
          this.localFiles.set(sessionUri, bytes);
          this.localFiles.set(sessionRel, bytes);
          this.localFiles.set(cleanFileName, bytes);
          return bytes;
        }
      } catch (_) {}
    }

    return null;
  }

  private async deleteOpfsSession(sessionId: string): Promise<void> {
    if (typeof navigator !== 'undefined' && navigator.storage?.getDirectory) {
      try {
        const root = await navigator.storage.getDirectory();
        const sessionsDir = await root.getDirectoryHandle('sessions');
        await (sessionsDir as any).removeEntry(sessionId, { recursive: true });
      } catch (_) {}
    }
    if (this.myfs && typeof this.myfs.rmdir === 'function') {
      try {
        await this.myfs.rmdir(`opfs:///sessions/${sessionId}`, { recursive: true });
      } catch (_) {}
    }
  }

  private async resolveFileBytes(
    path: string,
    session?: SessionRecord,
    sessionIdHint?: string
  ): Promise<Uint8Array | null> {
    if (!path) return null;

    const sid = sessionIdHint || session?.id;

    // 1. Direct hit in local cache (must have non-zero length)
    if (this.localFiles.has(path) && this.localFiles.get(path)!.length > 0) {
      return this.localFiles.get(path)!;
    }

    const clean = path.replace(/^opfs:\/\/*/, '').replace(/^\/+/, '');
    const cleanName = clean.split('/').pop() || clean;

    // Check if path explicitly contains sessions/<sid>/<file>
    const sessMatch = clean.match(/^sessions\/([^/]+)\/(.+)$/);
    const effectiveSid = sid || (sessMatch ? sessMatch[1] : undefined);
    const effectiveName = sessMatch ? sessMatch[2] : cleanName;

    // 2. If session ID is known, prioritize reading from opfs://sessions/<session-id>/<file-name>
    if (effectiveSid) {
      const sessionBytes = await this.readFromOpfsSession(effectiveSid, effectiveName);
      if (sessionBytes && sessionBytes.length > 0) {
        return sessionBytes;
      }
    }

    // 3. Basename matching in local cache
    if (this.localFiles.has(cleanName) && this.localFiles.get(cleanName)!.length > 0) {
      return this.localFiles.get(cleanName)!;
    }

    for (const [key, val] of this.localFiles.entries()) {
      if (val && val.length > 0 && (key === path || key.endsWith('/' + cleanName) || cleanName.endsWith('/' + key))) {
        return val;
      }
    }

    // 4. Native direct OPFS search across filesystem
    const opfsDirectBytes = await this.readFromOpfsDirect(clean, cleanName);
    if (opfsDirectBytes && opfsDirectBytes.length > 0) {
      // If found in general OPFS, ensure it is copied to opfs://sessions/<session-id>
      if (effectiveSid) {
        await this.writeToOpfsSession(effectiveSid, cleanName, opfsDirectBytes);
      } else {
        this.localFiles.set(path, opfsDirectBytes);
        this.localFiles.set(cleanName, opfsDirectBytes);
      }
      return opfsDirectBytes;
    }

    // 5. Try reading via MyFS safely if available
    if (this.myfs) {
      const myfsUris = [
        `opfs:///${clean}`,
        `opfs:///${cleanName}`,
        `opfs:///document/${cleanName}`,
        `opfs:///documents/${cleanName}`,
      ];
      if (effectiveSid) {
        myfsUris.unshift(`opfs:///sessions/${effectiveSid}/${cleanName}`);
      }
      for (const uri of myfsUris) {
        try {
          const res = await this.myfs.readFile(uri);
          const bytes = await this.extractBytes(res);
          if (bytes && bytes.length > 0) {
            if (effectiveSid) {
              await this.writeToOpfsSession(effectiveSid, cleanName, bytes);
            } else {
              this.localFiles.set(path, bytes);
              this.localFiles.set(cleanName, bytes);
            }
            return bytes;
          }
        } catch (_) {}
      }

      // Try searching via myfs.dirtree with proper OPFS root URI
      try {
        if (typeof this.myfs.dirtree === 'function') {
          const tree = await this.myfs.dirtree('opfs:///');
          const matchingPaths: string[] = [];
          const walkTree = (node: any) => {
            if (!node) return;
            if (node.type === 'file' && node.name) {
              if (
                node.name === cleanName ||
                node.name.toLowerCase() === cleanName.toLowerCase() ||
                node.name.endsWith(cleanName)
              ) {
                if (node.path) matchingPaths.push(node.path);
              }
            }
            if (node.children && Array.isArray(node.children)) {
              for (const child of node.children) walkTree(child);
            }
          };
          walkTree(tree);

          for (const matchPath of matchingPaths) {
            try {
              const properUri = matchPath.startsWith('opfs://')
                ? matchPath
                : `opfs:///${matchPath.replace(/^\/+/, '')}`;
              const res = await this.myfs.readFile(properUri);
              const bytes = await this.extractBytes(res);
              if (bytes && bytes.length > 0) {
                if (effectiveSid) {
                  await this.writeToOpfsSession(effectiveSid, cleanName, bytes);
                } else {
                  this.localFiles.set(path, bytes);
                  this.localFiles.set(cleanName, bytes);
                }
                return bytes;
              }
            } catch (_) {}
          }
        }
      } catch (_) {}
    }

    // 6. Network fetch ONLY if explicitly a remote HTTP/HTTPS URL, or as last-resort fallback for bundled sample.pdf
    if (typeof fetch !== 'undefined') {
      const isRemoteUrl = path.startsWith('http://') || path.startsWith('https://');
      const isSamplePdf = cleanName === 'sample.pdf';

      if (isRemoteUrl) {
        try {
          const res = await fetch(path);
          if (res.ok) {
            const buf = await res.arrayBuffer();
            const bytes = new Uint8Array(buf);
            if (bytes.length > 0) {
              if (effectiveSid) {
                await this.writeToOpfsSession(effectiveSid, cleanName, bytes);
              } else {
                this.localFiles.set(path, bytes);
              }
              return bytes;
            }
          }
        } catch (_) {}
      } else if (isSamplePdf) {
        const sampleCandidates = [
          '/sample.pdf',
          '/myfinsheet-web/sample.pdf',
        ];
        if (typeof window !== 'undefined' && window.location?.origin) {
          sampleCandidates.push(`${window.location.origin}/sample.pdf`);
          sampleCandidates.push(`${window.location.origin}/myfinsheet-web/sample.pdf`);
        }

        for (const url of sampleCandidates) {
          try {
            const res = await fetch(url);
            if (res.ok) {
              const buf = await res.arrayBuffer();
              const bytes = new Uint8Array(buf);
              if (bytes.length > 0) {
                if (effectiveSid) {
                  await this.writeToOpfsSession(effectiveSid, 'sample.pdf', bytes);
                } else {
                  this.localFiles.set(path, bytes);
                  this.localFiles.set('sample.pdf', bytes);
                }
                return bytes;
              }
            }
          } catch (_) {}
        }
      }
    }

    return null;
  }

  async createSession(
    fileOrPath: File | string | (File | string)[],
    config: any = {}
  ): Promise<{ session: SessionRecord; page_count: number }> {
    await this.ensureInitialized();
    const id = (typeof crypto !== 'undefined' && crypto.randomUUID) 
      ? crypto.randomUUID() 
      : 'sess_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

    const items = Array.isArray(fileOrPath) ? fileOrPath : [fileOrPath];
    if (items.length === 0) throw new Error('At least one file required to create session');

    const documents: SessionDocument[] = [];
    let firstBytes: Uint8Array | null = null;
    let firstFilePath = '';

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      let fileName = typeof item === 'string'
        ? (item.replace(/^opfs:\/\/*/, '').split('/').pop() || item)
        : item.name;
      let filePath = `opfs:///sessions/${id}/${fileName}`;
      let bytes: Uint8Array | null = null;

      if (typeof item === 'string') {
        bytes = await this.resolveFileBytes(item, undefined, id);
      } else {
        bytes = new Uint8Array(await item.arrayBuffer());
      }

      if (bytes && bytes.length > 0) {
        await this.writeToOpfsSession(id, fileName, bytes);
      }

      if (i === 0) {
        firstBytes = bytes;
        firstFilePath = filePath;
      }

      documents.push({
        id: `${id}:${i}`,
        file_path: filePath,
        name: fileName,
      });
    }

    const now = new Date().toISOString();
    const record: SessionRecord = {
      id,
      file_path: firstFilePath,
      status: 'Active',
      created_at: now,
      updated_at: now,
      config: {
        ...config,
        documents,
        active_document_id: documents[0]?.id || `${id}:0`,
      },
    };

    this.localFallbackSessions.set(id, record);
    this.persistToLocalStorage();

    if (this.db) {
      try {
        const configStr = JSON.stringify(record.config);
        if (typeof this.db.sql === 'function') {
          await this.db.sql`
            INSERT INTO sessions (id, file_path, config, status, created_at, updated_at)
            VALUES (${id}, ${firstFilePath}, ${configStr}, 'Active', ${now}, ${now})
          `.run();
        } else if (typeof this.db.run === 'function') {
          await this.db.run(
            `INSERT INTO sessions (id, file_path, config, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
            [id, firstFilePath, configStr, 'Active', now, now]
          );
        }
      } catch (err) {
        console.warn('[WasmPdfProvider] DB insert error, using local storage:', err);
      }
    }

    let pageCount = 1;
    if (firstBytes && firstBytes.length > 0 && typeof globalThis !== 'undefined') {
      const p = (globalThis as any).__pdfium || (globalThis as any).Module;
      if (p && typeof p._FPDF_LoadMemDocument === 'function' && typeof p._FPDF_GetPageCount === 'function') {
        try {
          const ptr = p._malloc(firstBytes.length);
          p.HEAPU8.set(firstBytes, ptr);
          let passPtr = 0;
          if (config?.password) {
            const passBytes = new TextEncoder().encode(config.password + '\0');
            passPtr = p._malloc(passBytes.length);
            p.HEAPU8.set(passBytes, passPtr);
          }
          const doc = p._FPDF_LoadMemDocument(ptr, firstBytes.length, passPtr);
          if (passPtr) p._free(passPtr);
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

  async addSessionFiles(sessionId: string, files: (File | string)[]): Promise<SessionDocument[]> {
    await this.ensureInitialized();
    const session = (await this.getSession(sessionId)).session;
    const added: SessionDocument[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      let fileName = typeof file === 'string'
        ? (file.replace(/^opfs:\/\/*/, '').split('/').pop() || file)
        : file.name;
      let filePath = `opfs:///sessions/${sessionId}/${fileName}`;
      let bytes: Uint8Array | null = null;

      if (typeof file === 'string') {
        bytes = await this.resolveFileBytes(file, session, sessionId);
      } else {
        bytes = new Uint8Array(await file.arrayBuffer());
      }
      if (!bytes?.length) throw new Error(`Unable to read PDF ${file}`);

      await this.writeToOpfsSession(sessionId, fileName, bytes);

      const document: SessionDocument = {
        id: `${sessionId}:${Date.now().toString(36)}_${i}`,
        file_path: filePath,
        name: fileName,
      };
      added.push(document);
    }

    const documents = [...(session.config?.documents || []), ...added];
    session.config = { ...(session.config || {}), documents };
    session.documents = documents;
    session.updated_at = new Date().toISOString();
    this.localFallbackSessions.set(sessionId, session);
    this.persistToLocalStorage();
    if (this.db) {
      const configStr = JSON.stringify(session.config);
      if (typeof this.db.sql === 'function') await this.db.sql`UPDATE sessions SET config = ${configStr}, updated_at = ${session.updated_at} WHERE id = ${sessionId}`.run();
      else if (typeof this.db.run === 'function') await this.db.run('UPDATE sessions SET config = ?, updated_at = ? WHERE id = ?', [configStr, session.updated_at, sessionId]);
    }
    return added;
  }

  async addSessionFile(sessionId: string, file: File | string): Promise<SessionDocument> {
    const docs = await this.addSessionFiles(sessionId, [file]);
    return docs[0];
  }

  async deleteSessionFile(sessionId: string, documentId: string): Promise<{ session: SessionRecord; page_count: number }> {
    const { session } = await this.getSession(sessionId);
    const docs = session.config?.documents || [];
    if (docs.length <= 1) {
      throw new Error('Cannot remove the only document in a session');
    }
    const filtered = docs.filter((d: SessionDocument) => d.id !== documentId);
    session.config = { ...(session.config || {}), documents: filtered };
    if (session.config.active_document_id === documentId) {
      session.config.active_document_id = filtered[0].id;
      session.file_path = filtered[0].file_path;
    }
    session.documents = filtered;
    session.updated_at = new Date().toISOString();
    this.localFallbackSessions.set(sessionId, session);
    this.persistToLocalStorage();
    if (this.db) {
      const configStr = JSON.stringify(session.config);
      if (typeof this.db.sql === 'function') await this.db.sql`UPDATE sessions SET file_path = ${session.file_path}, config = ${configStr}, updated_at = ${session.updated_at} WHERE id = ${sessionId}`.run();
      else if (typeof this.db.run === 'function') await this.db.run('UPDATE sessions SET file_path = ?, config = ?, updated_at = ? WHERE id = ?', [session.file_path, configStr, session.updated_at, sessionId]);
    }
    return { session, page_count: 1 };
  }

  async activateSessionFile(sessionId: string, documentId: string) {
    const { session } = await this.getSession(sessionId);
    const document = (session.config?.documents || []).find((item: SessionDocument) => item.id === documentId);
    if (!document) throw new Error(`Document not found: ${documentId}`);
    session.file_path = document.file_path;
    session.config = { ...(session.config || {}), active_document_id: documentId };
    session.active_document_id = documentId;
    session.documents = session.config.documents;
    session.updated_at = new Date().toISOString();
    this.localFallbackSessions.set(sessionId, session);
    this.persistToLocalStorage();
    if (this.db) {
      const configStr = JSON.stringify(session.config);
      if (typeof this.db.sql === 'function') await this.db.sql`UPDATE sessions SET file_path = ${session.file_path}, config = ${configStr}, updated_at = ${session.updated_at} WHERE id = ${sessionId}`.run();
      else if (typeof this.db.run === 'function') await this.db.run('UPDATE sessions SET file_path = ?, config = ?, updated_at = ? WHERE id = ?', [session.file_path, configStr, session.updated_at, sessionId]);
    }
    return { session, page_count: 1 };
  }

  async deleteSession(id: string): Promise<boolean> {
    await this.ensureInitialized();
    this.localFallbackSessions.delete(id);
    this.persistToLocalStorage();
    await this.deleteOpfsSession(id);

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

  async executeDsl(sessionId: string, code: string, documentId?: string): Promise<DslExecutionResult> {
    if (!this.wasm || typeof this.wasm.executeDsl !== 'function') {
      throw new Error('executeDsl is not available in WASM bundle');
    }

    let session: SessionRecord | undefined;
    if (sessionId) {
      try {
        const res = await this.getSession(sessionId);
        session = res.session;
        if (documentId) {
          const document = (session.config?.documents || []).find((item: SessionDocument) => item.id === documentId);
          if (document) session = { ...session, file_path: document.file_path };
        }
      } catch (_) {}
    }

    const fileLoader = async (path: string, sidFromRust?: string) => {
      const activeSid = sessionId || sidFromRust || session?.id || '';
      const documents: SessionDocument[] = session?.config?.documents || session?.documents || [];
      const clean = path.replace(/^opfs:\/\/*/, '').replace(/^\/+/, '').trim();
      const cleanName = clean.split('/').pop() || clean;

      // Special aliases resolve to active document
      if (!clean || clean === 'session' || clean === 'default') {
        const activeDoc = documents.find((d) => d.id === session?.config?.active_document_id) || documents[0];
        const targetPath = activeDoc?.file_path || session?.file_path || path;
        const bytes = await this.resolveFileBytes(targetPath, session, activeSid);
        if (bytes && bytes.length > 0) return bytes;
      }

      // 1. First, check if file exists in opfs://sessions/<session-id>/<cleanName>
      if (activeSid) {
        const sessionBytes = await this.readFromOpfsSession(activeSid, cleanName);
        if (sessionBytes && sessionBytes.length > 0) return sessionBytes;
      }

      // 2. Match strictly within session documents
      const matched = documents.find((d) => {
        if (d.name === clean || d.id === clean || d.name === cleanName) return true;
        const base = d.file_path.split('/').pop() || d.file_path;
        if (base === clean || base === cleanName) return true;
        return d.name.toLowerCase() === cleanName.toLowerCase() || base.toLowerCase() === cleanName.toLowerCase();
      });

      if (matched) {
        const bytes = await this.resolveFileBytes(matched.file_path, session, activeSid);
        if (bytes && bytes.length > 0) return bytes;
      }

      // 3. Fallback: Search OPFS filesystem and copy to opfs://sessions/<session-id>
      const opfsBytes = await this.resolveFileBytes(path, session, activeSid);
      if (opfsBytes && opfsBytes.length > 0) {
        const docName = cleanName;
        const sessionFilePath = activeSid
          ? `opfs:///sessions/${activeSid}/${docName}`
          : (path.includes('://') ? path : `opfs:///document/${docName}`);
        const newDoc: SessionDocument = {
          id: `${sessionId}:${Date.now().toString(36)}`,
          file_path: sessionFilePath,
          name: docName,
        };
        const docs = [...documents];
        if (!docs.some((d) => d.name === docName)) {
          docs.push(newDoc);
          if (session) {
            session.config = {
              ...(session.config || {}),
              documents: docs,
              active_document_id: newDoc.id,
            };
            session.documents = docs;
            session.file_path = newDoc.file_path;
            this.localFallbackSessions.set(sessionId, session);
            this.persistToLocalStorage();
          }
        }
        return opfsBytes;
      }

      const available = documents.map((d) => `'${d.name}'`).join(', ');
      throw new Error(
        `File "${path}" not found in session boundary (opfs://sessions/${activeSid}) or OPFS filesystem. Available session files: [${available || 'none'}]`
      );
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

    const result = await this.wasm.executeDsl(code, fileLoader, sessionId);
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
    password?: string,
    documentId?: string,
    targetFile?: string
  ): Promise<RenderResult> {
    if (!this.wasm || typeof this.wasm.render !== 'function') {
      throw new Error('render is not available in WASM bundle');
    }

    const { session } = await this.getSession(sessionId);
    let filePath = '';

    if (targetFile) {
      const docs = session.config?.documents || session.documents || [];
      const cleanTarget = targetFile.replace(/^opfs:\/\/*/, '').replace(/^\/+/, '');
      const cleanTargetName = cleanTarget.split('/').pop() || cleanTarget;
      const matched = docs.find((d: any) => {
        const dName = (d.name || d.file_path || '').split('/').pop();
        return d.name === targetFile || dName === cleanTargetName || d.file_path === targetFile;
      });
      filePath = matched?.file_path || `opfs:///sessions/${sessionId}/${cleanTargetName}`;
    } else {
      const document = documentId
        ? (session.config?.documents || []).find((item: SessionDocument) => item.id === documentId)
        : null;
      filePath = document?.file_path || session.file_path;
    }

    let bytes = await this.resolveFileBytes(filePath, session, sessionId);
    if ((!bytes || bytes.length === 0) && targetFile && targetFile !== filePath) {
      bytes = await this.resolveFileBytes(targetFile, session, sessionId);
    }
    if ((!bytes || bytes.length === 0) && !targetFile && session.file_path && session.file_path !== filePath) {
      bytes = await this.resolveFileBytes(session.file_path, session, sessionId);
    }
    if (!bytes || bytes.length === 0) {
      throw new Error(`Cannot render page: file bytes not found for "${targetFile || filePath || 'document'}" in OPFS filesystem (lookup: opfs://sessions/${sessionId})`);
    }

    // Auto-register discovered targetFile into session documents if not already registered
    if (bytes && bytes.length > 0 && targetFile) {
      const cleanTarget = targetFile.replace(/^opfs:\/\/*/, '').replace(/^\/+/, '');
      const docName = cleanTarget.split('/').pop() || cleanTarget;
      const sessionFilePath = `opfs:///sessions/${sessionId}/${docName}`;
      await this.writeToOpfsSession(sessionId, docName, bytes);

      const docs = session.config?.documents || session.documents || [];
      if (!docs.some((d: any) => d.name === docName || (d.file_path && d.file_path.split('/').pop() === docName))) {
        const newDoc: SessionDocument = {
          id: `${sessionId}:${Date.now().toString(36)}`,
          file_path: sessionFilePath,
          name: docName,
        };
        const updatedDocs = [...docs, newDoc];
        session.config = {
          ...(session.config || {}),
          documents: updatedDocs,
          active_document_id: newDoc.id,
        };
        session.documents = updatedDocs;
        session.file_path = newDoc.file_path;
        this.localFallbackSessions.set(sessionId, session);
        this.persistToLocalStorage();
      }
    }

    const scale = dpi / 72;
    const pwd = password || this.sessionPasswords.get(sessionId) || session?.config?.password || session?.config?.pdf?.password;
    if (pwd) {
      this.sessionPasswords.set(sessionId, pwd);
    }
    
    let pngBytes: Uint8Array;
    try {
      pngBytes = this.wasm.render(bytes, page, scale, targetWidth, pwd);
    } catch (err: any) {
      const msg = typeof err === 'string' ? err : err?.message || String(err);
      if (msg.includes('PDFium error 4') || msg.includes('error 4')) {
        throw new Error('This PDF document is password-protected. Please provide a password in the toolbar, in your DSL query (WITH PASSWORD "..."), or in session settings.');
      }
      throw new Error(msg);
    }

    const blob = new Blob([pngBytes.slice().buffer as ArrayBuffer], { type: 'image/png' });
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
