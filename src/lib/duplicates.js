// Finding duplicate songs in a library that was built by appending.
//
// Title matching alone is not enough: it misses rows whose artist and song
// fields are swapped, and rows with typos ("Graves Into Garden"). It also
// over-matches — two different songs can share a title. So this reports
// candidates with a reason and a confidence, and never merges anything.

const norm = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

// Lyrics compare on letters alone, so punctuation and line breaks cannot
// disguise the same song.
const normLyrics = (value) =>
  String(value ?? '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

// LCS ratio. Only ever used on titles and artist names — it is O(n·m), so
// running it on full lyric bodies across 200+ songs would be tens of thousands
// of million-operation comparisons.
const MAX_LCS_INPUT = 120

function similarity(a, b) {
  if (a.length > MAX_LCS_INPUT || b.length > MAX_LCS_INPUT) return a === b ? 1 : 0
  if (!a || !b) return 0
  if (a === b) return 1
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  // Containment scores high before the length guard below rejects it:
  // "Will Reagan" inside "Will Reagan & United Pursuit" is the same artist,
  // not a different one.
  if (long.includes(short)) return 0.95
  if (long.length - short.length > Math.max(4, short.length * 0.4)) return 0

  let prev = new Array(short.length + 1).fill(0)
  for (let i = 1; i <= long.length; i += 1) {
    const curr = [0]
    for (let j = 1; j <= short.length; j += 1) {
      curr[j] = long[i - 1] === short[j - 1]
        ? prev[j - 1] + 1
        : Math.max(prev[j], curr[j - 1])
    }
    prev = curr
  }
  return prev[short.length] / short.length
}

// Lyrics compare as word sets (Jaccard), not by LCS. Two different songs share
// plenty of common English; a subsequence metric rates that as near-identical,
// which is how an unrelated song ends up merged into someone else's group.
function lyricsSimilarity(a, b) {
  if (a === b) return 1
  const words = (t) => new Set(t.match(/[a-z0-9]+/g) ?? [])
  const setA = words(a)
  const setB = words(b)
  if (!setA.size || !setB.size) return 0
  let shared = 0
  for (const w of setA) if (setB.has(w)) shared += 1
  return shared / (setA.size + setB.size - shared)
}

const TITLE_FUZZY_THRESHOLD = 0.86
// Below this, a lyric body carries no evidence. Without it every row with
// empty or stub lyrics matches every other one and collapses into a single
// meaningless group — and plenty of this library is stubs.
const MIN_LYRICS_FOR_SIGNAL = 40
const LYRICS_NEAR_IDENTICAL = 0.92

/**
 * Compare two songs. Returns null when they look unrelated.
 * @returns {{ confidence: number, reasons: string[] }|null}
 */
export function comparePair(a, b) {
  if (a.notDuplicates?.includes(b.id) || b.notDuplicates?.includes(a.id)) return null

  const reasons = []
  let confidence = 0

  const titleA = norm(a.song)
  const titleB = norm(b.song)
  const artistA = norm(a.artist)
  const artistB = norm(b.artist)

  const sameTitle = titleA && titleA === titleB
  if (sameTitle) {
    reasons.push('Same title')
    confidence += 0.5
  } else if (titleA && titleB && similarity(titleA, titleB) >= TITLE_FUZZY_THRESHOLD) {
    reasons.push('Nearly the same title')
    confidence += 0.35
  }

  // Fields swapped on one side: its artist is the other's song and vice versa.
  if (titleA && artistB && artistA && titleB
      && similarity(artistA, titleB) >= TITLE_FUZZY_THRESHOLD
      && similarity(titleA, artistB) >= TITLE_FUZZY_THRESHOLD) {
    reasons.push('Artist and song look swapped')
    confidence += 0.5
  }

  const lyricsA = normLyrics(a.lyrics)
  const lyricsB = normLyrics(b.lyrics)
  if (lyricsA.length >= MIN_LYRICS_FOR_SIGNAL && lyricsB.length >= MIN_LYRICS_FOR_SIGNAL) {
    const score = lyricsSimilarity(lyricsA, lyricsB)
    if (score >= 0.999) {
      reasons.push('Identical lyrics')
      confidence += 0.5
    } else if (score >= LYRICS_NEAR_IDENTICAL) {
      reasons.push('Nearly identical lyrics')
      confidence += 0.4
    } else if (sameTitle && score < 0.5) {
      // Same title, unrelated words — most likely two different songs.
      reasons.push('Lyrics differ — may be different songs')
      confidence -= 0.35
    }
  }

  if (sameTitle && artistA && artistA === artistB) {
    reasons.push('Same artist')
    confidence += 0.2
  }

  if (sameTitle && artistA && artistB && artistA !== artistB) {
    const artistScore = similarity(artistA, artistB)
    if (artistScore >= 0.6) {
      reasons.push('Artist spelled differently')
      confidence += 0.1
    } else {
      reasons.push('Different artist')
      confidence -= 0.1
    }
  }

  if (sameTitle && (!artistA || !artistB)) {
    reasons.push('One copy has no artist')
    confidence += 0.15
  }

  if (confidence <= 0 || !reasons.length) return null
  return { confidence: Math.max(0, Math.min(1, confidence)), reasons }
}

/**
 * Group a library into duplicate candidates. Groups are transitive, so three
 * copies of one song arrive as a single group of three.
 * @returns {Array<{ songs: object[], confidence: number, reasons: string[] }>}
 */
export function findDuplicateGroups(songs) {
  const list = songs.filter((s) => s && s.id)
  const pairs = []

  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const verdict = comparePair(list[i], list[j])
      if (verdict) pairs.push({ a: list[i].id, b: list[j].id, ...verdict })
    }
  }

  // Union-find over the matched pairs.
  const parent = new Map(list.map((s) => [s.id, s.id]))
  const find = (id) => {
    while (parent.get(id) !== id) {
      parent.set(id, parent.get(parent.get(id)))
      id = parent.get(id)
    }
    return id
  }
  for (const { a, b } of pairs) parent.set(find(a), find(b))

  const byRoot = new Map()
  for (const song of list) {
    const root = find(song.id)
    if (!byRoot.has(root)) byRoot.set(root, [])
    byRoot.get(root).push(song)
  }

  const groups = []
  for (const [root, members] of byRoot) {
    if (members.length < 2) continue
    const ids = new Set(members.map((m) => m.id))
    const related = pairs.filter((p) => ids.has(p.a) && ids.has(p.b))
    groups.push({
      key: root,
      songs: members,
      confidence: Math.max(...related.map((p) => p.confidence)),
      reasons: [...new Set(related.flatMap((p) => p.reasons))],
    })
  }

  // Most certain first; the doubtful ones sort last, where they get read.
  return groups.sort((x, y) => y.confidence - x.confidence)
}

// Which row to keep by default: never one that is live in the set list, then
// whichever carries the most information.
export function suggestKeeper(songs) {
  const score = (s) => {
    let n = 0
    if (s.enabled) n += 1000
    if (s.artist?.trim()) n += 10
    if (s.ccliNumber) n += 5
    if (s.copyright) n += 5
    n += Math.min((s.lyrics?.length ?? 0) / 1000, 5)
    return n
  }
  return [...songs].sort((a, b) => score(b) - score(a))[0]
}

// Fields the keeper is missing that a sibling can supply.
export function fillableFields(keeper, others) {
  const fields = {}
  for (const field of ['artist', 'song', 'ccliNumber', 'copyright']) {
    if (String(keeper[field] ?? '').trim()) continue
    const donor = others.find((o) => String(o[field] ?? '').trim())
    if (donor) fields[field] = donor[field]
  }
  return fields
}
