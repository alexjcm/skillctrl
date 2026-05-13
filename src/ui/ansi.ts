export const useColor: boolean =
  process.env.FORCE_COLOR !== undefined
    ? process.env.FORCE_COLOR !== "0"
    : process.env.NO_COLOR === undefined &&
      process.env.TERM !== "dumb" && !!process.stdout.isTTY

const c = (open: string, close: string) => (s: string): string => {
  return useColor ? `\x1b[${open}m${s}\x1b[${close}m` : s
}

export const bold = c("1", "22")
export const dim = c("2", "22")
export const cyan = c("36", "39")
export const green = c("32", "39")
export const yellow = c("33", "39")
export const red = c("31", "39")
export const blue = c("34", "39")
