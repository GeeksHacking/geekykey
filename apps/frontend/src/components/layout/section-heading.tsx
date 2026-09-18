import { Link } from "@tanstack/react-router";

interface SectionHeadingProps {
  title: string;
  linkTo?: "/passport" | "/activity" | "/pair";
  linkLabel?: string;
}

export function SectionHeading({ title, linkTo, linkLabel }: SectionHeadingProps) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-4">
      <h2 className="text-base font-semibold">{title}</h2>
      {linkTo && linkLabel ? (
        <Link to={linkTo} className="text-sm font-medium text-primary-text underline-offset-4 hover:underline">
          {linkLabel}
        </Link>
      ) : null}
    </div>
  );
}
