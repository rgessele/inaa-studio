import { useCallback, useSyncExternalStore } from "react";
import type { DesignDataV2 } from "./types";

/**
 * Project-wide mold documentation logo helpers.
 *
 * The logo is stored INLINE in the project document
 * (DesignDataV2.meta.moldDocLogo) as a normalized data URL so the canvas and
 * the PDF export never depend on network availability or CORS (the export
 * rasterizes the Konva stage via toDataURL — a tainted canvas would break it).
 * Uploads are downscaled/re-encoded client-side to keep the JSONB small.
 */

export type MoldDocLogo = NonNullable<
  NonNullable<DesignDataV2["meta"]>["moldDocLogo"]
>;

export type MoldDocLogoItem = MoldDocLogo & { id: string };

type ProjectMeta = DesignDataV2["meta"];

/** Max images kept in the gallery (each is an inline data URL in the JSONB). */
export const MOLD_DOC_LOGO_GALLERY_MAX = 6;

/**
 * Normalized gallery view: the gallery array when present, else the legacy
 * single `moldDocLogo` exposed as a one-item gallery (id "legacy").
 * NOTE: builds new item objects for the legacy case — use only in UI code,
 * never to feed memoized renderers (use getSelectedMoldDocLogo for that).
 */
export function getMoldDocLogoGalleryItems(meta: ProjectMeta): MoldDocLogoItem[] {
  if (meta?.moldDocLogoGallery) return meta.moldDocLogoGallery;
  if (meta?.moldDocLogo) return [{ id: "legacy", ...meta.moldDocLogo }];
  return [];
}

/** Id of the selected gallery item, or null when none is selected. */
export function getSelectedMoldDocLogoId(meta: ProjectMeta): string | null {
  if (meta?.moldDocLogoGallery) return meta.moldDocLogoSelectedId ?? null;
  return meta?.moldDocLogo ? "legacy" : null;
}

/**
 * The logo effectively drawn on the molds' documentation: the selected
 * gallery item, falling back to the legacy single-logo field for projects
 * saved before the gallery existed. Returns references held by `meta`
 * (reference-stable across renders), so it is safe for memoized consumers.
 */
export function getSelectedMoldDocLogo(meta: ProjectMeta): MoldDocLogo | null {
  const gallery = meta?.moldDocLogoGallery;
  if (gallery) {
    const selId = meta?.moldDocLogoSelectedId;
    if (selId == null) return null;
    return gallery.find((item) => item.id === selId) ?? null;
  }
  return meta?.moldDocLogo ?? null;
}

export const MOLD_DOC_LOGO_ACCEPT =
  "image/png,image/jpeg,image/webp,image/svg+xml";

const ACCEPTED_MIME_TYPES = new Set(MOLD_DOC_LOGO_ACCEPT.split(","));
const MAX_INPUT_BYTES = 5 * 1024 * 1024; // 5MB, same cap as notification images
const MAX_HEIGHT_PX = 512; // normalized image is never taller than this
const MAX_WIDTH_PX = 1024; // cap for extreme aspect ratios (canvas limits)
const MIN_HEIGHT_PX = 128; // stop shrinking below this; reject instead
const MAX_DATA_URL_CHARS = 400_000; // ~300KB binary; keeps design_data lean
const SVG_FALLBACK_PX = 512; // for SVGs without intrinsic dimensions

export type NormalizeLogoResult =
  | { ok: true; logo: MoldDocLogo }
  | { ok: false; error: string };

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode-failed"));
    };
    img.src = url;
  });
}

/**
 * Validates and normalizes an uploaded logo file: downscales to at most
 * MAX_HEIGHT_PX (never upscales), re-encodes (PNG for PNG/SVG to preserve
 * alpha; JPEG q0.85 for JPEG/WebP) and shrinks iteratively until the data URL
 * fits MAX_DATA_URL_CHARS. Error messages are user-facing (pt-BR).
 */
export async function normalizeMoldDocLogo(
  file: File
): Promise<NormalizeLogoResult> {
  if (!ACCEPTED_MIME_TYPES.has(file.type)) {
    return {
      ok: false,
      error: "Formato não suportado. Use PNG, JPEG, WebP ou SVG.",
    };
  }
  if (file.size > MAX_INPUT_BYTES) {
    return { ok: false, error: "Imagem muito grande (máx. 5MB)." };
  }

  let img: HTMLImageElement;
  try {
    img = await loadImageFromFile(file);
  } catch {
    return { ok: false, error: "Não foi possível ler a imagem." };
  }

  // SVGs without intrinsic dimensions can report 0×0 — rasterize square.
  let srcW = img.naturalWidth;
  let srcH = img.naturalHeight;
  if (!Number.isFinite(srcW) || !Number.isFinite(srcH) || srcW <= 0 || srcH <= 0) {
    srcW = SVG_FALLBACK_PX;
    srcH = SVG_FALLBACK_PX;
  }

  const keepAlpha = file.type === "image/png" || file.type === "image/svg+xml";
  const mime = keepAlpha ? "image/png" : "image/jpeg";

  let height = Math.min(MAX_HEIGHT_PX, srcH);
  // Cap the width too (preserving aspect): very wide banners would otherwise
  // exceed browser canvas limits, where toDataURL silently returns "data:,".
  if (height * (srcW / srcH) > MAX_WIDTH_PX) {
    height = MAX_WIDTH_PX / (srcW / srcH);
  }
  for (;;) {
    const width = Math.max(1, Math.round(height * (srcW / srcH)));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = Math.max(1, Math.round(height));
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return { ok: false, error: "Não foi possível processar a imagem." };
    }
    if (!keepAlpha) {
      // JPEG has no alpha channel; transparent pixels would turn black.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    let dataUrl: string;
    try {
      dataUrl = canvas.toDataURL(mime, keepAlpha ? undefined : 0.85);
    } catch {
      return { ok: false, error: "Não foi possível processar a imagem." };
    }
    // Browsers return the inert "data:," when the canvas is unusable (e.g.
    // dimension limits) instead of throwing — treat it as a failure.
    if (!dataUrl.startsWith("data:image/")) {
      return { ok: false, error: "Não foi possível processar a imagem." };
    }

    if (dataUrl.length <= MAX_DATA_URL_CHARS) {
      return {
        ok: true,
        logo: {
          dataUrl,
          naturalWidth: canvas.width,
          naturalHeight: canvas.height,
        },
      };
    }
    if (height <= MIN_HEIGHT_PX) {
      return {
        ok: false,
        error: "Imagem muito complexa — use uma versão menor ou mais simples.",
      };
    }
    height = Math.max(MIN_HEIGHT_PX, height * 0.7);
  }
}

// ---------------------------------------------------------------------------
// Shared HTMLImageElement cache (one decode per data URL, shared by every
// FigureRenderer instance and by the PDF export preload).
// ---------------------------------------------------------------------------

const MAX_CACHE_ENTRIES = 4;

// Waiters live ON the entry (not in a url-keyed map) so an entry evicted from
// the cache still flushes its waiters when the decode settles (the onload
// closure keeps it alive), and a re-created entry for the same URL can never
// consume waiters that belong to the old one.
type LogoCacheEntry = {
  img: HTMLImageElement;
  loaded: boolean;
  failed: boolean;
  waiters: Array<() => void>;
};
const imageCache = new Map<string, LogoCacheEntry>();

function getCacheEntry(dataUrl: string): LogoCacheEntry {
  let entry = imageCache.get(dataUrl);
  if (!entry) {
    const img = new Image();
    const created: LogoCacheEntry = { img, loaded: false, failed: false, waiters: [] };
    entry = created;
    const settle = (failed: boolean) => {
      created.loaded = !failed;
      created.failed = failed;
      const waiters = created.waiters.splice(0);
      waiters.forEach((w) => w());
    };
    img.onload = () => settle(false);
    img.onerror = () => settle(true);
    img.src = dataUrl;
    imageCache.set(dataUrl, entry);
    if (imageCache.size > MAX_CACHE_ENTRIES) {
      const oldest = imageCache.keys().next().value;
      if (oldest !== undefined && oldest !== dataUrl) {
        imageCache.delete(oldest);
      }
    }
  }
  return entry;
}

/**
 * React hook: decoded HTMLImageElement for the logo data URL, or null while
 * loading / on decode failure (callers simply skip drawing).
 *
 * Implemented with useSyncExternalStore: the module cache is an external
 * store, and React re-reads the snapshot right after subscribing — so a
 * decode that settles between the render and the subscription is never
 * missed, even in memoized consumers.
 */
export function useMoldDocLogoImage(
  dataUrl: string | null | undefined
): HTMLImageElement | null {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!dataUrl) return () => {};
      const entry = getCacheEntry(dataUrl);
      if (entry.loaded || entry.failed) return () => {};
      let active = true;
      entry.waiters.push(() => {
        if (active) onStoreChange();
      });
      return () => {
        active = false;
      };
    },
    [dataUrl]
  );

  const getSnapshot = useCallback(() => {
    if (!dataUrl) return null;
    const entry = getCacheEntry(dataUrl);
    return entry.loaded && !entry.failed ? entry.img : null;
  }, [dataUrl]);

  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

/**
 * Async variant for the PDF export: resolves with the decoded image, or null
 * on failure (the export then skips the logo instead of aborting).
 */
export function loadMoldDocLogoImage(
  dataUrl: string
): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const entry = getCacheEntry(dataUrl);
    if (entry.loaded) return resolve(entry.img);
    if (entry.failed) return resolve(null);
    entry.waiters.push(() => resolve(entry.failed ? null : entry.img));
  });
}
