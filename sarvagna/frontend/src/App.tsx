import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";

import { useAuthStore } from "./store/authStore";
import { authApi } from "./lib/api";

import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import SubjectPage from "./pages/SubjectPage";
import RoadmapPage from "./pages/RoadmapPage";
import ProgressPage from "./pages/ProgressPage";
import ChatPage from "./pages/ChatPage";
import MapPage from "./pages/MapPage";
import ModuleMapPage from "./pages/ModuleMapPage";
import MapLobbyPage from "./pages/MapLobbyPage";
import ErrorBoundary from "./components/ErrorBoundary";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { token, setUser } = useAuthStore();

  // Re-hydrate user profile on page load if token exists
  useEffect(() => {
    if (token) {
      authApi.me().then((r) => setUser(r.data)).catch(() => {});
    }
  }, [token, setUser]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<RequireAuth><ErrorBoundary><DashboardPage /></ErrorBoundary></RequireAuth>} />
      <Route path="/subject/:id" element={<RequireAuth><SubjectPage /></RequireAuth>} />
      <Route path="/roadmap/:subject_id" element={<RequireAuth><RoadmapPage /></RequireAuth>} />
      <Route path="/progress" element={<RequireAuth><ProgressPage /></RequireAuth>} />
      <Route path="/chat/:subjectId/:moduleNumber" element={<RequireAuth><ErrorBoundary><ChatPage /></ErrorBoundary></RequireAuth>} />
      <Route path="/map/:subjectId" element={<RequireAuth><ErrorBoundary><MapPage /></ErrorBoundary></RequireAuth>} />
      <Route path="/lobby/:subjectId/:moduleNumber" element={<RequireAuth><ErrorBoundary><MapLobbyPage /></ErrorBoundary></RequireAuth>} />
      <Route path="/modulemap/:subjectId/:moduleNumber" element={<RequireAuth><ErrorBoundary><ModuleMapPage /></ErrorBoundary></RequireAuth>} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
        <Toaster
          position="top-right"
          toastOptions={{
            style: { background: "#1a1a2e", color: "#f3f4f6", border: "1px solid #374151" },
          }}
        />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
