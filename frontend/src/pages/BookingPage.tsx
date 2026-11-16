import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import "../api/client";
import { listPublicMeetingTypes } from "../api/generated/sdk.gen";
import type { PublicMeetingType } from "../api/generated/types.gen";
import { SiteLayout } from "../components/SiteLayout";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import "./BookingPage.css";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; meetingTypes: PublicMeetingType[] }
  | { status: "error" };

export function BookingPage() {
  useDocumentTitle("Запись на встречу — Календарь звонков");
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let isActive = true;

    listPublicMeetingTypes()
      .then(({ data, error }) => {
        if (!isActive) {
          return;
        }

        if (error) {
          setState({ status: "error" });
          return;
        }

        setState({ status: "ready", meetingTypes: data ?? [] });
      })
      .catch(() => {
        if (isActive) {
          setState({ status: "error" });
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

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
            <Link className="button button--secondary" to="/">
              Вернуться на главную
            </Link>
          </div>
          <div className="card booking-stub__card">
            <h2>Типы встреч</h2>
            {state.status === "loading" ? (
              <output>Загружаем типы встреч…</output>
            ) : null}
            {state.status === "error" ? (
              <p role="alert">
                Не удалось загрузить типы встреч. Обновите страницу.
              </p>
            ) : null}
            {state.status === "ready" && state.meetingTypes.length === 0 ? (
              <div className="booking-empty">
                <p>Пока нет доступных типов встреч.</p>
                <p>Владелец ещё не опубликовал ни одного типа встреч.</p>
              </div>
            ) : null}
            {state.status === "ready" && state.meetingTypes.length > 0 ? (
              <ul className="meeting-type-list">
                {state.meetingTypes.map((meetingType) => (
                  <li className="meeting-type" key={meetingType.id}>
                    <h3>{meetingType.name}</h3>
                    <p>{meetingType.description}</p>
                    <p className="meeting-type__duration">
                      {meetingType.durationMin} мин
                    </p>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </section>
    </SiteLayout>
  );
}
