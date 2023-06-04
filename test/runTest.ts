// CLI command for adding an epub book to the database

import * as fs from 'fs/promises'
import * as path from 'path'

import { dirname } from './dirname'
import { parseEpub } from '../src'

// @ts-ignore
const outputDir = path.resolve(dirname(import.meta.url), './output')

async function test(filePath?: string) {
  if (!filePath) {
    throw new Error('No file path provided')
  }

  // @ts-ignore
  const absoluteFilePath = path.resolve(dirname(import.meta.url), '../', filePath)
  const epubData = await parseEpub(absoluteFilePath)

  const htmlObjects = (epubData.sections || []).map((chapter) => chapter.toHtmlObjects!())

  await fs.writeFile(path.join(outputDir, 'epub.json'), JSON.stringify(htmlObjects, null, 2))
}

const epubFilePath = path.join(dirname(import.meta.url), 'test.epub')

test(epubFilePath).catch((err) => {
  console.error(err)
  process.exit(1)
})
