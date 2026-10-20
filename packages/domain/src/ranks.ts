// Staff ranks, matching public.members.rank. A disabled member keeps their rank but cannot sign in.

export const RANKS = { cashier: 1, admin: 2, manager: 3, developer: 4 } as const;
export type RankName = keyof typeof RANKS;
export type Rank = (typeof RANKS)[RankName];

export function isRank(value: unknown): value is Rank {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

export function rankName(rank: Rank): RankName {
  const entry = Object.entries(RANKS).find(([, value]) => value === rank);
  if (!entry) throw new RangeError(`Unknown rank ${rank}`);
  return entry[0] as RankName;
}

/**
 * Whether one member may manage another: higher ranks manage lower ranks, and a business
 * Developer manages everyone. Managers do not manage other Managers.
 */
export function canManage(actor: Rank, target: Rank): boolean {
  return actor === RANKS.developer || actor > target;
}
