// Scripture references: the same shape the sermon pages use, so what is typed
// here can be linked there.
//
// `messages.liquid` splits the front-matter `scripture` on ";", trims, and
// links each reference to BibleGateway in ESV. This file is that rule, plus
// enough book knowledge to autocomplete the part people actually mistype.
//
// Nothing here rejects anything. An unrecognised reference is reported so the
// UI can say so, and saved anyway.

// Canonical spellings follow what the archive already writes — "Psalm", not
// "Psalms". Aliases are the abbreviations people type, plus the near-misses
// worth catching ("Psalms", "Revelations", "Song of Songs").
const BOOK_TABLE = [
  ['Genesis', 'gen', 'ge', 'gn'],
  ['Exodus', 'exo', 'exod', 'ex'],
  ['Leviticus', 'lev', 'lv'],
  ['Numbers', 'num', 'nm', 'nu'],
  ['Deuteronomy', 'deut', 'dt', 'deu'],
  ['Joshua', 'josh', 'jos'],
  ['Judges', 'judg', 'jdg'],
  ['Ruth', 'rth', 'ru'],
  ['1 Samuel', '1 sam', '1 sa'],
  ['2 Samuel', '2 sam', '2 sa'],
  ['1 Kings', '1 kgs', '1 ki'],
  ['2 Kings', '2 kgs', '2 ki'],
  ['1 Chronicles', '1 chron', '1 chr'],
  ['2 Chronicles', '2 chron', '2 chr'],
  ['Ezra', 'ezr'],
  ['Nehemiah', 'neh'],
  ['Esther', 'est'],
  ['Job', 'jb'],
  ['Psalm', 'psalms', 'ps', 'psa', 'pslm'],
  ['Proverbs', 'prov', 'prv', 'pr'],
  ['Ecclesiastes', 'eccl', 'ecc', 'qoheleth'],
  ['Song of Solomon', 'song of songs', 'song', 'sos', 'canticles'],
  ['Isaiah', 'isa', 'is'],
  ['Jeremiah', 'jer'],
  ['Lamentations', 'lam'],
  ['Ezekiel', 'ezek', 'eze'],
  ['Daniel', 'dan', 'dn'],
  ['Hosea', 'hos'],
  ['Joel', 'jl'],
  ['Amos', 'am'],
  ['Obadiah', 'obad', 'ob'],
  ['Jonah', 'jon'],
  ['Micah', 'mic'],
  ['Nahum', 'nah'],
  ['Habakkuk', 'hab'],
  ['Zephaniah', 'zeph', 'zep'],
  ['Haggai', 'hag'],
  ['Zechariah', 'zech', 'zec'],
  ['Malachi', 'mal'],
  ['Matthew', 'matt', 'mt'],
  ['Mark', 'mk', 'mrk'],
  ['Luke', 'lk'],
  ['John', 'jn', 'jhn'],
  ['Acts', 'act'],
  ['Romans', 'rom', 'rm'],
  ['1 Corinthians', '1 cor', '1 co'],
  ['2 Corinthians', '2 cor', '2 co'],
  ['Galatians', 'gal'],
  ['Ephesians', 'eph'],
  ['Philippians', 'phil', 'php'],
  ['Colossians', 'col'],
  ['1 Thessalonians', '1 thess', '1 thes', '1 th'],
  ['2 Thessalonians', '2 thess', '2 thes', '2 th'],
  ['1 Timothy', '1 tim', '1 ti'],
  ['2 Timothy', '2 tim', '2 ti'],
  ['Titus', 'tit'],
  ['Philemon', 'philem', 'phm'],
  ['Hebrews', 'heb'],
  ['James', 'jas', 'jm'],
  ['1 Peter', '1 pet', '1 pt'],
  ['2 Peter', '2 pet', '2 pt'],
  ['1 John', '1 jn'],
  ['2 John', '2 jn'],
  ['3 John', '3 jn'],
  ['Jude', 'jud'],
  ['Revelation', 'revelations', 'rev', 'rv'],
]

export const BOOKS = BOOK_TABLE.map(([name, ...aliases]) => ({ name, aliases }))

// Roman numerals get folded to digits, full stops dropped ("Gen." → "gen"),
// and the space after a book number made optional, so "1john", "1 John" and
// "I John" are one thing.
const fold = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/\./g, ' ')
    .replace(/^\s*(iii|ii|i)\s+/, (_, numeral) => `${numeral.length} `)
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^([123])\s*/, '$1 ')

const KEYS = BOOKS.map((book, order) => ({
  book,
  order,
  keys: [book.name, ...book.aliases].map(fold),
}))

/** The sermon pages' rule: one field can hold several references, split on ";". */
export function splitReferences(text) {
  return String(text ?? '')
    .split(';')
    .map((ref) => ref.trim())
    .filter(Boolean)
}

/** The book a reference names, or null. "2 Peter 3:8" → "2 Peter". */
export function bookOf(reference) {
  const folded = fold(reference)
  if (!folded) return null
  // Longest key first, so "Song of Solomon" is not shadowed by "Song", and
  // "1 John" wins over a bare "John" reading of "1 John 4".
  let best = null
  for (const { book, keys } of KEYS) {
    for (const key of keys) {
      if (folded !== key && !folded.startsWith(`${key} `)) continue
      if (!best || key.length > best.key.length) best = { book, key }
    }
  }
  return best?.book.name ?? null
}

/** References whose book is not one of the 66. Empty when everything parsed. */
export function unknownBooks(text) {
  return splitReferences(text).filter((ref) => !bookOf(ref))
}

/** The link the sermon pages emit, verbatim. */
export function bibleGatewayUrl(reference) {
  return `https://www.biblegateway.com/passage/?search=${encodeURIComponent(reference)}&version=ESV`
}

// What is being typed right now: the last ";" segment, and the part of it that
// looks like a book name rather than a chapter or verse.
function activeSegment(value) {
  const text = String(value ?? '')
  const start = text.lastIndexOf(';') + 1
  const segment = text.slice(start)
  // A book name runs up to the first digit that is not a leading book number.
  const match = /^(\s*[123]?\s*[^\d]*)/.exec(segment)
  return { start, segment, book: match ? match[1] : segment }
}

/**
 * Books worth offering for what has been typed so far. Canonical prefix first,
 * then alias, then a word-start inside the name — so "cor" reaches
 * "1 Corinthians" while "john" still puts "John" above "1 John".
 */
export function suggestBooks(value, limit = 6) {
  const fragment = fold(activeSegment(value).book)
  if (!fragment) return []

  const scored = []
  for (const { book, keys, order } of KEYS) {
    const name = keys[0]
    let rank = null
    if (name.startsWith(fragment)) rank = 0
    else if (keys.slice(1).some((key) => key.startsWith(fragment))) rank = 1
    else if (name.split(' ').some((word) => word.startsWith(fragment))) rank = 2
    if (rank !== null) scored.push({ book, rank, order })
  }

  // Canon order breaks a tie, because that is the order these are listed
  // everywhere else: "phil" offers Philippians before Philemon.
  return scored
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .slice(0, limit)
    .map((entry) => entry.book.name)
}

/**
 * The field text with the book of the segment being typed replaced, chapter
 * and verse left alone: completing "Exodus 19; phil 2:5" with "Philippians"
 * gives "Exodus 19; Philippians 2:5".
 */
export function completeBook(value, book) {
  const { start, segment, book: typed } = activeSegment(value)
  const rest = segment.slice(typed.length)
  const prefix = String(value ?? '').slice(0, start)
  const spacer = prefix && !prefix.endsWith(' ') ? ' ' : ''
  return `${prefix}${spacer}${book}${rest.trim() ? ` ${rest.trim()}` : ' '}`
}
