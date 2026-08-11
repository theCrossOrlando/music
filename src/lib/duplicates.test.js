import { describe, it, expect } from 'vitest'
import { comparePair, findDuplicateGroups, suggestKeeper, fillableFields } from './duplicates.js'

// Cases taken from the real library rather than invented.
const song = (id, artist, songTitle, extra = {}) =>
  ({ id, artist, song: songTitle, lyrics: 'placeholder body', ...extra })

describe('comparePair — should match', () => {
  it('exact duplicates', () => {
    const v = comparePair(song('1', 'Jon Foreman', 'Your Love is Strong'),
                          song('2', 'Jon Foreman', 'Your Love is Strong'))
    expect(v.reasons).toContain('Same title')
    expect(v.confidence).toBeGreaterThan(0.5)
  })

  it('one copy missing the artist', () => {
    const v = comparePair(song('1', '', 'It Is Well With My Soul'),
                          song('2', 'Horatio G. Spafford', 'It Is Well With My Soul'))
    expect(v.reasons).toContain('One copy has no artist')
  })

  it('the same artist spelled differently', () => {
    const v = comparePair(song('1', 'Will Reagan', 'Set A Fire'),
                          song('2', 'Will Reagan & United Pursuit', 'Set a Fire'))
    expect(v.reasons).toContain('Artist spelled differently')
    expect(v.confidence).toBeGreaterThan(0.5)
  })

  it('a title typo', () => {
    const v = comparePair(song('1', 'Elevation Worship', 'Graves Into Garden'),
                          song('2', 'Elevation Worship', 'Graves Into Gardens'))
    expect(v).not.toBeNull()
    expect(v.reasons).toContain('Nearly the same title')
  })

  it('punctuation-only differences', () => {
    expect(comparePair(song('1', '', 'Oh Holy Night'), song('2', '', 'Oh, Holy Night'))).not.toBeNull()
  })

  it('swapped artist and song fields', () => {
    // The real row: artist "Ain't No Grave", song "Molly Skaggs".
    const v = comparePair(song('1', "Ain't No Grave", 'Molly Skaggs'),
                          song('2', 'Molly Skaggs', "Ain't No Grave"))
    expect(v).not.toBeNull()
    expect(v.reasons).toContain('Artist and song look swapped')
  })

  it('identical lyrics even when the titles disagree', () => {
    const body = 'when i survey the wondrous cross on which the prince of glory died'
    const v = comparePair(song('1', '', 'Wonderous Cross', { lyrics: body }),
                          song('2', 'Chris Tomlin', 'The Wondrous Cross', { lyrics: body }))
    expect(v.reasons).toContain('Identical lyrics')
  })
})

describe('comparePair — should NOT match', () => {
  it('different songs that share a title', () => {
    // Both are real, and both are genuinely different songs.
    const v = comparePair(
      song('1', 'Derek Johnson', 'I Belong to You',
        { lyrics: 'i belong to you and you alone forever mine my heart is yours to keep' }),
      song('2', 'Hillsong United', 'I Belong to You',
        { lyrics: 'a completely unrelated set of words about something else entirely different' }))
    // Surfaced for review, but flagged and ranked low — never auto-merged.
    expect(v.reasons).toContain('Lyrics differ — may be different songs')
    expect(v.confidence).toBeLessThan(0.3)
  })

  it('unrelated songs', () => {
    expect(comparePair(song('1', 'Crowder', 'Come As You Are'),
                       song('2', 'Gungor', 'Beautiful Things'))).toBeNull()
  })

  it('a pair already dismissed as not duplicates', () => {
    expect(comparePair(
      song('1', 'Jon Foreman', 'Your Love is Strong', { notDuplicates: ['2'] }),
      song('2', 'Jon Foreman', 'Your Love is Strong'))).toBeNull()
  })
})

describe('findDuplicateGroups', () => {
  it('collapses three copies into one group', () => {
    const groups = findDuplicateGroups([
      song('1', 'Jon Foreman', 'Your Love is Strong'),
      song('2', 'Jon Foreman', 'Your Love is Strong'),
      song('3', 'Jon Foreman', 'Your Love Is Strong'),
      song('4', 'Gungor', 'Beautiful Things'),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].songs.map((s) => s.id).sort()).toEqual(['1', '2', '3'])
  })

  it('ranks the certain groups above the doubtful ones', () => {
    const groups = findDuplicateGroups([
      song('1', '', 'Graves Into Garden'),
      song('2', 'Elevation Worship', 'Graves Into Gardens'),
      song('3', 'Chris Tomlin', 'Amazing Grace'),
      song('4', 'Chris Tomlin', 'Amazing Grace'),
    ])
    expect(groups[0].songs.map((s) => s.id)).toEqual(['3', '4'])
  })

  it('returns nothing for a clean library', () => {
    expect(findDuplicateGroups([
      song('1', 'Crowder', 'Come As You Are'),
      song('2', 'Gungor', 'Beautiful Things'),
    ])).toEqual([])
  })
})

describe('suggestKeeper', () => {
  it('never suggests deleting the live one', () => {
    const live = song('1', '', 'Anyone Else', { enabled: true })
    const shadow = song('2', 'John Mark McMillan', 'Anyone Else', { ccliNumber: '7275788' })
    expect(suggestKeeper([shadow, live]).id).toBe('1')
  })

  it('otherwise prefers the row carrying the most detail', () => {
    expect(suggestKeeper([
      song('1', '', 'It Is Well With My Soul'),
      song('2', 'Horatio G. Spafford', 'It Is Well With My Soul', { ccliNumber: '25376' }),
    ]).id).toBe('2')
  })
})

describe('fillableFields', () => {
  it('offers only what the keeper is missing', () => {
    const keeper = song('1', '', 'It Is Well With My Soul', { enabled: true })
    const other = song('2', 'Horatio G. Spafford', 'It Is Well With My Soul',
      { ccliNumber: '25376', copyright: 'Public Domain' })
    expect(fillableFields(keeper, [other]))
      .toEqual({ artist: 'Horatio G. Spafford', ccliNumber: '25376', copyright: 'Public Domain' })
  })

  it('never overwrites something the keeper already has', () => {
    const keeper = song('1', 'Will Reagan', 'Set A Fire')
    const other = song('2', 'Will Reagan & United Pursuit', 'Set a Fire')
    expect(fillableFields(keeper, [other])).toEqual({})
  })
})
