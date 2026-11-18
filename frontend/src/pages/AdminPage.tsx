import { useCallback, useEffect, useRef, useState } from "react";
import "../api/client";
import {
  archiveMeetingType,
  createMeetingType,
  getOwner,
  listAdminMeetingTypes,
  listUpcomingBookings,
  restoreMeetingType,
  updateMeetingType,
  updateOwner,
} from "../api/generated/sdk.gen";
import type {
  AdminMeetingType,
  ErrorResponse,
  UpcomingBooking,
} from "../api/generated/types.gen";
import {
  formatMoscowDateTime,
  formatMoscowInterval,
} from "../components/AvailabilityPicker";
import { SiteLayout } from "../components/SiteLayout";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import "./AdminPage.css";

function fieldErrorMap(err?: ErrorResponse): Record<string, string> {
  const map: Record<string, string> = {};
  for (const fe of err?.fieldErrors ?? []) map[fe.field] = fe.message;
  return map;
}

function FieldErrors({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p className="form-error" id={id}>
      {message}
    </p>
  );
}

type MeetingTypeFormState = {
  name: string;
  description: string;
  durationMin: string;
};

function toFormState(mt?: AdminMeetingType): MeetingTypeFormState {
  return {
    name: mt?.name ?? "",
    description: mt?.description ?? "",
    durationMin: mt ? String(mt.durationMin) : "30",
  };
}

const MOSCOW_DATE_KEY_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Moscow",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const MOSCOW_DATE_FORMATTER = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "UTC",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

function moscowDateKey(instant: string): string {
  const parts = MOSCOW_DATE_KEY_FORMATTER.formatToParts(new Date(instant));
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function formatMoscowDate(instant: string): string {
  return MOSCOW_DATE_FORMATTER.format(
    new Date(`${moscowDateKey(instant)}T00:00:00.000Z`),
  );
}

function groupByMoscowDate(bookings: UpcomingBooking[]): Array<{
  date: string;
  bookings: UpcomingBooking[];
}> {
  const groups = new Map<string, UpcomingBooking[]>();
  for (const booking of bookings) {
    const date = moscowDateKey(booking.start);
    const group = groups.get(date);
    if (group) group.push(booking);
    else groups.set(date, [booking]);
  }
  return Array.from(groups, ([date, items]) => ({
    date,
    bookings: items,
  })).sort((a, b) => a.date.localeCompare(b.date));
}

function isOngoing(booking: UpcomingBooking, nowMs = Date.now()): boolean {
  return Date.parse(booking.start) <= nowMs && Date.parse(booking.end) > nowMs;
}

type UpcomingState =
  | { status: "loading" }
  | { status: "ready"; bookings: UpcomingBooking[] }
  | { status: "error"; message: string };

function MeetingTypeEditor({
  meetingType,
  onSaved,
  onCancel,
}: {
  meetingType?: AdminMeetingType;
  onSaved: (msg: string) => void;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState<MeetingTypeFormState>(
    toFormState(meetingType),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setServerError(null);
    setBusy(true);
    const body = {
      name: form.name,
      description: form.description,
      durationMin: Number(form.durationMin),
    };
    try {
      const res = meetingType
        ? await updateMeetingType({ path: { id: meetingType.id }, body })
        : await createMeetingType({ body });
      if (res.error) {
        const err = res.error as ErrorResponse;
        if (err.code === "validation_error") {
          setErrors(fieldErrorMap(err));
          setTimeout(() => nameRef.current?.focus(), 0);
        } else {
          setServerError(err.message || "Server error");
        }
        return;
      }
      onSaved(meetingType ? "Тип встречи обновлён" : "Тип встречи создан");
      if (!meetingType) setForm(toFormState());
    } catch {
      setServerError("Server error");
    } finally {
      setBusy(false);
    }
  };

  const nameErrId = `mt-${meetingType?.id ?? "new"}-name-error`;
  const descErrId = `mt-${meetingType?.id ?? "new"}-desc-error`;
  const durErrId = `mt-${meetingType?.id ?? "new"}-dur-error`;

  return (
    <form className="inline-form" onSubmit={submit}>
      {serverError ? (
        <p role="alert" className="form-alert">
          {serverError}
        </p>
      ) : null}
      <div className="field">
        <label htmlFor={`mt-${meetingType?.id ?? "new"}-name`}>Название</label>
        <input
          id={`mt-${meetingType?.id ?? "new"}-name`}
          ref={nameRef}
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          aria-invalid={errors.name ? "true" : undefined}
          aria-describedby={errors.name ? nameErrId : undefined}
        />
        <FieldErrors id={nameErrId} message={errors.name} />
      </div>
      <div className="field">
        <label htmlFor={`mt-${meetingType?.id ?? "new"}-desc`}>Описание</label>
        <textarea
          id={`mt-${meetingType?.id ?? "new"}-desc`}
          value={form.description}
          onChange={(e) =>
            setForm((f) => ({ ...f, description: e.target.value }))
          }
          aria-invalid={errors.description ? "true" : undefined}
          aria-describedby={errors.description ? descErrId : undefined}
        />
        <FieldErrors id={descErrId} message={errors.description} />
      </div>
      <div className="field">
        <label htmlFor={`mt-${meetingType?.id ?? "new"}-dur`}>
          Длительность (мин)
        </label>
        <input
          id={`mt-${meetingType?.id ?? "new"}-dur`}
          type="number"
          value={form.durationMin}
          onChange={(e) =>
            setForm((f) => ({ ...f, durationMin: e.target.value }))
          }
          aria-invalid={errors.durationMin ? "true" : undefined}
          aria-describedby={errors.durationMin ? durErrId : undefined}
        />
        <FieldErrors id={durErrId} message={errors.durationMin} />
      </div>
      <div className="form-actions">
        <button
          type="submit"
          className="button button--primary"
          disabled={busy}
        >
          Сохранить
        </button>
        {onCancel ? (
          <button
            type="button"
            className="button button--secondary"
            onClick={onCancel}
            disabled={busy}
          >
            Отмена
          </button>
        ) : null}
      </div>
    </form>
  );
}

export function AdminPage() {
  useDocumentTitle("Админка — Календарь звонков");
  const [ownerName, setOwnerName] = useState("");
  const [ownerLoaded, setOwnerLoaded] = useState(false);
  const [ownerError, setOwnerError] = useState<string | null>(null);
  const [ownerFieldError, setOwnerFieldError] = useState<string | undefined>();
  const [ownerBusy, setOwnerBusy] = useState(false);
  const ownerInputRef = useRef<HTMLInputElement>(null);
  const [types, setTypes] = useState<AdminMeetingType[]>([]);
  const [typesError, setTypesError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [pendingArchiveId, setPendingArchiveId] = useState<number | null>(null);
  const [busyTypeId, setBusyTypeId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [upcomingState, setUpcomingState] = useState<UpcomingState>({
    status: "loading",
  });
  const [upcomingUpdating, setUpcomingUpdating] = useState(false);
  const [success, setSuccess] = useState("");
  const successRef = useRef<HTMLParagraphElement>(null);
  const confirmArchiveRef = useRef<HTMLButtonElement>(null);
  const archiveTriggerRefs = useRef<Record<number, HTMLButtonElement | null>>(
    {},
  );

  const announce = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => successRef.current?.focus(), 0);
  };

  useEffect(() => {
    if (pendingArchiveId !== null) {
      confirmArchiveRef.current?.focus();
    }
  }, [pendingArchiveId]);

  const loadOwner = useCallback(async () => {
    try {
      const res = await getOwner();
      if (res.error) {
        setOwnerError((res.error as ErrorResponse).message || "Server error");
        return;
      }
      setOwnerName(res.data?.displayName ?? "");
    } catch {
      setOwnerError("Server error");
    } finally {
      setOwnerLoaded(true);
    }
  }, []);

  const loadTypes = useCallback(async () => {
    try {
      const res = await listAdminMeetingTypes();
      if (res.error) {
        setTypesError((res.error as ErrorResponse).message || "Server error");
        return;
      }
      setTypes(res.data ?? []);
      setTypesError(null);
    } catch {
      setTypesError("Server error");
    }
  }, []);

  const loadUpcoming = useCallback(async () => {
    setUpcomingUpdating(true);
    try {
      const res = await listUpcomingBookings();
      if (res.error) {
        setUpcomingState({
          status: "error",
          message: (res.error as ErrorResponse).message || "Server error",
        });
        return;
      }
      setUpcomingState({ status: "ready", bookings: res.data ?? [] });
    } catch {
      setUpcomingState({ status: "error", message: "Server error" });
    } finally {
      setUpcomingUpdating(false);
    }
  }, []);

  useEffect(() => {
    loadOwner();
    loadTypes();
  }, [loadOwner, loadTypes]);

  useEffect(() => {
    loadUpcoming();
  }, [loadUpcoming]);

  const saveOwner = async (e: React.FormEvent) => {
    e.preventDefault();
    setOwnerFieldError(undefined);
    setOwnerError(null);
    setOwnerBusy(true);
    try {
      const res = await updateOwner({ body: { displayName: ownerName } });
      if (res.error) {
        const err = res.error as ErrorResponse;
        if (err.code === "validation_error") {
          setOwnerFieldError(fieldErrorMap(err).displayName || err.message);
          ownerInputRef.current?.focus();
        } else {
          setOwnerError(err.message || "Server error");
        }
        return;
      }
      setOwnerName(res.data?.displayName ?? ownerName);
      announce("Имя владельца сохранено");
    } catch {
      setOwnerError("Server error");
    } finally {
      setOwnerBusy(false);
    }
  };

  const archiveType = async (id: number) => {
    setActionError(null);
    setBusyTypeId(id);
    try {
      const res = await archiveMeetingType({ path: { id } });
      if (res.error) {
        setActionError((res.error as ErrorResponse).message || "Server error");
        return;
      }
      setPendingArchiveId(null);
      announce("Тип встречи архивирован");
      await loadTypes();
    } catch {
      setActionError("Server error");
    } finally {
      setBusyTypeId(null);
    }
  };

  const restoreType = async (id: number) => {
    setActionError(null);
    setBusyTypeId(id);
    try {
      const res = await restoreMeetingType({ path: { id } });
      if (res.error) {
        setActionError((res.error as ErrorResponse).message || "Server error");
        return;
      }
      announce("Тип встречи восстановлен");
      await loadTypes();
    } catch {
      setActionError("Server error");
    } finally {
      setBusyTypeId(null);
    }
  };

  const cancelArchive = () => {
    const id = pendingArchiveId;
    setPendingArchiveId(null);
    if (id !== null) {
      setTimeout(() => archiveTriggerRefs.current[id]?.focus(), 0);
    }
  };

  const active = types.filter((t) => t.archivedAtMs == null);
  const archived = types.filter((t) => t.archivedAtMs != null);

  return (
    <SiteLayout showBookingCta={false} showBackLink>
      <section className="admin">
        <div className="container">
          <h1>Админка</h1>
          <p className="demo-banner" role="note">
            Демо-режим: страница без авторизации. Не используйте в продакшене.
          </p>
          <p
            className="visually-live"
            aria-live="polite"
            tabIndex={-1}
            ref={successRef}
          >
            {success}
          </p>

          <section
            aria-labelledby="profile-heading"
            className="admin-section card"
          >
            <h2 id="profile-heading">Профиль</h2>
            {ownerError ? <p role="alert">{ownerError}</p> : null}
            {ownerLoaded ? (
              <form onSubmit={saveOwner} className="inline-form">
                <div className="field">
                  <label htmlFor="owner-name">Имя владельца</label>
                  <input
                    id="owner-name"
                    ref={ownerInputRef}
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    aria-invalid={ownerFieldError ? "true" : undefined}
                    aria-describedby={
                      ownerFieldError ? "owner-name-error" : undefined
                    }
                  />
                  <FieldErrors
                    id="owner-name-error"
                    message={ownerFieldError}
                  />
                </div>
                <div className="form-actions">
                  <button
                    type="submit"
                    className="button button--primary"
                    disabled={ownerBusy}
                  >
                    Сохранить
                  </button>
                </div>
              </form>
            ) : (
              <p>Загрузка…</p>
            )}
          </section>

          <section
            aria-labelledby="types-heading"
            className="admin-section card"
          >
            <h2 id="types-heading">Типы встреч</h2>
            {typesError ? <p role="alert">{typesError}</p> : null}
            {actionError ? <p role="alert">{actionError}</p> : null}
            <h3>Создать тип встречи</h3>
            <MeetingTypeEditor
              onSaved={(msg) => {
                announce(msg);
                loadTypes();
              }}
            />

            <h3>Список</h3>
            {active.length === 0 && archived.length === 0 ? (
              <p>Типов встреч пока нет.</p>
            ) : null}
            {active.length > 0 ? (
              <>
                <h4>Активные</h4>
                <ul className="admin-types-list">
                  {active.map((mt) => (
                    <li key={mt.id} className="admin-type-item">
                      {editingId === mt.id ? (
                        <MeetingTypeEditor
                          meetingType={mt}
                          onSaved={(msg) => {
                            announce(msg);
                            setEditingId(null);
                            loadTypes();
                          }}
                          onCancel={() => setEditingId(null)}
                        />
                      ) : (
                        <div>
                          <div className="admin-type-summary">
                            <strong>{mt.name}</strong>{" "}
                            <span>({mt.durationMin} мин)</span>
                            <span className="badge status-badge">Активный</span>
                          </div>
                          {mt.description ? <p>{mt.description}</p> : null}
                          <div className="admin-type-actions">
                            <button
                              type="button"
                              className="button button--secondary"
                              onClick={() => setEditingId(mt.id)}
                              disabled={
                                pendingArchiveId === mt.id ||
                                busyTypeId === mt.id
                              }
                            >
                              Редактировать
                            </button>
                            {pendingArchiveId === mt.id ? (
                              <fieldset className="archive-confirm">
                                <legend
                                  className="archive-confirm__warning"
                                  id={`archive-warning-${mt.id}`}
                                >
                                  Тип исчезнет из записи, существующие встречи
                                  сохранятся.
                                </legend>
                                <div className="form-actions">
                                  <button
                                    type="button"
                                    ref={confirmArchiveRef}
                                    className="button button--danger"
                                    onClick={() => archiveType(mt.id)}
                                    disabled={busyTypeId === mt.id}
                                    aria-describedby={`archive-warning-${mt.id}`}
                                  >
                                    Подтвердить архивацию
                                  </button>
                                  <button
                                    type="button"
                                    className="button button--secondary"
                                    onClick={cancelArchive}
                                    disabled={busyTypeId === mt.id}
                                  >
                                    Отмена
                                  </button>
                                </div>
                              </fieldset>
                            ) : (
                              <button
                                type="button"
                                ref={(node) => {
                                  archiveTriggerRefs.current[mt.id] = node;
                                }}
                                className="button button--secondary"
                                onClick={() => {
                                  setActionError(null);
                                  setPendingArchiveId(mt.id);
                                }}
                              >
                                Архивировать
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {archived.length > 0 ? (
              <>
                <h4>Архивные</h4>
                <ul className="admin-types-list">
                  {archived.map((mt) => (
                    <li key={mt.id} className="admin-type-item">
                      <div className="admin-type-summary">
                        <strong>{mt.name}</strong>{" "}
                        <span>({mt.durationMin} мин)</span>
                        <span className="badge status-badge status-badge--archived">
                          Архив
                        </span>
                      </div>
                      {mt.description ? <p>{mt.description}</p> : null}
                      <p className="archive-note">
                        Архивный тип нельзя редактировать до восстановления.
                      </p>
                      <div className="admin-type-actions">
                        <button
                          type="button"
                          className="button button--secondary"
                          onClick={() => restoreType(mt.id)}
                          disabled={busyTypeId === mt.id}
                        >
                          Восстановить
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </section>

          <section
            aria-labelledby="upcoming-heading"
            className="admin-section card"
          >
            <div className="admin-section-heading">
              <h2 id="upcoming-heading">Предстоящие встречи</h2>
              <button
                type="button"
                className="button button--secondary"
                onClick={() => loadUpcoming()}
                disabled={upcomingUpdating}
              >
                Обновить
              </button>
            </div>
            <p className="timezone-hint">Время по Москве</p>
            {upcomingState.status === "error" && !upcomingUpdating ? (
              <div role="alert" className="form-alert">
                <p>{upcomingState.message}</p>
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => loadUpcoming()}
                >
                  Повторить
                </button>
              </div>
            ) : null}
            {upcomingState.status === "loading" || upcomingUpdating ? (
              <output className="upcoming-skeletons">
                <p className="visually-live">Загрузка встреч…</p>
                <span className="skeleton-row" aria-hidden="true" />
                <span className="skeleton-row" aria-hidden="true" />
                <span className="skeleton-row" aria-hidden="true" />
              </output>
            ) : null}
            {upcomingState.status === "ready" && !upcomingUpdating ? (
              upcomingState.bookings.length === 0 ? (
                <p>
                  Предстоящих встреч нет. Когда гости запишутся, встречи
                  появятся здесь
                </p>
              ) : (
                groupByMoscowDate(upcomingState.bookings).map((group) => (
                  <div key={group.date} className="booking-group">
                    <h3>{formatMoscowDate(group.bookings[0].start)}</h3>
                    <ul className="booking-list">
                      {group.bookings.map((booking) => (
                        <li key={booking.id} className="booking-card">
                          <div className="booking-card__heading">
                            <strong>{booking.meetingType.name}</strong>
                            <span>
                              {formatMoscowInterval({
                                start: booking.start,
                                end: booking.end,
                              })}
                            </span>
                            {isOngoing(booking) ? (
                              <span className="badge status-badge status-badge--now">
                                Сейчас
                              </span>
                            ) : null}
                            {booking.meetingType.archived ? (
                              <span className="badge status-badge status-badge--archived">
                                Тип в архиве
                              </span>
                            ) : null}
                          </div>
                          <dl className="booking-card__details">
                            <div>
                              <dt>Гость</dt>
                              <dd>{booking.guestName}</dd>
                            </div>
                            <div>
                              <dt>Email</dt>
                              <dd>
                                <a href={`mailto:${booking.guestEmail}`}>
                                  {booking.guestEmail}
                                </a>
                              </dd>
                            </div>
                            {booking.comment ? (
                              <div>
                                <dt>Комментарий</dt>
                                <dd>{booking.comment}</dd>
                              </div>
                            ) : null}
                            <div>
                              <dt>Создана</dt>
                              <dd>{formatMoscowDateTime(booking.createdAt)}</dd>
                            </div>
                          </dl>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )
            ) : null}
          </section>
        </div>
      </section>
    </SiteLayout>
  );
}
