// apps/desktop/src/ui/components/EmptyState.tsx
import { useEffect, useRef, useState, type ReactNode } from "react";

const EMPTY_STATE_LIVE_REGION_RESET_DELAY_MS = 500;

interface EmptyStateContentProps {
  heading: string;
  description: string;
  testId?: string; // defaults to "empty-state"
}

interface EmptyStateLiveRegionProps extends EmptyStateContentProps {
  active: boolean;
}

interface EmptyStateProps extends EmptyStateContentProps {
  headingLevel?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6"; // default "h2"; use "h3" if the page already uses h2 for sections
  children?: ReactNode; // CTA buttons / links
}

function createAnnouncementText(heading: string, description: string): string {
  return `${heading}. ${description}`;
}

export function EmptyStateLiveRegion({
  heading,
  description,
  active,
  testId = "empty-state",
}: EmptyStateLiveRegionProps) {
  const nextAnnouncement = createAnnouncementText(heading, description);
  const [announcedText, setAnnouncedText] = useState(active ? nextAnnouncement : "");
  const lastAnnouncedTextRef = useRef(active ? nextAnnouncement : "");
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) {
        clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (resetTimerRef.current !== null) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }

    if (!active) {
      resetTimerRef.current = setTimeout(() => {
        lastAnnouncedTextRef.current = "";
        setAnnouncedText("");
        resetTimerRef.current = null;
      }, EMPTY_STATE_LIVE_REGION_RESET_DELAY_MS);
      return;
    }

    if (!nextAnnouncement || nextAnnouncement === lastAnnouncedTextRef.current) {
      return;
    }

    lastAnnouncedTextRef.current = nextAnnouncement;
    setAnnouncedText(nextAnnouncement);
  }, [active, nextAnnouncement]);

  return (
    <output
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
      data-testid={`${testId}-live-region`}
    >
      {announcedText}
    </output>
  );
}

export function EmptyState({
  heading,
  description,
  headingLevel: Heading = "h2",
  children,
  testId = "empty-state",
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center gap-4" data-testid={testId}>
      <Heading className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
        {heading}
      </Heading>
      <p className="text-sm text-neutral-600 dark:text-neutral-400 max-w-sm">{description}</p>
      {children && <div className="flex gap-3 flex-wrap justify-center">{children}</div>}
    </div>
  );
}
