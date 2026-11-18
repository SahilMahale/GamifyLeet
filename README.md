# GamifyLeet

![logo](.assets/logo.png "Gamify Leet")

A monorepo app to make coding practice fun again, with a DragonBall-style power-level progression
(more progression systems later). Built with Turborepo, tRPC, Vite and React.

## Where the project is today, and where it's heading

**Today:** a LeetCode submission tracker. Type in a username and the app shows that user's recent
submissions with a small summary (accepted / wrong answer / total). Submissions are persisted to
MongoDB (in progress on `feat-db-persistance-mongo`).

**Next: a daily coding puzzle game that doesn't depend on LeetCode.** The rules are Wordle-style:
one problem a day, the same for everyone, 6 tries, and a hint after each failed try (the pass ratio
plus one failing test). The full design is in
[`documentation/daily-challenge-architecture.md`](documentation/daily-challenge-architecture.md),
and the work is tracked as GitHub issues #3–#24 (P1 = issues #3–#8).

What "not dependent on LeetCode" means in practice:

| Concern | Today | New plan |
|---|---|---|
| Problem statement, editor | on leetcode.com | in our app (Monaco editor) |
| Running and judging code | LeetCode's judge | **our own judge**: a self-hosted [Piston](https://github.com/engineer-man/piston) sandbox, with verdicts decided on our server |
| Hidden test cases | LeetCode's (never exposed) | **ours**, imported from [LeetCodeDataset](https://github.com/newfacade/LeetCodeDataset) and curated |
| Who the user is | any LeetCode username, typed as free text | our own accounts (issue #22) |
| Calls to LeetCode at **runtime** | on every stale lookup | **none** |
| Calls to LeetCode at **import time** | – | once per problem, offline, to copy starter code and the function signature into Mongo |

After a problem is imported, the game never talks to LeetCode again. If LeetCode changed or
blocked its API tomorrow, the daily game would keep working. Only new imports would stop. The
current submission tracker (`user.hello`) may stay as a side feature ("also solved on LeetCode"
badges), but nothing in the game relies on it.

## Quick start

Requirements: Node `26.10.0` (see `.nvmrc`), pnpm, and Podman + podman-compose (Docker works too).

```sh
nvm use
pnpm install
podman compose up -d   # start MongoDB + mongo-express
pnpm dev               # start the server (:3001) and frontend (:5173) in parallel
```

Open http://localhost:5173, type a LeetCode username and press Enter.

Check the backend is alive without the UI:

```sh
curl -s 'localhost:3001/health'                                        # {"result":{"data":true}}
curl -s 'localhost:3001/user.hello?input=%7B%22name%22%3A%22neal_wu%22%7D' | jq   # input = {"name":"neal_wu"}
```

### Local MongoDB

`docker-compose.yml` runs two containers on the `gamifyleet-network` bridge network:

| Service | Image | Port | Purpose |
|---|---|---|---|
| `mongodb` | `mongo:7` | 27017 | Database. Root `root`/`password123`, db `gamifyleet`. Data in the `mongodb_data` volume. |
| `mongo-express` | `mongo-express:latest` | 8081 | Web UI for browsing the DB (login `admin`/`admin123`). |

- MongoDB: `mongodb://root:password123@127.0.0.1:27017`
- Admin UI: http://127.0.0.1:8081

Stop with `podman compose down` (`-v` also wipes the data volume). These credentials are for local
development only.

P1 (issue #3) adds a third service, **Piston**, the code-execution sandbox. It runs under
**rootless Podman** (verified), but the host needs cgroup v2 with the
`cpu cpuset io memory pids` controllers delegated to your user. Issue #3, step 0, has the checks and the
one-time fix.

### Podman notes

- `podman compose` runs an external provider (`docker-compose` if installed, otherwise
  `podman-compose`) against Podman's socket. Enable the socket once with
  `systemctl --user enable --now podman.socket`.
- Use `podman compose`, not `docker compose`. If the Docker CLI is also installed, `docker compose`
  talks to a different engine and creates a separate set of containers and volumes.
- To keep containers running across reboots (`restart: unless-stopped`), run
  `systemctl --user enable podman-restart.service`. On a server, also run `loginctl enable-linger $USER`.
- Docker works too, with the same compose file. CI uses Docker (issue #21).

## Repo layout

```
.
├── package.json            # turbo scripts; mongoose + dotenv currently live here (resolved by the server)
├── pnpm-workspace.yaml     # workspace = packages/*, allows native builds (swc, esbuild, tailwind oxide)
├── turbo.json              # build/dev/lint/type-check/clean pipelines
├── docker-compose.yml      # local MongoDB + mongo-express (+ Piston from P1)
├── documentation/
│   ├── daily-challenge-architecture.md  # the game design + decision records (ADRs). Start here
│   ├── mongodb-persistence-guide.md     # design of the current Mongo persistence work
│   └── leetcode-api.md                  # how we talk to LeetCode (leetcode-query)
└── packages/
    ├── server/             # @gamify-leet/server: the tRPC API (Node, runs with tsx)
    └── frontend/           # @gamify-leet/frontend: React + Vite UI
```

Root scripts run through turbo across both packages: `pnpm dev`, `pnpm build`, `pnpm lint`,
`pnpm type-check`, `pnpm clean`.

## How the frontend and backend talk to each other

The two packages talk over **[tRPC](https://trpc.io)**. In short, the server defines functions
("procedures"), and the frontend calls them as if they were local async functions, **with the
server's types**. There's no REST route table, OpenAPI spec or hand-written client to keep in sync.

### The type link (compile time)

```
packages/server/routers/router.ts          packages/frontend/utils/trpc.ts
───────────────────────────────            ────────────────────────────────────────────
export const appRouter = t.router({        import type { AppRouter }
  status, health,                            from "../../server/routers/router";
  user: userRouter,          ── types ──►  createTRPCClient<AppRouter>(...)
});                                        createTRPCOptionsProxy<AppRouter>(...)
export type AppRouter = typeof appRouter;
```

- The frontend imports the **type** `AppRouter` from the server source with a relative path. It
  uses `import type`, so no server code (mongoose, leetcode-query) ends up in the browser bundle.
- The type carries every procedure's name, input type (inferred from its `zod` schema) and return
  type. If you rename a procedure or change its input or output on the server, the frontend
  **fails to type-check** until it's updated. That's the main benefit of tRPC.
- `@gamify-leet/server` is also listed as a workspace dependency of the frontend, but the imports
  go through the relative paths above.

### A request at runtime: typing a username and pressing Enter

```
 Browser (:5173)                                           Server (:3001)
 ───────────────                                           ──────────────
 App.tsx
  setQueryName("neal_wu")
  useQuery(trpc.user.hello.queryOptions({ name }))
   │  TanStack React Query: caching, loading/error state,
   │  `enabled: !!queryName` so nothing fires until Enter
   ▼
 utils/trpc.ts: httpBatchLink
   │  GET http://localhost:3001/user.hello?batch=1&input={"0":{"name":"neal_wu"}}
   │  (queries are GETs; mutations are POSTs with a JSON body;
   │   calls made in the same tick are batched into one HTTP request)
   ▼ ─────────────────────────── HTTP ───────────────────────────►
                                                           src/index.ts
                                                            createHTTPServer (standalone adapter)
                                                            cors(): allows origin http://localhost:5173
                                                            createContext: () => ({})   ← no auth yet
                                                             ▼
                                                           routers/router.ts → user → hello
                                                            z.object({ name: z.string() }) validates input
                                                             ▼                 (bad input → 400 BAD_REQUEST)
                                                           routers/userRouter.ts
                                                            GetRecentSubmissions(name)
                                                             ▼
                                                           src/leetInterface/index.ts
                                                            fresh in Mongo (< 15 min)? → read Mongo
                                                            else → leetcode-query → save to Mongo
                                                             ▼
                                                           returns { greeting, recent_submissions }
 ◄────────────────────────── HTTP 200 ──────────────────────────
   [{"result":{"data":{"greeting":"Hello neal_wu!","recent_submissions":[...]}}}]
   ▼
 React Query caches it under the key for { name: "neal_wu" }
 App.tsx re-renders: isSuccess → table + stat cards
```

Things to know:

- **Errors:** if a procedure throws a `TRPCError` (or anything else), the client gets an error
  object and `useQuery` sets `isError`. `user.hello` currently *catches* its own errors and returns
  an empty list with an error greeting, so the frontend's error state is rarely reached.
- **No transformer** is configured (`initTRPC.create()`), so only plain JSON crosses the wire.
  `Date`, `Map` and `undefined` don't survive. Return strings or numbers instead (this is why
  `timestamp` is a unix-seconds string).
- **Hard-coded URLs:** the client points at `http://localhost:3001` (`utils/trpc.ts`), and the
  server's CORS origin is `http://localhost:5173` (`src/index.ts`). Change both if you change ports.
- The clear button calls `queryClient.removeQueries(trpc.user.hello.queryKey(...))`. Query keys
  come from the tRPC proxy, so never write them by hand.

### Adding a new endpoint (worked example)

Say you want `user.stats({ name })` to expose the existing `GetSubmissionStats`:

1. **Server: add the procedure** in `packages/server/routers/userRouter.ts`:
   ```ts
   stats: t.procedure
     .input(z.object({ name: z.string().min(1) }))
     .query(({ input }) => GetSubmissionStats(input.name)),
   ```
   Use `.query` for reads and `.mutation` for anything that changes state (submitting a try, for
   example). For a new area, create `routers/<area>Router.ts` and register it in `routers/router.ts`,
   the way P1 adds `daily: dailyRouter`.
2. **Test it without the UI:** `curl -s 'localhost:3001/user.stats?input=%7B%22name%22%3A%22neal_wu%22%7D'`.
3. **Frontend: call it.** The types are already there:
   ```ts
   const stats = useQuery({ ...trpc.user.stats.queryOptions({ name }), enabled: !!name });
   // stats.data is typed as SubmissionStats, inferred from the server. No cast needed.
   ```
   For mutations: `useMutation(trpc.daily.submit.mutationOptions())`, then `mutate({ ... })`.
4. `pnpm type-check` (or the frontend's `tsc -b`) catches any mismatch between the two sides.

### Server: `packages/server`

Runs with `tsx watch src/index.ts` in dev. Config comes from `packages/server/.env`:

```
MONGODB_URI=mongodb://root:password123@127.0.0.1:27017/gamifyleet?authSource=admin
NODE_ENV=development
PORT=3001   # optional, defaults to 3001
```

| File | What it does |
|---|---|
| `src/index.ts` | Creates the tRPC standalone HTTP server with CORS for `http://localhost:5173`, connects to Mongo, then listens on `PORT`. |
| `trpc/trpcServer.ts` | `initTRPC.create()`: the shared `t` used to build routers and procedures. |
| `routers/router.ts` | Root router: `status`, `health` (both return `true`) and the `user` sub-router. Exports `AppRouter`, the type the frontend imports. |
| `routers/userRouter.ts` | `user.hello({ name })` → `{ greeting, recent_submissions }` via `GetRecentSubmissions`. On error it returns an empty list with an error greeting instead of throwing. `user.getUsers` returns hard-coded mock users. |
| `src/leetInterface/index.ts` | The cache-or-fetch logic described below. Also `GetSubmissionStats(username)`, which isn't exposed through tRPC yet. |
| `src/database/connection.ts` | `connectDB()` / `disconnectDB()`, using mongoose and `MONGODB_URI`. |
| `src/database/models/users.ts` | `User`: `username` (unique), `createdAt`, `updatedAt`, `deletedAt`, `lastFetched`. A `pre("save")` hook refreshes `updatedAt`. |
| `src/database/models/submission.ts` | `Submission`: `username`, `title`, `titleSlug`, `timestamp` (unix seconds as a string), `statusDisplay`, `lang`. Indexes: `{username, timestamp: -1}` for "recent" queries, and a unique `{username, titleSlug, timestamp}` so re-fetching the same submission can't create duplicates. |
| `src/database/services/UserService.ts` | `findOrCreateUser`, `updateLastFetched`, `shouldRefreshData(username, cacheTimeMinutes = 15)`. |
| `src/database/services/submissionService.ts` | `saveSubmissions` (`insertMany` with `ordered: false`, ignores duplicate-key errors), `getRecentSubmissions(username, limit = 20)`, `getSubmissionStats` (total / accepted / wrong answer / count per language). |
| `src/types/leetcode.ts` | Shared types: `Submission`, `LeetCodeData`, `GetRecentSubmissionsResponse`. The frontend imports them too. |

The submission tracker's cache-or-fetch flow:

```
GetRecentSubmissions(username)
   ├─ data fresh (< 15 min since lastFetched)? ──► read submissions from MongoDB
   └─ stale / unknown user ──► leetcode-query: fetch user.recentSubmissionList
                                 ├─ upsert User
                                 ├─ insert Submissions (duplicates ignored)
                                 ├─ bump User.lastFetched
                                 └─ return the fresh list
   (if LeetCode fails, fall back to whatever is cached in MongoDB)
```

Usernames are lower-cased before they reach the DB, so lookups are case-insensitive.

P1 adds `src/judge/` (sandbox client, code runners, checker) and `routers/dailyRouter.ts`. See issues #3–#8.

### Frontend: `packages/frontend`

React 19 + Vite 6 + Tailwind 4, using tRPC v11's TanStack React Query integration.

| File | What it does |
|---|---|
| `utils/trpc.ts` | Creates the `QueryClient`, a tRPC client with `httpBatchLink` to `http://localhost:3001`, and the `trpc` options proxy typed with the server's `AppRouter`. |
| `src/main.tsx` | Mounts `<App />` inside `QueryClientProvider`. |
| `src/App.tsx` | Username input → sets `queryName`, which enables `useQuery(trpc.user.hello.queryOptions(...))`. Renders loading / error / success states, a submissions table (status badge colours, unix timestamp → local date) and Accepted / Wrong Answer / Total cards. The clear button removes the cached query. |

## Glossary

| Term | Meaning |
|---|---|
| **slug** (`titleSlug`, `problems.slug`) | A problem's URL name: lower-case words joined by hyphens. `https://leetcode.com/problems/two-sum/` → `two-sum`. It's unique per problem and never changes. See [why we use the slug](#why-we-key-problems-by-the-leetcode-slug). |
| **langSlug** | LeetCode's ID for a language: `javascript`, `typescript`, `python3`, `golang`, `cpp`, `c`. We use the same strings as our language keys, so `problem.codeSnippets[lang]` needs no mapping table. |
| **metaData** | LeetCode's language-neutral description of a problem's function signature, e.g. `{ name: "twoSum", params: [{ name: "nums", type: "integer[]" }, ...], return: { type: "integer[]" } }`. Our runners are generated from it. |
| **codeSnippets** | The starter code for each language, shown in the editor. |
| **hidden tests** | The test cases a try is judged against. They're stored in Mongo and never sent to the browser or the sandbox together with the expected answers. |
| **Piston** | The open-source sandbox that runs player code in isolated containers. We self-host it. |
| **runner** | Generated code that reads the test inputs, calls the player's function and prints the outputs. One template per language. |
| **verdict** | `accepted` (all tests pass), `partial` (some pass), `fail` (none pass, or a compile error or timeout). |

### Why we key problems by the LeetCode slug

1. **It's the join key between our two data sources.** The hidden tests come from LeetCodeDataset,
   whose `task_id` *is* the slug. The starter code and signature come from LeetCode's
   `problem(slug)`. Using the slug as our key joins the two without a mapping table.
2. **It's already unique, stable and readable.** `two-sum` in a log, a URL or a Mongo document is
   self-explanatory. A numeric ID like `1` or an ObjectId isn't, and LeetCode's numeric
   `questionId` doesn't always match the number shown on its site.
3. **It's how we link back.** Before a public launch we'll show our own short summary plus a link
   to `leetcode.com/problems/<slug>`, which requires the slug (ADR-3).

Using the slug doesn't make us depend on LeetCode at runtime. It's just a string ID we store. If we
ever add problems that aren't from LeetCode, they get their own slug in the same format
(`my-custom-problem`), and nothing else changes.

## Known issues (as of this branch)

- The server has no `tsconfig.json`, so `pnpm build` / `type-check` for the server don't behave as
  expected. Server code is type-checked indirectly through the frontend's `tsc -b`.
- `packages/server/.env` is committed. It holds only local dev credentials today, but it should be
  ignored by git, with a committed `.env.example` instead.
- There's no authentication: `createContext` returns `{}`, and usernames are free text (issue #22).
- `App.tsx` casts `userQuery.data as LeetCodeData`, which isn't needed because tRPC already infers that type.

## Further reading

- [`documentation/daily-challenge-architecture.md`](documentation/daily-challenge-architecture.md): the game design and decision records.
- [`documentation/mongodb-persistence-guide.md`](documentation/mongodb-persistence-guide.md): the persistence design.
- [`documentation/leetcode-api.md`](documentation/leetcode-api.md): how we talk to LeetCode.
