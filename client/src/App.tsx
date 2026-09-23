import { BrowserRouter, Routes, Route } from "react-router-dom";
import { DashboardRoute } from "@/routes/DashboardRoute";
import { NewProjectRoute } from "@/routes/NewProjectRoute";
import { EditorRoute } from "@/routes/EditorRoute";
import { NotFoundRoute } from "@/routes/NotFoundRoute";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DashboardRoute />} />
        <Route path="/new" element={<NewProjectRoute />} />
        <Route path="/editor/:projectId" element={<EditorRoute />} />
        <Route path="*" element={<NotFoundRoute />} />
      </Routes>
    </BrowserRouter>
  );
}
