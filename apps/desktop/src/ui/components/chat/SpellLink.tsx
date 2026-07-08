import { Link } from "react-router-dom";
import { spellNameToSlug } from "./chatUtils";

interface SpellLinkProps {
  id: number;
  name: string;
}

export function SpellLink({ id, name }: SpellLinkProps) {
  return (
    <Link
      to={`/edit/${id}`}
      data-testid={`spell-link-${spellNameToSlug(name)}`}
      className="text-blue-600 dark:text-blue-400 underline underline-offset-2 hover:text-blue-500"
    >
      {name}
    </Link>
  );
}
