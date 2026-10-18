/**
 * Models and textures keep the same address when they change, so the
 * installed app caches them under a name of the build: a new build fills a
 * new cache, and the caches of earlier builds are dropped, so changed files
 * are fetched anew instead of served stale forever.
 */
export const ASSET_CACHE_PREFIX = "aquaria-assets";

/** The cache name of models and textures for a build (its commit or version). */
export function assetCacheName(build: string): string {
  return `${ASSET_CACHE_PREFIX}-${build}`;
}

/** Caches of models and textures from other builds than `current`. */
export function staleAssetCaches(names: readonly string[], current: string): string[] {
  return names.filter((name) => name.startsWith(ASSET_CACHE_PREFIX) && name !== current);
}
