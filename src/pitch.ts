import { evaluate, type ItemState } from "./checklists.js";
import type { Goal, Manifest, Pitch } from "./types.js";

const OFFER_LABEL: Record<string, string> = {
  option: "Option",
  purchase: "Purchase",
  license: "License",
  distribution: "Distribution",
  rerelease_partner: "Re-release partner",
  co_production: "Co-production",
  financing: "Financing",
  collaboration: "Collaboration",
  other: "Offer",
};

/** What a buyer would notice is missing from the pitch. */
export function pitchGaps(p?: Pitch): string[] {
  if (!p) return ["No pitch recorded yet. Draft one with record_pitch."];
  const g: string[] = [];
  if (!p.logline || p.logline.split(/\s+/).length > 45) g.push("Logline missing or longer than about 45 words.");
  if (!p.synopsis) g.push("No synopsis.");
  if (!p.hook) g.push("No hook: the one line a buyer repeats in the room.");
  if (!p.comps?.length) g.push("No comparable titles.");
  if (!p.offer) g.push("No offer: say what is on the table (option, license, distribution…).");
  if (!p.contact) g.push("No contact line.");
  if (!p.approved) g.push("Not yet approved by the owner.");
  return g;
}

function rightsAtAGlance(m: Manifest, goal: Goal) {
  const r = evaluate(m, goal);
  const blockers = r.results.filter((x) => x.state === "blocked" || x.state === "missing").map((x) => x.label);
  const ready = r.results.filter((x) => x.state === "ready").map((x) => x.label);
  return { verdict: r.verdict, ready, blockers, items: r.results.map((x) => ({ label: x.label, state: x.state })) };
}

export function pitchMarkdown(m: Manifest, goal: Goal): string {
  const p = m.pitch;
  if (!p) return "";
  const rg = rightsAtAGlance(m, goal);
  const L: string[] = [`# ${p.title}`, "", `**${p.logline}**`, ""];
  const meta = [p.format, p.genre, p.status].filter(Boolean).join(" · ");
  if (meta) L.push(`_${meta}_`, "");
  if (p.hook) L.push(`> ${p.hook}`, "");
  if (p.synopsis) L.push("## The story", "", p.synopsis.trim(), "");
  if (p.whyNow) L.push("## Why now", "", p.whyNow.trim(), "");
  if (p.audience) L.push("## Audience", "", p.audience.trim(), "");
  if (p.comps?.length) L.push("## Comparable titles", "", ...p.comps.map((c) => `- **${c.title}**${c.year ? ` (${c.year})` : ""}: ${c.why}`), "");
  if (p.assets?.length) L.push("## What's available", "", ...p.assets.map((a) => `- ${a}`), "");
  if (p.team?.length) L.push("## Team", "", ...p.team.map((t) => `- ${t.name}, ${t.role}`), "");
  L.push(
    "## Rights at a glance",
    "",
    `**${rg.verdict}** for ${goal}.`,
    "",
    ...rg.items.map((x) => `- ${x.state === "ready" ? "✓" : x.state === "review" ? "~" : "✗"} ${x.label} (${x.state})`),
    "",
    "Full detail in RIGHTS_REPORT.md.",
    "",
  );
  if (p.offer) L.push("## The offer", "", `**${OFFER_LABEL[p.offer.type] ?? "Offer"}.** ${p.offer.summary}`, "");
  if (p.contact) L.push("## Contact", "", p.contact, "");
  L.push("---", "", "_Packaged with StoryBroker · www.story.broker. Rights information summarizes the documents provided and is not a title opinion._", "");
  return L.join("\n");
}

const h = (s = "") => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const paras = (s = "") => s.trim().split(/\n\s*\n/).map((x) => `<p>${h(x).replace(/\n/g, "<br>")}</p>`).join("");
const MARK: Record<ItemState, string> = { ready: "Ready", review: "Review", blocked: "Blocked", missing: "Missing" };

/** A self-contained one-page HTML pitch a buyer can open anywhere. No scripts, no external requests. */
export function pitchHtml(m: Manifest, goal: Goal): string {
  const p = m.pitch;
  if (!p) return "";
  const rg = rightsAtAGlance(m, goal);
  const meta = [p.format, p.genre, p.status].filter(Boolean).map(h).join(" · ");
  const sec = (title: string, body: string) => (body ? `<section><h2>${title}</h2>${body}</section>` : "");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>${h(p.title)}</title>
<style>
:root{--ink:#0b0b0c;--muted:#5c5f66;--line:#e6e6e8;--soft:#f6f6f7;--ok:#1f7a46;--warn:#b42318;--rev:#9a6700}
*{box-sizing:border-box}
body{margin:0;background:#fff;color:var(--ink);font:17px/1.6 "Helvetica Neue",Helvetica,Arial,sans-serif}
main{max-width:760px;margin:0 auto;padding:64px 24px 80px}
h1{font-size:clamp(36px,6vw,56px);line-height:1.02;letter-spacing:-.03em;margin:0 0 18px}
.logline{font-size:22px;line-height:1.4;margin:0 0 12px}
.meta{color:var(--muted);font-size:15px;margin:0 0 28px}
.hook{font-family:Georgia,serif;font-style:italic;font-size:24px;line-height:1.35;border-left:3px solid var(--ink);padding-left:20px;margin:0 0 40px}
section{border-top:1px solid var(--line);padding:24px 0}
h2{font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:0 0 10px}
p{margin:0 0 12px}
ul{margin:0;padding-left:20px}
li{margin:4px 0}
.rights{list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:6px 24px}
.rights li{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid var(--line);padding:6px 0;font-size:15px}
.s-ready{color:var(--ok);font-weight:600}.s-review{color:var(--rev);font-weight:600}.s-blocked,.s-missing{color:var(--warn);font-weight:600}
.verdict{font-weight:600}
.offer{background:var(--soft);border-radius:14px;padding:20px;border:0;margin-top:8px}
footer{color:var(--muted);font-size:13px;border-top:1px solid var(--line);padding-top:20px;margin-top:24px}
@media print{main{padding:24px}section{break-inside:avoid}}
</style>
</head>
<body>
<main>
<h1>${h(p.title)}</h1>
<p class="logline">${h(p.logline)}</p>
${meta ? `<p class="meta">${meta}</p>` : ""}
${p.hook ? `<p class="hook">${h(p.hook)}</p>` : ""}
${sec("The story", p.synopsis ? paras(p.synopsis) : "")}
${sec("Why now", p.whyNow ? paras(p.whyNow) : "")}
${sec("Audience", p.audience ? paras(p.audience) : "")}
${sec("Comparable titles", p.comps?.length ? `<ul>${p.comps.map((c) => `<li><strong>${h(c.title)}</strong>${c.year ? ` (${h(c.year)})` : ""}: ${h(c.why)}</li>`).join("")}</ul>` : "")}
${sec("What's available", p.assets?.length ? `<ul>${p.assets.map((a) => `<li>${h(a)}</li>`).join("")}</ul>` : "")}
${sec("Team", p.team?.length ? `<ul>${p.team.map((t) => `<li>${h(t.name)}, ${h(t.role)}</li>`).join("")}</ul>` : "")}
<section><h2>Rights at a glance</h2><p class="verdict">${h(rg.verdict)} for ${h(goal)}.</p><ul class="rights">${rg.items.map((x) => `<li><span>${h(x.label)}</span><span class="s-${x.state}">${MARK[x.state]}</span></li>`).join("")}</ul></section>
${p.offer ? `<section class="offer"><h2>The offer</h2><p><strong>${h(OFFER_LABEL[p.offer.type] ?? "Offer")}.</strong> ${h(p.offer.summary)}</p>${p.contact ? `<p>${h(p.contact)}</p>` : ""}</section>` : p.contact ? sec("Contact", `<p>${h(p.contact)}</p>`) : ""}
<footer>Packaged with StoryBroker · www.story.broker. Rights information summarizes the documents provided and is not a title opinion.</footer>
</main>
</body>
</html>
`;
}
