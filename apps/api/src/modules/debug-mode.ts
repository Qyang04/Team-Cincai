export function isDebugModeEnabled(): boolean {
  return (process.env.DEBUG_MODE ?? "false").toLowerCase() === "true";
}
