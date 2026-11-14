import { Link } from "react-router-dom";

type SiteHeaderProps = {
  showBookingCta?: boolean;
  showBackLink?: boolean;
};

export function SiteHeader({
  showBookingCta = true,
  showBackLink = false,
}: SiteHeaderProps) {
  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <Link className="site-header__brand" to="/">
          Календарь звонков
        </Link>
        <nav className="site-header__nav" aria-label="Основная навигация">
          {showBackLink ? (
            <Link className="site-header__back" to="/">
              ← На главную
            </Link>
          ) : null}
          {showBookingCta ? (
            <Link className="button button--primary" to="/book">
              Записаться
            </Link>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
