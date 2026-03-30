import "./styles/base.css";
import "./styles/components.css";
import "./styles/themes.css";
import "./styles/responsive.css";
import "./mobile/mobile.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
