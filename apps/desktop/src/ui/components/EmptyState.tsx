// apps/desktop/src/ui/components/EmptyState.tsx
import type { ReactNode } from "react";

interface EmptyStateProps {
  heading: string;
  description: string;
  headingLevel?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6"; // default "h2"; use "h3" if the page already uses h2 for sections
  children?: ReactNode; // CTA buttons / links
  testId?: string; // defaults to "empty-state"
}

export function EmptyState({
  heading,
  description,
  headingLevel: Heading = "h2",
  children,
  testId = "empty-state",
}: EmptyStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center py-16 text-center gap-4"
      data-testid={testId}
    >
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
