import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./globals.css";
import App from "./App";
import TryEnforcementPage from "./pages/TryEnforcementPage";
import { ErrorBoundary } from "./components/shared/ErrorBoundary";

const path = window.location.pathname.replace(/\/+$/, "") || "/";
const isTryPage = path === "/try" || path === "/demo";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary>
      {isTryPage ? <TryEnforcementPage /> : <App />}
    </ErrorBoundary>
  </StrictMode>
);
