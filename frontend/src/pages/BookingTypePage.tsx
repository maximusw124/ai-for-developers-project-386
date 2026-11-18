import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import "../api/client";
import { getPublicMeetingType } from "../api/generated/sdk.gen";
import type {
  ErrorResponse,
  PublicMeetingType,
} from "../api/generated/types.gen";
import { SiteLayout } from "../components/SiteLayout";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import "./BookingPage.css";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; meetingType: PublicMeetingType }
  | { status: "not_found" }
  | { status: "error" };

function parseIdParam(raw: string | undefined): number | null {
  if (!raw || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1 || id > 2147483647) return null;
  return id;
}

export function BookingTypePage() {
  useDocumentTitle("Запись на встречу — Календарь звонков");
  const { meetingTypeId } = useParams();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let isActive = true;
    const id = parseIdParam(meetingTypeId);

    if (id === null) {
      setState({ status: "not_found" });
      return;
    }

    setState({ status: "loading" });
    getPublicMeetingType({ path: { id } })
      .then(({ data, error }) => {
        if (!isActive) {
          return;
        }

        if (error) {
          const err = error as ErrorResponse;
          setState({
            status: err.code === "not_found" ? "not_found" : "error",
          });
          return;
        }

        if (!data) {
          setState({ status: "error" });
          return;
        }

        setState({ status: "ready", meetingType: data });
      })
      .catch(() => {
        if (isActive) {
          setState({ status: "error" });
        }
      });

    return () => {
      isActive = false;
    };
  }, [meetingTypeId]);

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
              <output>Загружаем тип встречи…</output>
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
                Не удалось загрузить тип встречи. Обновите страницу.
              </p>
            ) : null}
            {state.status === "ready" ? (
              <div>
                <h2>{state.meetingType.name}</h2>
                <p>{state.meetingType.description}</p>
                <p className="meeting-type__duration">
                  {state.meetingType.durationMin} мин
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </SiteLayout>
  );
}
