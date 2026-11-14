import { Link } from "react-router-dom";
import { SiteLayout } from "../components/SiteLayout";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import "./HomePage.css";

const steps = [
  {
    title: "Выберите тип встречи",
    description:
      "Короткий звонок, консультация или другой формат — с понятной длительностью.",
  },
  {
    title: "Найдите свободное время",
    description:
      "Откройте календарь и выберите слот, который подходит вам и владельцу.",
  },
  {
    title: "Подтвердите запись",
    description:
      "Оставьте имя и email — после этого встреча появится в расписании.",
  },
];

const benefits = [
  {
    title: "Без переписки",
    description:
      "Свободное время видно сразу, не нужно согласовывать даты в сообщениях.",
  },
  {
    title: "Понятный выбор",
    description: "Тип встречи, длительность и формат собраны в одном месте.",
  },
  {
    title: "Быстрое подтверждение",
    description:
      "Форма занимает меньше минуты, а результат виден сразу после отправки.",
  },
];

const previewSlots = ["10:00", "12:30", "15:00", "17:30"];

export function HomePage() {
  useDocumentTitle("Календарь звонков — запись на встречу онлайн");

  return (
    <SiteLayout>
      <section className="hero">
        <div className="container hero__inner">
          <div className="hero__content">
            <p className="eyebrow">Онлайн-запись на встречи</p>
            <h1>Записывайтесь на звонок в удобное время</h1>
            <p className="hero__lead">
              Выберите тип встречи и свободный слот, оставьте контакты — и
              встреча назначена. Без переписки и долгих согласований.
            </p>
            <div className="hero__actions">
              <Link className="button button--primary" to="/book">
                Записаться на звонок
              </Link>
              <a className="text-link" href="#how-it-works">
                Как это работает
              </a>
            </div>
          </div>
          <div className="slot-preview" aria-hidden="true">
            <div className="slot-preview__header">
              <span>Свободное время</span>
              <span className="slot-preview__date">Сегодня</span>
            </div>
            <div className="slot-preview__grid">
              {previewSlots.map((slot, index) => (
                <span
                  className={index === 1 ? "slot slot--selected" : "slot"}
                  key={slot}
                >
                  {slot}
                </span>
              ))}
            </div>
            <p className="slot-preview__caption">Пример доступных слотов</p>
          </div>
        </div>
      </section>

      <section className="section" id="how-it-works">
        <div className="container">
          <div className="section__heading">
            <p className="eyebrow">Простой сценарий</p>
            <h2>Как это работает</h2>
            <p>Три шага от ссылки до подтверждённой встречи.</p>
          </div>
          <ol className="steps">
            {steps.map((step, index) => (
              <li className="card step" key={step.title}>
                <span className="step__number">{index + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section section--muted">
        <div className="container">
          <div className="section__heading">
            <p className="eyebrow">Преимущества</p>
            <h2>Почему это удобно</h2>
            <p>Всё, что нужно для записи, — на одной странице.</p>
          </div>
          <ul className="benefits">
            {benefits.map((benefit) => (
              <li className="card benefit" key={benefit.title}>
                <h3>{benefit.title}</h3>
                <p>{benefit.description}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section owner-section">
        <div className="container owner-section__inner">
          <div>
            <p className="eyebrow">Для владельца</p>
            <h2>Принимаете звонки?</h2>
            <p>
              Настройте типы встреч и расписание — гости сами выберут удобное
              время.
            </p>
          </div>
          <Link className="button button--secondary" to="/book">
            Посмотреть страницу записи
          </Link>
        </div>
      </section>

      <section className="section final-cta">
        <div className="container final-cta__inner">
          <h2>Готовы выбрать время?</h2>
          <p>Запись занимает меньше минуты.</p>
          <Link className="button button--primary" to="/book">
            Записаться на звонок
          </Link>
        </div>
      </section>
    </SiteLayout>
  );
}
