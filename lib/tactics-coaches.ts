import type { ReviewMode } from "@/lib/review-modes";

export const TACTICS_COACH_LIMITS = {
  riot: 50,
  replay: 5,
  deep: 2,
} as const;

export type TacticsCoach = keyof typeof TACTICS_COACH_LIMITS;
export type AnalysisAccessKind = "standard" | `tactics:${TacticsCoach}`;

export function isTacticsCoach(value: unknown): value is TacticsCoach {
  return value === "riot" || value === "replay" || value === "deep";
}

export function accessKindForReview(mode: ReviewMode, coach?: TacticsCoach): AnalysisAccessKind {
  if (mode === "aim") return "standard";
  return `tactics:${coach || (mode === "round" ? "deep" : "replay")}`;
}

export function coachMode(coach: TacticsCoach): ReviewMode {
  return coach === "deep" ? "round" : "tactics";
}
