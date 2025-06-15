import { t } from "../trpc/trpcServer";
import { userRouter } from "./userRouter";

const healthCheck = () => {
  return true;
};
export const appRouter = t.router({
  status: t.procedure.query(healthCheck),
  health: t.procedure.query(healthCheck),
  user: userRouter,
});

export type AppRouter = typeof appRouter;
