import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { applyAppearancePreference } from "./lib/appearance";
import "./styles.css";

applyAppearancePreference();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
