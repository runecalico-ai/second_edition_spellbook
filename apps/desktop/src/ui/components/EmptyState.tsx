// apps/desktop/src/ui/components/EmptyState.tsx
import type { ElementType, ReactNode } from "react";

interface EmptyStateProps {
  heading: string;
  description: string;
  headingLevel?: ElementType; // default "h2"; use "h3" if the page already uses h2 for sections
  children?: ReactNode; // CTA buttons / links
}

export function EmptyState({
  heading,
  description,
  headingLevel: Heading = "h2",
  children,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
      <Heading className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
        {heading}
      </Heading>
      <p className="text-sm text-neutral-600 dark:text-neutral-400 max-w-sm">
        {description}
      </p>
      {children && (
        <div className="flex gap-3 flex-wrap justify-center">{children}</div>
      )}
    </div>
  );
}
