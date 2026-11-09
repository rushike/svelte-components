import { WasmPdfProvider } from "../../lib/providers";

let pdfiumReadyPromise: Promise<any> | null = null;

/**
 * Ensures that the official PDFium WASM engine is loaded into the browser
 * and its exported C functions (like _FPDF_LoadMemDocument) are available on globalThis.__pdfium.
 */
export async function ensurePdfiumInitialized(): Promise<any> {
  if (typeof window === "undefined") return null;

  if ((window as any).__pdfium && (window as any).__pdfium._FPDF_LoadMemDocument) {
    return (window as any).__pdfium;
  }
  if ((window as any).Module && (window as any).Module._FPDF_LoadMemDocument) {
    (window as any).__pdfium = (window as any).Module;
    return (window as any).Module;
  }

  if (pdfiumReadyPromise) return pdfiumReadyPromise;

  pdfiumReadyPromise = new Promise((resolve, reject) => {
    if ((window as any).Module && (window as any).Module._FPDF_LoadMemDocument) {
      (window as any).__pdfium = (window as any).Module;
      return resolve((window as any).Module);
    }

    const prevModule = (window as any).Module || {};
    const prevInit = prevModule.onRuntimeInitialized;

    (window as any).Module = {
      ...prevModule,
      locateFile(path: string, prefix: string) {
        if (path.endsWith(".wasm")) {
          return "/pdfium.wasm";
        }
        return (prefix || "") + path;
      },
      onRuntimeInitialized() {
        (window as any).__pdfium = (window as any).Module;
        if (typeof prevInit === "function") prevInit();
        resolve((window as any).Module);
      },
      onAbort(msg: any) {
        reject(new Error("PDFium WASM aborted: " + msg));
      },
    };

    const existingScript = document.querySelector('script[src*="pdfium.js"]');
    if (!existingScript) {
      const script = document.createElement("script");
      script.src = "/pdfium.js";
      script.async = true;
      script.onerror = () => reject(new Error("Failed to load /pdfium.js"));
      document.head.appendChild(script);
    } else {
      const checkInterval = setInterval(() => {
        if (
          (window as any).Module &&
          (window as any).Module._FPDF_LoadMemDocument
        ) {
          clearInterval(checkInterval);
          (window as any).__pdfium = (window as any).Module;
          resolve((window as any).Module);
        }
      }, 50);

      setTimeout(() => {
        clearInterval(checkInterval);
        if (
          (window as any).Module &&
          (window as any).Module._FPDF_LoadMemDocument
        ) {
          (window as any).__pdfium = (window as any).Module;
          resolve((window as any).Module);
        } else {
          reject(new Error("Timed out waiting for PDFium WASM engine"));
        }
      }, 10000);
    }
  });

  return pdfiumReadyPromise;
}

/**
 * Initializes the WASM engine, loading SQLite OPFS database, MyFS filesystem,
 * PDFium engine, and the compiled Rust WebAssembly module.
 */
export async function initializeWasmEngine(): Promise<WasmPdfProvider> {
  // Ensure PDFium runtime is ready before invoking WASM methods
  await ensurePdfiumInitialized().catch((err) => {
    console.warn("[pdfExtractorService] PDFium initialization warning:", err);
  });

  let mypdfutils: any;
  try {
    mypdfutils = await import("@rushike/mypdfutils");
  } catch (_) {
    mypdfutils = await import("../../../../mypdfutils/src/index.ts");
  }
  const initWasm = mypdfutils.initWasm || mypdfutils.default;
  if (typeof initWasm === "function") {
    try {
      await initWasm();
    } catch (err: any) {
      console.warn("[pdfExtractorService] Default initWasm failed, trying fallbacks:", err?.message || err);
      let initialized = false;
      const candidatePaths = [
        "/mypdfutils_bg.wasm",
        "/pkg/mypdfutils_bg.wasm",
        "/myfinsheet-web/pkg/mypdfutils_bg.wasm",
        "/myfinsheet-web/mypdfutils_bg.wasm",
      ];
      for (const p of candidatePaths) {
        try {
          await initWasm(p);
          initialized = true;
          break;
        } catch (_) {}
      }
      if (!initialized) {
        throw err;
      }
    }
  }

  let db = null;
  let myfs = null;
  try {
    const sqliteModule = await import("@rushike/sqlite3-client");
    const ClientClass =
      sqliteModule.SQLiteClient || sqliteModule.default?.SQLiteClient;
    if (ClientClass) {
      db = new ClientClass();
      if (typeof db.init === "function") {
        await db.init().catch(() => { });
      }
    }
  } catch (e) {
    console.debug("[WASM] Optional @rushike/sqlite3-client not available:", e?.message || e);
  }

  try {
    const myfsModule = await import("@rushike/myfs");
    const MyFSClass = myfsModule.default || myfsModule.MyFS;
    if (MyFSClass) myfs = new MyFSClass();
  } catch (e) {
    console.debug("[WASM] Optional @rushike/myfs not available:", e?.message || e);
  }

  return new WasmPdfProvider({
    db,
    myfs,
    wasmModule: {
      compileDsl: mypdfutils.compileDsl,
      executeDsl: mypdfutils.executeDsl,
      render: mypdfutils.render,
    },
  });
}

let cachedWasmProvider: WasmPdfProvider | null = null;

export async function getOrInitWasmEngine(): Promise<WasmPdfProvider> {
  if (cachedWasmProvider) return cachedWasmProvider;
  cachedWasmProvider = await initializeWasmEngine();
  return cachedWasmProvider;
}

const META_KEYS = new Set([
  "session_id",
  "function",
  "page",
  "page_count",
  "text",
  "pdf_width",
  "pdf_height",
]);

/**
 * Normalizes a layer value into an array of drawable items.
 * If value is already an array, returns it.
 * If value is a non-null object with bbox / geometry / words / texts / rows, wraps it in [value].
 */
export function normalizeLayerItems(val: any): any[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === "object") {
    // If it's a table with rows, or an object with bbox/start/end/etc., wrap in array so it can be drawn
    return [val];
  }
  return [];
}

/**
 * Synchronizes layer order and active status from a backend/WASM pipeline or DSL response.
 * Handles both arrays (e.g. rows: [...]) and single objects (e.g. my_table: { ... }).
 */
export function syncLayersFromResponse(
  data: Record<string, any>,
  currentAvailableLayers: string[],
  currentActiveLayers: Record<string, boolean>,
): {
  availableLayers: string[];
  activeLayers: Record<string, boolean>;
  totalNodes: number;
} {
  const newAvailableLayers = Object.keys(data).filter((key) => {
    if (META_KEYS.has(key)) return false;
    const items = normalizeLayerItems(data[key]);
    return items.length > 0;
  });

  // Preserve existing user-arranged drag order
  const existingSet = new Set(newAvailableLayers);
  const ordered = currentAvailableLayers.filter((k) => existingSet.has(k));
  const added = newAvailableLayers.filter(
    (k) => !currentAvailableLayers.includes(k),
  );
  const availableLayers =
    ordered.length > 0 ? [...ordered, ...added] : newAvailableLayers;

  const activeLayers: Record<string, boolean> = {};
  let totalNodes = 0;
  newAvailableLayers.forEach((layer) => {
    activeLayers[layer] =
      currentActiveLayers[layer] !== undefined
        ? currentActiveLayers[layer]
        : true;
    totalNodes += normalizeLayerItems(data[layer]).length;
  });

  return { availableLayers, activeLayers, totalNodes };
}

/**
 * Populates default sub-layer checkboxes for newly returned items (arrays or single objects).
 */
export function buildSublayersVisibility(
  data: Record<string, any>,
  currentVisibility: Record<string, Record<number, boolean>>,
): Record<string, Record<number, boolean>> {
  if (!data) return currentVisibility;
  const nextVis = { ...currentVisibility };
  for (const [key, rawVal] of Object.entries(data)) {
    if (META_KEYS.has(key)) continue;
    const items = normalizeLayerItems(rawVal);
    if (items.length > 0) {
      const layerMap = { ...(nextVis[key] || {}) };
      const isPhoto = key === "images" || key === "photos";
      items.forEach((_, idx) => {
        if (layerMap[idx] === undefined) {
          layerMap[idx] = isPhoto ? false : true;
        }
      });
      nextVis[key] = layerMap;
    }
  }
  return nextVis;
}

/**
 * Extracts password if present in a DSL query (e.g., LOAD "..." WITH PASSWORD "secret" AS ...).
 */
export function extractPasswordFromDsl(code?: string): string | undefined {
  if (!code) return undefined;
  const match = code.match(/WITH\s+PASSWORD\s+(?:=\s*)?["']([^"']+)["']/i);
  return match ? match[1] : undefined;
}

/**
 * Extracts the file path or name specified in a DSL query (e.g., LOAD "doc.pdf" ... AS ...).
 */
export function extractLoadedFileFromDsl(code?: string): string | undefined {
  if (!code) return undefined;
  const match = code.match(/LOAD\s+["']([^"']+)["']/i);
  return match ? match[1].trim() : undefined;
}
