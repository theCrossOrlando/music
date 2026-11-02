import { describe, expect, it } from 'vitest'
import { renderMarkdown } from './markdown.js'
import { parseSections } from './lyricsFormat.js'

describe('Markdown rendering', () => {
  it('formats text and preserves lyric line breaks', () => {
    expect(renderMarkdown('**Leader:** speak\n*People:* respond')).toBe('<p><strong>Leader:</strong> speak<br>\n<em>People:</em> respond</p>\n')
  })
  it('keeps section labels and plain text', () => {
    const sections = parseSections('Verse 1\nFirst line\nSecond line\n\nChorus\n**Sing**')
    expect(sections.map(({ label, body }) => [label, renderMarkdown(body)])).toEqual([
      ['Verse 1', '<p>First line<br>\nSecond line</p>\n'],
      ['Chorus', '<p><strong>Sing</strong></p>\n'],
    ])
  })
  it('does not execute raw HTML or unsafe links', () => {
    const html = renderMarkdown('<img src=x onerror=alert(1)>\n[click](javascript:alert(1))')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('href=')
  })
})
