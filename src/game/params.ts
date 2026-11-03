import rawParams from '../../2026-11-03/game-design/outputs/params.v0.1.json';

/**
 * Single source of truth for all gameplay tuning.
 * The JSON file lives under the GDD deliverables on purpose for M1.
 */
export const params = rawParams;

export type GameParams = typeof params;
