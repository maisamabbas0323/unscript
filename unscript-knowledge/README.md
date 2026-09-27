# Unscript Knowledge — Sanity Content Studio

The content model behind **Unscript** ([`../README.md`](../README.md)): a
Sanity dataset that stores the structured writing knowledge the terminal
agent retrieves at runtime.

- **Project ID:** `b209xsoi`
- **Dataset:** `production`
- **Edit it locally:** `npm install && npm run dev` (Sanity Studio with
  Vision for inspecting the data)

## What lives here

The dataset stores eight document types — the "policy layer" Unscript
consults before every transformation:

| Type                    | Purpose                                                                        |
| ----------------------- | ------------------------------------------------------------------------------ |
| `contentType`           | Kinds of writing (email, documentation, article, …) with audience and structure |
| `humanizationLevel`     | Transformation intensity (Light, Natural, Human, Deep, …) with a 1–10 intensity |
| `toneRule`              | Tones to write in — characteristics, preferred/avoided language, rhythm         |
| `writingPattern`        | Recognizable habits in the original text, with severity and when to change      |
| `transformationRule`    | Concrete instructions applied when a trigger matches, in documented priority    |
| `preservationRule`      | What must always survive the rewrite — values, structure, requirements          |
| `source`                | Provenance for rules and patterns — real references only                        |
| `userDecision`          | Recurring editorial decisions captured for consistency                           |

## How Unscript reads this data

Unscript never queries this dataset directly with a client. At runtime it
talks to a **hosted Sanity Context MCP endpoint in GROQ mode** for this
dataset. The endpoint exposes tools (`initial_context`, `schema_explorer`,
`groq_query`); the agent runs a bounded set of targeted GROQ queries that
mirror these schemas (see `src/knowledge/retrieval.ts` in the main project).

Schema changes here must be reflected in:

- `src/knowledge/types.ts` — the typed document model in the CLI, and
- the GROQ projections in `src/knowledge/retrieval.ts`.

Slugs are validated `[a-z0-9-]+` and are inlined into queries by the
retrieval layer, so keep slug values lowercase and hyphenated.

## Populating the knowledge base

1. `npm install && npm run dev` in this directory and log in to Sanity.
2. Create **Sources** first — every rule and pattern should reference a real
   origin document; never invent URLs, authors, or publishers.
3. Add content types, tones, and humanization levels.
4. Add writing patterns, then transformation and preservation rules,
   linking them to the content types / tones / levels they apply to.
5. When two transformation rules genuinely conflict, record the
   `conflictsWith` reference and let the documented priorities decide.

## Local conventions

- The Studio is its own npm project (`private: true`); its `.gitignore`
  keeps `/dist`, `/.sanity`, and local files out of the repository.
- Prettier defaults here (single quotes, no semicolons) differ from the main
  repository's style on purpose; the root `npm run format` excludes this
  folder.