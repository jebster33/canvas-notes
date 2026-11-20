import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/inter";
import "highlight.js/styles/github-dark.css";
import "./styles.css";
import "./features.css";
import App from "./App";
import { CaptureApp } from "./components/CaptureApp";
import { initAppearance } from "./lib/appearance";

initAppearance();

// The same bundle serves the main window and the small quick-capture window.
const isCapture = new URLSearchParams(location.search).has("capture");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{isCapture ? <CaptureApp /> : <App />}</React.StrictMode>,
);
