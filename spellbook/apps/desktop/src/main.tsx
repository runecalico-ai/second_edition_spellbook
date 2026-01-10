import React from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createBrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./ui/App";
import CharacterManager from "./ui/CharacterManager";
import Chat from "./ui/Chat";
import ExportPage from "./ui/ExportPage";
import ImportWizard from "./ui/ImportWizard";
import Library from "./ui/Library";
import SpellEditor from "./ui/SpellEditor";

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
