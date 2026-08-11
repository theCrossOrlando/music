import { describe, it, expect } from 'vitest'
import { diffLines, diffFields } from './lineDiff.js'

const statuses = (r) => r.rows.map((x) => `${x.status[0]}:${x.text}`)

describe('diffLines', () => {
  it('reports identical bodies as identical', () => {
    const r = diffLines('one\ntwo\nthree', 'one\ntwo\nthree')
    expect(r.identical).toBe(true)
    expect(r.changed).toBe(0)
  })

  it('ignores whitespace and apostrophe style', () => {
    // The normalizer curls apostrophes, so one copy may be curled and the
    // other not. That is not a real difference to a human choosing a keeper.
    expect(diffLines("jesus' blood  ", 'jesus’ blood').identical).toBe(true)
  })

  it('marks an added line', () => {
    const r = diffLines('one\nthree', 'one\ntwo\nthree')
    expect(statuses(r)).toEqual(['s:one', 'a:two', 's:three'])
    expect(r.changed).toBe(1)
  })

  it('marks a removed line', () => {
    const r = diffLines('one\ntwo\nthree', 'one\nthree')
    expect(statuses(r)).toEqual(['s:one', 'r:two', 's:three'])
  })

  it('handles a changed line as one removal and one addition', () => {
    const r = diffLines('one\nold\nthree', 'one\nnew\nthree')
    expect(statuses(r)).toEqual(['s:one', 'r:old', 'a:new', 's:three'])
    expect(r.changed).toBe(2)
  })

  it('handles an empty side', () => {
    expect(diffLines('', 'one\ntwo').rows.every((r) => r.status === 'added')).toBe(true)
    expect(diffLines('one\ntwo', '').rows.every((r) => r.status === 'removed')).toBe(true)
  })

  it('finds a missing verse in an otherwise identical song', () => {
    const full = 'Verse 1\na\nb\n\nChorus\nc\n\nVerse 2\nd\ne'
    const short = 'Verse 1\na\nb\n\nChorus\nc'
    const r = diffLines(full, short)
    expect(r.changed).toBe(4)
    expect(r.rows.filter((x) => x.status === 'removed').map((x) => x.text))
      .toEqual(['', 'Verse 2', 'd', 'e'])
  })
})

describe('diffFields', () => {
  it('lists only the fields that differ', () => {
    expect(diffFields(
      { song: 'Set A Fire', artist: 'Will Reagan', ccliNumber: '' },
      { song: 'Set a Fire', artist: 'Will Reagan', ccliNumber: '6209950' },
    )).toEqual([
      { field: 'song', a: 'Set A Fire', b: 'Set a Fire' },
      { field: 'ccliNumber', a: '', b: '6209950' },
    ])
  })

  it('treats blank and missing as the same', () => {
    expect(diffFields({ artist: '' }, {})).toEqual([])
  })
})
