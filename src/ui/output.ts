export let isJsonMode = false

export const setJsonMode = (val: boolean) => {
  isJsonMode = val
}

export const printJson = (data: unknown) => {
  process.stdout.write(JSON.stringify(data, null, 2) + "\n")
}
