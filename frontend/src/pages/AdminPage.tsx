import { useCallback, useEffect, useRef, useState } from "react";
import "../api/client";
import {
  createMeetingType,
  getOwner,
  listAdminMeetingTypes,
  updateMeetingType,
  updateOwner,
} from "../api/generated/sdk.gen";
import type {
  AdminMeetingType,
  ErrorResponse,
} from "../api/generated/types.gen";
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
  const [success, setSuccess] = useState("");
  const successRef = useRef<HTMLParagraphElement>(null);

  const announce = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => successRef.current?.focus(), 0);
  };

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

  useEffect(() => {
    loadOwner();
    loadTypes();
  }, [loadOwner, loadTypes]);

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
                          </div>
                          {mt.description ? <p>{mt.description}</p> : null}
                          <button
                            type="button"
                            className="button button--secondary"
                            onClick={() => setEditingId(mt.id)}
                          >
                            Редактировать
                          </button>
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
                        <span>({mt.durationMin} мин, архив)</span>
                      </div>
                      {mt.description ? <p>{mt.description}</p> : null}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </section>
        </div>
      </section>
    </SiteLayout>
  );
}
