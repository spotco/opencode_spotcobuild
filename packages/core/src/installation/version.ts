declare global {
  const OPENCODE_VERSION: string
  const OPENCODE_CHANNEL: string
  const OPENCODE_SPOTCOBUILD_MARK: string
}

const baseVersion = typeof OPENCODE_VERSION === "string" ? OPENCODE_VERSION : "local"
const spotcobuildMark =
  typeof OPENCODE_SPOTCOBUILD_MARK === "string" ? OPENCODE_SPOTCOBUILD_MARK : undefined

/** Includes SpotcoBuild identity when built with OPENCODE_SPOTCOBUILD_MARK. */
export const InstallationVersion = spotcobuildMark ? `${baseVersion} ${spotcobuildMark}` : baseVersion
export const InstallationChannel = typeof OPENCODE_CHANNEL === "string" ? OPENCODE_CHANNEL : "local"
export const InstallationLocal = InstallationChannel === "local"
export const SpotcoBuildMark = spotcobuildMark
