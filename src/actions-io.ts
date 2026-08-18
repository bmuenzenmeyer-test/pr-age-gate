/**
 * Minimal replacement for @actions/core's input/logging helpers. Zero
 * dependencies is the point here — see README for why. GitHub Actions sets
 * one INPUT_<NAME> env var per declared input regardless of whether the
 * action is native or composite, JS or TypeScript; this mirrors
 * @actions/core.getInput's exact naming convention (uppercased, spaces —
 * not hyphens — become underscores) so action.yml's `inputs:` block needs
 * no special wiring.
 */
export function getInput(name: string): string {
  const key = `INPUT_${name.replace(/ /g, "_").toUpperCase()}`;
  return process.env[key]?.trim() ?? "";
}

export function info(message: string): void {
  console.log(message);
}

/** Workflow command syntax GitHub Actions parses out of stderr/stdout to annotate the run. */
export function setFailed(message: string): void {
  process.exitCode = 1;
  console.error(`::error::${message}`);
}
