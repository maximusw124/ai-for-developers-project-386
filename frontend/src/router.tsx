import { Route, Routes } from "react-router-dom";
import { AdminPage } from "./pages/AdminPage";
import { BookingPage } from "./pages/BookingPage";
import { BookingTypePage } from "./pages/BookingTypePage";
import { HomePage } from "./pages/HomePage";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/book" element={<BookingPage />} />
      <Route path="/book/:meetingTypeId" element={<BookingTypePage />} />
      <Route path="/admin" element={<AdminPage />} />
    </Routes>
  );
}
