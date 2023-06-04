import path from 'path'
// @ts-ignore
import toMarkdown from 'to-markdown'
import parseLink from './parseLink'
import parseHTML from './parseHTML'
import { HtmlNodeObject } from './types'
import { resolveHref, resolveSrc } from './resolvers'

export type ParseSectionConfig = {
  id: string
  htmlString: string
  resourceResolver: (path: string) => any
  idResolver: (link: string) => string
  expand: boolean
}

export class Section {
  id: string
  htmlString: string
  htmlObjects?: HtmlNodeObject[]
  private _resourceResolver?: (path: string) => any
  private _idResolver?: (link: string) => string

  constructor({ id, htmlString, resourceResolver, idResolver, expand }: ParseSectionConfig) {
    this.id = id
    this.htmlString = htmlString
    this._resourceResolver = resourceResolver
    this._idResolver = idResolver
    if (expand) {
      this.htmlObjects = this.toHtmlObjects?.()
    }
  }

  toHtmlObjects?() {
    return parseHTML(this.htmlString, {
      resolveHref: (val: string) => resolveHref(val, this._idResolver),
      resolveSrc: (val: string) => resolveSrc(val, this._resourceResolver),
    })
  }
}

const parseSection = (config: ParseSectionConfig) => {
  return new Section(config)
}

export default parseSection
