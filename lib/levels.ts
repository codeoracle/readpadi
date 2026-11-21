/** Mirrors public.level_for() in the database. */
export const LEVELS_LADDER = [
  { n: 1, name: "Fresher", min: 0 },
  { n: 2, name: "Reader", min: 200 },
  { n: 3, name: "Bookworm", min: 600 },
  { n: 4, name: "Scholar", min: 1500 },
  { n: 5, name: "Akada", min: 3000 },
  { n: 6, name: "First Class", min: 6000 },
  { n: 7, name: "Professor", min: 12000 },
];
export function levelInfo(xp: number) {
  const cur = [...LEVELS_LADDER].reverse().find((l) => xp >= l.min)!;
  const next = LEVELS_LADDER.find((l) => l.min > xp) || null;
  const pct = next ? Math.round(((xp - cur.min) / (next.min - cur.min)) * 100) : 100;
  return { ...cur, next, pct, toNext: next ? next.min - xp : 0 };
}
export interface MyLevel { xp: number; week_xp: number; today_xp: number; streak: number; level: number; referral_code: string; referrals: number; referral_every: number; referral_days: number; show_on_board: boolean }
