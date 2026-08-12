// Normalising lyrics into the format the public page understands: a section
// label alone on its line, one blank line between sections, no chords.
//
// Dependency-free on purpose. The obvious library, chordsheetjs, is GPL-2.0-only
// and this is a public repo with no licence declared; a few regexes are not
// worth that decision.

const SECTION_WORDS =
  'pre-?chorus|chorus|verse|bridge|refrain|interlude|instrumental|intro|outro|ending|tag|vamp|coda'

// A label alone on its line: "Chorus", "Verse 2", "PRE-CHORUS:", "Bridge 1".
const SECTION_LABEL = new RegExp(`^\\s*((?:${SECTION_WORDS})(?:\\s+\\d+)?)\\s*:?\\s*$`, 'i')

// Inline chords: [G] [Am7] [C#m] [D/F#] [Bbsus4]. Deliberately strict so that
// bracketed lyrics — "[repeat]", "[a cappella]" — survive untouched.
const INLINE_CHORD_SOURCE =
  /\[[A-G][#b]?(?:maj|min|m|dim|aug|sus|add)?\d*(?:\/[A-G][#b]?)?\]/
const INLINE_CHORD = new RegExp(INLINE_CHORD_SOURCE.source, 'g')
// Separate non-global copy for tests: `.test()` on a /g regex advances
// lastIndex between calls and starts the next search mid-string, so sharing one
// object between test and replace intermittently misses chords.
const HAS_INLINE_CHORD = new RegExp(INLINE_CHORD_SOURCE.source)

// SongSelect's export footer, and the copyright block above it.
const CCLI_SONG_NUMBER = /CCLI\s*Song\s*#\s*([0-9]+)/i
// The © line is the one part of the footer worth keeping: CCLI expects the
// copyright notice to travel with reproduced lyrics, and the public page
// currently shows none.
const COPYRIGHT_LINE = /^\s*(?:©|\(c\)\s*\d{4})\s*(.+?)\s*$/i
const FOOTER_LINE =
  /^\s*(CCLI\s*(Song|License)\s*#|©|\(c\)\s*\d{4}|Copyright\s|For use solely with the SongSelect|All rights reserved|Used by permission|CCLI\s*Licence)/i

const titleCase = (label) =>
  label
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/pre-?chorus/i, 'Pre-Chorus')

export function looksLikeChordPro(text) {
  if (!text) return false
  return /\{\s*(?:start_of_\w+|end_of_\w+|so[vcbt]|eo[vcbt]|title|artist|key|comment|c)\b/i.test(text)
    || HAS_INLINE_CHORD.test(text)
}

// A line that is only chord symbols, as sits above lyrics in a chord chart.
function isChordOnlyLine(line) {
  const t = line.trim()
  if (!t) return false
  return t.split(/\s+/).every((tok) =>
    /^[A-G][#b]?(?:maj|min|m|dim|aug|sus|add)?\d*(?:\/[A-G][#b]?)?$/.test(tok))
}

/**
 * @param {string} input
 * @param {{ structural?: boolean, knownTitle?: string, knownArtist?: string }} options
 *   knownTitle/knownArtist: what the record already says this song is. A
 *   SongSelect copy wraps the lyrics with the title on the first line and the
 *   artist on the last; both duplicate fields the page already renders.
 *   structural: also convert ChordPro, strip chords and footers, and rewrite
 *   section labels. Off by default so an ordinary save can never restructure
 *   something a human formatted by hand.
 * @returns {{ text: string, changes: string[], ccliNumber: string|null,
 *             copyright: string|null, title: string|null, artist: string|null }}
 */
export function normalize(input, { structural = false, knownTitle = '', knownArtist = '' } = {}) {
  const changes = []
  let ccliNumber = null
  let copyright = null
  let title = null
  let artist = null
  let text = String(input ?? '')

  const note = (message) => { if (!changes.includes(message)) changes.push(message) }

  if (text.includes('\r')) {
    text = text.replace(/\r\n?/g, '\n')
    note('Normalised line endings')
  }

  let lines = text.split('\n')

  if (structural) {
    const match = text.match(CCLI_SONG_NUMBER)
    if (match) {
      ccliNumber = match[1]
      note(`Found CCLI Song #${ccliNumber}`)
    }

    let removedFooter = false
    let strippedChords = false
    let converted = 0

    lines = lines.flatMap((line) => {
      // ChordPro section directives become plain labels.
      const start = line.match(
        /^\s*\{\s*(?:start_of_(verse|chorus|bridge|tag)|so([vcbt]))\s*(?::\s*(.+?))?\s*\}\s*$/i)
      if (start) {
        const kind = start[1] || { v: 'verse', c: 'chorus', b: 'bridge', t: 'tag' }[start[2].toLowerCase()]
        converted += 1
        return [titleCase(start[3]?.trim() || kind)]
      }
      if (/^\s*\{\s*(?:end_of_\w+|eo[vcbt])\s*\}\s*$/i.test(line)) { converted += 1; return [] }

      // Chord charts mark sections with {comment}/{c} rather than
      // {start_of_*}. Dropping those as metadata silently loses the structure —
      // and merges the section that followed into the one before it.
      const comment = line.match(/^\s*\{\s*(?:comment|c|comment_italic|ci)\s*:\s*(.+?)\s*\}\s*$/i)
      if (comment) {
        converted += 1
        return SECTION_LABEL.test(comment[1]) ? [titleCase(comment[1].trim())] : []
      }

      // Metadata directives carry no lyric text, but they do carry the song
      // details — worth keeping rather than dropping on the floor.
      const meta = line.match(/^\s*\{\s*(title|t|artist|subtitle|st|ccli|key|tempo)\s*:\s*(.+?)\s*\}\s*$/i)
      if (meta) {
        const [, name, value] = meta
        const key = name.toLowerCase()
        if ((key === 'title' || key === 't') && !title) title = value
        if ((key === 'artist' || key === 'subtitle' || key === 'st') && !artist) artist = value
        if (key === 'ccli' && !ccliNumber) ccliNumber = value.replace(/\D/g, '') || null
        converted += 1
        return []
      }
      if (/^\s*\{[^}]*\}\s*$/.test(line)) { converted += 1; return [] }

      // Bar/measure lines from a chord chart: "| G | D | Em | C |". Once the
      // chords come out these are just pipes, and they are not lyrics.
      if (/\|/.test(line) && !line.replace(INLINE_CHORD, '').replace(/[|\s.\/%-]/g, '')) {
        strippedChords = true
        return []
      }

      if (FOOTER_LINE.test(line)) {
        const owner = line.match(COPYRIGHT_LINE)
        if (owner && !copyright) copyright = owner[1].replace(/\s+/g, ' ').trim()
        removedFooter = true
        return []
      }
      if (isChordOnlyLine(line)) { strippedChords = true; return [] }

      if (HAS_INLINE_CHORD.test(line)) {
        strippedChords = true
        line = line.replace(INLINE_CHORD, '')
      }
      return [line]
    })

    // Strip the title off the top and the artist off the bottom. A SongSelect
    // copy includes both, and they duplicate what the page already shows above
    // and below the lyrics.
    const same = (a, b) => {
      const n = (v) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
      return Boolean(n(a)) && n(a) === n(b)
    }
    const titleHint = knownTitle || title
    const artistHint = knownArtist || artist

    const firstIdx = lines.findIndex((l) => l.trim())
    if (firstIdx !== -1 && same(lines[firstIdx], titleHint)) {
      // Only when it reads as a heading — followed by a blank line or a section
      // label. Plenty of songs legitimately open with their own title as the
      // first sung line.
      const next = lines[firstIdx + 1]
      if (next === undefined || !next.trim() || SECTION_LABEL.test(next)) {
        lines.splice(firstIdx, 1)
        note('Removed the repeated title')
      }
    }

    let lastIdx = -1
    for (let i = lines.length - 1; i >= 0; i -= 1) { if (lines[i].trim()) { lastIdx = i; break } }
    if (lastIdx !== -1 && same(lines[lastIdx], artistHint)) {
      lines.splice(lastIdx, 1)
      note('Removed the repeated artist')
    }

    // A label whose whole body was chords — a chord-chart intro, say — would
    // otherwise render as a heading with nothing under it.
    const kept = []
    for (let i = 0; i < lines.length; i += 1) {
      if (SECTION_LABEL.test(lines[i])) {
        const next = lines.slice(i + 1).find((l) => l.trim())
        if (next === undefined || SECTION_LABEL.test(next)) continue
      }
      kept.push(lines[i])
    }
    lines = kept

    if (converted) note(`Converted ${converted} ChordPro ${converted === 1 ? 'directive' : 'directives'}`)
    if (strippedChords) note('Removed chords')
    if (removedFooter) note('Removed the CCLI footer')
    if (copyright) note('Kept the copyright line')
    if (title) note(`Found the title “${title}”`)
    if (artist) note(`Found the artist “${artist}”`)

    // Labels to Title Case, alone on their line.
    let relabelled = 0
    lines = lines.map((line) => {
      const m = line.match(SECTION_LABEL)
      if (!m) return line
      const clean = titleCase(m[1].replace(/\s+/g, ' ').trim())
      if (clean !== line) relabelled += 1
      return clean
    })
    if (relabelled) note(`Tidied ${relabelled} section ${relabelled === 1 ? 'label' : 'labels'}`)
  }

  // Trailing whitespace never survives.
  const hadTrailing = lines.some((l) => l !== l.replace(/[ \t]+$/, ''))
  lines = lines.map((l) => l.replace(/[ \t]+$/, ''))
  if (hadTrailing) note('Removed trailing spaces')

  text = lines.join('\n')

  if (/\n{3,}/.test(text)) {
    text = text.replace(/\n{3,}/g, '\n\n')
    note('Collapsed extra blank lines')
  }

  if (structural) {
    // Exactly one blank line before each label that follows content.
    text = text.replace(
      new RegExp(`([^\\n])\\n((?:${SECTION_WORDS})(?:\\s+\\d+)?)\\n`, 'gi'),
      (_m, before, label) => `${before}\n\n${label}\n`)
    // ...and none directly after it.
    text = text.replace(
      new RegExp(`^((?:${SECTION_WORDS})(?:\\s+\\d+)?)\\n\\n+`, 'gim'),
      (_m, label) => `${label}\n`)
  }

  const straight = (text.match(/'/g) || []).length
  if (straight) {
    // Curly apostrophes to match the serif setting on the public page.
    text = text.replace(/(\w)'(\w)/g, '$1’$2').replace(/'/g, '’')
    note('Standardised apostrophes')
  }

  const trimmed = text.replace(/^\n+|\s+$/g, '')
  if (trimmed !== text) note('Trimmed blank lines around the lyrics')
  text = trimmed

  return { text, changes, ccliNumber, copyright, title, artist }
}

// Mirrors the public page's parser, so the admin preview and the live site
// agree on what counts as a section.
export function parseSections(text) {
  const lines = String(text ?? '').split('\n')
  if (!lines.some((line) => SECTION_LABEL.test(line))) return null

  const sections = []
  let current = { label: null, lines: [] }

  for (const line of lines) {
    const match = line.match(SECTION_LABEL)
    if (match) {
      if (current.label || current.lines.some((l) => l.trim())) sections.push(current)
      current = { label: match[1].trim(), lines: [] }
    } else {
      current.lines.push(line)
    }
  }
  sections.push(current)

  return sections
    .map((s) => ({ label: s.label, body: s.lines.join('\n').replace(/^\n+|\n+$/g, '') }))
    .filter((s) => s.label || s.body.trim())
}
