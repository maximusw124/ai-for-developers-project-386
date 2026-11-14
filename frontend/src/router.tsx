import { Route, Routes } from "react-router-dom";
import { BookingPage } from "./pages/BookingPage";
import { HomePage } from "./pages/HomePage";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/book" element={<BookingPage />} />
    </Routes>
  );
}
