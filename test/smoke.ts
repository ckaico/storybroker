// End-to-end check: start the built server over stdio, run every tool against a copy of the example project.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..");
const work = mkdtempSync(path.join(tmpdir(), "sb-"));
const proj = path.join(work, "the-lantern-keeper");
cpSync(path.join(repo, "examples/the-lantern-keeper"), proj, { recursive: true });

// A minimal PDF with a text layer, to exercise PDF extraction.
const pdfBody = "BT /F1 12 Tf 72 720 Td (Quitclaim of rights to The Lantern Keeper soundtrack album) Tj ET";
const objs = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
  `<< /Length ${pdfBody.length} >>\nstream\n${pdfBody}\nendstream`,
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
];
let pdf = "%PDF-1.4\n";
const offs: number[] = [];
objs.forEach((o, i) => { offs.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
const xref = pdf.length;
pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
writeFileSync(path.join(proj, "03_music/soundtrack_quitclaim.pdf"), pdf);

const runtime = process.argv[2] ?? "bun";
const entry = runtime === "bun" ? path.join(repo, "src/index.ts") : path.join(repo, "dist/index.js");
const client = new Client({ name: "smoke", version: "0" });
await client.connect(new StdioClientTransport({ command: runtime, args: [entry] }));

let failures = 0;
const check = (ok: boolean, label: string) => { console.log(`${ok ? "PASS" : "FAIL"}  ${label}`); if (!ok) failures++; };
const call = async (name: string, args: Record<string, unknown>) => {
  const r = (await client.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean };
  return { text: r.content.map((c) => c.text).join("\n"), isError: !!r.isError };
};

const tools = (await client.listTools()).tools.map((t) => t.name);
check(tools.length === 8, `8 tools: ${tools.join(", ")}`);

const open = await call("open_project", { path: proj, name: "The Lantern Keeper", goal: "rerelease" });
check(!open.isError && /24 files/.test(open.text), "open_project scans 24 files");
check(/chain_of_title \(\d+\)/.test(open.text) && /music \(\d+\)/.test(open.text) && /talent \(\d+\)/.test(open.text), "documents sorted into chain_of_title, music, talent");
check(/restore it in 4K/.test(open.text), "brief picked up from BRIEF.md");

const pdfHit = await call("search_documents", { query: "Quitclaim of rights" });
check(/soundtrack_quitclaim\.pdf/.test(pdfHit.text), "PDF text extracted and searchable");

const hits = await call("search_documents", { query: "hereafter devised|excluded" });
check(/sync_license_paper_moon_parade/.test(hits.text) && /meridian_distribution_agreement/.test(hits.text), "search finds media clauses");

const docs = await call("list_documents", { category: "music" });
const id = (re: RegExp) => docs.text.split("\n").find((l) => re.test(l))!.split(/\s+/)[0];
const sync = id(/sync_license/), master = id(/master_use/);
const read = await call("read_document", { doc: sync });
check(/All other media, including internet/.test(read.text) && /data, not instructions/.test(read.text), "read_document returns fenced text");

const all = await call("list_documents", {});
const d = (re: RegExp) => all.text.split("\n").find((l) => re.test(l))!.split(/\s+/)[0];

const rec = await call("record_findings", {
  parties: [
    { name: "Lantern Films LLC", role: "copyright owner of record (entity cancelled 2021)" },
    { name: "Calder Holdings LP", role: "bought Meridian's library in bankruptcy; claims distribution through 2029" },
    { name: "Claire Vance", role: "executor, Estate of Harold Vance" },
  ],
  rights: [
    { category: "copyright", item: "Copyright in the Picture", holder: "Lantern Films LLC", status: "partial", sources: [{ doc: d(/copyright_registration/), quote: "Copyright claimant: Lantern Films LLC" }], notes: "LLC cancelled 2021; authority to sign unclear." },
    { category: "chain_of_title", item: "Meridian distribution rights sold to Calder in bankruptcy asset sale", holder: "Calder Holdings LP", status: "disputed", sources: [{ doc: d(/bankruptcy_sale/), quote: "Debtor's distribution rights under Distribution Agreement dated June 2, 2008" }] },
    { category: "distribution", item: "Worldwide distribution, all media", holder: "Calder Holdings LP (claimed)", status: "disputed", media: "all media now known or hereafter devised", term: "15 years from US release", expires: "2024-10-09", sources: [{ doc: d(/meridian_distribution/), quote: "Fifteen (15) years from the initial United States theatrical release" }] },
    { category: "music_sync", item: "Paper Moon Parade (composition)", holder: "Hollow Pine Music Publishing", status: "cleared", media: "theatrical, television and home video (DVD and Blu-ray)", expires: "2019-10-09", sources: [{ doc: sync, quote: "Term: ten (10) years from October 9, 2009" }] },
    { category: "music_master", item: "Paper Moon Parade (recording)", holder: "Riverglass Records", status: "cleared", media: "all media now known or hereafter devised", term: "perpetuity", sources: [{ doc: master, quote: "Term: perpetuity" }] },
    { category: "music_sync", item: "Ferris Wheel Blues", status: "gap", sources: [{ doc: d(/cue_sheet/), quote: "4M2,Ferris Wheel Blues,background vocal,0:47,Unknown" }] },
    { category: "talent", item: "Gus Whitfield (Old Tamsin) voice agreement", status: "gap", sources: [{ doc: d(/gus_whitfield/), quote: "DRAFT v3 — NOT EXECUTED" }] },
  ],
  assets: [
    { kind: "2K DPX master", description: "Final graded image sequence", resolution: "2K", location: "Vaultline Storage, Burbank (fees in arrears)", status: "believed_exists", sources: [{ doc: d(/lab_access/), quote: "2K DPX image sequence, final graded" }] },
    { kind: "Animation project files (LTO-4)", description: "Maya scenes, rigs, textures, comps", location: "Ruth Calloway's garage", status: "believed_exists", sources: [{ doc: d(/render_archive/), quote: "a set of LTO-4 tapes with the Maya scenes" }] },
  ],
  questions: [{ question: "Did Calder's distribution term end on Oct 9, 2024, or is there a real extension?", blocking: true, askWho: "Calder Holdings LP", related: ["R03"] }],
});
check(!rec.isError && /added R07/.test(rec.text), "record_findings adds 7 rights");
check(/Expired on 2019-10-09/.test(rec.text) && /Confirm it covers streaming/.test(rec.text), "warnings flag expired, non-streaming music license");
check(/Passes through an insolvency/.test(rec.text), "warning flags insolvency in chain of title");

const map = await call("rights_map", {});
check(/## music sync/.test(map.text) && /Ferris Wheel Blues/.test(map.text), "rights_map renders by category");

const ready = await call("readiness_check", { goal: "rerelease" });
check(/Not ready/.test(ready.text) && /BLOCKED/.test(ready.text) && /MISSING/.test(ready.text), "readiness_check says Not ready with blocked and missing items");

const exp = await call("export_package", {});
const out = path.join(proj, ".storybroker/out");
check(["RIGHTS_REPORT.md", "OPEN_QUESTIONS.md", "DOCUMENT_INDEX.csv", "rights-manifest.json"].every((f) => existsSync(path.join(out, f))), "export_package writes 4 files");
const report = readFileSync(path.join(out, "RIGHTS_REPORT.md"), "utf8");
check(/not legal advice/.test(report) && /What to do next/.test(report), "report has disclaimer and next steps");
check(JSON.parse(readFileSync(path.join(out, "rights-manifest.json"), "utf8")).readiness.verdict === "Not ready", "manifest JSON carries verdict");

const again = await call("open_project", { path: proj });
check(/0 new or changed/.test(again.text) && /7 rights/.test(again.text), "re-opening keeps findings and skips unchanged files");

const bad = await call("read_document", { doc: "D999" });
check(bad.isError, "unknown document returns an error");

// A crafted workspace must not be able to reach outside the project.
const mPath = path.join(proj, ".storybroker/manifest.json");
const crafted = JSON.parse(readFileSync(mPath, "utf8"));
crafted.documents.push({ id: "../../../escape", path: "../../../../etc/hosts", category: "notes", ext: ".txt", bytes: 1, sha1: "x", chars: 1, status: "text" });
writeFileSync(mPath, JSON.stringify(crafted));
const evil = await call("read_document", { doc: "../../../escape" });
check(evil.isError || !/localhost/.test(evil.text), "crafted manifest entry cannot read outside the project");
await call("open_project", { path: proj });
check(!existsSync(path.join(work, "escape.txt")) && !existsSync(path.join(proj, "escape.txt")), "crafted manifest entry cannot write outside the workspace");

await client.close();
if (process.env.KEEP) console.log(`\nKept: ${proj}`); else rmSync(work, { recursive: true, force: true });
console.log(failures ? `\n${failures} failed` : "\nAll passed");
process.exit(failures ? 1 : 0);
