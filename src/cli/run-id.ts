import { randomBytes } from 'crypto'

export function generateRunId(): string {
  const timestamp = Date.now().toString(36)
  const random = randomBytes(4).toString('hex')
  return `${timestamp}-${random}`
}
