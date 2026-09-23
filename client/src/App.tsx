import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { DashboardRoute } from "@/routes/DashboardRoute";
import { NewProjectRoute } from "@/routes/NewProjectRoute";
import { EditorRoute } from "@/routes/EditorRoute";
import { SetupRoute } from "@/routes/SetupRoute";
import { NotFoundRoute } from "@/routes/NotFoundRoute";

/** Redirects to /setup until an OpenAI API key is configured (checked once on mount). */
function RequireApiKey({ children }: { children: React.ReactNode }) {
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data: { success: true; hasApiKey: boolean }) => {
        if (!cancelled) setHasApiKey(data.hasApiKey);
      })
      .catch(() => {
        // If the check itself fails, don't hard-block the app on it --
        // let the user in; any actual AI call will fail with its own
        // clear error if the key is really missing.
        if (!cancelled) setHasApiKey(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (hasApiKey === null) {
    return <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }
  if (!hasApiKey) {
    return <Navigate to="/setup" replace />;
  }
  return children;
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/setup" element={<SetupRoute />} />
        <Route
          path="/"
          element={
            <RequireApiKey>
              <DashboardRoute />
            </RequireApiKey>
          }
        />
        <Route
          path="/new"
          element={
            <RequireApiKey>
              <NewProjectRoute />
            </RequireApiKey>
          }
        />
        <Route
          path="/editor/:projectId"
          element={
            <RequireApiKey>
              <EditorRoute />
            </RequireApiKey>
          }
        />
        <Route path="*" element={<NotFoundRoute />} />
      </Routes>
    </BrowserRouter>
  );
}
