export const available = true

export async function resolveBinary() {
  return process.env.PORKCODE_PTY_BIN || "opencode-pty"
}
