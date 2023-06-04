import * as path from 'path'
import { fileURLToPath } from 'url'

export function dirname(importMetaUrl: string) {
  const filename = fileURLToPath(importMetaUrl)
  return path.dirname(filename)
}
