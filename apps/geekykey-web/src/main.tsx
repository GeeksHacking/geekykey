import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "@/styles/globals.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "@/app";

const root = document.getElementById("root");
if (!root) throw new Error("index.html is missing the #root element");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
