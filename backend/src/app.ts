import Fastify, { type FastifyInstance } from "fastify";
import type { PublicMeetingType } from "./api/generated/types.gen.js";
import type { Db } from "./db/index.js";

export type BuildAppOptions = {
  db: Db;
};

export function buildApp({ db }: BuildAppOptions): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get("/api/health", async () => {
    return { status: "ok" };
  });

  app.get<{ Reply: PublicMeetingType[] }>("/api/meeting-types", async () => {
    return db
      .prepare(
        `
            SELECT id, name, description, duration_min AS durationMin
            FROM meeting_types
            ORDER BY id
          `,
      )
      .all() as PublicMeetingType[];
  });

  return app;
}
