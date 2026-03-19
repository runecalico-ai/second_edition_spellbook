import React from "react";
import { createRoot } from "react-dom/client";
import {
  RouterProvider,
  createBrowserRouter,
  type RouteObject,
} from "react-router-dom";
import "./index.css";
import { useEffect } from "react";
import { useParams } from "react-router-dom";
import type { ThemeState } from "./store/useTheme";
import { useTheme } from "./store/useTheme";
import App from "./ui/App";
import CharacterEditor from "./ui/CharacterEditor";
import CharacterManager from "./ui/CharacterManager";
import Chat from "./ui/Chat";
import ExportPage from "./ui/ExportPage";
import ImportWizard from "./ui/ImportWizard";
import Library from "./ui/Library";
import SpellEditor from "./ui/SpellEditor";
import SpellbookBuilder from "./ui/SpellbookBuilder";
import SettingsPage from "./ui/SettingsPage";

// Uses key={id} to force a full remount of SpellEditor when the spell ID changes,
// resetting all local state and ensuring a clean render for each spell.
function SpellEditorWrapper() {
  const { id } = useParams();
  return <SpellEditor key={id} />;
}

type ThemeStore = {
  getState: () => ThemeState;
  subscribe: (listener: (state: ThemeState) => void) => () => void;
};

type ThemeMediaQueryList = {
  matches: boolean;
  addEventListener?: (type: "change", listener: (event: { matches: boolean }) => void) => void;
  removeEventListener?: (type: "change", listener: (event: { matches: boolean }) => void) => void;
  addListener?: (listener: (event: { matches: boolean }) => void) => void;
  removeListener?: (listener: (event: { matches: boolean }) => void) => void;
};

type ThemeRuntimeRoot = {
  classList: {
    toggle: (token: string, force?: boolean) => boolean;
  };
  dataset: DOMStringMap;
};

export function applyResolvedTheme(rootElement: ThemeRuntimeRoot, resolvedTheme: ThemeState["resolvedTheme"]) {
  rootElement.classList.toggle("dark", resolvedTheme === "dark");
  rootElement.dataset.theme = resolvedTheme;
}

export function attachThemeRuntime({
  rootElement,
  mediaQueryList,
  store,
}: {
  rootElement: ThemeRuntimeRoot;
  mediaQueryList: ThemeMediaQueryList;
  store: ThemeStore;
}) {
  applyResolvedTheme(rootElement, store.getState().resolvedTheme);

  const handleSystemThemeChange = (event: { matches: boolean }) => {
    store.getState().syncResolvedTheme(event.matches);
  };

  const unsubscribe = store.subscribe((state) => {
    applyResolvedTheme(rootElement, state.resolvedTheme);
  });

  if (typeof mediaQueryList.addEventListener === "function") {
    mediaQueryList.addEventListener("change", handleSystemThemeChange);
  } else if (typeof mediaQueryList.addListener === "function") {
    mediaQueryList.addListener(handleSystemThemeChange);
  }

  return () => {
    unsubscribe();
    if (typeof mediaQueryList.removeEventListener === "function") {
      mediaQueryList.removeEventListener("change", handleSystemThemeChange);
    } else if (typeof mediaQueryList.removeListener === "function") {
      mediaQueryList.removeListener(handleSystemThemeChange);
    }
  };
}

function ThemeRuntime() {
  useEffect(() => {
    if (
      typeof document === "undefined" ||
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return undefined;
    }

    const mediaQueryList = window.matchMedia("(prefers-color-scheme: dark)");
    return attachThemeRuntime({
      rootElement: document.documentElement,
      mediaQueryList,
      store: useTheme,
    });
  }, []);

  return null;
}

export const appRoutes: RouteObject[] = [
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <Library /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "import", element: <ImportWizard /> },
      { path: "chat", element: <Chat /> },
      { path: "export", element: <ExportPage /> },
      { path: "edit/:id", element: <SpellEditorWrapper /> },
      { path: "character", element: <CharacterManager /> },
      { path: "character/:id/builder", element: <SpellbookBuilder /> },
      { path: "character/:id/edit", element: <CharacterEditor /> },
    ],
  },
];

export function createAppRouter() {
  return createBrowserRouter(appRoutes);
}

export function AppRuntime({
  activeRouter,
}: {
  activeRouter?: ReturnType<typeof createAppRouter>;
}) {
  const router = activeRouter ?? createAppRouter();

  return (
    <>
      <ThemeRuntime />
      <RouterProvider router={router} />
    </>
  );
}

export function mountApp(rootElement: HTMLElement | null) {
  if (!rootElement) {
    console.error("Root element not found for React app.");
    return;
  }

  createRoot(rootElement).render(
    <React.StrictMode>
      <AppRuntime />
    </React.StrictMode>,
  );
}

if (typeof document !== "undefined") {
  mountApp(document.getElementById("root"));
}
