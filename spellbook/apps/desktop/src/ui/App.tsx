import clsx from "classnames";
import { Link, Outlet, useLocation } from "react-router-dom";

export default function App() {
  const { pathname } = useLocation();
  const Tab = ({ to, label }: { to: string; label: string }) => (
    <Link
      to={to}
      className={clsx(
        "px-3 py-2 rounded-md",
        pathname === to || (to === "/" && pathname === "/")
          ? "bg-neutral-800"
          : "hover:bg-neutral-800/60",
      )}
    >
      {label}
    </Link>
  );
  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Spellbook</h1>
        <nav className="space-x-2">
          <Tab to="/" label="Library" />
          <Tab to="/import" label="Import" />
          <Tab to="/chat" label="Chat" />
          <Tab to="/export" label="Export" />
        </nav>
      </header>
      <Outlet />
    </div>
  );
}
