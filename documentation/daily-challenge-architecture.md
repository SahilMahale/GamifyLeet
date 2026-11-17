# Daily Challenge: Architecture & Design Decisions

## Overview

This document turns GamifyLeet from a LeetCode submission tracker into a **daily coding puzzle game** with Wordle-style rules:

1. **One problem per day, the same for everyone**, with **6 tries** to solve it.
2. **One visible example** is given as the starting point. Each failed try reveals a hint: the **pass ratio** (for example `7/10`) and **exactly one failed hidden test case**.
3. Consecutive days solved build a **streak**, shown as a **power level** that grows through tiers.

The problem statement, editor, code execution, judging and hints all live **inside GamifyLeet**. LeetCode is only a source of problem metadata.

Status: **Proposed**. Nothing in this document is implemented yet.

## Decision Log

| # | Decision | Status |
|---|---|---|
| ADR-1 | Run our own judge instead of syncing from LeetCode | Accepted |
| ADR-2 | Self-hosted Piston as the code execution sandbox | Accepted |
| ADR-3 | LeetCodeDataset for hidden tests, LeetCode for metadata | Accepted |
| ADR-4 | Language-neutral JSON tests + generated per-language runners | Accepted |
| ADR-5 | Verdicts decided on the server, not inside the sandbox | Accepted |
| ADR-6 | Hint = pass ratio + first failing case | Accepted |
| ADR-7 | Languages: JS, TS, Go, C++, C (+ Python) | Accepted |
| ADR-8 | Daily problem pool limited to supported types | Accepted |
| ADR-9 | Streak shown as a power level with tiers | Accepted |
| ADR-10 | Monaco as the code editor | Accepted |

---

## ADR-1: Run our own judge instead of syncing from LeetCode

### Context
LeetCode has no public API for running code, and hidden test cases are never exposed. Three options were considered:

| Option | Pros | Cons |
|---|---|---|
| **A. Sync mode**: link to the problem on LeetCode; the player solves it there and clicks *Sync*, and we read `recentSubmissionList` | No judge to build. LeetCode shows the failing test case itself | The public data has only a verdict per submission: **no pass ratio, no failing case** for our app to show. We can't stop a 7th try. Anyone can sync any username (needs profile verification). Only the last 20 submissions are visible |
| **B. Proxy to LeetCode submit**: send player code to LeetCode with their `LEETCODE_SESSION` cookie | Real LeetCode judge and test cases | Undocumented API, probably against LeetCode's terms, players have to hand over a session cookie, tries show up on their real account |
| **C. Own judge** | Full control of the 6-try limit, hints, languages and UX. No LeetCode login | We have to host a sandbox, a test bank and per-language runners |

### Decision
**C. Own judge.** The hint rule (ADR-6) is the core of the game, and it can only be shown in our app if we run the tests ourselves.

### Consequences
- We depend on an execution sandbox (ADR-2), a test bank (ADR-3) and per-language runners (ADR-4).
- Sync mode stays a possible future side feature, for example "also solved on LeetCode" badges. The existing `UserService`/`SubmissionService` code already supports it.

---

## ADR-2: Self-hosted Piston as the code execution sandbox

### Context
Player code is untrusted and must never run directly on the API server. Open-source options:

| | [Piston](https://github.com/engineer-man/piston) | [Judge0 CE](https://github.com/judge0/judge0) |
|---|---|---|
| API | Single call: `POST /api/v2/execute` | Submit, then poll (batch submissions supported) |
| Limits | `run_timeout`, `run_cpu_time`, `run_memory_limit`, compile limits per request | Per-submission time/memory limits |
| Hosting | One Docker container; needs `--privileged` and **cgroup v2** | Several containers (server, workers, Postgres, Redis); needs cgroup v1 or privileged mode |
| Security notes | Container-based isolation | Reviews warn its container has wide host access, so it needs network-level isolation |
| Public API | **Closed to the public since Feb 15, 2026**, so self-hosting is required | Paid SaaS or self-hosted |

### Decision
**Self-hosted Piston**, added as a service in `docker-compose.yml`. Only the API server can reach it; it is never exposed publicly.

### Consequences
- Piston takes **one stdin per call**, so each try is **one execution** that runs every test case in a loop inside the runner (ADR-4), not one call per test.
- Default stdout is capped (1024 chars). The runner output must be compact, or the limit raised in config.
- Host requirement: cgroup v2 (check this on the deploy target; Docker Desktop on macOS works for development).
- If we later need batch scaling or stronger isolation (gVisor, Firecracker), Judge0 or a custom sandbox can replace it behind the same internal `execute()` interface.

---

## ADR-3: LeetCodeDataset for hidden tests, LeetCode for metadata

### Context
LeetCode's public GraphQL API (via `leetcode-query`, see [leetcode-api.md](./leetcode-api.md)) gives problem metadata but **never hidden tests**. Writing tests by hand for every problem doesn't scale.

[LeetCodeDataset](https://github.com/newfacade/LeetCodeDataset) ([Hugging Face](https://huggingface.co/datasets/newfacade/LeetCodeDataset), [paper](https://arxiv.org/abs/2504.14655)) gives about 2,869 LeetCode problems (v0.3.1) with:
- `task_id`: the LeetCode **title slug**, used to join with LeetCode metadata
- `entry_point`: for example `Solution().twoSum`
- `input_output`: about 80 to 100+ generated cases per problem, as Python-style strings (`nums = [3,3], target = 6` → `[0, 1]`)
- `prompt`: Python imports plus `ListNode` / `TreeNode` helpers
- `starter_code`, `difficulty`, `tags`, and a canonical solution

### Decision
- **Hidden tests**: imported from LeetCodeDataset, converted to JSON (ADR-4), and stored in Mongo.
- **Metadata** (`codeSnippets` for each language, `metaData` signature with types, difficulty, tags, link): fetched from LeetCode with `leetcode-query`'s `problem(slug)`, joined on the slug, and stored in Mongo. It's fetched once at import time, not on each request.

### Consequences
- **Test quality must be curated.** The inputs were generated with an AI model and can break the problem's own rules. For example, a Two Sum case expects `None` even though a solution is guaranteed. Every problem in the daily pool gets a review step before it is enabled.
- **License:** the dataset is listed as Apache-2.0 on Hugging Face and MIT on GitHub (both permissive). That covers the dataset authors' work only.
- **Problem statements are LeetCode's copyrighted content.** For personal or private use we show the statement. **Before any public launch**, show the title, difficulty, our own short summary and a link to LeetCode instead of LeetCode's full text.
- The dataset is Python-only, which is why ADR-4 exists.

---

## ADR-4: Language-neutral JSON tests + generated per-language runners

### Context
No open-source project generates LeetCode-style test runners (parse input → call `Solution.method` → print output) for many languages. Only single-language helper libraries exist (pyleet, leetcode-utils for Java, leetkit for Go). Writing a runner for each problem in each language doesn't scale.

LeetCode's `metaData` describes each signature in language-neutral types:

```json
{
  "name": "twoSum",
  "params": [
    { "name": "nums", "type": "integer[]" },
    { "name": "target", "type": "integer" }
  ],
  "return": { "type": "integer[]" }
}
```

### Decision
1. **Import step (once per problem):** convert each `input_output` case from Python syntax to JSON with Python's `ast.literal_eval`:
   ```json
   { "args": [[3, 3], 6], "expected": [0, 1] }
   ```
2. **Runner generator (one template per language):** from `metaData`, generate a runner that:
   - reads **all** cases as JSON from stdin,
   - converts the arguments to that language's types (including `ListNode` / `TreeNode` built from level-order arrays),
   - calls the player's function for each case and catches errors **per case**,
   - prints **one JSON line per case**: `{"i":0,"out":[0,1],"ms":1}` or `{"i":3,"err":"IndexError ..."}`.
3. The player's code and the generated runner are sent to Piston as one program (several files where the language needs it).

### Runner I/O contract (every language)

**stdin:** one JSON document holding only the arguments, never the expected values:
```json
{ "cases": [ [[2,7,11,15], 9], [[3,3], 6] ] }
```

**stdout:** one JSON line per case, in any order:
```text
{"i":0,"out":[0,1],"ms":0.12}
{"i":1,"err":"TypeError: Cannot read properties of undefined (reading 'length')"}
```

- The server keeps only lines that parse as JSON and have an integer `i` plus `out` or `err`. If a case appears more than once, the **first** line wins and later ones are ignored. Player code can print anything, but it never sees `expected`, so a forged line can't turn into a pass.
- Player logging (`console.log`, `print`, …) goes to **stderr** wherever the language allows it, so it can't corrupt the protocol.
- A case with no line (crash, timeout or output limit partway through the run) counts as a failure, and its reason comes from the run status (ADR-6).
- `out` uses the same format as the stored `expected` value (ADR-5): `ListNode` → array, `TreeNode` → level-order array.
- An `undefined` or `None` return is printed as `null`, never as a missing key.
- Generated source only contains identifiers that passed `/^[A-Za-z_$][\w$]*$/` (`metaData.name`, parameter names). Anything else makes runner generation fail.

### In-place (`void`) problems

Some problems change their input instead of returning a value (for example `rotate-array`, `sort-colors`). LeetCode marks these with `"return": { "type": "void" }` and adds `"output": { "paramindex": N }` to `metaData`. For these problems the runner prints the mutated `args[N]` as `out`, converted the same way as a normal return value.

### Per-language notes

| Language | JSON library | Notes | Est. effort |
|---|---|---|---|
| JavaScript | built in | Builds the generator core | ~1 day |
| TypeScript | built in | Same runner as JS; run with a TS-capable runtime (Deno/Bun) or compile with `tsc` | +½ day |
| Go | `encoding/json` | Strict typing: `[]int`, `[][]int`, `*TreeNode` conversion must be generated exactly | ~2 days |
| C++ | [nlohmann/json](https://github.com/nlohmann/json) (single header, MIT) | `vector` / `ListNode*` / `TreeNode*` conversion; compile time on every try | ~2 days |
| C | [cJSON](https://github.com/DaveGamble/cJSON) (single file, MIT) | **Hardest.** LeetCode C signatures use pointer + size pairs (`int* nums, int numsSize, int* returnSize`, `int** returnColumnSizes`) and a result the player allocates with `malloc` | ~3–4 days |
| Python | built in | Comes nearly free: reuse the dataset's `prompt` helpers and `entry_point` | ~½ day |

### Consequences
- Supporting a new language means one template, not N problems.
- Starter code shown in the editor is LeetCode's own `codeSnippets` for that language, so signatures match what players know.
- The runners for each language need their own test suite: one problem per supported type, run through every language.

---

## ADR-5: Verdicts decided on the server, not inside the sandbox

### Decision
Runners only **report outputs**. The API server (TypeScript) compares them with `expected` and decides pass or fail.

### Why
- One checker for all languages instead of five.
- Problem-specific rules live in one place, as flags on the problem document:
  - `anyOrder`: compare as multisets (for example "return the answer in any order")
  - `floatTolerance`: for example `1e-5`
  - `customChecker`: for problems with several valid answers
- Hidden `expected` values never enter the sandbox, so player code can't read them.

### How expected values are stored
`expected` is stored in the **runner's output format**, so the checker only ever compares plain JSON and doesn't need to know about node types:
- `ListNode` → array of values: `[1,2,3]`, and `[]` for an empty list.
- `TreeNode` → LeetCode level-order array with `null` for a missing child and trailing `null`s trimmed: `[3,9,20,null,null,15,7]`, and `[]` for an empty tree.
- `void` problems → the expected state of the mutated parameter.

### Comparison rules
- Default: deep equality. The verdict is decided by the **first** failing case in stored order (ADR-6).
- `anyOrder` applies to the **top-level array only**. Nested any-order answers (for example Group Anagrams) need a `custom` checker.
- An unknown `custom` checker name is an error, never a silent pass.

### Consequences
- Problems that accept several valid answers need a hand-written checker or must stay out of the pool (ADR-8).

---

## ADR-6: Hint = pass ratio + first failing case

### Decision
After each try that isn't accepted, the player sees:
- **Pass ratio**: `passed / total` hidden tests (for example `7/10`).
- **Exactly one failing test case**: the **first** failing hidden case in a fixed order, showing the input, the expected output and the player's output (or the error).

The tile shown for each try:
- **Accepted**: all hidden tests pass.
- **Partial**: `0 < passed < total`.
- **Complete fail**: `passed == 0`, or a compile error, or the whole run timed out.

### Details
- The hidden tests are a **curated subset** (about 10–20) of the dataset cases, so the ratio means something and a run stays fast. Keep them ordered from simple to edge cases, so early hints teach and later ones catch edge cases.
- **Run on example** (the visible case) is free and doesn't use a try.
- A compile error uses a try but shows the compiler message instead of a test case. *(Open question: should compile errors be free? See below.)*

---

## ADR-7: Languages

### Decision
**JavaScript, TypeScript, Go, C++, C**, plus **Python**, since the dataset makes it nearly free.

Build order: **JS → TS → Go → C++ → C**, with Python added alongside JS. If C's pointer conventions drag on, C launches enabled only for problems with simple signatures (scalars and 1D arrays).

---

## ADR-8: Daily problem pool limited to supported types

### Decision
A problem enters the daily pool only if all of these are true:
- Every `metaData` param and return type is in the supported set:
  `integer`, `long`, `double`, `boolean`, `string`, `character`, 1D and 2D arrays of those, `ListNode`, `TreeNode`.
  A `void` return is allowed when `metaData.output.paramindex` points to a parameter of a supported type (see ADR-4, *In-place problems*).
- It is **not** a design problem (class with a sequence of method calls, for example `LRUCache`), an interactive problem, or one using graph `Node` or random-pointer lists.
- It is not a premium problem.
- Its hidden tests passed curation (ADR-3) and the canonical solution passes them in **every** supported language's runner.
- Difficulty: Easy and Medium at first.

### Daily selection
- **One problem for everyone each day**, keyed by the UTC date.
- Picked from the enabled pool by an admin script, or randomly with the date as the seed, and stored in a `dailyPuzzles` collection so the choice is fixed and can be audited.
- No repeats within a configurable window (for example 365 days).

---

## ADR-9: Streak shown as a power level with tiers

### Decision
- **Streak:** consecutive UTC days with an *Accepted* try within 6 tries. A day missed or lost resets the streak.
- **Power gained per solve:** `(7 − triesUsed) × 1000 × streakMultiplier`. That's 6,000 for a first-try solve and 1,000 for a sixth-try solve.
- **Tiers** are unlocked by current streak length, for example 3, 7, 14, 30 and 100 days. Each tier raises `streakMultiplier`.
- **Kept forever:** total power and best streak. **Reset on a miss:** current streak and multiplier.

### Theming note
The power-level theme is inspired by anime transformations. **Tier names and art live in one config file** (`tiers.ts`). Franchise names (for example "Super Saiyan") and character art (the existing `Goku.svg`) belong to their rights holders. They're acceptable for a personal project, but **must be swapped for original names and art before any public release**.

---

## ADR-10: Monaco as the code editor

### Decision
[`@monaco-editor/react`](https://github.com/suren-atoyan/monaco-react), the VS Code editor, chosen over CodeMirror 6 for out-of-the-box language support and familiarity.

- A language picker loads that language's `codeSnippets` starter code.
- The player's draft is kept in `localStorage` for each problem and language, so a page reload doesn't lose code.
- Panels: problem statement, editor, example input/output, try board (6 rows), hint panel.

---

## Data Model (Mongo)

```text
problems
  slug (unique)            "two-sum" (LeetCode title slug, the join key with LeetCodeDataset)
  title, difficulty, tags
  content                  statement HTML, for personal use only (see ADR-3 before a public launch)
  metaData                 LeetCode signature, stored as a parsed object, not the raw JSON string (ADR-4)
  codeSnippets             { langSlug: starterCode }
  example                  { args, expected }   visible to the player
  hiddenTests              [{ args, expected }] ordered simple → edge, select: false
  checker                  { anyOrder?, floatTolerance?, custom? }
  supportedLangs           ["javascript", "typescript", "golang", "cpp", "c", "python3"]
  status                   draft | enabled | retired

dailyPuzzles
  date (unique)            "YYYY-MM-DD" string, UTC day
  problemSlug

attempts                   one document per user per day
  username, date           (unique together); username lower-cased
  problemSlug              copied in, so the record stays auditable
  tries: [{ lang, code, passed, total, failingCase, verdict, createdAt }]
  solved, triesUsed        triesUsed duplicates tries.length so the 6-try limit is one atomic filter

users (extend existing)
  currentStreak, bestStreak, powerLevel, tier
  lastSolvedDate           "YYYY-MM-DD" string, the same format as dailyPuzzles.date
```

Rules:
- `hiddenTests` has `select: false` in the Mongoose schema, so it only comes back with an explicit `.select("+hiddenTests")`. Only the judge path asks for it.
- `expected` values use the runner output format (ADR-5).
- Dates are UTC calendar days stored as strings, never `Date` objects, which avoids timezone bugs.
- The 6-try limit is enforced with one atomic update: `findOneAndUpdate({ username, date, triesUsed: { $lt: 6 }, solved: false }, …)`. Parallel submits can't create a 7th try.

## API (tRPC)

| Procedure | Purpose |
|---|---|
| `daily.today` | Today's problem: statement, example, starter code for each language. **No hidden tests.** |
| `daily.runExample` | Run code against the visible example only. Doesn't use a try |
| `daily.submit` | Use a try: run hidden tests, return `{ passed, total, verdict, failingCase }` and the updated board |
| `daily.board` | The player's tries for today |
| `user.power` | Streak, power level and tier |

`daily.submit` refuses a try after 6 tries or after a solve. The limit is enforced on the server, never only in the client.

## Request Flow: `daily.submit`

```text
Client ──submit(code, lang)──▶ API server
                                 │ 1. check tries < 6, not already solved
                                 │ 2. load problem + hiddenTests
                                 │ 3. generate runner(lang, metaData)
                                 │ 4. POST Piston /api/v2/execute
                                 │      files: [runner, player code]
                                 │      stdin: JSON args only (no expected values)
                                 ▼
                              Piston sandbox ──▶ one JSON line per case
                                 │
                                 │ 5. compare outputs with expected values (ADR-5 checker)
                                 │ 6. passed/total + first failing case (ADR-6)
                                 │ 7. save try; on solve, update streak and power (ADR-9)
                                 ▼
Client ◀── { passed, total, verdict, failingCase, board }
```

## Build Plan

Tracked as GitHub issues. The title prefix `[P1]`…`[P6]` matches the step below. The P1 issues include step-by-step execution guides.

1. **Spike:** Piston in `docker-compose.yml`, import a handful of problems, JS runner + server checker, `daily.submit` returning `{ passed, total, failingCase }`. Issues #3 (Piston), #4 (`execute()`), #5 (models), #6 (JS runner), #7 (checker), #8 (end-to-end `daily.submit`).
2. **Import pipeline:** full dataset to JSON tests + LeetCode metadata, a curation script, pool filtering (ADR-8). Issues #9, #10.
3. **Python + TS** runners. Issues #11, #12.
4. **Game loop:** daily selection, attempts, the 6-try limit, streak and power level. Issues #13, #14, #15.
5. **Frontend:** Monaco editor, try board, hint panel, power-level display. Issues #16, #17.
6. **Go → C++ → C** runners. Issues #18, #19, #20.

Cross-cutting: #21 (runner test suite across languages), #22 (real accounts), #23 (open questions below), #24 (cleanup before a public launch).

## Open Questions

- **Identity:** usernames are free text today. The game needs real accounts (OAuth or magic link) so streaks can't be claimed by someone else.
- **Do compile errors use a try?** Wordle only counts valid guesses. Leaning toward *free compile errors, with a limit per day*.
- **Time limits per language:** C/C++ and JS/Python need different limits. Should they scale from LeetCode's own limits?
- **Spoilers:** whether, and when, to reveal the canonical solution after a loss.
- **Deploy target:** must support cgroup v2 and `--privileged` containers for Piston.

## References

- [LeetCode API notes](./leetcode-api.md)
- [MongoDB persistence guide](./mongodb-persistence-guide.md)
- [LeetCodeDataset](https://github.com/newfacade/LeetCodeDataset) · [paper](https://arxiv.org/abs/2504.14655)
- [Piston](https://github.com/engineer-man/piston) · [Judge0](https://github.com/judge0/judge0)
- [nlohmann/json](https://github.com/nlohmann/json) · [cJSON](https://github.com/DaveGamble/cJSON) · [monaco-react](https://github.com/suren-atoyan/monaco-react)
