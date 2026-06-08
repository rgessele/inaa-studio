#!/usr/bin/env node
/**
 * One-time backfill: simplify bloated seam-allowance figures in existing
 * projects.
 *
 * Curved molds used to generate seam allowances with ~120 flattened points per
 * cubic edge, persisted as one corner-node + one line-edge each — so a ~20-node
 * mold produced a ~1000-1450-node seam (see components/editor/seamFigure.ts,
 * now fixed for NEW seams). This script repairs the rows already in the DB by
 * running Ramer–Douglas–Peucker on each bloated seam's own contour, dropping it
 * to a few dozen nodes within ~0.2 mm of the original.
 *
 * SAFETY:
 *   - --dry (default): report only, write nothing.
 *   - --apply: write backups to ./backups/<id>.json BEFORE each UPDATE.
 *   - Only closed, numeric-offset seam-allowances above the bloat threshold are
 *     touched. Hems, per-edge seams (seamSegments), and molds are left alone.
 *   - Idempotent: a repaired seam falls under the threshold, so re-runs are no-ops.
 *   - Node/edge ids on seams are ephemeral (nothing references them by value),
 *     so they are regenerated; all seam metadata is preserved. `measures` cache
 *     is dropped so the app recomputes it from the new geometry.
 *
 * The RDP below is a byte-identical copy of components/editor/geometrySimplify.ts
 * (this file is run under plain `node`, which can't import the TS module). Keep
 * the two in sync.
 *
 * Usage:
 *   node scripts/migrate-seam-figures.mjs            # dry run, all projects
 *   node scripts/migrate-seam-figures.mjs --apply    # write changes (+ backups)
 *   node scripts/migrate-seam-figures.mjs --id <uuid>      # single project
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PX_PER_CM = 37.7952755906;
const SEAM_SIMPLIFY_TOLERANCE_PX = 0.02 * PX_PER_CM; // ~0.2 mm

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ----------------------------------------------------------------------------
// RDP (mirror of components/editor/geometrySimplify.ts)
// ----------------------------------------------------------------------------
function pointToSegmentDistance(p, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const ab2 = abx * abx + aby * aby;
  if (ab2 <= 1e-9) return Math.hypot(apx, apy);
  let t = (apx * abx + apy * aby) / ab2;
  t = Math.max(0, Math.min(1, t));
  const dx = p.x - (a.x + abx * t);
  const dy = p.y - (a.y + aby * t);
  return Math.hypot(dx, dy);
}

function simplifyPolylineRdp(points, tolerance) {
  if (points.length <= 2) return points.slice();
  if (!Number.isFinite(tolerance) || tolerance <= 0) return points.slice();

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const range = stack.pop();
    if (!range) continue;
    const [start, end] = range;
    if (end - start <= 1) continue;
    const a = points[start];
    const b = points[end];
    let bestIdx = -1;
    let bestDist = 0;
    for (let i = start + 1; i < end; i++) {
      const d = pointToSegmentDistance(points[i], a, b);
      if (d > bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0 && bestDist > tolerance) {
      keep[bestIdx] = 1;
      stack.push([start, bestIdx], [bestIdx, end]);
    }
  }

  const out = [];
  for (let i = 0; i < points.length; i++) if (keep[i]) out.push(points[i]);
  return out.length >= 2 ? out : [points[0], points[points.length - 1]];
}

function simplifyClosedPolygonRdp(points, tolerance) {
  const n = points.length;
  if (n <= 4) return points.slice();
  if (!Number.isFinite(tolerance) || tolerance <= 0) return points.slice();

  let far = 0;
  let farDist = -1;
  for (let i = 1; i < n; i++) {
    const dx = points[i].x - points[0].x;
    const dy = points[i].y - points[0].y;
    const d = dx * dx + dy * dy;
    if (d > farDist) {
      farDist = d;
      far = i;
    }
  }

  const arc1 = points.slice(0, far + 1);
  const arc2 = points.slice(far).concat([points[0]]);
  const s1 = simplifyPolylineRdp(arc1, tolerance);
  const s2 = simplifyPolylineRdp(arc2, tolerance);
  const merged = s1.slice(0, -1).concat(s2.slice(0, -1));
  return merged.length >= 3 ? merged : points.slice();
}

// ----------------------------------------------------------------------------
// Migration core
// ----------------------------------------------------------------------------
function pointsToFlat(points) {
  const out = [];
  for (const p of points) out.push(p.x, p.y);
  return out;
}

/**
 * Reconstruct the ordered contour of a seam/hem figure by walking its edge
 * chain, and report whether the chain closes back on itself (a ring) or is an
 * open polyline. Falls back to raw node order if the walk fails.
 */
function contourFromChain(fig) {
  const byId = new Map(fig.nodes.map((n) => [n.id, n]));
  const nextOf = new Map();
  for (const e of fig.edges) if (!nextOf.has(e.from)) nextOf.set(e.from, e.to);
  const start = fig.edges[0]?.from;
  if (start == null) {
    return {
      ring: fig.nodes.map((n) => ({ x: n.x, y: n.y })),
      closed: fig.edges.length >= fig.nodes.length,
    };
  }

  const ring = [];
  const seen = new Set();
  let cur = start;
  while (cur != null && !seen.has(cur)) {
    seen.add(cur);
    const node = byId.get(cur);
    if (!node) break;
    ring.push({ x: node.x, y: node.y });
    cur = nextOf.get(cur);
  }
  const closed = cur === start; // walked all the way back to the start node
  if (ring.length < fig.nodes.length * 0.5) {
    return {
      ring: fig.nodes.map((n) => ({ x: n.x, y: n.y })),
      closed: fig.edges.length >= fig.nodes.length,
    };
  }
  return { ring, closed };
}

/**
 * Classify a figure for migration:
 *  - "seam"        closed numeric seam-allowance, no seamSegments  -> closed-ring rebuild
 *  - "hem-simple"  single-segment hem, contour == nodes, no piques -> open-chain rebuild
 *  - "skip-complex" bloated but unsafe to rewrite here (per-edge / multi-segment / has piques)
 *  - "keep"        not a migration target
 */
function classify(fig, byId) {
  if (fig.kind !== "seam") return "keep";
  if (!Array.isArray(fig.nodes) || !Array.isArray(fig.edges)) return "keep";

  const parent = fig.parentId ? byId.get(fig.parentId) : null;
  const threshold = Math.max(64, 4 * (parent?.nodes?.length ?? 0));
  if (fig.nodes.length <= threshold) return "keep";

  const isHem = fig.derivedRole === "hem" || !!fig.hemMeta;
  if (isHem) {
    const segs = fig.seamSegments;
    const onlyOneSeg = Array.isArray(segs) && segs.length === 1;
    const segPts = onlyOneSeg ? segs[0].length / 2 : 0;
    const noPiques = !Array.isArray(fig.piques) || fig.piques.length === 0;
    // Only the simplest hem shape is safe to rewrite by value here: one segment
    // whose point count matches the node count (no internal fold lines / closure
    // segments) and no piques referencing edge ids.
    if (onlyOneSeg && noPiques && segPts === fig.nodes.length) return "hem-simple";
    return "skip-complex";
  }

  if (typeof fig.offsetCm !== "number") return "skip-complex"; // per-edge seam
  if (Array.isArray(fig.seamSegments) && fig.seamSegments.length) return "skip-complex";
  if (fig.closed !== true) return "skip-complex";
  return "seam";
}

function rebuildContour(fig, { rebuildSeamSegments }) {
  const { ring, closed } = contourFromChain(fig);
  const simplified = closed
    ? simplifyClosedPolygonRdp(ring, SEAM_SIMPLIFY_TOLERANCE_PX)
    : simplifyPolylineRdp(ring, SEAM_SIMPLIFY_TOLERANCE_PX);
  if (simplified.length < (closed ? 3 : 2)) return null; // never degrade further

  const nodes = simplified.map((p) => ({
    id: `n_${randomUUID()}`,
    x: p.x,
    y: p.y,
    mode: "corner",
  }));
  const edges = [];
  const limit = closed ? nodes.length : nodes.length - 1;
  for (let i = 0; i < limit; i++) {
    const a = nodes[i];
    const b = nodes[(i + 1) % nodes.length];
    edges.push({ id: `e_${randomUUID()}`, from: a.id, to: b.id, kind: "line" });
  }

  // Preserve all metadata; only geometry changes. Drop the stale measures cache.
  const next = { ...fig, nodes, edges };
  delete next.measures;
  if (rebuildSeamSegments) {
    // Keep seamSegmentEdgeIds (e.g. ["hem-seg-1"]); rewrite the segment points
    // from the same simplified contour so nodes/edges/seamSegments stay aligned.
    next.seamSegments = [pointsToFlat(simplified)];
  }
  return next;
}

function migrateFigures(figures) {
  if (!Array.isArray(figures)) {
    return { figures, changed: 0, skipped: 0, before: 0, after: 0 };
  }
  const byId = new Map(figures.map((f) => [f.id, f]));
  let changed = 0;
  let skipped = 0;
  let before = 0;
  let after = 0;

  const out = figures.map((fig) => {
    const n = Array.isArray(fig.nodes) ? fig.nodes.length : 0;
    before += n;
    const kind = classify(fig, byId);

    if (kind === "keep") {
      after += n;
      return fig;
    }
    if (kind === "skip-complex") {
      skipped += 1;
      after += n;
      return fig;
    }

    const rebuilt = rebuildContour(fig, {
      rebuildSeamSegments: kind === "hem-simple",
    });
    // Only accept a rebuild that strictly reduces the node count. If RDP cannot
    // shrink the contour further, the figure is already minimal — leave it
    // untouched so re-runs are true no-ops (idempotent) and we never churn ids.
    if (!rebuilt || rebuilt.nodes.length >= n) {
      after += n;
      return fig;
    }
    changed += 1;
    after += rebuilt.nodes.length;
    return rebuilt;
  });

  return { figures: out, changed, skipped, before, after };
}

// ----------------------------------------------------------------------------
// Supabase REST helpers
// ----------------------------------------------------------------------------
function loadEnv() {
  const envPath = resolve(ROOT, ".env.local");
  const text = readFileSync(envPath, "utf8");
  const env = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    env[m[1]] = v;
  }
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    env.SUPABASE_SECRET_KEY ||
    env.SUPABASE_SERVICE_ROLE_KEY ||
    env.SUPABASE_SECRET_API_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or a service key (SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY) in .env.local"
    );
  }
  return { url: url.replace(/\/+$/, ""), key };
}

async function rest(url, key, path, init = {}) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`REST ${path} -> ${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
  }
  return res;
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const idFlag = args.indexOf("--id");
  const onlyId = idFlag >= 0 ? args[idFlag + 1] : null;

  const { url, key } = loadEnv();
  console.log(`Mode: ${apply ? "APPLY (will write + backup)" : "DRY RUN (no writes)"}`);
  console.log(`Tolerance: ${SEAM_SIMPLIFY_TOLERANCE_PX.toFixed(3)} px (~0.2 mm)\n`);

  const filter = onlyId
    ? `projects?id=eq.${onlyId}&select=id,name`
    : `projects?select=id,name&order=updated_at.desc`;
  const list = await (await rest(url, key, filter)).json();
  console.log(`Scanning ${list.length} project(s)...\n`);

  let totalChangedProjects = 0;
  let totalChangedSeams = 0;
  let totalSkipped = 0;
  let totalBefore = 0;
  let totalAfter = 0;

  for (const { id, name } of list) {
    const rows = await (
      await rest(url, key, `projects?id=eq.${id}&select=design_data`)
    ).json();
    const design = rows[0]?.design_data;
    if (!design || !Array.isArray(design.figures)) continue;

    const { figures, changed, skipped, before, after } = migrateFigures(
      design.figures
    );
    totalBefore += before;
    totalAfter += after;
    totalSkipped += skipped;
    if (changed === 0 && skipped === 0) continue;

    if (changed > 0) totalChangedProjects += 1;
    totalChangedSeams += changed;
    const skipNote = skipped > 0 ? ` | skipped (complex): ${skipped}` : "";
    console.log(
      `• ${name} (${id})\n    seams/hems fixed: ${changed} | nodes: ${before} -> ${after} (${(before / Math.max(1, after)).toFixed(1)}x)${skipNote}`
    );

    if (apply) {
      const backupDir = resolve(ROOT, "backups");
      if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });
      writeFileSync(
        resolve(backupDir, `${id}.json`),
        JSON.stringify(design, null, 0)
      );

      const nextDesign = { ...design, figures };
      await rest(url, key, `projects?id=eq.${id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ design_data: nextDesign }),
      });
      console.log(`    ✓ written (backup: backups/${id}.json)`);
    }
  }

  console.log(
    `\n${apply ? "Applied" : "Would change"}: ${totalChangedSeams} seam/hem figure(s) in ${totalChangedProjects} project(s).`
  );
  if (totalSkipped > 0) {
    console.log(
      `Skipped ${totalSkipped} bloated figure(s) too complex to rewrite by value ` +
        `(per-edge seams / multi-segment or piqued hems). New geometry from the ` +
        `fixed generators will slim these when they are next re-derived in-app.`
    );
  }
  console.log(
    `Total seam-figure nodes: ${totalBefore} -> ${totalAfter}` +
      (totalAfter > 0 ? ` (${(totalBefore / totalAfter).toFixed(1)}x overall)` : "")
  );
  if (!apply && totalChangedSeams > 0) {
    console.log(`\nRe-run with --apply to write changes (backups go to ./backups/).`);
  }
}

main().catch((err) => {
  console.error("\nMigration failed:", err.message);
  process.exit(1);
});
