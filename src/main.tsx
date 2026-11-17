import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./style.css";
import "./workbench.css";
import "./construction.css";
import "./personal.css";
import "./field-operations.css";
import "./experience.css";
import "./order-experience.css";
import { createKzh } from "./kzh";
import { useStore } from "./store";
import { createKzhDetails } from "./details";
const query = new URLSearchParams(window.location.search);
if (!query.has("demo"))
  useStore
    .getState()
    .load(
      query.get("assembly") === "details"
        ? createKzhDetails()
        : createKzh(
            query.get("assembly") === "canopy" ? "canopy" : "pavilion",
            query.get("variant") === "sections" ? "sections" : "plan",
          ),
    );
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
