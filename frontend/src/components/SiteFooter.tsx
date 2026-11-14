import { Link } from "react-router-dom";

type SiteFooterProps = {
  showBookingLink?: boolean;
};

export function SiteFooter({ showBookingLink = true }: SiteFooterProps) {
  return (
    <footer className="site-footer">
      <div className="container site-footer__inner">
        <div>
          <p className="site-footer__brand">Календарь звонков</p>
          <p className="site-footer__tagline">
            Сервис записи на встречи онлайн.
          </p>
        </div>
        <div className="site-footer__meta">
          {showBookingLink ? <Link to="/book">Записаться</Link> : null}
          <p>© 2026 Календарь звонков</p>
        </div>
      </div>
    </footer>
  );
}
