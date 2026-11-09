import { promises as fs } from "node:fs";
import path from "node:path";
import { evaluate, warningsFor } from "./checklists.js";
import { workdir } from "./project.js";
import type { Goal, Manifest, Right, Source } from "./types.js";

const STATE_MARK = { ready: "READY", review: "REVIEW", blocked: "BLOCKED", missing: "MISSING" } as const;
export const DISCLAIMER =
  "Prepared with StoryBroker from the documents in this folder. This is an organizing tool, not legal advice and not a title opinion. Have an entertainment attorney review every finding before you rely on it.";

const esc = (s = "") => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
const src = (s: Source[], m: Manifest) =>
  s.map((x) => {
    const d = m.documents.find((d) => d.id === x.doc);
    return `${x.doc}${d ? ` (${d.path})` : ""}${x.location ? `, ${x.location}` : ""}${x.quote ? `: "${x.quote}"` : ""}`;
  }).join("; ");

export function rightsMapMarkdown(m: Manifest, goal?: Goal) {
  const lines: string[] = [`# Rights map: ${m.project.name}`, ""];
  const cats = [...new Set(m.rights.map((r) => r.category))];
  if (!m.rights.length) lines.push("_No rights recorded yet. Read the documents and call record_findings._", "");
  for (const c of cats) {
    lines.push(`## ${c.replace(/_/g, " ")}`, "", "| ID | Item | Holder | Status | Media / territory / term | Warnings | Source |", "|---|---|---|---|---|---|---|");
    for (const r of m.rights.filter((r) => r.category === c)) {
      const mtt = [r.media, r.territory, r.term ?? (r.expires ? `until ${r.expires}` : "")].filter(Boolean).join(" · ");
      lines.push(`| ${r.id} | ${esc(r.item)} | ${esc(r.holder)} | ${r.status.toUpperCase()} | ${esc(mtt)} | ${esc(warningsFor(r, goal).join(" "))} | ${esc(src(r.sources, m))} |`);
    }
    lines.push("");
  }
  if (m.assets.length) {
    lines.push("## Assets", "", "| ID | Kind | Description | Format / resolution | Location | Holder | Status |", "|---|---|---|---|---|---|---|");
    for (const a of m.assets) lines.push(`| ${a.id} | ${esc(a.kind)} | ${esc(a.description)} | ${esc([a.format, a.resolution].filter(Boolean).join(" · "))} | ${esc(a.location)} | ${esc(a.holder)} | ${a.status.toUpperCase()} |`);
    lines.push("");
  }
  if (m.parties.length) {
    lines.push("## Parties", "", "| ID | Name | Role | Contact | Notes |", "|---|---|---|---|---|");
    for (const p of m.parties) lines.push(`| ${p.id} | ${esc(p.name)} | ${esc(p.role)} | ${esc(p.contact)} | ${esc(p.notes)} |`);
    lines.push("");
  }
  const open = m.questions.filter((q) => q.status === "open");
  if (open.length) {
    lines.push("## Open questions", "");
    for (const q of open) lines.push(`- **${q.id}**${q.blocking ? " (blocking)" : ""}: ${q.question}${q.askWho ? ` Ask: ${q.askWho}.` : ""}`);
    lines.push("");
  }
  return lines.join("\n");
}

export function readinessMarkdown(m: Manifest, goal: Goal) {
  const r = evaluate(m, goal);
  const lines = [
    `# ${r.title}`,
    "",
    `**${r.verdict}.** ${r.tally.ready} ready · ${r.tally.review} to review · ${r.tally.blocked} blocked · ${r.tally.missing} missing · ${r.blockingQuestions} blocking questions`,
    "",
    "| | Item | Status | Linked |",
    "|---|---|---|---|",
    ...r.results.map((x) => `| ${STATE_MARK[x.state]} | **${x.label}**<br>${esc(x.why)} | ${esc(x.detail)} | ${[...x.rights, ...x.assets, ...x.questions].join(", ")} |`),
    "",
  ];
  return { markdown: lines.join("\n"), result: r };
}

function nextSteps(m: Manifest, goal: Goal) {
  const r = evaluate(m, goal);
  const steps: string[] = [];
  for (const x of r.results.filter((x) => x.state === "blocked")) steps.push(`Resolve **${x.label}**: ${x.detail}.`);
  for (const x of r.results.filter((x) => x.state === "missing")) steps.push(`Find documents for **${x.label}**. ${x.why}`);
  for (const q of m.questions.filter((q) => q.status === "open" && q.blocking)) steps.push(`Answer ${q.id}: ${q.question}${q.askWho ? ` (ask ${q.askWho})` : ""}`);
  return steps;
}

export async function exportPackage(root: string, m: Manifest, goal: Goal) {
  const out = path.join(workdir(root), "out");
  await fs.mkdir(out, { recursive: true });
  const { markdown: readiness, result } = readinessMarkdown(m, goal);
  const steps = nextSteps(m, goal);

  const report = [
    `# ${m.project.name}: rights and readiness report`,
    "",
    `_Generated ${new Date().toISOString().slice(0, 10)} · goal: ${goal} · ${m.documents.length} documents reviewed_`,
    "",
    `> ${DISCLAIMER}`,
    "",
    m.project.brief ? `## Brief\n\n${m.project.brief.trim()}\n` : "",
    "## Summary",
    "",
    `**${result.verdict}.** ${result.tally.ready} of ${result.results.length} checklist items are ready.`,
    "",
    steps.length ? "### What to do next\n\n" + steps.map((s, i) => `${i + 1}. ${s}`).join("\n") + "\n" : "",
    readiness.replace(/^# /, "## "),
    rightsMapMarkdown(m, goal).replace(/^# .*\n/, "").replace(/^## /gm, "### ").replace(/^/, "## Rights map\n"),
    "## Documents reviewed",
    "",
    "| ID | Path | Category | Read |",
    "|---|---|---|---|",
    ...m.documents.map((d) => `| ${d.id} | ${esc(d.path)} | ${d.category} | ${d.status === "text" ? "yes" : esc(d.note ?? d.status)} |`),
    "",
  ].join("\n");

  const byWho = new Map<string, string[]>();
  for (const q of m.questions.filter((q) => q.status === "open")) {
    const k = q.askWho ?? "Unassigned";
    byWho.set(k, [...(byWho.get(k) ?? []), `- [ ] ${q.blocking ? "**Blocking.** " : ""}${q.question} _(${q.id})_`]);
  }
  const questions = [`# Open questions: ${m.project.name}`, "", ...[...byWho].flatMap(([who, qs]) => [`## ${who}`, "", ...qs, ""])].join("\n");

  const csv = ["id,path,category,status,bytes", ...m.documents.map((d) => [d.id, JSON.stringify(d.path), d.category, d.status, d.bytes].join(","))].join("\n");

  const manifest = { ...m, readiness: { goal, verdict: result.verdict, tally: result.tally, items: result.results }, disclaimer: DISCLAIMER };

  const files: Record<string, string> = {
    "RIGHTS_REPORT.md": report,
    "OPEN_QUESTIONS.md": questions,
    "DOCUMENT_INDEX.csv": csv,
    "rights-manifest.json": JSON.stringify(manifest, null, 2),
  };
  for (const [name, body] of Object.entries(files)) await fs.writeFile(path.join(out, name), body);
  return { dir: out, files: Object.keys(files), verdict: result.verdict, steps };
}

export function summarizeRight(r: Right) {
  return `${r.id} [${r.category}] ${r.item} → ${r.status}`;
}
