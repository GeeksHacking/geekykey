/**
 * Project facts the site needs: who is on the team, and the 2026 schedule. Both come from
 * the Single Source of Truth (section 1.1 for the team, section 7 for the dates). The showcase
 * is on 17 Nov, with setup on 16 Nov, as the migration spec (.scratch/db-hosting/spec.md,
 * section 10) has it since 27 Oct.
 */

export const AUTHORS = ["adam", "zitao", "joshua", "ethan"] as const;
export type AuthorId = (typeof AUTHORS)[number];

export const TEAM: Record<AuthorId, string> = {
  adam: "Adam",
  zitao: "Zi Tao",
  joshua: "Joshua",
  ethan: "Ethan",
};

export const AREAS = [
  "backend",
  "frontend",
  "firmware",
  "hardware",
  "design",
  "research",
  "tooling",
  "admin",
] as const;

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

export const SPRINTS = [
  { number: 1, focus: "Working prototype", from: day("2026-09-21"), to: day("2026-10-04") },
  { number: 2, focus: "A/B test", from: day("2026-10-05"), to: day("2026-10-18") },
  { number: 3, focus: "Refinement", from: day("2026-10-19"), to: day("2026-11-01") },
  { number: 4, focus: "Showcase prep", from: day("2026-11-02"), to: day("2026-11-13") },
];

export const SHOWCASE = day("2026-11-17");
