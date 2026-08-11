// Sorting the library into what still needs a CCLI decision, and what kind of
// decision that is.

// Terminal states only. "Skipped" is deliberately absent: skipping is a
// session-local "not now", and persisting it would mark the song reviewed and
// strand it outside the queue permanently.
export const STATUS = {
  MATCHED: 'matched',
  PUBLIC_DOMAIN: 'public-domain',
  NOT_A_SONG: 'not-a-song',
}

// Service elements rather than songs. None of these exist in SongSelect.
const LITURGY = /^\s*(confession|call to worship|apostle['’]?s?['’]?\s+creed|doxology|nunc dimittis|prayer of the church|sunday meditation|lament liturgy|election liturgy|annual commitment form|.*\bprayer\b.*|.*\blitany\b.*)\s*$/i

// Authors dead long enough that their work is public domain. A hint for the
// UI to pre-select, never an automatic decision — "Common Hymnal" is a modern
// publisher despite the name, and arrangements can carry their own copyright.
const PUBLIC_DOMAIN_AUTHOR = /\b(charles wesley|john wesley|isaac watts|john newton|augustus m\.? toplady|fanny crosby|horatio g\.? spafford|frances r\.? havergal|james chadwick|francis of assisi|martin luther|james montgomery|horatius bonar|henry f\.? lyte|reginald heber|john m\.? neale|thomas o\.? chisholm|edward mote|traditional|christmas carol|public domain)\b/i

export function isLiturgy(song) {
  return LITURGY.test(song?.song ?? '')
}

export function looksPublicDomain(song) {
  return PUBLIC_DOMAIN_AUTHOR.test(song?.artist ?? '')
}

// Already decided? Anything with a status, or with a CCLI number already on it
// from an import.
export function isReviewed(song) {
  return Boolean(song?.ccliStatus) || Boolean(String(song?.ccliNumber ?? '').trim())
}

/**
 * Everything still needing a decision, most useful first.
 *
 * Ordering: the set list first — those are the songs being reproduced in front
 * of the congregation right now, so they are the ones whose attribution
 * actually matters. Then songs with an artist, because they can be looked up
 * unambiguously. Titles alone come last.
 */
export function buildQueue(songs) {
  return songs
    .filter((s) => s?.id && !isReviewed(s))
    .map((s) => ({
      song: s,
      suggestion: isLiturgy(s)
        ? STATUS.NOT_A_SONG
        : looksPublicDomain(s)
          ? STATUS.PUBLIC_DOMAIN
          : null,
    }))
    .sort((a, b) => {
      const rank = (x) => {
        if (x.song.enabled) return 0
        if (x.suggestion) return 3 // mechanical, batch them at the end
        return String(x.song.artist ?? '').trim() ? 1 : 2
      }
      return rank(a) - rank(b)
        || String(a.song.song ?? '').localeCompare(String(b.song.song ?? ''))
    })
}

export function progress(songs) {
  const real = songs.filter((s) => s?.id)
  const reviewed = real.filter(isReviewed).length
  return { reviewed, total: real.length, remaining: real.length - reviewed }
}

// The fields a decision writes. Kept here so the view cannot invent its own
// shape and drift from what the queue reads back.
export function decisionFields(status, extra = {}) {
  const fields = { ccliStatus: status }
  if (status === STATUS.PUBLIC_DOMAIN) fields.copyright = extra.copyright || 'Public Domain'
  if (status === STATUS.MATCHED) {
    if (extra.ccliNumber) fields.ccliNumber = String(extra.ccliNumber).trim()
    if (extra.copyright) fields.copyright = String(extra.copyright).trim()
  }
  return fields
}
