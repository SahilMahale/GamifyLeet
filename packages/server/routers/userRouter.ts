import { t } from "../trpc/trpcServer";
import { z } from "zod";
export const userRouter = t.router({
  hello: t.procedure
    .input(z.object({ name: z.string() }))
    .query(({ input }) => {
      console.log(input.name);
      return {
        greeting: `Hello ${input.name}!`,
      };
    }),

  getUsers: t.procedure.query(() => {
    return [
      { id: 1, name: "John Doe" },
      { id: 2, name: "Jane Smith" },
    ];
  }),
});

export type UserRouter = typeof userRouter;
