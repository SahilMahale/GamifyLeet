# GamifyLeet

![logo](.assets/logo.png "Gamify Leet")

A mono-repo app to make Leetcoding fun again, using DragonBall progression system,more progression system soon.
Made using turbo-repo, tRPC, vite, React.

Right now the app is a LeetCode submission tracker: type in a username and it shows that user's
recent submissions with a small summary (accepted / wrong answer / total). Submissions are
being persisted to MongoDB (work in progress on `feat-db-persistance-mongo`).

## Quick start

Requirements: Node `26.10.0` (see `.nvmrc`), pnpm, Podman + podman-compose (Docker works too).

```sh
nvm use
pnpm install
podman compose up -d   # start MongoDB + mongo-express
pnpm dev               # start server (:3001) and frontend (:5173) in parallel
```

Open http://localhost:5173.

### Local MongoDB

`docker-compose.yml` runs two containers on the `gamifyleet-network` bridge network:

| Service | Image | Port | Purpose |
|---|---|---|---|
| `mongodb` | `mongo:7` | 27017 | Database. Root `root`/`password123`, db `gamifyleet`. Data in the `mongodb_data` volume. |
| `mongo-express` | `mongo-express:latest` | 8081 | Web UI for browsing the DB (login `admin`/`admin123`). |

- MongoDB: `mongodb://root:password123@127.0.0.1:27017`
- Admin UI: http://127.0.0.1:8081

Stop with `podman compose down` (`-v` also wipes the data volume).

## Repo layout

```
.
├── package.json            # turbo scripts; mongoose + dotenv live here (hoisted to server)
├── pnpm-workspace.yaml     # workspace = packages/*, allows native builds (swc, esbuild, tailwind oxide)
├── turbo.json              # build/dev/lint/type-check/clean pipelines
├── docker-compose.yml      # local MongoDB + mongo-express
├── documentation/
│   └── mongodb-persistence-guide.md   # design/plan for the Mongo persistence work
└── packages/
    ├── server/             # @gamify-leet/server — tRPC API
    └── frontend/           # @gamify-leet/frontend — React + Vite UI
```

Root scripts (all run via turbo across both packages): `pnpm dev`, `pnpm build`, `pnpm lint`,
`pnpm type-check`, `pnpm clean`.

## How it works

```
Browser (React, :5173)
   │  trpc.user.hello({ name })   — HTTP batch link
   ▼
tRPC standalone server (:3001)
   │  userRouter.hello
   ▼
leetInterface.GetRecentSubmissions(username)
   │
   ├─ data fresh (< 15 min since lastFetched)? ──► read submissions from MongoDB
   │
   └─ stale / unknown user ──► leetcode-query: fetch user.recentSubmissionList
                                 ├─ upsert User
                                 ├─ insert Submissions (duplicates ignored)
                                 ├─ bump User.lastFetched
                                 └─ return the fresh list
   (if LeetCode fails, fall back to whatever is cached in MongoDB)
```

### Server — `packages/server`

Run with `tsx watch src/index.ts` in dev. Config comes from `packages/server/.env`:

```
MONGODB_URI=mongodb://root:password123@127.0.0.1:27017/gamifyleet?authSource=admin
NODE_ENV=development
PORT=3001   # optional, defaults to 3001
```

| File | What it does |
|---|---|
| `src/index.ts` | Creates the tRPC standalone HTTP server with CORS for `http://localhost:5173`, listens on `PORT`. Exports `AppRouter` type for the client. |
| `trpc/trpcServer.ts` | `initTRPC.create()` — the shared `t` used to build routers/procedures. |
| `routers/router.ts` | Root router: `status`, `health` (both return `true`), and `user` sub-router. |
| `routers/userRouter.ts` | `user.hello({ name })` → `{ greeting, recent_submissions }` via `GetRecentSubmissions`; on error returns an empty list with an error greeting instead of throwing. `user.getUsers` returns hard-coded mock users. |
| `src/leetInterface/index.ts` | The cache-or-fetch logic shown above. Also `GetSubmissionStats(username)` (not yet exposed through tRPC). |
| `src/database/connection.ts` | `connectDB()` / `disconnectDB()` using mongoose and `MONGODB_URI`. |
| `src/database/models/users.ts` | `User`: `username` (unique), `createdAt`, `updatedAt`, `deletedAt`, `lastFetched`. A `pre("save")` hook refreshes `updatedAt`. |
| `src/database/models/submission.ts` | `Submission`: `username`, `title`, `titleSlug`, `timestamp` (unix seconds as string), `statusDisplay`, `lang`. Indexes: `{username, timestamp: -1}` for "recent" queries, and unique `{username, titleSlug, timestamp}` so re-fetching the same submission can't create duplicates. |
| `src/database/services/UserService.ts` | `findOrCreateUser`, `updateLastFetched`, `shouldRefreshData(username, cacheTimeMinutes = 15)`. |
| `src/database/services/submissionService.ts` | `saveSubmissions` (`insertMany`, `ordered: false`, swallows duplicate-key errors), `getRecentSubmissions(username, limit = 20)`, `getSubmissionStats` (total / accepted / wrong answer / count per language). |
| `src/types/leetcode.ts` | Shared types: `Submission`, `LeetCodeData`, `GetRecentSubmissionsResponse`. Also imported by the frontend. |

Usernames are lower-cased before hitting the DB, so lookups are case-insensitive.

### Frontend — `packages/frontend`

React 19 + Vite 6 + Tailwind 4, using tRPC v11's TanStack React Query integration.

| File | What it does |
|---|---|
| `utils/trpc.ts` | Creates the `QueryClient`, a tRPC client with `httpBatchLink` to `http://localhost:3001`, and the `trpc` options proxy typed with the server's `AppRouter`. |
| `src/main.tsx` | Mounts `<App />` inside `QueryClientProvider`. |
| `src/App.tsx` | Username input → sets `queryName`, which enables `useQuery(trpc.user.hello.queryOptions(...))`. Renders loading / error / success states, a submissions table (status badge colours, unix timestamp → local date), and Accepted / Wrong Answer / Total cards. The clear button removes the cached query. |

The frontend depends on `@gamify-leet/server` as a workspace package only for its **types** — no
server code runs in the browser.

## Known issues (as of this branch)

- Server has no `tsconfig.json`; `pnpm build` / `type-check` for the server won't behave as expected.
  (Server code is type-checked indirectly through the frontend's `tsc -b`.)

See `documentation/mongodb-persistence-guide.md` for the full persistence design,
`documentation/leetcode-api.md` for how we talk to LeetCode, and
`documentation/daily-challenge-architecture.md` for the daily puzzle game design.
