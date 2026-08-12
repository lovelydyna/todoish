import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Lets `npm run dev` render in a plain browser. No-op inside the Tauri window.
if (import.meta.env.DEV) {
  const { installTauriMock } = await import("./dev/tauriMock");
  installTauriMock();
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
