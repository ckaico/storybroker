import type { Asset, Goal, Manifest, Right, RightCategory, RightStatus } from "./types.js";

export type ItemState = "ready" | "review" | "blocked" | "missing";

interface Item {
  key: string;
  label: string;
  why: string;
  categories?: RightCategory[];
  assets?: RegExp;          // asset kinds that satisfy this item
  optional?: boolean;       // missing = review, not missing
  emptyIsGood?: boolean;    // e.g. encumbrances: nothing recorded is fine once someone has looked
}

const MASTERS = /negative|interpositive|\bip\b|internegative|dcp|master|prores|dpx|exr|camera|project files|source|render|stems|m&e|audio/i;

const COMMON: Record<string, Item> = {
  copyright: { key: "copyright", label: "Current copyright owner of the film", why: "Every license flows from whoever owns the film today. Registration is evidence, not proof of current ownership.", categories: ["copyright"] },
  chain: { key: "chain", label: "Unbroken chain of title", why: "Each transfer from the creators to today's owner needs a signed document, including any bankruptcy or asset sale.", categories: ["chain_of_title"] },
  underlying: { key: "underlying", label: "Underlying rights (source material)", why: "If the film is based on a book, article, life story or earlier work, those rights must cover this use.", categories: ["underlying_rights"], optional: true },
  screenplay: { key: "screenplay", label: "Screenplay and writer agreements", why: "Writers must have assigned or licensed their work to the production.", categories: ["screenplay"] },
  sync: { key: "sync", label: "Music: composition (sync) licenses", why: "Each licensed song needs a sync license from every publisher, covering the media, territory and term.", categories: ["music_sync"] },
  master: { key: "master", label: "Music: recording (master use) licenses", why: "Each licensed recording needs a master use license from the label or owner of the recording.", categories: ["music_master"] },
  score: { key: "score", label: "Original score", why: "The composer agreement should make the score a work for hire or license it broadly.", categories: ["score"] },
  talent: { key: "talent", label: "Talent agreements", why: "Signed agreements for cast and key crew, covering likeness and the media you plan to use.", categories: ["talent"] },
  guild: { key: "guild", label: "Guild obligations and residuals", why: "SAG-AFTRA, WGA and DGA residuals follow the picture. A new owner or distributor usually has to assume them.", categories: ["guild"], optional: true },
  distribution: { key: "distribution", label: "Distribution rights", why: "Who may distribute the film, where, in which media and until when. Outstanding licenses can block a new deal.", categories: ["distribution"] },
  encumbrance: { key: "encumbrance", label: "Liens, security interests and disputes", why: "Lenders, completion guarantors or litigants can hold rights over the film that survive a sale.", categories: ["encumbrance"], emptyIsGood: true },
  title: { key: "title", label: "Title and trademark", why: "A title report shows whether the title can be used without conflict.", categories: ["title_trademark"], optional: true },
  insurance: { key: "insurance", label: "Errors and omissions insurance", why: "Distributors and platforms require current E&O. Old policies usually have expired.", categories: ["insurance"] },
  clips: { key: "clips", label: "Licensed footage, clips and artwork", why: "Any third-party footage, stills or artwork in the film needs a license that covers this use.", categories: ["footage_clips", "artwork"], optional: true },
  derivative: { key: "derivative", label: "Remake, sequel and merchandising rights", why: "A buyer will want to know who controls derivative works.", categories: ["derivative"], optional: true },
  masters: { key: "masters", label: "Delivery masters exist and are reachable", why: "You need the actual picture and sound files, and permission from whoever holds them.", assets: MASTERS },
  source: { key: "source", label: "Highest-quality source materials located", why: "A higher-resolution re-release needs camera originals, original render files or the best surviving master, plus stems or M&E.", assets: MASTERS },
};

export const CHECKLISTS: Record<Goal, { title: string; items: Item[] }> = {
  release: {
    title: "Release: ready to deliver alongside the film",
    items: [COMMON.copyright, COMMON.chain, COMMON.underlying, COMMON.screenplay, COMMON.sync, COMMON.master, COMMON.score, COMMON.talent, COMMON.guild, COMMON.clips, COMMON.title, COMMON.insurance, COMMON.distribution, COMMON.encumbrance, COMMON.masters],
  },
  rerelease: {
    title: "Re-release: restore and redistribute an existing film",
    items: [COMMON.copyright, COMMON.chain, COMMON.encumbrance, COMMON.distribution, COMMON.sync, COMMON.master, COMMON.score, COMMON.talent, COMMON.guild, COMMON.clips, COMMON.source, COMMON.insurance, COMMON.title],
  },
  sale: {
    title: "Sale or option: ready for a buyer's due diligence",
    items: [COMMON.copyright, COMMON.chain, COMMON.underlying, COMMON.screenplay, COMMON.encumbrance, COMMON.distribution, COMMON.derivative, COMMON.title],
  },
};

const SEVERITY: Record<RightStatus, number> = { cleared: 0, partial: 1, unknown: 2, expired: 3, gap: 3, disputed: 4 };

const ALL_MEDIA = /all media|now known or hereafter|hereafter (devised|invented)|any and all media|in perpetuity.*all media/i;
const STREAMING = /stream|svod|avod|tvod|internet|digital|online|electronic sell|vod|new media/i;

/** Warnings a reader should see next to a right, regardless of how it was recorded. */
export function warningsFor(r: Right, goal?: Goal, today = new Date()): string[] {
  const w: string[] = [];
  if (r.expires) {
    const d = new Date(r.expires);
    if (!isNaN(+d) && d < today) w.push(`Expired on ${r.expires}.`);
    else if (!isNaN(+d) && +d - +today < 365 * 864e5) w.push(`Expires within a year (${r.expires}).`);
  }
  if (r.sources.length === 0) w.push("No source document cited.");
  if ((goal === "rerelease" || goal === "release") && ["music_sync", "music_master", "talent", "distribution", "footage_clips"].includes(r.category)) {
    if (r.media && !ALL_MEDIA.test(r.media) && !STREAMING.test(r.media)) w.push(`Media is limited to "${r.media}". Confirm it covers streaming and digital.`);
    if (!r.media) w.push("Media not recorded. Confirm it covers streaming and digital.");
  }
  if (r.category === "chain_of_title" && /bankrupt|asset (sale|purchase)|receiver|liquidat/i.test(`${r.item} ${r.notes ?? ""}`)) {
    w.push("Passes through an insolvency. Get the court order or sale schedule that lists this film.");
  }
  return w;
}

function effectiveStatus(r: Right, goal?: Goal): RightStatus {
  if (r.status === "cleared" && warningsFor(r, goal).some((w) => w.startsWith("Expired"))) return "expired";
  return r.status;
}

export interface ItemResult {
  key: string;
  label: string;
  why: string;
  state: ItemState;
  detail: string;
  rights: string[];
  assets: string[];
  questions: string[];
}

export function evaluate(m: Manifest, goal: Goal) {
  const list = CHECKLISTS[goal];
  const results: ItemResult[] = list.items.map((it) => {
    const rights = it.categories ? m.rights.filter((r) => it.categories!.includes(r.category)) : [];
    const assets: Asset[] = it.assets ? m.assets.filter((a) => it.assets!.test(`${a.kind} ${a.description}`)) : [];
    const ids = new Set([...rights.map((r) => r.id), ...assets.map((a) => a.id)]);
    const questions = m.questions.filter((q) => q.status === "open" && q.related?.some((x) => ids.has(x)));
    let state: ItemState;
    let detail: string;

    if (it.assets) {
      if (!assets.length) { state = "missing"; detail = "No masters or source materials recorded."; }
      else if (assets.some((a) => a.status === "located")) { state = assets.some((a) => a.status === "missing") ? "review" : "ready"; detail = `${assets.filter((a) => a.status === "located").length} located, ${assets.filter((a) => a.status !== "located").length} not yet located.`; }
      else if (assets.every((a) => a.status === "missing")) { state = "blocked"; detail = "Every recorded master is missing."; }
      else { state = "review"; detail = "Masters believed to exist but not yet located."; }
    } else if (!rights.length) {
      state = it.emptyIsGood ? "review" : it.optional ? "review" : "missing";
      detail = it.emptyIsGood ? "None recorded. Confirm someone has checked (UCC search, litigation search)." : it.optional ? "Nothing recorded. Confirm whether this applies." : "Nothing recorded yet.";
    } else {
      const worst = rights.map((r) => effectiveStatus(r, goal)).sort((a, b) => SEVERITY[b] - SEVERITY[a])[0];
      const counts = rights.reduce<Record<string, number>>((acc, r) => ((acc[effectiveStatus(r, goal)] = (acc[effectiveStatus(r, goal)] ?? 0) + 1), acc), {});
      detail = Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ");
      if (it.emptyIsGood) state = rights.every((r) => r.status === "cleared") ? "ready" : "blocked";
      else state = SEVERITY[worst] >= 3 ? "blocked" : SEVERITY[worst] >= 1 ? "review" : "ready";
      const warned = rights.filter((r) => warningsFor(r, goal).length && r.status === "cleared");
      if (state === "ready" && warned.length) { state = "review"; detail += `; ${warned.length} with warnings`; }
    }
    if (state === "ready" && questions.some((q) => q.blocking)) state = "review";
    return { key: it.key, label: it.label, why: it.why, state, detail, rights: rights.map((r) => r.id), assets: assets.map((a) => a.id), questions: questions.map((q) => q.id) };
  });

  const tally = results.reduce<Record<ItemState, number>>((a, r) => ((a[r.state] += 1), a), { ready: 0, review: 0, blocked: 0, missing: 0 });
  const blockingQuestions = m.questions.filter((q) => q.status === "open" && q.blocking).length;
  const verdict =
    tally.blocked || tally.missing ? "Not ready" : tally.review || blockingQuestions ? "Close, needs review" : "Ready for attorney review";
  return { goal, title: list.title, verdict, tally, blockingQuestions, results };
}
