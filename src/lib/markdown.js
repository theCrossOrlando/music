import MarkdownIt from 'markdown-it'

const markdown = new MarkdownIt({ html: false, breaks: true, linkify: false })

export function renderMarkdown(text) {
  return markdown.render(String(text ?? ''))
}
