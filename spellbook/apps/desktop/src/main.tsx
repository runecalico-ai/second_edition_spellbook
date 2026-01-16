import React from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createBrowserRouter } from "react-router-dom";
import "./index.css";
import { useParams } from "react-router-dom";
import App from "./ui/App";
import CharacterManager from "./ui/CharacterManager";
import Chat from "./ui/Chat";
import ExportPage from "./ui/ExportPage";
import ImportWizard from "./ui/ImportWizard";
import Library from "./ui/Library";
import SpellEditor from "./ui/SpellEditor";
import SpellbookBuilder from "./ui/SpellbookBuilder";

// This wrapper is now responsible for passing the ID to SpellEditor,
// allowing SpellEditor to manage its own state and data fetching based on the ID prop,
// rather than forcing a remount with the 'key' prop.
function SpellEditorWrapper() {
  const { id } = useParams();
  return <SpellEditor key={id} />;
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <Library /> },
      { path: "import", element: <ImportWizard /> },
      { path: "chat", element: <Chat /> },
      { path: "export", element: <ExportPage /> },
      { path: "edit/:id", element: <SpellEditorWrapper /> },
      { path: "character", element: <CharacterManager /> },
      { path: "character/:id/builder", element: <SpellbookBuilder /> },
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
