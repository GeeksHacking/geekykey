import "@fontsource-variable/open-sans";
import "@fontsource-variable/geist-mono";
import "@/styles/globals.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { AvatarLab } from "@/features/passport/avatar/lab/avatar-lab";

const root = document.getElementById("root");
if (!root) throw new Error("avatar-lab.html is missing the #root element");

createRoot(root).render(
  <StrictMode>
    <AvatarLab />
  </StrictMode>,
);
