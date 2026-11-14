import { cn } from "@/lib/utils";

interface PersonLinesProps {
  name: string;
  bio: string | null;
  contactLine?: string | null;
  /**
   * compact: the reveal's and Home's smaller, muted bio. lead: the main text of a card (FRO-182).
   */
  bioSize?: "compact" | "lead";
}

/**
 * A person's name, bio and contact line, as the reveal, Home's rows, the Connections tab's card
 * and the Profile tab's "How others see you" all show them (BAC-147, FRO-184). A field they don't
 * have takes no line, and the caller says Guest for someone with no name (BAC-136).
 */
export function PersonLines({
  name,
  bio,
  contactLine = null,
  bioSize = "compact",
}: PersonLinesProps) {
  return (
    <>
      <p className="type-item break-words">{name}</p>
      {bio ? (
        <p
          className={cn(
            "mt-0.5 break-words",
            bioSize === "compact" && "text-sm text-muted-foreground",
          )}
        >
          {bio}
        </p>
      ) : null}
      {contactLine ? <p className="mt-0.5 text-sm break-words">Contact: {contactLine}</p> : null}
    </>
  );
}
