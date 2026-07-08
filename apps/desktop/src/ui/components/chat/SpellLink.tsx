import { Link } from "react-router-dom";
import { spellNameToSlug } from "./chatUtils";

interface SpellLinkProps {
  id: number;
  name: string;
}

export function SpellLink({ id, name }: SpellLinkProps) {
  // Guard against malformed ids (0, negatives, non-integers) that would produce
  // a broken /edit route; render inert text instead of a dead link.
  if (!Number.isInteger(id) || id <= 0) {
    return <span>{name}</span>;
  }

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
