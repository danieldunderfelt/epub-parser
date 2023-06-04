export interface HtmlNodeObject {
  tag?: string
  text?: string
  children?: HtmlNodeObject[]
  attrs?: Record<string, string>
}
