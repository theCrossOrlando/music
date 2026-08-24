import { describe, it, expect } from 'vitest'
import { search, parseQuery } from './search.js'

// Songs and lyrics taken from the real library rather than invented.
const GOODNESS = {
  id: '1',
  artist: 'Bethel Music',
  song: 'Goodness of God',
  lyrics: 'All my life You have been faithful\nAll my life You have been so, so good\nWith every breath that I am able\nOh, I will sing of the goodness of God',
}

const GRACE = {
  id: '2',
  artist: 'Chris Tomlin',
  song: 'Amazing Grace (My Chains Are Gone)',
  lyrics: 'Amazing grace how sweet the sound\nThat saved a wretch like me\nMy chains are gone, I have been set free',
}

const WELL = {
  id: '3',
  artist: 'Horatio G. Spafford',
  song: 'It Is Well With My Soul',
  lyrics: 'When peace like a river attendeth my way\nWhen sorrows like sea billows roll\nWhatever my lot, Thou hast taught me to say\nIt is well, it is well with my soul',
}

const LIBRARY = [GOODNESS, GRACE, WELL]

const titles = (results) => results.map((r) => r.song.song)
const marked = (result) => result.excerpt.filter((s) => s.mark).map((s) => s.text)
const text = (result) => result.excerpt.map((s) => s.text).join('')

describe('parseQuery', () => {
  it('folds punctuation and case the way the library is normalised', () => {
    expect(parseQuery("  It's  WELL ")).toEqual(['its', 'well'])
  })

  it('is empty for a blank query', () => {
    expect(parseQuery('   ')).toEqual([])
  })
})

describe('search', () => {
  it('returns nothing for an empty query rather than everything', () => {
    expect(search(LIBRARY, '')).toEqual([])
  })

  it('finds a song by title', () => {
    expect(titles(search(LIBRARY, 'goodness'))).toContain('Goodness of God')
  })

  it('finds a song by artist, which the title alone would miss', () => {
    expect(titles(search(LIBRARY, 'spafford'))).toEqual(['It Is Well With My Soul'])
  })

  it('finds a song by a line from its lyrics', () => {
    expect(titles(search(LIBRARY, 'billows'))).toEqual(['It Is Well With My Soul'])
  })

  it('matches a word by prefix, so "amazing" is found from "amaz"', () => {
    expect(titles(search(LIBRARY, 'amaz'))).toContain('Amazing Grace (My Chains Are Gone)')
  })

  it('ignores case and punctuation', () => {
    expect(titles(search(LIBRARY, 'CHAINS!'))).toEqual(['Amazing Grace (My Chains Are Gone)'])
  })

  it('narrows on a second term instead of widening', () => {
    // "my" is in all three; "chains" is in one.
    expect(titles(search(LIBRARY, 'my'))).toHaveLength(3)
    expect(titles(search(LIBRARY, 'my chains'))).toEqual(['Amazing Grace (My Chains Are Gone)'])
  })

  it('requires every term to land somewhere', () => {
    expect(search(LIBRARY, 'grace tuba')).toEqual([])
  })

  it('spreads terms across fields, title and artist together', () => {
    expect(titles(search(LIBRARY, 'tomlin grace'))).toEqual(['Amazing Grace (My Chains Are Gone)'])
  })

  it('ranks a title match above a body match', () => {
    // "goodness" is the title of one and the last line of the same song, but
    // "God" appears in both — the titled one has to come first.
    const results = search([WELL, GOODNESS], 'god')
    expect(results[0].song.song).toBe('Goodness of God')
  })

  it('does not let a repeated word outrank a title', () => {
    const chorus = {
      id: '4',
      artist: 'Someone',
      song: 'Another Song',
      lyrics: 'goodness goodness goodness goodness goodness goodness goodness',
    }
    expect(titles(search([chorus, GOODNESS], 'goodness'))[0]).toBe('Goodness of God')
  })

  it('keeps the given order when scores tie', () => {
    const first = { id: 'a', artist: '', song: 'Come Thou Fount', lyrics: 'tune my heart' }
    const second = { id: 'b', artist: '', song: 'Come Thou Long Expected Jesus', lyrics: 'born to set' }
    expect(titles(search([first, second], 'come thou'))).toEqual([first.song, second.song])
    expect(titles(search([second, first], 'come thou'))).toEqual([second.song, first.song])
  })
})

describe('excerpts', () => {
  it('marks the matched words in the original spelling', () => {
    const [result] = search(LIBRARY, 'billows')
    expect(marked(result)).toEqual(['billows'])
    expect(text(result)).toContain('sea billows roll')
  })

  it('marks every term that appears in the body', () => {
    const [result] = search(LIBRARY, 'chains gone')
    expect(marked(result).map((w) => w.toLowerCase()).sort()).toEqual(['chains', 'gone'])
  })

  it('windows a long body around the match rather than dumping it', () => {
    const long = {
      id: '5',
      artist: '',
      song: 'Long One',
      lyrics: `${'padding '.repeat(60)}sparrow${' padding'.repeat(60)}`,
    }
    const [result] = search([long], 'sparrow')
    const words = text(result).split(/\s+/).filter(Boolean)
    expect(words.length).toBeLessThanOrEqual(32) // 30 words plus the two ellipses
    expect(marked(result)).toEqual(['sparrow'])
    expect(text(result).startsWith('…')).toBe(true)
    expect(text(result).endsWith('…')).toBe(true)
  })

  it('gives no excerpt when only the title or artist matched', () => {
    expect(search(LIBRARY, 'spafford')[0].excerpt).toEqual([])
  })

  it('leaves a short body whole, with no ellipses', () => {
    const [result] = search([GRACE], 'wretch')
    expect(text(result).startsWith('…')).toBe(false)
  })
})
