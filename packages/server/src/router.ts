import { initTRPC } from "@trpc/server";
import { z } from "zod";

const t = initTRPC.create();

export const appRouter = t.router({
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

export type AppRouter = typeof appRouter;
