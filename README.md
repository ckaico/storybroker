# StoryBroker

**Every story has a paper trail. StoryBroker turns it into a deal.**
Who owns what, what’s blocking release, and who has to say yes, packaged for your attorney, a buyer or a distributor.

[www.story.broker](https://www.story.broker)

---

Point Claude at a project folder (scripts, production bible, contracts, music licenses, talent agreements, delivery papers, notes, a brief) and get back a rights map, a readiness checklist, and a package an entertainment attorney can work from.

Built for three jobs:

- **Release.** Make sure everything on screen and on the soundtrack is cleared before you deliver a new film.
- **Re-release.** Untangle an older film whose rights went sideways (a distributor went bankrupt, music licenses lapsed, the production company dissolved) and find out what it takes to restore and redistribute it.
- **Sale.** Get a project ready for a buyer's due diligence.

> StoryBroker organizes what your documents say. It is not legal advice and not a title opinion.

## Install

Requires Node 20 or later.

**Claude Code**

```bash
claude mcp add storybroker -- npx -y storybroker
```

**Claude Desktop** (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "storybroker": { "command": "npx", "args": ["-y", "storybroker"] }
  }
}
```

**From a local checkout**

```bash
bun install && bun run build
claude mcp add storybroker -- node /absolute/path/to/storybroker/dist/index.js
```

**The skill (recommended).** Copy `skill/` to `~/.claude/skills/storybroker/` so Claude follows the rights-mapping workflow and its rules.

## Use

```
Open ~/Films/the-lantern-keeper with StoryBroker. Goal: rerelease.
Map the rights, tell me what's blocking a 4K streaming re-release, and who to call first.
```

Claude opens the folder, reads the documents, records each right with a quoted source, then writes the package into the project:

```
the-lantern-keeper/.storybroker/
  manifest.json            everything recorded so far (re-running keeps it)
  text/                    extracted text of each document
  out/RIGHTS_REPORT.md     summary, next steps, readiness checklist, rights map, document index
  out/OPEN_QUESTIONS.md    questions grouped by who to ask
  out/DOCUMENT_INDEX.csv
  out/rights-manifest.json machine-readable rights map with the verdict
```

## Tools

| Tool | What it does |
|---|---|
| `open_project` | Scans the folder, extracts text from PDF, DOCX, TXT, MD, CSV, EML, HTML, RTF, FDX and Fountain files, and sorts each document (chain of title, distribution, music, talent, delivery, creative, notes…). |
| `list_documents` | Lists documents, optionally by type. |
| `read_document` | Reads one document in pages. |
| `search_documents` | Searches every document, e.g. `perpetuity\|all media\|hereafter devised`. |
| `record_findings` | Adds or updates parties, rights, assets and open questions. Each right cites a document and a quote. |
| `rights_map` | Shows every right by category with holder, status, media, territory, term, warnings and sources. |
| `readiness_check` | Scores the map against the checklist for `release`, `rerelease` or `sale`: each item is ready, review, blocked or missing. |
| `export_package` | Writes the report, open questions, document index and JSON manifest. |

Statuses: `cleared`, `partial`, `unknown`, `gap`, `expired`, `disputed`. StoryBroker also flags rights that expired, licenses whose media don't cover streaming, rights with no cited source, and transfers that pass through a bankruptcy.

## Try the example

`examples/the-lantern-keeper/` is a **fictional** 2009 animated feature with a realistic mess: the distributor went bankrupt and its library was sold, the buyer claims an extension that isn't in the contract, the production company was dissolved after its founder died, a song license excluded streaming and expired, one song was never licensed, a voice actor never signed, the masters are in a storage unit with unpaid fees, and the original animation files are on tapes in the director's garage.

```
Open examples/the-lantern-keeper with StoryBroker, goal rerelease, and map it.
```

## Privacy

Files stay in your folder. StoryBroker reads them locally and writes only to `.storybroker/` inside the project. The passages Claude reads are sent to the AI model you're using, the same as anything else you share in a conversation, so follow your own confidentiality obligations before opening privileged or confidential documents.

## Develop

```bash
bun install
bun run build      # dist/index.js for Node
bun run test       # end-to-end test over stdio against the example project
```

## License

Copyright 2026 Christian Kai. Code: [Apache License 2.0](LICENSE); see [NOTICE](NOTICE). The license covers the code only. "StoryBroker" and the StoryBroker logo are not licensed for use in forks or derivative products.
