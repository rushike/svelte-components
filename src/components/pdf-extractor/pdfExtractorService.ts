import { WasmPdfProvider } from "../../lib/providers";

/**
 * Initializes the WASM engine, loading SQLite OPFS database, MyFS filesystem,
 * and the compiled Rust WebAssembly module.
 */
export async function initializeWasmEngine(): Promise<WasmPdfProvider> {
  let mypdfutils: any;
  try {
    mypdfutils = await import("@rushike/mypdfutils");
  } catch (_) {
    mypdfutils = await import("../../../../mypdfutils/src/index.ts");
  }
  const initWasm = mypdfutils.initWasm || mypdfutils.default;
  if (typeof initWasm === "function") {
    await initWasm();
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
        await db.init().catch(() => {});
      }
    }
  } catch (_) {}

  try {
    const myfsModule = await import("@rushike/myfs");
    const MyFSClass = myfsModule.default || myfsModule.MyFS;
    if (MyFSClass) myfs = new MyFSClass();
  } catch (_) {}

  return new WasmPdfProvider({
    db,
    myfs,
    wasmModule: {
      WasmPdfSession: mypdfutils.WasmPdfSession,
      compileDsl: mypdfutils.compileDsl,
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
 * Synchronizes layer order and active status from a backend/WASM pipeline or DSL response.
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
  const newAvailableLayers = Object.keys(data).filter(
    (key) =>
      Array.isArray(data[key]) &&
      data[key].length > 0 &&
      !META_KEYS.has(key),
  );

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
    totalNodes += data[layer].length;
  });

  return { availableLayers, activeLayers, totalNodes };
}

/**
 * Populates default sub-layer checkboxes for newly returned item arrays.
 */
export function buildSublayersVisibility(
  data: Record<string, any>,
  currentVisibility: Record<string, Record<number, boolean>>,
): Record<string, Record<number, boolean>> {
  if (!data) return currentVisibility;
  const nextVis = { ...currentVisibility };
  for (const [key, items] of Object.entries(data)) {
    if (Array.isArray(items)) {
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
