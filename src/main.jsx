import { createRoot } from "react-dom/client";
import "./styles.css";
import App from "./App.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";
import "./fonts.css";   // keep this AFTER the other imports so Poppins wins everywhere
import "./print-documents.css";
import "./polish-v2.css";
import { applyTextSize } from "./textSize.js";
import { watchTables } from "./tableLabels.js";
watchTables();
applyTextSize();
createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);