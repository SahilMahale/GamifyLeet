import { GetRecentSubmissions } from "../src/leetInterface";
import { t } from "../trpc/trpcServer";
import { z } from "zod";
import type {
  LeetCodeData,
  GetRecentSubmissionsResponse,
} from "../src/types/leetcode";

export const userRouter = t.router({
  hello: t.procedure
    .input(z.object({ name: z.string() }))
    .query(async ({ input }): Promise<LeetCodeData> => {
      console.log("Input name:", input.name);

      try {
        const submissions = (await GetRecentSubmissions(
          input.name,
        )) as GetRecentSubmissionsResponse;

        return {
          greeting: `Hello ${input.name}!`,
          recent_submissions: Array.isArray(submissions) ? submissions : [],
        };
      } catch (error) {
        console.error("Error fetching submissions:", error);
        return {
          greeting: `Hello ${input.name}! (Error fetching submissions)`,
          recent_submissions: [],
        };
      }
    }),

  getUsers: t.procedure.query(() => {
    return [
      { id: 1, name: "John Doe" },
      { id: 2, name: "Jane Smith" },
    ];
  }),
});

export type UserRouter = typeof userRouter;
