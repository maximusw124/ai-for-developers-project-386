import { Link } from "react-router-dom";
import { SiteLayout } from "../components/SiteLayout";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import "./BookingPage.css";

const upcomingFeatures = [
  "Выбор типа встречи и длительности",
  "Календарь со свободными слотами",
  "Форма с именем, email и комментарием",
];

export function BookingPage() {
  useDocumentTitle("Запись на звонок — Календарь звонков");

  return (
    <SiteLayout showBookingCta={false} showBackLink>
      <section className="booking-stub">
        <div className="container booking-stub__inner">
          <div className="booking-stub__content">
            <span className="badge">Скоро</span>
            <h1>Запись на звонок</h1>
            <p className="booking-stub__lead">
              Страница записи ещё в разработке. Скоро здесь можно будет выбрать
              тип встречи, свободный слот и заполнить форму.
            </p>
            <Link className="button button--secondary" to="/">
              Вернуться на главную
            </Link>
          </div>
          <div className="card booking-stub__card">
            <h2>Что появится здесь</h2>
            <ul>
              {upcomingFeatures.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </SiteLayout>
  );
}
