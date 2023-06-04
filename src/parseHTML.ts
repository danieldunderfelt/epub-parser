import { JSDOM } from 'jsdom'
import { HtmlNodeObject } from './types'
import { NodeHtmlMarkdown } from 'node-html-markdown'
import { isNumeric } from './utils'

const OMITTED_TAGS = ['head', 'input', 'textarea', 'script', 'style', 'svg']
const UNWRAP_TAGS = ['body', 'html', 'div', 'span']
const PICKED_ATTRS = ['href', 'src', 'id']

// The content of these tags will be converted to markdown.
const MARKDOWN_TAGS_INNER = ['p', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']
const MARKDOWN_TAGS_OUTER = ['ol', 'ul']

type HtmlNodeType = {
  tagName?: string
  parentNode?: HtmlNodeType | null
  childNodes?: HtmlNodeType[]
  innerHTML?: string
  nodeType: number
  getAttribute?: (attr: string) => string | null
  textContent?: string
}

function isObjectLike(node: unknown): node is Record<string, unknown> {
  return typeof node === 'object' && node !== null
}

function isHtmlNode(node: unknown): node is HtmlNodeType {
  return isObjectLike(node) && (node.nodeType === 1 || node.nodeType === 3)
}

/**
 * recursivelyReadParent
 * @param node
 * @param callback invoke every time a parent node is read, return truthy value to stop the reading process
 * @param final callback when reaching the root
 */
const recursivelyReadParent = (
  node: HtmlNodeType,
  callback: (node: HtmlNodeType) => HtmlNodeObject | undefined,
  final: () => HtmlNodeObject,
) => {
  const _read = (_node: HtmlNodeType): HtmlNodeObject => {
    const parent = _node.parentNode

    if (parent && isHtmlNode(parent)) {
      const newNode = callback(parent)

      if (!newNode) {
        return _read(parent)
      }

      return newNode
    } else {
      return final()
    }
  }

  return _read(node)
}

export interface ParseHTMLConfig {
  resolveSrc?: (src: string) => string
  resolveHref?: (href: string) => string
  htmlToMarkdown?: NodeHtmlMarkdown
}

function parseHtmlElements(elements: HtmlNodeType | HtmlNodeType[], config: ParseHTMLConfig = {}) {
  const elementArray = (Array.isArray(elements) ? elements : [elements]).filter((node) =>
    isHtmlNode(node),
  )

  const output: HtmlNodeObject[] = []

  for (let object of elementArray) {
    const tagName = object.tagName?.toLowerCase() || ''

    if (object.tagName && UNWRAP_TAGS.includes(tagName)) {
      output.push(...parseHtmlElements(Array.from(object.childNodes || []), config))
      continue
    }

    let transformedObject = transformHtmlElements(object, config)

    if (!transformedObject) {
      continue
    }

    let children: HtmlNodeObject[] | undefined = undefined

    if (object.childNodes) {
      const canMarkdown =
        tagName &&
        object.innerHTML &&
        config.htmlToMarkdown &&
        (MARKDOWN_TAGS_INNER.includes(tagName) || MARKDOWN_TAGS_OUTER.includes(tagName))

      // Check if the tag should be converted to markdown
      if (canMarkdown) {
        let markdownContent

        if (MARKDOWN_TAGS_INNER.includes(tagName)) {
          markdownContent = config.htmlToMarkdown!.translate(object.innerHTML!)
        } else if (MARKDOWN_TAGS_OUTER.includes(tagName)) {
          markdownContent = config.htmlToMarkdown!.translate(
            `<${tagName}>${object.innerHTML}</${tagName}>`,
          )
        }

        markdownContent = markdownContent?.trim()

        if (markdownContent) {
          // Return a text object with the markdown content
          children = [{ text: markdownContent }]
        }
      } else {
        children = parseHtmlElements(Array.from(object.childNodes), config)
      }
    }

    if ((children && children.length !== 0) || transformedObject.text) {
      output.push({
        ...transformedObject,
        children,
      })
    }
  }

  return output
}

function transformHtmlElements(
  node: HtmlNodeType,
  config: ParseHTMLConfig = {},
): HtmlNodeObject | undefined {
  const { resolveHref, resolveSrc, htmlToMarkdown } = config

  if (node.nodeType === 1) {
    const tag = node.tagName!.toLowerCase()
    const attrs: HtmlNodeObject['attrs'] = {}

    if (OMITTED_TAGS.includes(tag)) {
      return undefined
    }

    PICKED_ATTRS.forEach((attr) => {
      let attrVal = node.getAttribute?.(attr) || undefined

      if (attrVal && attr === 'href' && resolveHref) {
        attrVal = resolveHref(attrVal)
      }
      if (attrVal && attr === 'src' && resolveSrc) {
        attrVal = resolveSrc(attrVal)
      }

      if (attrVal) {
        attrs[attr] = attrVal
      }
    })

    return { tag, attrs }
  } else if (node.nodeType === 3) {
    const text = node.textContent?.trim()

    if (!text) {
      return undefined
    }

    const makeTextObject = () => {
      return {
        text,
      } satisfies HtmlNodeObject
    }

    // find the closest parent which is not in UNWRAP_TAGS
    // if failed then wrap with p tag
    return recursivelyReadParent(
      node,
      (parent) => {
        const tag = parent.tagName && parent.tagName.toLowerCase()

        if (!tag || UNWRAP_TAGS.includes(tag)) {
          return undefined
        }

        return makeTextObject()
      },
      () => {
        return {
          tag: 'p',
          children: [makeTextObject()],
        } satisfies HtmlNodeObject
      },
    )
  }
}

const parseHTML = (HTMLString: string, config: ParseHTMLConfig = {}) => {
  const rootNode = new JSDOM(HTMLString).window.document.documentElement

  const nhm = new NodeHtmlMarkdown(
    {
      keepDataImages: true,
      bulletMarker: '-',
      maxConsecutiveNewlines: 2,
      useInlineLinks: false,
    },
    {
      a: ({ node, options, visitor }) => {
        const href = node.getAttribute('href')
        if (!href) return {}

        // Encodes symbols that can cause problems in markdown
        let encodedHref = ''
        for (const chr of href) {
          switch (chr) {
            case '(':
              encodedHref += '%28'
              break
            case ')':
              encodedHref += '%29'
              break
            case '_':
              encodedHref += '%5F'
              break
            case '*':
              encodedHref += '%2A'
              break
            default:
              encodedHref += chr
          }
        }

        if (config.resolveHref) {
          encodedHref = config.resolveHref(encodedHref)
        }

        const title = node.getAttribute('title')

        // Inline link, when possible
        // See: https://github.com/crosstype/node-html-markdown/issues/17
        if (node.textContent === href && options.useInlineLinks) {
          return { content: `<${encodedHref}>` }
        }

        return {
          postprocess: ({ content }) => content.replace(/(?:\r?\n)+/g, ' '),
          childTranslators: visitor.instance.aTagTranslators,
          prefix: '[',
          postfix:
            ']' +
            (!options.useLinkReferenceDefinitions
              ? `(${encodedHref}${title ? ` "${title}"` : ''})`
              : `[${visitor.addOrGetUrlDefinition(encodedHref)}]`),
        }
      },
      img: ({ node, options }) => {
        const src = node.getAttribute('src') || ''
        if (!src || (!options.keepDataImages && /^data:/i.test(src))) return { ignore: true }

        const internalSrc = config.resolveSrc && config.resolveSrc(src)

        const alt = node.getAttribute('alt') || ''
        const title = node.getAttribute('title') || ''

        return {
          content: `![${alt}](${internalSrc}${title && ` "${title}"`})`,
          recurse: false,
        }
      },
      sup: {
        prefix: '<sup>',
        postfix: '</sup>',
        postprocess: ({ content }) =>
          isNumeric(content) ? `(${content})[#refs:${content}]` : content,
      },
    },
  )

  // initial parse
  return parseHtmlElements(rootNode as unknown as HtmlNodeType, { ...config, htmlToMarkdown: nhm })
}

export default parseHTML
