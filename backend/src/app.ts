import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import { DateTime } from "luxon";
import type {
  AdminMeetingType,
  Availability,
  BookingConfirmation,
  CreateBookingRequest,
  CreateMeetingTypeRequest,
  ErrorResponse,
  FieldError,
  Owner,
  PublicMeetingType,
  UpdateMeetingTypeRequest,
  UpdateOwnerRequest,
} from "./api/generated/types.gen.js";
import type { Db } from "./db/index.js";
import {
  type BusyInterval,
  type Clock,
  buildSlots,
  getWindowBounds,
  systemClock,
} from "./domain/availability.js";
import { isBookableStart, overlapGuardsDisabled } from "./domain/booking.js";

export type BuildAppOptions = {
  db: Db;
  clock?: Clock;
};

type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; fieldErrors: FieldError[] };

function sendError(
  reply: FastifyReply,
  statusCode: number,
  body: ErrorResponse,
) {
  return reply.code(statusCode).send(body);
}

function invalidRequest(message = "Invalid request") {
  return { code: "invalid_request", message } satisfies ErrorResponse;
}

function validationError(fieldErrors: FieldError[]) {
  return {
    code: "validation_error",
    message: "Validation failed",
    fieldErrors,
  } satisfies ErrorResponse;
}

function notFound(message = "Not found") {
  return { code: "not_found", message } satisfies ErrorResponse;
}

function internalError() {
  return {
    code: "internal_error",
    message: "Internal server error",
  } satisfies ErrorResponse;
}

function parseIdParam(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1 || id > 2147483647) return null;
  return id;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateOwnerBody(
  body: unknown,
): ValidationResult<UpdateOwnerRequest> {
  if (!isRecord(body) || typeof body.displayName !== "string") {
    return {
      ok: false,
      fieldErrors: [{ field: "displayName", message: "Name is required" }],
    };
  }
  const displayName = body.displayName.trim();
  if (displayName.length === 0) {
    return {
      ok: false,
      fieldErrors: [{ field: "displayName", message: "Name is required" }],
    };
  }
  return { ok: true, value: { displayName } };
}

function validateMeetingTypeBody(body: unknown): ValidationResult<{
  name: string;
  description: string;
  durationMin: number;
}> {
  if (!isRecord(body)) {
    return {
      ok: false,
      fieldErrors: [{ field: "name", message: "Invalid request body" }],
    };
  }
  const fieldErrors: FieldError[] = [];

  if (typeof body.name !== "string") {
    fieldErrors.push({ field: "name", message: "Name is required" });
  } else {
    const name = body.name.trim();
    if (name.length < 1 || name.length > 100) {
      fieldErrors.push({
        field: "name",
        message: "Name must be 1..100 characters",
      });
    }
  }

  let description = "";
  if (body.description !== undefined) {
    if (typeof body.description !== "string") {
      fieldErrors.push({
        field: "description",
        message: "Description must be a string",
      });
    } else if (body.description.length > 2000) {
      fieldErrors.push({
        field: "description",
        message: "Description must be at most 2000 characters",
      });
    } else {
      description = body.description;
    }
  }

  const duration = body.durationMin;
  if (typeof duration !== "number" || !Number.isInteger(duration)) {
    fieldErrors.push({
      field: "durationMin",
      message: "Duration must be an integer",
    });
  } else if (duration < 15 || duration > 540 || duration % 15 !== 0) {
    fieldErrors.push({
      field: "durationMin",
      message: "Duration must be 15..540 and multiple of 15",
    });
  }

  if (fieldErrors.length > 0) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    value: {
      name: (body.name as string).trim(),
      description,
      durationMin: duration as number,
    },
  };
}

const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

type ValidBookingBody = {
  startMs: number;
  guestName: string;
  guestEmail: string;
  comment?: string;
};

type BookingOutcome =
  | { kind: "created"; confirmation: BookingConfirmation }
  | { kind: "not_found" }
  | { kind: "slot_unavailable" }
  | { kind: "slot_taken" };

function slotUnavailable() {
  return {
    code: "slot_unavailable",
    message: "The selected slot is not available",
  } satisfies ErrorResponse;
}

function slotTaken() {
  return {
    code: "slot_taken",
    message: "The selected slot is already booked",
  } satisfies ErrorResponse;
}

function serviceBusy() {
  return {
    code: "service_busy",
    message: "Booking service is busy, please retry",
  } satisfies ErrorResponse;
}

function isSqliteBusy(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && code.startsWith("SQLITE_BUSY");
}

function isOverlapError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("booking_overlap");
}

function validateBookingBody(
  body: unknown,
): ValidationResult<ValidBookingBody> {
  if (!isRecord(body)) {
    return {
      ok: false,
      fieldErrors: [{ field: "start", message: "Invalid request body" }],
    };
  }

  const fieldErrors: FieldError[] = [];
  let startMs = Number.NaN;
  if (
    typeof body.start !== "string" ||
    !UTC_INSTANT.test(body.start) ||
    !DateTime.fromISO(body.start, { zone: "utc" }).isValid
  ) {
    fieldErrors.push({
      field: "start",
      message: "Start must be an ISO 8601 UTC instant",
    });
  } else {
    startMs = Date.parse(body.start);
  }

  let guestName = "";
  if (typeof body.guestName !== "string") {
    fieldErrors.push({ field: "guestName", message: "Name is required" });
  } else {
    guestName = body.guestName.trim();
    if (guestName.length < 1 || guestName.length > 100) {
      fieldErrors.push({
        field: "guestName",
        message: "Name must be 1..100 characters",
      });
    }
  }

  let guestEmail = "";
  if (typeof body.guestEmail !== "string") {
    fieldErrors.push({ field: "guestEmail", message: "Email is required" });
  } else {
    guestEmail = body.guestEmail.trim();
    if (
      guestEmail.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)
    ) {
      fieldErrors.push({
        field: "guestEmail",
        message: "Email must be a valid address",
      });
    }
  }

  let comment: string | undefined;
  if (body.comment !== undefined) {
    if (typeof body.comment !== "string") {
      fieldErrors.push({
        field: "comment",
        message: "Comment must be a string",
      });
    } else if (body.comment.length > 2000) {
      fieldErrors.push({
        field: "comment",
        message: "Comment must be at most 2000 characters",
      });
    } else {
      comment = body.comment.trim();
    }
  }

  if (fieldErrors.length > 0) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    value: { startMs, guestName, guestEmail, comment },
  };
}

function toAdminMeetingType(row: {
  id: number;
  name: string;
  description: string;
  durationMin: number;
  archivedAtMs: number | null;
}): AdminMeetingType {
  return row;
}

export function buildApp({
  db,
  clock = systemClock,
}: BuildAppOptions): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get("/api/health", async () => {
    return { status: "ok" };
  });

  app.get<{ Reply: PublicMeetingType[] | ErrorResponse }>(
    "/api/meeting-types",
    async (_req, reply) => {
      try {
        const rows = db
          .prepare(
            `
            SELECT id, name, description, duration_min AS durationMin
            FROM meeting_types
            WHERE archived_at_ms IS NULL
            ORDER BY id
          `,
          )
          .all() as PublicMeetingType[];
        return rows;
      } catch {
        return sendError(reply, 500, internalError());
      }
    },
  );

  app.get<{ Params: { id: string }; Reply: PublicMeetingType | ErrorResponse }>(
    "/api/meeting-types/:id",
    async (req, reply) => {
      const id = parseIdParam(req.params.id);
      if (id === null)
        return sendError(reply, 400, invalidRequest("Invalid meeting type id"));
      try {
        const row = db
          .prepare(
            "SELECT id, name, description, duration_min AS durationMin FROM meeting_types WHERE id = ? AND archived_at_ms IS NULL",
          )
          .get(id) as PublicMeetingType | undefined;
        if (!row)
          return sendError(reply, 404, notFound("Meeting type not found"));
        return row;
      } catch {
        return sendError(reply, 500, internalError());
      }
    },
  );

  app.get<{ Params: { id: string }; Reply: Availability | ErrorResponse }>(
    "/api/meeting-types/:id/availability",
    async (req, reply) => {
      const id = parseIdParam(req.params.id);
      if (id === null)
        return sendError(reply, 400, invalidRequest("Invalid meeting type id"));
      try {
        const meetingType = db
          .prepare(
            "SELECT id, name, description, duration_min AS durationMin FROM meeting_types WHERE id = ? AND archived_at_ms IS NULL",
          )
          .get(id) as PublicMeetingType | undefined;
        if (!meetingType)
          return sendError(reply, 404, notFound("Meeting type not found"));

        const nowMs = clock.now();
        const { windowStartMs, windowEndMs } = getWindowBounds(nowMs);
        const busy = db
          .prepare(
            `SELECT start_ms AS startMs, end_ms AS endMs
             FROM bookings
             WHERE start_ms < ? AND end_ms > ?
             ORDER BY start_ms`,
          )
          .all(windowEndMs, windowStartMs) as BusyInterval[];

        return {
          meetingType,
          days: buildSlots(nowMs, meetingType.durationMin, busy),
        };
      } catch {
        return sendError(reply, 500, internalError());
      }
    },
  );

  app.post<{
    Body: CreateBookingRequest;
    Reply: BookingConfirmation | ErrorResponse;
  }>("/api/bookings", async (req, reply) => {
    if (!isRecord(req.body)) return sendError(reply, 400, invalidRequest());
    const meetingTypeId = req.body.meetingTypeId;
    if (
      typeof meetingTypeId !== "number" ||
      !Number.isInteger(meetingTypeId) ||
      meetingTypeId < 1 ||
      meetingTypeId > 2147483647
    ) {
      return sendError(reply, 400, invalidRequest());
    }

    try {
      const existing = db
        .prepare(
          "SELECT id, archived_at_ms AS archivedAtMs FROM meeting_types WHERE id = ?",
        )
        .get(meetingTypeId) as
        | { id: number; archivedAtMs: number | null }
        | undefined;
      if (!existing || existing.archivedAtMs !== null) {
        return sendError(reply, 404, notFound("Meeting type not found"));
      }

      const parsed = validateBookingBody(req.body);
      if (!parsed.ok) {
        return sendError(reply, 422, validationError(parsed.fieldErrors));
      }

      const nowMs = clock.now();
      const outcome = db
        .transaction((): BookingOutcome => {
          const meetingType = db
            .prepare(
              `SELECT id, name, description, duration_min AS durationMin
             FROM meeting_types
             WHERE id = ? AND archived_at_ms IS NULL`,
            )
            .get(meetingTypeId) as PublicMeetingType | undefined;
          if (!meetingType) return { kind: "not_found" };

          const { startMs } = parsed.value;
          if (!isBookableStart(nowMs, startMs, meetingType.durationMin)) {
            return { kind: "slot_unavailable" };
          }

          const endMs = startMs + meetingType.durationMin * 60_000;
          if (!overlapGuardsDisabled()) {
            const overlap = db
              .prepare(
                "SELECT id FROM bookings WHERE start_ms < ? AND end_ms > ? LIMIT 1",
              )
              .get(endMs, startMs);
            if (overlap) return { kind: "slot_taken" };
          }

          try {
            db.prepare(
              `INSERT INTO bookings
              (meeting_type_id, start_ms, end_ms, guest_name, guest_email, comment, created_at_ms)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            ).run(
              meetingTypeId,
              startMs,
              endMs,
              parsed.value.guestName,
              parsed.value.guestEmail,
              parsed.value.comment ?? null,
              nowMs,
            );
          } catch (error) {
            if (isOverlapError(error)) return { kind: "slot_taken" };
            throw error;
          }

          const owner = db
            .prepare(
              "SELECT display_name AS displayName FROM owner WHERE id = 1",
            )
            .get() as Owner | undefined;
          if (!owner) throw new Error("Owner is missing");

          return {
            kind: "created",
            confirmation: {
              meetingType,
              start: new Date(startMs).toISOString(),
              end: new Date(endMs).toISOString(),
              durationMin: meetingType.durationMin,
              ownerName: owner.displayName,
              guestName: parsed.value.guestName,
              guestEmail: parsed.value.guestEmail,
              ...(parsed.value.comment !== undefined
                ? { comment: parsed.value.comment }
                : {}),
              createdAt: new Date(nowMs).toISOString(),
            },
          };
        })
        .immediate();

      if (outcome.kind === "not_found") {
        return sendError(reply, 404, notFound("Meeting type not found"));
      }
      if (outcome.kind === "slot_unavailable") {
        return sendError(reply, 422, slotUnavailable());
      }
      if (outcome.kind === "slot_taken") {
        return sendError(reply, 409, slotTaken());
      }
      return reply.code(201).send(outcome.confirmation);
    } catch (error) {
      if (isSqliteBusy(error)) {
        return sendError(reply, 503, serviceBusy());
      }
      return sendError(reply, 500, internalError());
    }
  });

  app.get<{ Reply: Owner | ErrorResponse }>(
    "/api/admin/owner",
    async (_req, reply) => {
      try {
        const row = db
          .prepare("SELECT display_name AS displayName FROM owner WHERE id = 1")
          .get() as Owner | undefined;
        if (!row) return sendError(reply, 500, internalError());
        return row;
      } catch {
        return sendError(reply, 500, internalError());
      }
    },
  );

  app.patch<{ Body: UpdateOwnerRequest; Reply: Owner | ErrorResponse }>(
    "/api/admin/owner",
    async (req, reply) => {
      const parsed = validateOwnerBody(req.body);
      if (!parsed.ok)
        return sendError(reply, 422, validationError(parsed.fieldErrors));
      try {
        db.prepare("UPDATE owner SET display_name = ? WHERE id = 1").run(
          parsed.value.displayName,
        );
        return { displayName: parsed.value.displayName };
      } catch {
        return sendError(reply, 500, internalError());
      }
    },
  );

  app.get<{ Reply: AdminMeetingType[] | ErrorResponse }>(
    "/api/admin/meeting-types",
    async (_req, reply) => {
      try {
        const rows = db
          .prepare(
            `
            SELECT id, name, description, duration_min AS durationMin, archived_at_ms AS archivedAtMs
            FROM meeting_types
            ORDER BY CASE WHEN archived_at_ms IS NULL THEN 0 ELSE 1 END, id ASC
          `,
          )
          .all() as AdminMeetingType[];
        return rows.map(toAdminMeetingType);
      } catch {
        return sendError(reply, 500, internalError());
      }
    },
  );

  app.post<{
    Body: CreateMeetingTypeRequest;
    Reply: AdminMeetingType | ErrorResponse;
  }>("/api/admin/meeting-types", async (req, reply) => {
    if (!isRecord(req.body)) return sendError(reply, 400, invalidRequest());
    const parsed = validateMeetingTypeBody(req.body);
    if (!parsed.ok)
      return sendError(reply, 422, validationError(parsed.fieldErrors));
    try {
      const info = db
        .prepare(
          "INSERT INTO meeting_types (name, description, duration_min, archived_at_ms) VALUES (?, ?, ?, NULL)",
        )
        .run(
          parsed.value.name,
          parsed.value.description,
          parsed.value.durationMin,
        );
      const row = db
        .prepare(
          "SELECT id, name, description, duration_min AS durationMin, archived_at_ms AS archivedAtMs FROM meeting_types WHERE id = ?",
        )
        .get(Number(info.lastInsertRowid)) as AdminMeetingType | undefined;
      if (!row) return sendError(reply, 500, internalError());
      return reply.code(201).send(row);
    } catch {
      return sendError(reply, 500, internalError());
    }
  });

  app.get<{ Params: { id: string }; Reply: AdminMeetingType | ErrorResponse }>(
    "/api/admin/meeting-types/:id",
    async (req, reply) => {
      const id = parseIdParam(req.params.id);
      if (id === null)
        return sendError(reply, 400, invalidRequest("Invalid meeting type id"));
      try {
        const row = db
          .prepare(
            "SELECT id, name, description, duration_min AS durationMin, archived_at_ms AS archivedAtMs FROM meeting_types WHERE id = ?",
          )
          .get(id) as AdminMeetingType | undefined;
        if (!row)
          return sendError(reply, 404, notFound("Meeting type not found"));
        return row;
      } catch {
        return sendError(reply, 500, internalError());
      }
    },
  );

  app.patch<{
    Params: { id: string };
    Body: UpdateMeetingTypeRequest;
    Reply: AdminMeetingType | ErrorResponse;
  }>("/api/admin/meeting-types/:id", async (req, reply) => {
    const id = parseIdParam(req.params.id);
    if (id === null)
      return sendError(reply, 400, invalidRequest("Invalid meeting type id"));
    if (!isRecord(req.body)) return sendError(reply, 400, invalidRequest());
    const parsed = validateMeetingTypeBody(req.body);
    if (!parsed.ok)
      return sendError(reply, 422, validationError(parsed.fieldErrors));
    try {
      const existing = db
        .prepare(
          "SELECT id, archived_at_ms AS archivedAtMs FROM meeting_types WHERE id = ?",
        )
        .get(id) as { id: number; archivedAtMs: number | null } | undefined;
      if (!existing)
        return sendError(reply, 404, notFound("Meeting type not found"));
      if (existing.archivedAtMs !== null) {
        return sendError(
          reply,
          422,
          validationError([
            {
              field: "meetingType",
              message: "Archived meeting type is read-only",
            },
          ]),
        );
      }
      db.prepare(
        "UPDATE meeting_types SET name = ?, description = ?, duration_min = ? WHERE id = ?",
      ).run(
        parsed.value.name,
        parsed.value.description,
        parsed.value.durationMin,
        id,
      );
      const row = db
        .prepare(
          "SELECT id, name, description, duration_min AS durationMin, archived_at_ms AS archivedAtMs FROM meeting_types WHERE id = ?",
        )
        .get(id) as AdminMeetingType | undefined;
      if (!row) return sendError(reply, 500, internalError());
      return row;
    } catch {
      return sendError(reply, 500, internalError());
    }
  });

  app.post<{ Params: { id: string }; Reply: AdminMeetingType | ErrorResponse }>(
    "/api/admin/meeting-types/:id/archive",
    async (req, reply) => {
      const id = parseIdParam(req.params.id);
      if (id === null)
        return sendError(reply, 400, invalidRequest("Invalid meeting type id"));
      try {
        const existing = db
          .prepare(
            "SELECT id, archived_at_ms AS archivedAtMs FROM meeting_types WHERE id = ?",
          )
          .get(id) as { id: number; archivedAtMs: number | null } | undefined;
        if (!existing)
          return sendError(reply, 404, notFound("Meeting type not found"));
        if (existing.archivedAtMs === null) {
          db.prepare(
            "UPDATE meeting_types SET archived_at_ms = ? WHERE id = ?",
          ).run(clock.now(), id);
        }
        const row = db
          .prepare(
            "SELECT id, name, description, duration_min AS durationMin, archived_at_ms AS archivedAtMs FROM meeting_types WHERE id = ?",
          )
          .get(id) as AdminMeetingType | undefined;
        if (!row) return sendError(reply, 500, internalError());
        return row;
      } catch {
        return sendError(reply, 500, internalError());
      }
    },
  );

  app.post<{ Params: { id: string }; Reply: AdminMeetingType | ErrorResponse }>(
    "/api/admin/meeting-types/:id/restore",
    async (req, reply) => {
      const id = parseIdParam(req.params.id);
      if (id === null)
        return sendError(reply, 400, invalidRequest("Invalid meeting type id"));
      try {
        const existing = db
          .prepare("SELECT id FROM meeting_types WHERE id = ?")
          .get(id) as { id: number } | undefined;
        if (!existing)
          return sendError(reply, 404, notFound("Meeting type not found"));
        db.prepare(
          "UPDATE meeting_types SET archived_at_ms = NULL WHERE id = ?",
        ).run(id);
        const row = db
          .prepare(
            "SELECT id, name, description, duration_min AS durationMin, archived_at_ms AS archivedAtMs FROM meeting_types WHERE id = ?",
          )
          .get(id) as AdminMeetingType | undefined;
        if (!row) return sendError(reply, 500, internalError());
        return row;
      } catch {
        return sendError(reply, 500, internalError());
      }
    },
  );

  return app;
}
