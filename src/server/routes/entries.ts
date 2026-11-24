import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  createEntrySchema,
  monthQuerySchema,
  rangeQuerySchema,
  tagUpdateSchema,
  updateEntrySchema,
} from "../../shared/entries.js";
import type { Database } from "../db/client.js";
import { withUserContext } from "../db/rls.js";
import { errors } from "../errors.js";
import { authorize } from "../plugins/auth-context.js";
import {
  calendarMonth,
  createEntry,
  deleteEntry,
  deleteTag,
  getEntry,
  listEntries,
  listTags,
  renameTag,
  updateEntry,
} from "../services/entries.js";
import { findUserById } from "../services/users.js";
import { currentTimeIn, todayIn } from "../../shared/time.js";

export interface EntryRoutesDeps {
  db: Database;
}

export function registerEntryRoutes(app: FastifyInstance, deps: EntryRoutesDeps): void {
  const { db } = deps;

  app.get("/api/entries", { preHandler: authorize("entries:read") }, async (request) => {
    const query = rangeQuerySchema.safeParse(request.query);
    if (!query.success) throw errors.validation(firstIssue(query.error));
    const userId = userIdOf(request);
    // The API range is inclusive on both ends; the service uses an exclusive upper bound.
    const range = { from: query.data.from, to: nextDay(query.data.to) };

    return {
      entries: await withUserContext(db, userId, (tx) => listEntries(tx, userId, range)),
    };
  });

  app.get<{ Params: { date: string } }>(
    "/api/days/:date",
    { preHandler: authorize("entries:read") },
    async (request) => {
      const date = z.iso.date().safeParse(request.params.date);
      if (!date.success) throw errors.validation("date must be YYYY-MM-DD");
      const userId = userIdOf(request);
      const range = { from: date.data, to: nextDay(date.data) };

      return {
        entries: await withUserContext(db, userId, (tx) => listEntries(tx, userId, range)),
      };
    },
  );

  app.get("/api/calendar", { preHandler: authorize("entries:read") }, async (request) => {
    const query = monthQuerySchema.safeParse(request.query);
    if (!query.success) throw errors.validation(firstIssue(query.error));
    const userId = userIdOf(request);

    return {
      days: await withUserContext(db, userId, (tx) => calendarMonth(tx, userId, query.data.month)),
    };
  });

  app.post("/api/entries", { preHandler: authorize("entries:write") }, async (request, reply) => {
    const body = createEntrySchema.safeParse(request.body);
    if (!body.success) throw errors.validation(firstIssue(body.error));
    const userId = userIdOf(request);
    const timezone = await timezoneOf(db, userId);

    const entry = await withUserContext(db, userId, (tx) =>
      createEntry(tx, userId, body.data, {
        today: todayIn(timezone),
        now: currentTimeIn(timezone),
      }),
    );
    return reply.code(201).send({ entry });
  });

  app.get<{ Params: { id: string } }>(
    "/api/entries/:id",
    { preHandler: authorize("entries:read") },
    async (request) => {
      const id = parseId(request.params.id, "Entry");
      const userId = userIdOf(request);
      return { entry: await withUserContext(db, userId, (tx) => getEntry(tx, userId, id)) };
    },
  );

  app.patch<{ Params: { id: string } }>(
    "/api/entries/:id",
    { preHandler: authorize("entries:write") },
    async (request) => {
      const id = parseId(request.params.id, "Entry");
      const body = updateEntrySchema.safeParse(request.body);
      if (!body.success) throw errors.validation(firstIssue(body.error));
      const userId = userIdOf(request);

      return {
        entry: await withUserContext(db, userId, (tx) => updateEntry(tx, userId, id, body.data)),
      };
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/api/entries/:id",
    { preHandler: authorize("entries:delete") },
    async (request, reply) => {
      const id = parseId(request.params.id, "Entry");
      const userId = userIdOf(request);
      await withUserContext(db, userId, (tx) => deleteEntry(tx, userId, id));
      return reply.code(204).send();
    },
  );

  app.get("/api/tags", { preHandler: authorize("entries:read") }, async (request) => {
    const userId = userIdOf(request);
    return { tags: await withUserContext(db, userId, (tx) => listTags(tx, userId)) };
  });

  app.put<{ Params: { id: string } }>(
    "/api/tags/:id",
    { preHandler: authorize("tags:manage") },
    async (request) => {
      const id = parseTagId(request.params.id);
      const body = tagUpdateSchema.safeParse(request.body);
      if (!body.success) throw errors.validation(firstIssue(body.error));
      const userId = userIdOf(request);

      return {
        tag: await withUserContext(db, userId, (tx) => renameTag(tx, userId, id, body.data.name)),
      };
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/api/tags/:id",
    { preHandler: authorize("tags:manage") },
    async (request, reply) => {
      const id = parseTagId(request.params.id);
      const userId = userIdOf(request);
      await withUserContext(db, userId, (tx) => deleteTag(tx, userId, id));
      return reply.code(204).send();
    },
  );
}

function userIdOf(request: FastifyRequest): string {
  if (!request.auth) throw errors.unauthenticated();
  return request.auth.userId;
}

async function timezoneOf(db: Database, userId: string): Promise<string> {
  const user = await findUserById(db, userId);
  if (!user) throw errors.unauthenticated();
  return user.timezone;
}

function parseId(value: string, what: string): string {
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) throw errors.notFound(what);
  return parsed.data;
}

function parseTagId(value: string): number {
  const parsed = z.coerce.number().int().positive().safeParse(value);
  if (!parsed.success) throw errors.notFound("Tag");
  return parsed.data;
}

function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  return issue ? `${issue.path.join(".") || "request"} ${issue.message}` : "Invalid request";
}

/** The day after a "YYYY-MM-DD" date, used as the exclusive upper bound of a day query. */
function nextDay(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
