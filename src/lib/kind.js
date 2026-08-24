// Which of the two things in the library a row actually is. Most are songs; a
// handful are service elements — Confession, Doxology, the monthly Prayers —
// with no artist, no CCLI number, and no business sitting in the same grid as
// Cornerstone.
//
// Lives here rather than in matching.js because the answer is read by the
// store, both views and the public page, while matching.js is about CCLI
// decisions specifically.

export const KIND = {
  SONG: 'song',
  LITURGY: 'liturgy',
}

// Service elements rather than songs. None of these exist in SongSelect.
const LITURGY = /^\s*(confession|call to worship|apostle['’]?s?['’]?\s+creed|doxology|nunc dimittis|prayer of the church|sunday meditation|lament liturgy|election liturgy|annual commitment form|.*\bprayer\b.*|.*\blitany\b.*)\s*$/i

export function isLiturgy(song) {
  return LITURGY.test(song?.song ?? '')
}

/**
 * The row's kind, explicit field first and inference after, so this is correct
 * on the library as it stands today rather than only on rows saved since.
 *
 * A row with no `kind` falls back to the 'not-a-song' decision recorded in the
 * match queue — a human already answered this exact question there — and then
 * to the title. parse.js appends straight from the website's lyrics.yml and
 * will never write a kind, so the fallback is not only for legacy rows.
 */
export function kindOf(song) {
  const stored = String(song?.kind ?? '').trim().toLowerCase()
  if (stored === KIND.LITURGY) return KIND.LITURGY
  // Anything unrecognised reads as a song: a typo in the field must not make a
  // song vanish out of the section people go looking for it in.
  if (stored) return KIND.SONG
  // Kept as a literal rather than importing STATUS, which would make matching.js
  // and this module import each other. kind.test.js asserts the two agree.
  if (song?.ccliStatus === 'not-a-song') return KIND.LITURGY
  return isLiturgy(song) ? KIND.LITURGY : KIND.SONG
}

export function isLiturgyItem(song) {
  return kindOf(song) === KIND.LITURGY
}

// One pass, input order preserved inside each group — callers sort after.
export function partition(songs) {
  const out = { songs: [], liturgy: [] }
  for (const song of songs ?? []) {
    (isLiturgyItem(song) ? out.liturgy : out.songs).push(song)
  }
  return out
}
