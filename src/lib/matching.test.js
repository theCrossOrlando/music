import { describe, it, expect } from 'vitest'
import {
  STATUS, isLiturgy, looksPublicDomain, isReviewed, buildQueue, progress, decisionFields,
} from './matching.js'

const s = (id, song, artist = '', extra = {}) => ({ id, song, artist, ...extra })

describe('isLiturgy', () => {
  // All real rows from the library.
  it.each([
    'Confession', 'Doxology', 'Call To Worship', 'Nunc Dimittis',
    // Apostrophe placement: the real row is "Apostle's", not "Apostles'".
    "Apostle's Creed", 'Apostles Creed', 'Apostle’s Creed',
    'January Prayer', "February's Prayer", 'A Good Shepherd Litany', 'Lament Liturgy',
    'Annual Commitment Form',
  ])('%s is liturgy', (title) => expect(isLiturgy(s('1', title))).toBe(true))

  it.each(['Amazing Grace', 'Goodness of God', 'Cornerstone'])(
    '%s is a song', (title) => expect(isLiturgy(s('1', title))).toBe(false))
})

describe('looksPublicDomain', () => {
  it.each([
    'Charles Wesley', 'Augustus M. Toplady', 'Frances R. Havergal',
    'Francis of Assisi', 'Christmas Carol', 'Horatio G. Spafford',
  ])('%s suggests public domain', (a) => expect(looksPublicDomain(s('1', 'x', a))).toBe(true))

  it('does not treat a modern publisher as public domain despite the name', () => {
    // Real row, and a genuine trap: Common Hymnal is a current publisher.
    expect(looksPublicDomain(s('1', 'The Kingdom is Yours', 'Common Hymnal'))).toBe(false)
  })

  it.each(['Bethel Music', 'Chris Tomlin', 'Elevation Worship', ''])(
    '%s does not', (a) => expect(looksPublicDomain(s('1', 'x', a))).toBe(false))
})

describe('isReviewed', () => {
  it('counts an existing CCLI number as reviewed', () => {
    expect(isReviewed(s('1', 'x', 'y', { ccliNumber: '7117726' }))).toBe(true)
  })
  it('counts any explicit status as reviewed', () => {
    expect(isReviewed(s('1', 'x', '', { ccliStatus: STATUS.NOT_A_SONG }))).toBe(true)
    expect(isReviewed(s('1', 'x', '', { ccliStatus: STATUS.PUBLIC_DOMAIN }))).toBe(true)
  })

  it('has no persisted skip state — skipping must not strand a song', () => {
    expect(STATUS.SKIPPED).toBeUndefined()
  })
  it('treats an untouched row as unreviewed', () => {
    expect(isReviewed(s('1', 'x'))).toBe(false)
    expect(isReviewed(s('1', 'x', '', { ccliNumber: '  ' }))).toBe(false)
  })
})

describe('buildQueue', () => {
  it('omits anything already decided', () => {
    const q = buildQueue([
      s('1', 'Done', 'A', { ccliNumber: '123' }),
      s('2', 'Also done', 'B', { ccliStatus: STATUS.PUBLIC_DOMAIN }),
      s('3', 'Todo', 'C'),
    ])
    expect(q.map((x) => x.song.id)).toEqual(['3'])
  })

  it('puts the set list first — those are being reproduced now', () => {
    const q = buildQueue([
      s('1', 'Library song', 'A'),
      s('2', 'Live song', 'B', { enabled: true }),
    ])
    expect(q[0].song.id).toBe('2')
  })

  it('ranks lookups above title-only rows, and mechanical ones last', () => {
    const q = buildQueue([
      s('pd', 'Rock of Ages', 'Augustus M. Toplady'),
      s('bare', 'As The Deer', ''),
      s('easy', 'Goodness of God', 'Bethel Music'),
    ])
    expect(q.map((x) => x.song.id)).toEqual(['easy', 'bare', 'pd'])
  })

  it('suggests a bucket without deciding', () => {
    const q = buildQueue([
      s('1', 'Confession', ''),
      s('2', 'Rock of Ages', 'Augustus M. Toplady'),
      s('3', 'Goodness of God', 'Bethel Music'),
    ])
    const by = Object.fromEntries(q.map((x) => [x.song.id, x.suggestion]))
    expect(by['1']).toBe(STATUS.NOT_A_SONG)
    expect(by['2']).toBe(STATUS.PUBLIC_DOMAIN)
    expect(by['3']).toBeNull()
  })
})

describe('progress', () => {
  it('counts what is done against the whole library', () => {
    expect(progress([
      s('1', 'a', '', { ccliNumber: '1' }),
      s('2', 'b'),
      s('3', 'c'),
    ])).toEqual({ reviewed: 1, total: 3, remaining: 2 })
  })
})

describe('decisionFields', () => {
  it('writes Public Domain as the copyright, since no CCLI number exists', () => {
    expect(decisionFields(STATUS.PUBLIC_DOMAIN))
      .toEqual({ ccliStatus: STATUS.PUBLIC_DOMAIN, copyright: 'Public Domain' })
  })

  it('carries CCLI details through on a match', () => {
    expect(decisionFields(STATUS.MATCHED, { ccliNumber: ' 7117726 ', copyright: ' 2018 Bethel ' }))
      .toEqual({ ccliStatus: STATUS.MATCHED, ccliNumber: '7117726', copyright: '2018 Bethel' })
  })

  it('writes lyrics when the caller opts in', () => {
    expect(decisionFields(STATUS.MATCHED, { ccliNumber: '1', lyrics: 'Verse 1\nline' }))
      .toEqual({ ccliStatus: STATUS.MATCHED, ccliNumber: '1', lyrics: 'Verse 1\nline' })
  })

  it('refuses to overwrite lyrics with an empty body', () => {
    // A blank paste during a sweep must not wipe a song.
    expect(decisionFields(STATUS.MATCHED, { ccliNumber: '1', lyrics: '   \n  ' }))
      .toEqual({ ccliStatus: STATUS.MATCHED, ccliNumber: '1' })
  })

  it('leaves lyrics alone when not opted in', () => {
    expect(decisionFields(STATUS.MATCHED, { ccliNumber: '1' }))
      .toEqual({ ccliStatus: STATUS.MATCHED, ccliNumber: '1' })
  })

  it('never writes empty values over existing ones', () => {
    expect(decisionFields(STATUS.MATCHED, { ccliNumber: '', copyright: '' }))
      .toEqual({ ccliStatus: STATUS.MATCHED })
  })

  it('writes nothing but the status for liturgy', () => {
    expect(decisionFields(STATUS.NOT_A_SONG)).toEqual({ ccliStatus: STATUS.NOT_A_SONG })
  })
})
