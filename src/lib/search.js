// One search box over the library, the way the sermon search on the public site
// works — except that this one stops at the title and the artist. A body hit
// meant that typing a word to find a song you knew the name of buried it under
// every song that happens to sing it.
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

// norm() has already folded everything that is not a letter or a digit to a
// space, so splitting on it is the whole tokeniser.
const tokenize = (text) => norm(text).split(' ').filter(Boolean)

// Two fields of a few words each across 188 rows, so this is re-tokenised on
// every query rather than cached.
const tokensFor = (song) => ({
  song: tokenize(song?.song),
  artist: tokenize(song?.artist),
})

// A song *called* "Grace" outranks one merely by an artist matching "grace".
const WEIGHTS = { song: 6, artist: 3 }

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
  for (const token of tokens) if (token.startsWith(term)) count += 1
  return count
}

/**
 * @param {object[]} songs
 * @param {string} query
 * @returns {{ song: object, score: number }[]} most relevant first; input order
 *   breaks ties, so an unranked list stays in whatever order it arrived in.
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

    results.push({ song, score, index })
  })

  return results
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ song, score }) => ({ song, score }))
}
