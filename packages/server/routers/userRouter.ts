import { GetRecentSubmissions } from "../src/leetInterface";
import { t } from "../trpc/trpcServer";
import { z } from "zod";
export const userRouter = t.router({
  hello: t.procedure.input(z.object({ name: z.string() })).query(
    async ({
      input,
    }): Promise<{
      greeting: string;
      recent_submissions: any; // Replace 'any' with your actual type
    }> => {
      console.log(input.name);
      const recSub = await GetRecentSubmissions(input.name);
      console.log(recSub);
      return {
        greeting: `Hello ${input.name}!`,
        recent_submissions: recSub,
      };
    },
  ),

  getUsers: t.procedure.query(() => {
    return [
      { id: 1, name: "John Doe" },
      { id: 2, name: "Jane Smith" },
    ];
  }),
});

export type UserRouter = typeof userRouter;
