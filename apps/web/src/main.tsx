import { createRoot } from "react-dom/client";
import { App } from "./App.js";

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("Missing #root element");
}

createRoot(rootElement).render(<App />);
