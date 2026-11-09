import { createHash } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import type { Doc, DocCategory, Manifest } from "./types.js";

export const WORKDIR = ".storybroker";
const SKIP_DIRS = new Set([WORKDIR, ".git", "node_modules", ".DS_Store", "__MACOSX"]);
const MAX_FILES = 2000;
const MAX_TEXT_BYTES = 40 * 1024 * 1024;

const TEXT_EXT = new Set([".txt", ".md", ".markdown", ".csv", ".tsv", ".json", ".eml", ".fountain", ".fdx", ".html", ".htm", ".rtf", ".xml", ".yaml", ".yml"]);
const MEDIA_EXT = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".tif", ".tiff", ".psd", ".mov", ".mp4", ".mxf", ".wav", ".aif", ".aiff", ".mp3", ".m4a", ".dpx", ".exr", ".r3d", ".braw"]);

// Ordered: first match wins. Matched against the lowercased relative path, then the opening text.
const RULES: [DocCategory, RegExp][] = [
  ["chain_of_title", /chain[\s_-]*of[\s_-]*title|copyright[\s_-]*(registration|certificate|office)|\bpa[\s_-]?\d{6,}|asset[\s_-]*purchase|bankruptcy|quitclaim|assignment[\s_-]*of[\s_-]*(rights|copyright)/],
  ["music", /\bmusic\b|\bsong|cue[\s_-]*sheet|\bsync|master[\s_-]*use|composer|\bscore\b|soundtrack|publish(er|ing)|\bascap\b|\bbmi\b/],
  ["talent", /\bactor|\btalent|\bcast\b|sag[\s_-]*aftra|\bsag\b|\bvoice\b|performer|loan[\s_-]*out|director[\s_-]*agreement|crew[\s_-]*deal/],
  ["distribution", /distribut|sales[\s_-]*agen|\bterritor|licens(e|ing)[\s_-]*(term|window)|\bsvod\b|\bavod\b|streaming[\s_-]*deal|output[\s_-]*deal/],
  ["delivery", /deliverabl|delivery|lab[\s_-]*access|\bdcp\b|\bmasters?\b|\bnegative|e[\s_&-]*o\b|errors[\s_-]*and[\s_-]*omissions|insurance|\bqc\b|title[\s_-]*report/],
  ["finance", /budget|financ|waterfall|collection[\s_-]*account|recoup|investor|loan[\s_-]*agreement|security[\s_-]*interest|\blien/],
  ["contract", /agreement|contract|deal[\s_-]*memo|\boption\b|\brelease\b|consent|amendment|termination|settlement|license/],
  ["creative", /script|screenplay|\bbible\b|treatment|outline|\bdraft\b|storyboard|pitch|lookbook|\bdeck\b/],
  ["correspondence", /\beml$|\bemail|letter|correspondence|\bmemo\b|call[\s_-]*notes/],
  ["notes", /\bnotes?\b|question|\bbrief\b|\btodo\b|readme/],
];

export function classify(relPath: string, head: string): DocCategory {
  const ext = path.extname(relPath).toLowerCase();
  if (MEDIA_EXT.has(ext)) return "media";
  // Underscores, dashes and dots count as word breaks so "voice_agreement" matches \bvoice\b.
  const p = relPath.toLowerCase().replace(/[_.\-]+/g, " ");
  for (const [cat, re] of RULES) if (re.test(p)) return cat;
  const h = head.slice(0, 4000).toLowerCase();
  for (const [cat, re] of RULES) if (re.test(h)) return cat;
  return "other";
}

async function walk(root: string, rel = "", out: string[] = []): Promise<string[]> {
  const entries = await fs.readdir(path.join(root, rel), { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name) || e.name.startsWith("~$")) continue;
    const r = path.join(rel, e.name);
    if (e.isDirectory()) await walk(root, r, out);
    else if (e.isFile() && !e.name.startsWith(".")) out.push(r);
    if (out.length >= MAX_FILES) break;
  }
  return out;
}

function stripHtml(s: string) {
  return s.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/[ \t]+/g, " ");
}
function stripRtf(s: string) {
  return s.replace(/\\par[d]?/g, "\n").replace(/\{\\\*[^}]*\}/g, "").replace(/\\[a-z]+-?\d* ?/gi, "").replace(/[{}]/g, "");
}

export async function extractText(abs: string, ext: string): Promise<{ text: string; status: Doc["status"]; note?: string }> {
  try {
    const stat = await fs.stat(abs);
    if (stat.size > MAX_TEXT_BYTES) return { text: "", status: "unsupported", note: "File too large to read." };
    if (TEXT_EXT.has(ext)) {
      let t = await fs.readFile(abs, "utf8");
      if (ext === ".html" || ext === ".htm" || ext === ".fdx" || ext === ".xml") t = stripHtml(t);
      if (ext === ".rtf") t = stripRtf(t);
      return { text: t, status: t.trim() ? "text" : "no_text" };
    }
    if (ext === ".pdf") {
      const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(await fs.readFile(abs)));
      const { text } = await pdfText(pdf, { mergePages: false });
      const pages = (text as string[]).map((p, i) => `\n[page ${i + 1}]\n${p}`).join("\n");
      if (!pages.replace(/\[page \d+\]/g, "").trim()) return { text: "", status: "no_text", note: "PDF has no text layer. It is probably a scan and needs OCR." };
      return { text: pages, status: "text" };
    }
    if (ext === ".docx") {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.extractRawText({ path: abs });
      return { text: value, status: value.trim() ? "text" : "no_text" };
    }
    if (MEDIA_EXT.has(ext)) return { text: "", status: "unsupported", note: "Media file. Listed as an asset candidate, not read." };
    return { text: "", status: "unsupported", note: `No reader for ${ext || "files without an extension"}.` };
  } catch (err) {
    return { text: "", status: "error", note: (err as Error).message };
  }
}

export function workdir(root: string) {
  return path.join(root, WORKDIR);
}
function manifestPath(root: string) {
  return path.join(workdir(root), "manifest.json");
}
const DOC_ID = /^D\d{3,6}$/;
function textPath(root: string, id: string) {
  if (!DOC_ID.test(id)) throw new Error(`Invalid document id: ${id}`);
  return path.join(workdir(root), "text", `${id}.txt`);
}

/** A relative path that stays inside the project root. */
function safeRel(root: string, rel: unknown): rel is string {
  if (typeof rel !== "string" || !rel || path.isAbsolute(rel)) return false;
  const abs = path.resolve(root, rel);
  return abs.startsWith(root + path.sep);
}

function hashFile(abs: string): Promise<string> {
  return new Promise((resolve) => {
    const h = createHash("sha1");
    createReadStream(abs)
      .on("data", (c) => h.update(c))
      .on("end", () => resolve(h.digest("hex")))
      .on("error", () => resolve(""));
  });
}

export async function resolveRoot(p: string): Promise<string> {
  const abs = path.resolve(p.replace(/^~(?=$|\/)/, process.env.HOME ?? "~"));
  const st = await fs.stat(abs).catch(() => null);
  if (!st || !st.isDirectory()) throw new Error(`Not a folder: ${abs}`);
  return abs;
}

export async function loadManifest(root: string): Promise<Manifest | null> {
  let m: Manifest;
  try {
    m = JSON.parse(await fs.readFile(manifestPath(root), "utf8")) as Manifest;
  } catch {
    return null;
  }
  // The workspace lives inside a folder someone else may have prepared. Drop any document entry
  // whose id or path could point outside the project, so a crafted manifest can't read or write elsewhere.
  if (!m || typeof m !== "object" || !Array.isArray(m.documents)) return null;
  m.documents = m.documents.filter((d) => d && DOC_ID.test(d.id) && safeRel(root, d.path));
  for (const k of ["parties", "rights", "assets", "questions"] as const) if (!Array.isArray(m[k])) (m[k] as unknown[]) = [];
  return m;
}

export async function saveManifest(root: string, m: Manifest) {
  m.project.updatedAt = new Date().toISOString();
  await fs.mkdir(workdir(root), { recursive: true });
  await fs.writeFile(manifestPath(root), JSON.stringify(m, null, 2));
}

export async function requireManifest(root: string): Promise<Manifest> {
  const m = await loadManifest(root);
  if (!m) throw new Error(`No StoryBroker workspace in ${root}. Run open_project on this folder first.`);
  return m;
}

/** Scan the folder. Keeps existing findings; re-indexes documents, keeping ids stable by path. */
export async function openProject(root: string, opts: { name?: string; goal?: Manifest["project"]["goal"]; brief?: string }) {
  const now = new Date().toISOString();
  const prev = await loadManifest(root);
  const m: Manifest = prev ?? {
    schema: "storybroker.manifest/0.1",
    project: { name: opts.name ?? path.basename(root), openedAt: now, updatedAt: now },
    documents: [],
    parties: [],
    rights: [],
    assets: [],
    questions: [],
  };
  if (opts.name) m.project.name = opts.name;
  if (opts.goal) m.project.goal = opts.goal;
  if (opts.brief) m.project.brief = opts.brief;

  const byPath = new Map(prev?.documents.map((d) => [d.path, d]) ?? []);
  let next = Math.max(0, ...(prev?.documents.map((d) => Number(d.id.slice(1))) ?? [0])) + 1;
  const files = await walk(root);
  await fs.mkdir(path.join(workdir(root), "text"), { recursive: true });

  const docs: Doc[] = [];
  let changed = 0;
  for (const rel of files) {
    const abs = path.join(root, rel);
    const st = await fs.stat(abs).catch(() => null);
    const sha1 = st ? await hashFile(abs) : "";
    const old = byPath.get(rel);
    if (old && old.sha1 === sha1) {
      docs.push(old);
      continue;
    }
    changed++;
    const ext = path.extname(rel).toLowerCase();
    const id = old?.id ?? `D${String(next++).padStart(3, "0")}`;
    const { text, status, note } = await extractText(abs, ext);
    if (text) await fs.writeFile(textPath(root, id), text);
    docs.push({ id, path: rel, category: classify(rel, text), ext, bytes: st?.size ?? 0, sha1, chars: text.length, status, note });
  }
  m.documents = docs;

  // Pick up a brief file if none was given.
  if (!m.project.brief) {
    const brief = docs.find((d) => /(^|\/)(brief|readme)[^/]*\.(md|txt)$/i.test(d.path) && d.status === "text");
    if (brief) m.project.brief = (await readDocText(root, brief.id)).replace(/<!--[\s\S]*?-->/g, "").trim().slice(0, 4000);
  }
  await saveManifest(root, m);
  return { manifest: m, total: files.length, changed, truncated: files.length >= MAX_FILES };
}

export async function readDocText(root: string, id: string): Promise<string> {
  if (!DOC_ID.test(id)) return "";
  return fs.readFile(textPath(root, id), "utf8").catch(() => "");
}

export function findDoc(m: Manifest, ref: string) {
  const r = ref.trim();
  return m.documents.find((d) => d.id.toLowerCase() === r.toLowerCase() || d.path === r) ?? m.documents.find((d) => d.path.endsWith(r));
}

export async function searchDocs(root: string, m: Manifest, query: string, opts: { category?: string; maxHits?: number; context?: number }) {
  const maxHits = opts.maxHits ?? 40;
  const ctx = opts.context ?? 1;
  const terms = query.split("|").map((t) => t.trim()).filter(Boolean);
  const re = new RegExp(terms.map((t) => t.replace(/[.*+?^${}()[\]\\]/g, "\\$&")).join("|"), "i");
  const hits: { doc: string; path: string; line: number; text: string }[] = [];
  for (const d of m.documents) {
    if (opts.category && d.category !== opts.category) continue;
    if (d.status !== "text") continue;
    const lines = (await readDocText(root, d.id)).split("\n");
    for (let i = 0; i < lines.length && hits.length < maxHits; i++) {
      if (re.test(lines[i])) {
        const from = Math.max(0, i - ctx);
        const to = Math.min(lines.length, i + ctx + 1);
        hits.push({ doc: d.id, path: d.path, line: i + 1, text: lines.slice(from, to).join("\n") });
      }
    }
    if (hits.length >= maxHits) break;
  }
  return hits;
}
