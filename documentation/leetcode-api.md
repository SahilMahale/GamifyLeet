# LeetCode API Reference

## Overview

LeetCode does **not** offer a public, documented API. GamifyLeet uses the same private GraphQL endpoint that the leetcode.com website calls from the browser, through the community library [`leetcode-query`](https://jacoblincool.github.io/LeetCode-Query/) (v2.0.0, MIT, by jacoblincool).

What that means in practice:
- **No API key and no login** are needed. We only read public profile data.
- **No official contract.** LeetCode can change or remove fields, or block clients, without notice. That's why the server keeps a MongoDB copy and falls back to it when a fetch fails.
- **Rate limits aren't published.** Sending too many requests gets `HTTP 429` or `403` responses.

## Where It Is Used

- **Location**: `packages/server/src/leetInterface/index.ts`
- **Entry point**: `GetRecentSubmissions(username)`, called by the `user.hello` tRPC procedure in `packages/server/routers/userRouter.ts`
- **Data Flow**: Client → tRPC → MongoDB cache (fresh for 15 min) → LeetCode GraphQL → MongoDB → Client

```typescript
const leetcode = new LeetCode();
const user = await leetcode.user(username);
const submissions = user.recentSubmissionList;
```

## The Endpoint

| | |
|---|---|
| **URL** | `POST https://leetcode.com/graphql` |
| **Auth** | None for public data. The library sends empty `LEETCODE_SESSION` and `csrftoken` cookies. |
| **CSRF** | When the library starts, it sends `GET https://leetcode.com/graphql/` and reads `csrftoken` from `Set-Cookie`. It sends that token as the `x-csrftoken` header and cookie. |
| **Headers** | `content-type: application/json`, `origin` and `referer: https://leetcode.com`, `user-agent: Mozilla/5.0 LeetCode API` |
| **Body** | `{ "query": "<graphql>", "variables": { "username": "..." } }` |

### Query sent by `leetcode.user(username)`

`user()` fetches the **whole public profile**. We only use `recentSubmissionList`; the rest is thrown away.

```graphql
query ($username: String!) {
    allQuestionsCount { difficulty count }
    matchedUser(username: $username) {
        username
        socialAccounts
        githubUrl
        contributions { points questionCount testcaseCount }
        profile {
            realName websites countryName skillTags company school
            starRating aboutMe userAvatar reputation ranking
        }
        submissionCalendar
        submitStats {
            acSubmissionNum    { difficulty count submissions }
            totalSubmissionNum { difficulty count submissions }
        }
        badges { id displayName icon creationDate }
        upcomingBadges { name icon }
        activeBadge { id }
    }
    recentSubmissionList(username: $username, limit: 20) {
        title
        titleSlug
        timestamp
        statusDisplay
        lang
    }
}
```

### Fields we store

Each item in `recentSubmissionList` maps 1:1 to the `Submission` type in `packages/server/src/types/leetcode.ts` and to the `submissions` collection in MongoDB:

| Field | Example | Notes |
|---|---|---|
| `title` | `"Two Sum"` | Problem title as displayed |
| `titleSlug` | `"two-sum"` | URL slug: `https://leetcode.com/problems/<titleSlug>/` |
| `timestamp` | `"1731684000"` | Unix time in **seconds**, returned as a **string** |
| `statusDisplay` | `"Accepted"`, `"Wrong Answer"`, `"Time Limit Exceeded"`, `"Runtime Error"`, `"Compile Error"` | Human-readable verdict |
| `lang` | `"python3"`, `"cpp"`, `"java"` | Language slug |

Quirks to know about:
- **Only the last 20 submissions** are returned, and only if the user's submission history is public. This is a LeetCode limit, not ours.
- Unknown usernames give `matchedUser: null` and an empty or `null` `recentSubmissionList`. They don't produce an HTTP error, which is why `GetRecentSubmissions` checks for `null`.
- `timestamp` is a string. Sorting it as text only works because every current Unix timestamp has 10 digits.

## Rate Limiting

`leetcode-query` has a built-in client-side limiter: **20 requests per 10 s, at most 2 at a time**, applied **per `LeetCode` instance**.

`GetRecentSubmissions` creates a `new LeetCode()` on every call. As a result:
- The limiter never applies across requests, because each instance starts with an empty counter.
- Every call makes an extra `GET /graphql/` to fetch a CSRF token before running the query.

The 15-minute MongoDB cache (`UserService.shouldRefreshData`) is what currently keeps us from hitting LeetCode too often.

## Other Methods Available

`leetcode-query` exposes more of the same GraphQL API. These may be useful for future gamification features (all are public, no login):

| Method | Returns |
|---|---|
| `recent_submissions(username, limit = 20)` | Only `recentSubmissionList`, a much smaller query than `user()` |
| `user_contest_info(username)` | Contest rating, ranking, and contest history |
| `problem(slug)` | Details of a single problem (difficulty, tags, stats) |
| `problems({ limit, offset, filters })` | Paginated problem list |
| `daily()` | Today's daily challenge |

Methods that **require a logged-in session** (`LEETCODE_SESSION` cookie passed via `new Credential()`): `submissions()` (full history), `submission(id)` (source code), `whoami()`. GamifyLeet does not use these.

## Suggested Improvements

1. **Switch to `recent_submissions(username)`**: it returns the same data while skipping the heavy profile query.
2. **Reuse one `LeetCode` instance** at module level, so the rate limiter and CSRF token apply across requests.
3. **Handle `429`/`403` explicitly**, for example with backoff. Serving cached data already covers this for users who have been fetched before.
