import { describe, it, expect } from 'vitest'
import { KIND, isLiturgy, kindOf, isLiturgyItem, partition } from './kind.js'
import { STATUS } from './matching.js'

const s = (song, extra = {}) => ({ id: '1', song, artist: '', ...extra })

describe('isLiturgy', () => {
  // All real rows from the library.
  it.each([
    'Confession', 'Doxology', 'Call To Worship', 'Nunc Dimittis',
    // Apostrophe placement: the real row is "Apostle's", not "Apostles'".
    "Apostle's Creed", 'Apostles Creed', 'Apostle’s Creed',
    'January Prayer', "February's Prayer", 'A Good Shepherd Litany', 'Lament Liturgy',
    'Annual Commitment Form',
  ])('%s is liturgy', (title) => expect(isLiturgy(s(title))).toBe(true))

  it.each(['Amazing Grace', 'Goodness of God', 'Cornerstone'])(
    '%s is a song', (title) => expect(isLiturgy(s(title))).toBe(false))
})

describe('kindOf', () => {
  it('takes the stored field over everything else', () => {
    // A song-shaped title and a CCLI match, marked liturgy by hand anyway.
    expect(kindOf(s('Cornerstone', { kind: 'liturgy', ccliNumber: '6158927' })))
      .toBe(KIND.LITURGY)
    // ...and the reverse: a title the regex claims, kept as a song.
    expect(kindOf(s('Doxology', { kind: 'song' }))).toBe(KIND.SONG)
    expect(kindOf(s('Confession', { kind: 'song', ccliStatus: STATUS.NOT_A_SONG })))
      .toBe(KIND.SONG)
  })

  it('falls back to the decision already recorded in the match queue', () => {
    // Song-shaped title, so only the status can be saying this.
    expect(kindOf(s('Annual Meeting Notes', { ccliStatus: STATUS.NOT_A_SONG })))
      .toBe(KIND.LITURGY)
  })

  it('falls back to the title last', () => {
    expect(kindOf(s('Nunc Dimittis'))).toBe(KIND.LITURGY)
    expect(kindOf(s('Cornerstone'))).toBe(KIND.SONG)
  })

  it('does not read another CCLI status as liturgy', () => {
    expect(kindOf(s('Amazing Grace', { ccliStatus: STATUS.PUBLIC_DOMAIN }))).toBe(KIND.SONG)
    expect(kindOf(s('Cornerstone', { ccliStatus: STATUS.MATCHED }))).toBe(KIND.SONG)
  })

  it('reads an unrecognised value as a song rather than losing it', () => {
    expect(kindOf(s('Cornerstone', { kind: 'sogn' }))).toBe(KIND.SONG)
    // Even when the title would otherwise have said liturgy: the field was set
    // by something, and guessing past it is how a row ends up in neither list.
    expect(kindOf(s('Doxology', { kind: 'hymn' }))).toBe(KIND.SONG)
  })

  it('tolerates the shapes Firestore actually hands back', () => {
    expect(kindOf(s('Doxology', { kind: '' }))).toBe(KIND.LITURGY)
    expect(kindOf(s('Doxology', { kind: null }))).toBe(KIND.LITURGY)
    expect(kindOf(s('Cornerstone', { kind: ' LITURGY ' }))).toBe(KIND.LITURGY)
    expect(kindOf(undefined)).toBe(KIND.SONG)
  })
})

describe('isLiturgyItem', () => {
  it('is kindOf as a predicate', () => {
    expect(isLiturgyItem(s('Confession'))).toBe(true)
    expect(isLiturgyItem(s('Cornerstone'))).toBe(false)
  })
})

describe('partition', () => {
  it('splits without reordering either group', () => {
    const rows = [
      s('Cornerstone'), s('Confession'), s('Goodness of God'),
      s('Doxology'), s('Amazing Grace'),
    ]
    const { songs, liturgy } = partition(rows)
    expect(songs.map((r) => r.song)).toEqual(['Cornerstone', 'Goodness of God', 'Amazing Grace'])
    expect(liturgy.map((r) => r.song)).toEqual(['Confession', 'Doxology'])
  })

  it('always returns both groups', () => {
    expect(partition([])).toEqual({ songs: [], liturgy: [] })
    expect(partition(undefined)).toEqual({ songs: [], liturgy: [] })
  })
})
