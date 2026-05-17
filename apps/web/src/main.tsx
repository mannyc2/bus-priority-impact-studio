import { createRoot } from "react-dom/client";
import "./global.css";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "./router.js";
import { installRouterEventObservers } from "./router-events.js";

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("Missing #root element");
}

installRouterEventObservers(router);

createRoot(rootElement).render(<RouterProvider router={router} />);
