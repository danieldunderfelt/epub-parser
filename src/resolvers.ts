import parseLink from './parseLink'
import path from 'path'

const isInternalUri = (uri: string) => {
  return !uri.startsWith('http')
}

export const resolveHref = (href: string, idResolver?: (href: string) => unknown) => {
  if (isInternalUri(href)) {
    const { hash } = parseLink(href)
    // todo: what if a link only contains hash part?
    const sectionId = idResolver?.(href)
    if (hash) {
      return `#${sectionId},${hash}`
    }
    return `#${sectionId}`
  }
  return href
}

export const resolveSrc = (
  src: string,
  resourceResolver?: (path: string) => { asText: () => string; asNodeBuffer: () => Buffer },
) => {
  if (isInternalUri(src)) {
    const absolutePath = path.resolve('/', src).substring(1)
    const buffer = resourceResolver?.(absolutePath)?.asNodeBuffer()

    if (buffer) {
      const base64 = buffer.toString('base64')
      return `data:image/png;base64,${base64}`
    }
  }

  return src
}
