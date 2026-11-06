/** A section of a screen. The tabs already lead to the other screens, so this links nowhere. */
export function SectionHeading({ title }: { title: string }) {
  return <h2 className="type-section mb-3">{title}</h2>;
}
