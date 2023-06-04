import fs from 'fs'
import xml2js from 'xml2js'
import _ from 'lodash'
// @ts-ignore
import nodeZip from 'node-zip'
import parseLink from './parseLink'
import parseSection, { Section } from './parseSection'

const xmlParser = new xml2js.Parser()

type GeneralObject = Record<string, unknown>

const xmlToJs = (xml: string) => {
  return new Promise<any>((resolve, reject) => {
    xmlParser.parseString(xml, (err: Error | null, object: GeneralObject) => {
      if (err) {
        reject(err)
      } else {
        resolve(object)
      }
    })
  })
}

const determineRoot = (opfPath: string) => {
  let root = ''
  // set the opsRoot for resolving paths
  if (opfPath.match(/\//)) {
    // not at top level
    root = opfPath.replace(/\/([^\/]+)\.opf/i, '')
    if (!root.match(/\/$/)) {
      // 以 '/' 结尾，下面的 zip 路径写法会简单很多
      root += '/'
    }
    if (root.match(/^\//)) {
      root = root.replace(/^\//, '')
    }
  }
  return root
}

const parseMetadata = (metadata: GeneralObject[]) => {
  let title = _.get(metadata[0], ['dc:title', 0]) as string
  let author = _.get(metadata[0], ['dc:creator', 0]) as string

  if (typeof author === 'object') {
    author = _.get(author, ['_']) as string
  }

  if (typeof title === 'object') {
    title = _.get(title, ['_']) as string
  }

  const publisher = _.get(metadata[0], ['dc:publisher', 0]) as string

  return {
    title,
    author,
    publisher,
  }
}

export class Epub {
  private _zip: any // nodeZip instance
  private _opfPath?: string
  private _root?: string
  private _content?: GeneralObject
  private _manifest?: any[]
  private _spine?: string[] // array of ids defined in manifest
  private _metadata?: GeneralObject
  info?: {
    title: string
    author: string
    publisher: string
  }
  sections?: Section[]

  constructor(buffer: Buffer) {
    this._zip = new nodeZip(buffer, { binary: true, base64: false, checkCRC32: true })
  }

  resolve(path: string): {
    asText: () => string
  } {
    let _path
    if (path[0] === '/') {
      // use absolute path, root is zip root
      _path = path.substr(1)
    } else {
      _path = this._root + path
    }
    const file = this._zip.file(decodeURI(_path))
    if (file) {
      return file
    } else {
      throw new Error(`${_path} not found!`)
    }
  }

  async _resolveXMLAsJsObject(path: string) {
    const xml = this.resolve(path).asText()
    return xmlToJs(xml)
  }

  private async _getOpfPath() {
    const container = await this._resolveXMLAsJsObject('/META-INF/container.xml')
    return container.container.rootfiles[0].rootfile[0]['$']['full-path']
  }

  _getManifest(content: GeneralObject) {
    return _.get(content, ['package', 'manifest', 0, 'item'], []).map(
      (item: any) => item.$,
    ) as any[]
  }

  _resolveIdFromLink(href: string) {
    const { name: tarName } = parseLink(href)
    const tarItem = _.find(this._manifest, (item) => {
      const { name } = parseLink(item.href)
      return name === tarName
    })
    return _.get(tarItem, 'id')
  }

  _getSpine() {
    return _.get(this._content, ['package', 'spine', 0, 'itemref'], []).map((item: unknown) =>
      _.get(item, ['$', 'idref']),
    )
  }

  _resolveSectionsFromSpine(expand = false) {
    // no chain
    return _.map(_.union(this._spine), (id) => {
      const path = _.find(this._manifest, { id }).href
      const html = this.resolve(path).asText()

      return parseSection({
        id,
        htmlString: html,
        resourceResolver: this.resolve.bind(this),
        idResolver: this._resolveIdFromLink.bind(this),
        expand,
      })
    })
  }

  async parse(expand = false) {
    const opfPath = await this._getOpfPath()
    this._root = determineRoot(opfPath)

    const content = await this._resolveXMLAsJsObject('/' + opfPath)
    const manifest = this._getManifest(content)
    const metadata = _.get(content, ['package', 'metadata'], [])

    this._manifest = manifest
    this._content = content
    this._opfPath = opfPath
    this._spine = this._getSpine()
    this._metadata = metadata
    this.info = parseMetadata(metadata)
    this.sections = this._resolveSectionsFromSpine(expand)

    return this
  }
}

export interface ParserOptions {
  type?: 'binaryString' | 'path' | 'buffer'
  expand?: boolean
}
export default function parserWrapper(target: string | Buffer, options: ParserOptions = {}) {
  // seems 260 is the length limit of old windows standard
  // so path length is not used to determine whether it's path or binary string
  // the downside here is that if the filepath is incorrect, it will be treated as binary string by default
  // but it can use options to define the target type
  const { type, expand } = options
  let _target = target
  if (type === 'path' || (typeof target === 'string' && fs.existsSync(target))) {
    _target = fs.readFileSync(target as string, 'binary')
  }
  return new Epub(_target as Buffer).parse(expand)
}
