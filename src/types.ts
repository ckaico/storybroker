export const DOC_CATEGORIES = [
  "chain_of_title",
  "contract",
  "music",
  "talent",
  "distribution",
  "delivery",
  "creative",
  "finance",
  "correspondence",
  "notes",
  "media",
  "other",
] as const;
export type DocCategory = (typeof DOC_CATEGORIES)[number];

export const RIGHT_CATEGORIES = [
  "underlying_rights",   // book, article, life story, original idea the film is based on
  "screenplay",          // writer agreements, script assignment
  "copyright",           // registration and current owner of the film itself
  "chain_of_title",      // every transfer from creator to current owner, incl. bankruptcy/asset sales
  "distribution",        // who may distribute, where, in which media, until when
  "music_sync",          // composition (publishing) side of each licensed song
  "music_master",        // recording (label) side of each licensed song
  "score",               // composer agreement for the original score
  "talent",              // actor / voice / director agreements, likeness, new-media use
  "guild",               // SAG-AFTRA, WGA, DGA obligations and residuals
  "footage_clips",       // licensed clips, stock, archival
  "artwork",             // key art, posters, character designs
  "title_trademark",     // title report, trademarks
  "insurance",           // E&O and other policies
  "encumbrance",         // liens, security interests, lender rights, disputes, litigation
  "derivative",          // remake, sequel, series, merchandising, games
  "other",
] as const;
export type RightCategory = (typeof RIGHT_CATEGORIES)[number];

export const RIGHT_STATUSES = ["cleared", "partial", "unknown", "gap", "expired", "disputed"] as const;
export type RightStatus = (typeof RIGHT_STATUSES)[number];

export const GOALS = ["release", "rerelease", "sale"] as const;
export type Goal = (typeof GOALS)[number];

export interface Source {
  doc: string;        // document id, e.g. "D07"
  quote?: string;     // short exact quote supporting the finding
  location?: string;  // page, section or clause
}

export interface Doc {
  id: string;
  path: string;       // relative to project root
  category: DocCategory;
  ext: string;
  bytes: number;
  sha1: string;
  chars: number;
  status: "text" | "no_text" | "unsupported" | "error";
  note?: string;
}

export interface Party {
  id: string;
  name: string;
  role: string;       // e.g. "copyright owner", "distributor (bankrupt)", "music publisher"
  contact?: string;
  notes?: string;
  sources?: Source[];
}

export interface Right {
  id: string;
  category: RightCategory;
  item: string;           // what this covers, e.g. "Song: 'Paper Moon Parade' (sync)"
  holder?: string;        // who holds it now
  grantedBy?: string;
  status: RightStatus;
  media?: string;         // e.g. "theatrical, home video" or "all media now known"
  territory?: string;
  term?: string;
  expires?: string;       // ISO date when known
  sources: Source[];
  notes?: string;
}

export interface Asset {
  id: string;
  kind: string;           // e.g. "35mm negative", "2K DCP", "ProRes master", "stems", "M&E track", "project files"
  description: string;
  format?: string;
  resolution?: string;
  location?: string;
  holder?: string;
  status: "located" | "believed_exists" | "missing" | "unknown";
  sources: Source[];
  notes?: string;
}

export interface Question {
  id: string;
  question: string;
  blocking: boolean;
  askWho?: string;
  related?: string[];     // right/asset/party ids
  status: "open" | "resolved";
  answer?: string;
}

export interface Manifest {
  schema: "storybroker.manifest/0.1";
  project: {
    name: string;
    goal?: Goal;
    brief?: string;
    openedAt: string;
    updatedAt: string;
  };
  documents: Doc[];
  parties: Party[];
  rights: Right[];
  assets: Asset[];
  questions: Question[];
}
