import React from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import "./index.css";
import App from "./ui/App";
import Library from "./ui/Library";
import ImportWizard from "./ui/ImportWizard";
import Chat from "./ui/Chat";
import ExportPage from "./ui/ExportPage";
import SpellEditor from "./ui/SpellEditor";
import CharacterManager from "./ui/CharacterManager";

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <Library /> },
      { path: "import", element: <ImportWizard /> },
      { path: "chat", element: <Chat /> },
      { path: "export", element: <ExportPage /> },
      { path: "edit/:id", element: <SpellEditor /> },
      { path: "character", element: <CharacterManager /> },
    ],
  },
]);

const root = document.getElementById("root");

if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <RouterProvider router={router} />
    </React.StrictMode>,
  );
} else {
  console.error("Root element not found for React app.");
}
