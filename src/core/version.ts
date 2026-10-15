/**
 * The version shown to viewers: the SemVer release from package.json and,
 * when known, the commit it was built from (builds between releases differ).
 */
export function versionLabel(version: string, commit: string): string {
  return commit === "" ? `v${version}` : `v${version} · ${commit}`;
}
