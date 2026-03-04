import { ZeroProvider } from "@rocicorp/zero/react";
import { mutators, schema } from "@games/shared";
import { ThemeModeScript } from "flowbite-react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { getOrCreateSessionId } from "./lib/session";
import { HomePage } from "./pages/HomePage";
import { ImposterPage } from "./pages/ImposterPage";
import { PasswordBeginPage } from "./pages/PasswordBeginPage";
import { PasswordGamePage } from "./pages/PasswordGamePage";
import { PasswordResultsPage } from "./pages/PasswordResultsPage";

const sessionId = getOrCreateSessionId();

export function App() {
  return (
    <>
      <ThemeModeScript />
      <ZeroProvider
        userID={sessionId}
        cacheURL={import.meta.env.VITE_ZERO_CACHE_URL ?? "http://localhost:4848"}
        schema={schema}
        mutators={mutators}
      >
        <BrowserRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<HomePage sessionId={sessionId} />} />
              <Route path="/imposter/:id" element={<ImposterPage sessionId={sessionId} />} />
              <Route path="/password/:id/begin" element={<PasswordBeginPage sessionId={sessionId} />} />
              <Route path="/password/:id" element={<PasswordGamePage sessionId={sessionId} />} />
              <Route path="/password/:id/results" element={<PasswordResultsPage sessionId={sessionId} />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ZeroProvider>
    </>
  );
}
