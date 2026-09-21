declare global {
  const OPENCODE_VERSION: string
  const OPENCODE_CHANNEL: string
  const OPENCODE_SPOTCOBUILD_MARK: string
}

const baseVersion = typeof OPENCODE_VERSION === "string" ? OPENCODE_VERSION : "local"
const spotcobuildMark =
  typeof OPENCODE_SPOTCOBUILD_MARK === "string" && OPENCODE_SPOTCOBUILD_MARK.length > 0
    ? OPENCODE_SPOTCOBUILD_MARK
    : undefined

/**
 * Semantic OpenCode version used for plugin compatibility, package selection,
 * session metadata, MCP clientInfo, health matching, and User-Agent strings.
 * Must remain semver-compatible — do not append SpotcoBuild markers here.
 */
export const InstallationVersion = baseVersion

/** SpotcoBuild patched-build identity marker when present at compile time. */
export const SpotcoBuildMark = spotcobuildMark

/**
 * Display-only version for CLI `--version` / human-facing identity checks.
 * Includes the SpotcoBuild mark when built with OPENCODE_SPOTCOBUILD_MARK.
 */
export const InstallationDisplayVersion = spotcobuildMark
  ? `${InstallationVersion} ${spotcobuildMark}`
  : InstallationVersion

export const InstallationChannel = typeof OPENCODE_CHANNEL === "string" ? OPENCODE_CHANNEL : "local"
export const InstallationLocal = InstallationChannel === "local"
