// One search box over the whole record, the way the sermon search on the
// public site works. That one is Pagefind over the built HTML, which is why a
// sermon is found by title, by speaker, or by a line from its transcript. The
// index cannot be borrowed — Pagefind builds at deploy time and the library
// changes after every build — so this rebuilds the same behaviour in memory:
// every term must hit somewhere, fields are weighted, and a body hit comes
// back with an excerpt showing where it landed.
//
// Dependency-free, like duplicates.js next door. 188 rows is a scan.

// Same folding as duplicates.js: curly apostrophes first, so "It's" and "Its"
// normalise alike rather than splitting into two tokens.
const norm = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

// Words with their original spelling kept alongside the normalised form: the
// excerpt has to render what the song actually says, not the folded version.
const WORD = /[\p{L}\p{N}][\p{L}\p{N}’']*/gu

function tokenize(text) {
  const tokens = []
  for (const match of String(text ?? '').matchAll(WORD)) {
    const key = norm(match[0])
    if (key) tokens.push({ text: match[0], key })
  }
  return tokens
}

// Snapshots hand back fresh objects on every write, so a WeakMap keyed on the
// song empties itself when the data changes. Without it every keystroke
// re-tokenises every lyric body in the library.
const tokenCache = new WeakMap()

function tokensFor(song) {
  const cached = tokenCache.get(song)
  if (cached) return cached
  const tokens = {
    song: tokenize(song?.song),
    artist: tokenize(song?.artist),
    lyrics: tokenize(song?.lyrics),
  }
  tokenCache.set(song, tokens)
  return tokens
}

// A song *called* "Grace" is a better answer than one that says "grace" in its
// third verse.
const WEIGHTS = { song: 6, artist: 3, lyrics: 1 }

// A word repeated in a chorus should not outrank a title match by volume
// alone, so hits per field per term stop counting at three.
const MAX_HITS_PER_FIELD = 3

export function parseQuery(query) {
  return norm(query).split(' ').filter(Boolean)
}

// Prefix rather than exact, so "wonder" finds "wonderful" — the cheap stand-in
// for Pagefind's stemming, without carrying a stemmer.
const hits = (tokens, term) => {
  let count = 0
  for (const token of tokens) if (token.key.startsWith(term)) count += 1
  return count
}

const WINDOW = 30 // words, matching the site's `excerptLength: 30`
const LEAD = 5    // words of run-up, so the match is not flush against the edge

/**
 * The 30-word window with the most matched words in it, as alternating
 * marked/unmarked segments. Earliest window wins a tie — a match in the first
 * verse says more about the song than one in the last.
 *
 * @returns {{ text: string, mark: boolean }[]} empty when nothing matched
 */
function excerptFor(tokens, terms) {
  const matched = tokens.map((token) => terms.some((term) => token.key.startsWith(term)))
  const indices = matched.reduce((acc, isMatch, i) => (isMatch ? acc.concat(i) : acc), [])
  if (!indices.length) return []

  let best = 0
  let bestCount = -1
  for (const index of indices) {
    const start = Math.max(0, Math.min(index - LEAD, tokens.length - WINDOW))
    const count = indices.filter((i) => i >= start && i < start + WINDOW).length
    if (count > bestCount) {
      best = start
      bestCount = count
    }
  }

  const end = Math.min(tokens.length, best + WINDOW)
  const segments = []
  const push = (text, mark) => {
    const last = segments[segments.length - 1]
    if (last && last.mark === mark) last.text += text
    else segments.push({ text, mark })
  }

  if (best > 0) push('…', false)
  for (let i = best; i < end; i += 1) {
    if (i > best || best > 0) push(' ', false)
    push(tokens[i].text, matched[i])
  }
  if (end < tokens.length) push('…', false)

  return segments
}

/**
 * @param {object[]} songs
 * @param {string} query
 * @returns {{ song: object, score: number, excerpt: {text: string, mark: boolean}[] }[]}
 *   most relevant first; input order breaks ties, so an unranked list stays in
 *   whatever order it arrived in.
 */
export function search(songs, query) {
  const terms = parseQuery(query)
  if (!terms.length) return []

  const results = []
  songs.forEach((song, index) => {
    const tokens = tokensFor(song)
    let score = 0

    for (const term of terms) {
      let termScore = 0
      for (const field of Object.keys(WEIGHTS)) {
        const count = Math.min(hits(tokens[field], term), MAX_HITS_PER_FIELD)
        termScore += count * WEIGHTS[field]
      }
      // Every term has to land somewhere. Two words narrow the result the way
      // they do on the sermon page, rather than widening it.
      if (termScore === 0) return
      score += termScore
    }

    results.push({ song, score, index, excerpt: excerptFor(tokens.lyrics, terms) })
  })

  return results
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ song, score, excerpt }) => ({ song, score, excerpt }))
}
