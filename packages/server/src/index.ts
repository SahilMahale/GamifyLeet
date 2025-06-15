// packages/server/src/index.ts
import { createHTTPServer } from "@trpc/server/adapters/standalone";
import { appRouter } from "../routers/router";
import cors from "cors";

const server = createHTTPServer({
  router: appRouter,
  createContext: () => ({}),
  middleware: cors({
    origin: "http://localhost:5173", // Replace with your frontend URL
    credentials: true,
  }),
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 tRPC Server running on http://localhost:${PORT}`);
});

export type AppRouter = typeof appRouter;
