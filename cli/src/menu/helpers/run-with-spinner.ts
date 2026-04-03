import * as clack from "@clack/prompts"

type MessageResolver<T> = string | ((value: T) => string) | undefined

interface RunWithSpinnerOptions<T> {
  startMessage: string
  successMessage?: MessageResolver<T>
  failureMessage?: MessageResolver<unknown>
}

function resolveMessage<T>(message: MessageResolver<T>, value: T, fallback: string): string {
  if (!message) return fallback
  return typeof message === "function" ? message(value) : message
}

export async function runWithSpinner<T>(
  options: RunWithSpinnerOptions<T>,
  task: () => Promise<T>
): Promise<T> {
  const spinner = clack.spinner()
  spinner.start(options.startMessage)

  try {
    const result = await task()
    spinner.stop(resolveMessage(options.successMessage, result, "Completed"))
    return result
  } catch (err) {
    spinner.stop(resolveMessage(options.failureMessage, err, "Failed"))
    throw err
  }
}
