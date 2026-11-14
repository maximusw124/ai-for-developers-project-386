import type { ReactNode } from "react";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

type SiteLayoutProps = {
  children: ReactNode;
  showBookingCta?: boolean;
  showBackLink?: boolean;
};

export function SiteLayout({
  children,
  showBookingCta = true,
  showBackLink = false,
}: SiteLayoutProps) {
  return (
    <>
      <a className="skip-link" href="#main">
        Перейти к содержимому
      </a>
      <SiteHeader showBookingCta={showBookingCta} showBackLink={showBackLink} />
      <main id="main">{children}</main>
      <SiteFooter showBookingLink={showBookingCta} />
    </>
  );
}
