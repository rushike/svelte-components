export const STORAGE_KEY_DSL = "mypdfutils_pipeline_dsl_config";
export const STORAGE_KEY_USE_WASM = "mypdfutils_use_wasm";
export const STORAGE_KEY_WASM_ACTIVE_SESSION = "mypdfutils_wasm_active_session_id";
export const STORAGE_KEY_SERVER_ACTIVE_SESSION = "mypdfutils_server_active_session_id";
export const STORAGE_KEY_WASM_SESSIONS = "mypdfutils_wasm_sessions";

export function getActiveSessionStorageKey(useWasm: boolean): string {
  return useWasm ? STORAGE_KEY_WASM_ACTIVE_SESSION : STORAGE_KEY_SERVER_ACTIVE_SESSION;
}

export const DEFAULT_DSL_QUERY = `LOAD "sample.pdf" AS pdf
EXTRACT WORDS FROM pdf AS words
FIND SENTENCES FROM words AS sentences
FIND ROWS FROM sentences AS rows
FIND COLUMNS FROM rows AS cols
RETURN rows, cols`;

export interface LayerStyle {
  stroke: string;
  fill: string;
  hoverStroke: string;
  hoverFill: string;
  textColor: string;
  accentClass: string;
}

export const layerStyles: Record<string, LayerStyle> = {
  words: {
    stroke: "#00C800",
    fill: "rgba(0, 200, 0, 0.12)",
    hoverStroke: "#00FF78",
    hoverFill: "rgba(0, 255, 120, 0.45)",
    textColor: "text-emerald-400",
    accentClass: "accent-emerald-500",
  },
  sentences: {
    stroke: "#00A0DC",
    fill: "rgba(0, 160, 220, 0.12)",
    hoverStroke: "#00E0FF",
    hoverFill: "rgba(0, 200, 255, 0.45)",
    textColor: "text-sky-400",
    accentClass: "accent-sky-500",
  },
  rows: {
    stroke: "#C800C8",
    fill: "rgba(200, 0, 200, 0.12)",
    hoverStroke: "#FF00FF",
    hoverFill: "rgba(255, 0, 255, 0.45)",
    textColor: "text-purple-400",
    accentClass: "accent-purple-500",
  },
  columns: {
    stroke: "#FF8000",
    fill: "rgba(255, 128, 0, 0.12)",
    hoverStroke: "#FFAA00",
    hoverFill: "rgba(255, 170, 0, 0.45)",
    textColor: "text-amber-400",
    accentClass: "accent-amber-500",
  },
  tables: {
    stroke: "#FF0000",
    fill: "rgba(255, 0, 0, 0.08)",
    hoverStroke: "#FF4444",
    hoverFill: "rgba(255, 60, 60, 0.40)",
    textColor: "text-red-400",
    accentClass: "accent-red-500",
  },
  lines: {
    stroke: "#00D2FF",
    fill: "rgba(0, 210, 255, 0.12)",
    hoverStroke: "#60EFFF",
    hoverFill: "rgba(96, 239, 255, 0.45)",
    textColor: "text-teal-400",
    accentClass: "accent-teal-500",
  },
  images: {
    stroke: "#3B82F6",
    fill: "rgba(59, 130, 246, 0.12)",
    hoverStroke: "#60A5FA",
    hoverFill: "rgba(96, 165, 250, 0.45)",
    textColor: "text-blue-400",
    accentClass: "accent-blue-500",
  },
};

export function getLayerStyle(layer: string): LayerStyle {
  if (layerStyles[layer]) return layerStyles[layer];
  const lower = (layer || "").toLowerCase();
  if (lower.includes("line") || lower.includes("rule")) return layerStyles.lines;
  if (lower.includes("box") || lower.includes("rect") || lower.includes("table")) return layerStyles.tables;
  if (lower.includes("image") || lower.includes("photo")) return layerStyles.images;
  if (lower.includes("word") || lower.includes("glyph") || lower.includes("char")) return layerStyles.words;
  if (lower.includes("sentence")) return layerStyles.sentences;
  if (lower.includes("row")) return layerStyles.rows;
  if (lower.includes("column") || lower.includes("col")) return layerStyles.columns;
  return {
    stroke: "#A855F7",
    fill: "rgba(168, 85, 247, 0)",
    hoverStroke: "#C084FC",
    hoverFill: "rgba(192, 132, 252, 0.45)",
    textColor: "text-indigo-400",
    accentClass: "accent-indigo-500",
  };
}

export function getItemBBox(item: any) {
  if (!item)
    return { x: 0, y: 0, width: 0, height: 0, x1: 0, y1: 0, x2: 0, y2: 0 };
  if (item.start && item.end) {
    const x1 = Math.min(item.start.x, item.end.x);
    const y1 = Math.min(item.start.y, item.end.y);
    const x2 = Math.max(item.start.x, item.end.x);
    const y2 = Math.max(item.start.y, item.end.y);
    return {
      x: x1,
      y: y1,
      width: Math.max(0, x2 - x1),
      height: Math.max(0, y2 - y1),
      x1,
      y1,
      x2,
      y2,
    };
  }
  const b = item.bbox || item;
  const x1 = b.x1 !== undefined ? b.x1 : b.x !== undefined ? b.x : 0;
  const y1 = b.y1 !== undefined ? b.y1 : b.y !== undefined ? b.y : 0;
  const x2 =
    b.x2 !== undefined ? b.x2 : b.width !== undefined ? x1 + b.width : x1;
  const y2 =
    b.y2 !== undefined ? b.y2 : b.height !== undefined ? y1 + b.height : y1;
  const width = Math.max(0, x2 - x1);
  const height = Math.max(0, y2 - y1);
  return { x: x1, y: y1, width, height, x1, y1, x2, y2 };
}

export function getElementText(el: any): string {
  if (!el) return "";
  if (typeof el.text === "string") return el.text.trim();
  if (Array.isArray(el.texts)) {
    return el.texts.map(getElementText).filter(Boolean).join(" ");
  }
  if (Array.isArray(el.words)) {
    return el.words
      .map((w: any) => (w && w.text) || "")
      .filter(Boolean)
      .join(" ");
  }
  return "";
}

export function isTableItem(item: any): boolean {
  if (!item || typeof item !== "object") return false;
  return Boolean(
    item.structure ||
      (Array.isArray(item.rows) &&
        item.rows.length > 0 &&
        (item.rows[0].texts || item.rows[0].bbox)),
  );
}

export function getTableElements(item: any): {
  bbox: ReturnType<typeof getItemBBox>;
  rows: any[];
  columns: any[];
  cells: any[];
} {
  const bbox = getItemBBox(item.bbox || item.structure?.bbox || item);
  const rows =
    Array.isArray(item.rows) && item.rows.length > 0
      ? item.rows
      : Array.isArray(item.structure?.rows)
        ? item.structure.rows
        : [];
  const columns =
    Array.isArray(item.structure?.columns) && item.structure.columns.length > 0
      ? item.structure.columns
      : Array.isArray(item.columns)
        ? item.columns
        : [];
  const cells = Array.isArray(item.structure?.cells)
    ? item.structure.cells
    : Array.isArray(item.cells)
      ? item.cells
      : [];
  return { bbox, rows, columns, cells };
}

export function getItemLabel(layerKey: string, item: any, idx: number): string {
  if (item.text && typeof item.text === "string")
    return `"${item.text.slice(0, 20)}${item.text.length > 20 ? "…" : ""}"`;
  if (
    layerKey === "images" ||
    item.data_base64 ||
    item.data ||
    item.pixel_width
  ) {
    return `Photo #${idx + 1}`;
  }
  if (layerKey === "lines" || item.orientation || item.start) {
    const orient = item.orientation ? ` (${item.orientation})` : "";
    return `Line #${item.id || idx + 1}${orient}`;
  }
  if (isTableItem(item) || layerKey.toLowerCase().includes("table")) {
    const tbl = getTableElements(item);
    const rowCount = tbl.rows.length;
    const colCount = tbl.columns.length;
    let label = `Table #${item.id || idx + 1}`;
    if (rowCount > 0 && colCount > 0) {
      label += ` (${rowCount}R × ${colCount}C)`;
    } else if (rowCount > 0) {
      label += ` (${rowCount} rows)`;
    }
    return label;
  }
  const cleanName = layerKey.endsWith("s") ? layerKey.slice(0, -1) : layerKey;
  return `${cleanName} #${idx + 1}`;
}

export function isSublayerChecked(
  layerKey: string,
  subKey: number | string,
  subVis: Record<string, Record<string | number, boolean>>,
) {
  if (subVis && subVis[layerKey] && subVis[layerKey][subKey] !== undefined) {
    return subVis[layerKey][subKey] === true;
  }
  const isPhoto = layerKey === "images" || layerKey === "photos";
  return isPhoto ? false : true;
}

export function isSublayerVisible(
  layerKey: string,
  subKey: number | string,
  subVis: Record<string, Record<string | number, boolean>>,
  actLayers: Record<string, boolean>,
) {
  if (actLayers && actLayers[layerKey] === false) return false;
  return isSublayerChecked(layerKey, subKey, subVis);
}
