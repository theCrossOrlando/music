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

  it('does not read the lyrics: a word only the body has finds nothing', () => {
    expect(titles(search(LIBRARY, 'billows'))).toEqual([])
  })

  it('narrows a title match rather than widening it with body hits', () => {
    // "grace" is in the title of one and the first line of the same song, and
    // "amazing" is in both — neither reaches past the title.
    expect(titles(search(LIBRARY, 'grace'))).toEqual(['Amazing Grace (My Chains Are Gone)'])
  })

  it('matches a word by prefix, so "amazing" is found from "amaz"', () => {
    expect(titles(search(LIBRARY, 'amaz'))).toContain('Amazing Grace (My Chains Are Gone)')
  })

  it('ignores case and punctuation', () => {
    expect(titles(search(LIBRARY, 'CHAINS!'))).toEqual(['Amazing Grace (My Chains Are Gone)'])
  })

  it('narrows on a second term instead of widening', () => {
    // "my" is in two titles; "chains" is in one.
    expect(titles(search(LIBRARY, 'my'))).toHaveLength(2)
    expect(titles(search(LIBRARY, 'my chains'))).toEqual(['Amazing Grace (My Chains Are Gone)'])
  })

  it('requires every term to land somewhere', () => {
    expect(search(LIBRARY, 'grace tuba')).toEqual([])
  })

  it('spreads terms across fields, title and artist together', () => {
    expect(titles(search(LIBRARY, 'tomlin grace'))).toEqual(['Amazing Grace (My Chains Are Gone)'])
  })

  it('ranks a title match above an artist match', () => {
    const named = { id: '4', artist: 'Goodness Collective', song: 'Another Song', lyrics: '' }
    expect(titles(search([named, GOODNESS], 'goodness'))[0]).toBe('Goodness of God')
  })

  it('does not let a repeated word in the body count at all', () => {
    const chorus = {
      id: '5',
      artist: 'Someone',
      song: 'Another Song',
      lyrics: 'goodness goodness goodness goodness goodness goodness goodness',
    }
    expect(titles(search([chorus, GOODNESS], 'goodness'))).toEqual(['Goodness of God'])
  })

  it('keeps the given order when scores tie', () => {
    const first = { id: 'a', artist: '', song: 'Come Thou Fount', lyrics: 'tune my heart' }
    const second = { id: 'b', artist: '', song: 'Come Thou Long Expected Jesus', lyrics: 'born to set' }
    expect(titles(search([first, second], 'come thou'))).toEqual([first.song, second.song])
    expect(titles(search([second, first], 'come thou'))).toEqual([second.song, first.song])
  })
})

