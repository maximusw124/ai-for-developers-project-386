import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import "../api/client";
import { createBooking, getAvailability } from "../api/generated/sdk.gen";
import type {
  Availability,
  BookingConfirmation,
  ErrorResponse,
  FieldError,
  Slot,
} from "../api/generated/types.gen";
import {
  AvailabilityPicker,
  formatMoscowDateTime,
  formatMoscowInterval,
} from "../components/AvailabilityPicker";
import { SiteLayout } from "../components/SiteLayout";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import "./BookingPage.css";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; availability: Availability }
  | { status: "not_found" }
  | { status: "error" };

type Contacts = {
  guestName: string;
  guestEmail: string;
  comment: string;
};

type FormError = { message: string; nonce: number };

function parseIdParam(raw: string | undefined): number | null {
  if (!raw || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1 || id > 2147483647) return null;
  return id;
}

function asErrorResponse(error: unknown): ErrorResponse | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  if (!("code" in error) || typeof error.code !== "string") return undefined;
  return error as ErrorResponse;
}

export function BookingTypePage() {
  useDocumentTitle("Запись на встречу — Календарь звонков");
  const { meetingTypeId } = useParams();
  const id = parseIdParam(meetingTypeId);
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [selectedSlot, setSelectedSlot] = useState<Slot>();
  const [confirmation, setConfirmation] = useState<BookingConfirmation>();
  const [contacts, setContacts] = useState<Contacts>({
    guestName: "",
    guestEmail: "",
    comment: "",
  });
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);
  const [formError, setFormError] = useState<FormError>();
  const [submitting, setSubmitting] = useState(false);
  const alertRef = useRef<HTMLParagraphElement>(null);
  const errorNonce = useRef(0);

  function showError(message: string) {
    errorNonce.current += 1;
    setFormError({ message, nonce: errorNonce.current });
  }

  function errorFor(field: string): FieldError | undefined {
    return fieldErrors.find((item) => item.field === field);
  }

  async function refreshAvailability(meetingTypeId: number) {
    const { data, error } = await getAvailability({
      path: { id: meetingTypeId },
    });
    if (data) {
      setState({ status: "ready", availability: data });
      return;
    }
    const err = asErrorResponse(error);
    setState({
      status: err?.code === "not_found" ? "not_found" : "error",
    });
  }

  useEffect(() => {
    let isActive = true;

    if (id === null) {
      setState({ status: "not_found" });
      return;
    }

    setState({ status: "loading" });
    setSelectedSlot(undefined);
    setConfirmation(undefined);
    getAvailability({ path: { id } })
      .then(({ data, error }) => {
        if (!isActive) return;
        const err = asErrorResponse(error);
        if (err) {
          setState({
            status: err.code === "not_found" ? "not_found" : "error",
          });
          return;
        }
        if (!data) {
          setState({ status: "error" });
          return;
        }
        setState({ status: "ready", availability: data });
      })
      .catch(() => {
        if (isActive) setState({ status: "error" });
      });

    return () => {
      isActive = false;
    };
  }, [id]);

  useEffect(() => {
    if (formError) alertRef.current?.focus();
  }, [formError]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (id === null || !selectedSlot || submitting) return;

    setSubmitting(true);
    setFieldErrors([]);
    setFormError(undefined);

    try {
      const { data, error } = await createBooking({
        body: {
          meetingTypeId: id,
          start: selectedSlot.start,
          guestName: contacts.guestName,
          guestEmail: contacts.guestEmail,
          ...(contacts.comment ? { comment: contacts.comment } : {}),
        },
      });

      if (data) {
        setConfirmation(data);
        setSelectedSlot(undefined);
        return;
      }

      const err = asErrorResponse(error);
      if (err?.code === "slot_taken" || err?.code === "slot_unavailable") {
        setSelectedSlot(undefined);
        showError("Это время уже занято. Выберите другое.");
        await refreshAvailability(id);
        return;
      }
      if (err?.code === "validation_error") {
        setFieldErrors(err.fieldErrors ?? []);
        showError("Проверьте данные формы.");
        return;
      }
      showError("Не удалось забронировать встречу. Попробуйте ещё раз.");
    } catch {
      showError("Не удалось забронировать встречу. Попробуйте ещё раз.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SiteLayout showBookingCta={false} showBackLink>
      <section className="booking-stub">
        <div className="container booking-stub__inner">
          <div className="booking-stub__content">
            <span className="badge">Запись</span>
            <h1>Запись на встречу</h1>
            <p className="booking-stub__lead">
              Выберите подходящий тип встречи. Время встреч указано по Москве.
            </p>
            <Link className="button button--secondary" to="/book">
              Все типы встреч
            </Link>
          </div>
          <div className="card booking-stub__card">
            {state.status === "loading" ? (
              <output>Загружаем доступные слоты…</output>
            ) : null}
            {state.status === "not_found" ? (
              <div className="booking-empty">
                <p role="alert">
                  Тип встречи не найден или больше не доступен для записи.
                </p>
                <p>Возможно, владелец архивировал его.</p>
              </div>
            ) : null}
            {state.status === "error" ? (
              <p role="alert">
                Не удалось загрузить доступные слоты. Обновите страницу.
              </p>
            ) : null}
            {state.status === "ready" && !confirmation ? (
              <div>
                <h2>{state.availability.meetingType.name}</h2>
                <p>{state.availability.meetingType.description}</p>
                <p className="meeting-type__duration">
                  {state.availability.meetingType.durationMin} мин
                </p>
                <AvailabilityPicker
                  days={state.availability.days}
                  selectedSlotStart={selectedSlot?.start}
                  onSelectSlot={setSelectedSlot}
                />
                {selectedSlot ? (
                  <output className="availability__selected">
                    Выбран слот: {formatMoscowInterval(selectedSlot)}
                  </output>
                ) : null}
                {formError ? (
                  <p
                    className="booking-form__alert"
                    role="alert"
                    ref={alertRef}
                    tabIndex={-1}
                  >
                    {formError.message}
                  </p>
                ) : null}
                {selectedSlot || formError ? (
                  <form
                    className="booking-form"
                    onSubmit={handleSubmit}
                    noValidate
                  >
                    <fieldset className="booking-form__fields">
                      <legend>Данные гостя</legend>
                      <div className="booking-form__field">
                        <label htmlFor="guestName">Имя</label>
                        <input
                          id="guestName"
                          name="guestName"
                          autoComplete="name"
                          value={contacts.guestName}
                          aria-invalid={Boolean(errorFor("guestName"))}
                          aria-describedby={
                            errorFor("guestName")
                              ? "guestName-error"
                              : undefined
                          }
                          onChange={(event) =>
                            setContacts({
                              ...contacts,
                              guestName: event.target.value,
                            })
                          }
                        />
                        {errorFor("guestName") ? (
                          <p
                            className="booking-form__error"
                            id="guestName-error"
                          >
                            {errorFor("guestName")?.message}
                          </p>
                        ) : null}
                      </div>
                      <div className="booking-form__field">
                        <label htmlFor="guestEmail">Email</label>
                        <input
                          id="guestEmail"
                          name="guestEmail"
                          type="email"
                          autoComplete="email"
                          value={contacts.guestEmail}
                          aria-invalid={Boolean(errorFor("guestEmail"))}
                          aria-describedby={
                            errorFor("guestEmail")
                              ? "guestEmail-error"
                              : undefined
                          }
                          onChange={(event) =>
                            setContacts({
                              ...contacts,
                              guestEmail: event.target.value,
                            })
                          }
                        />
                        {errorFor("guestEmail") ? (
                          <p
                            className="booking-form__error"
                            id="guestEmail-error"
                          >
                            {errorFor("guestEmail")?.message}
                          </p>
                        ) : null}
                      </div>
                      <div className="booking-form__field">
                        <label htmlFor="comment">
                          Комментарий (необязательно)
                        </label>
                        <textarea
                          id="comment"
                          name="comment"
                          rows={3}
                          value={contacts.comment}
                          aria-invalid={Boolean(errorFor("comment"))}
                          aria-describedby={
                            errorFor("comment") ? "comment-error" : undefined
                          }
                          onChange={(event) =>
                            setContacts({
                              ...contacts,
                              comment: event.target.value,
                            })
                          }
                        />
                        {errorFor("comment") ? (
                          <p className="booking-form__error" id="comment-error">
                            {errorFor("comment")?.message}
                          </p>
                        ) : null}
                      </div>
                    </fieldset>
                    <button
                      className="button button--primary"
                      type="submit"
                      disabled={submitting}
                    >
                      {submitting ? "Отправляем…" : "Подтвердить запись"}
                    </button>
                  </form>
                ) : null}
              </div>
            ) : null}
            {confirmation ? (
              <div className="booking-confirmation">
                <h2>Встреча забронирована</h2>
                <dl>
                  <dt>Тип встречи</dt>
                  <dd>{confirmation.meetingType.name}</dd>
                  <dt>Длительность</dt>
                  <dd>{confirmation.durationMin} мин</dd>
                  <dt>Время по Москве</dt>
                  <dd>
                    {formatMoscowInterval({
                      start: confirmation.start,
                      end: confirmation.end,
                    })}
                  </dd>
                  <dt>Владелец</dt>
                  <dd>{confirmation.ownerName}</dd>
                  <dt>Гость</dt>
                  <dd>{confirmation.guestName}</dd>
                  <dt>Email</dt>
                  <dd>{confirmation.guestEmail}</dd>
                  {confirmation.comment ? (
                    <>
                      <dt>Комментарий</dt>
                      <dd>{confirmation.comment}</dd>
                    </>
                  ) : null}
                  <dt>Создано</dt>
                  <dd>{formatMoscowDateTime(confirmation.createdAt)}</dd>
                </dl>
                <p className="booking-confirmation__notice" role="note">
                  Письмо с подтверждением не отправляется — сохраните данные
                  этой страницы.
                </p>
                <Link className="button button--primary" to="/book">
                  Записаться ещё раз
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </SiteLayout>
  );
}
