import { describe, it, expect } from 'vitest'
import {
  BOOKS, splitReferences, bookOf, unknownBooks, bibleGatewayUrl, suggestBooks, completeBook,
} from './scripture.js'

describe('splitReferences', () => {
  it('splits on the semicolon the sermon pages split on', () => {
    expect(splitReferences('Exodus 19; Mark 5')).toEqual(['Exodus 19', 'Mark 5'])
  })

  it('drops the blanks a trailing separator leaves', () => {
    expect(splitReferences('Acts 2;  ; ')).toEqual(['Acts 2'])
  })

  it('is empty for an empty field', () => {
    expect(splitReferences('')).toEqual([])
    expect(splitReferences(undefined)).toEqual([])
  })
})

describe('bookOf', () => {
  it('reads the shapes the message archive actually uses', () => {
    // Every one of these is a real `scripture:` value from messages/*.md.
    expect(bookOf('2 Peter 3:8')).toBe('2 Peter')
    expect(bookOf('Luke 2')).toBe('Luke')
    expect(bookOf('Romans 11:33-36')).toBe('Romans')
    expect(bookOf('Genesis 12-25')).toBe('Genesis')
    expect(bookOf('Galatians')).toBe('Galatians')
    expect(bookOf('Psalm 51')).toBe('Psalm')
  })

  it('keeps a numbered book off the unnumbered one', () => {
    expect(bookOf('1 John 4:8')).toBe('1 John')
    expect(bookOf('John 4:8')).toBe('John')
  })

  it('is not shadowed by a shorter book name inside a longer one', () => {
    expect(bookOf('Song of Solomon 2')).toBe('Song of Solomon')
    expect(bookOf('Song of Songs 2')).toBe('Song of Solomon')
  })

  it('takes the spellings people type', () => {
    expect(bookOf('Psalms 23')).toBe('Psalm')
    expect(bookOf('Revelations 21')).toBe('Revelation')
    expect(bookOf('Gen. 1')).toBe('Genesis')
    expect(bookOf('1john 2')).toBe('1 John')
    expect(bookOf('II John')).toBe('2 John')
    expect(bookOf('1 Cor 13')).toBe('1 Corinthians')
  })

  it('does not invent a book', () => {
    expect(bookOf('Kings 3')).toBeNull()
    expect(bookOf('Hezekiah 4')).toBeNull()
    expect(bookOf('')).toBeNull()
  })

  it('covers all 66', () => {
    expect(BOOKS).toHaveLength(66)
    for (const book of BOOKS) expect(bookOf(`${book.name} 1`)).toBe(book.name)
  })
})

describe('unknownBooks', () => {
  it('reports only the reference it could not read', () => {
    expect(unknownBooks('Exodus 19; Mark 5')).toEqual([])
    expect(unknownBooks('Exodus 19; Hezekiah 4')).toEqual(['Hezekiah 4'])
  })
})

describe('bibleGatewayUrl', () => {
  it('is the link the sermon pages emit', () => {
    expect(bibleGatewayUrl('2 Peter 3:8'))
      .toBe('https://www.biblegateway.com/passage/?search=2%20Peter%203%3A8&version=ESV')
  })
})

describe('suggestBooks', () => {
  it('puts the canonical name above the numbered ones', () => {
    expect(suggestBooks('john').slice(0, 4)).toEqual(['John', '1 John', '2 John', '3 John'])
  })

  it('reaches a numbered book by the word inside its name', () => {
    expect(suggestBooks('cor')).toEqual(['1 Corinthians', '2 Corinthians'])
  })

  it('follows an abbreviation', () => {
    expect(suggestBooks('ps')[0]).toBe('Psalm')
    expect(suggestBooks('1 pe')).toEqual(['1 Peter'])
  })

  it('suggests nothing for an empty field', () => {
    expect(suggestBooks('')).toEqual([])
    expect(suggestBooks('   ')).toEqual([])
  })

  it('completes the reference being typed, not the one already finished', () => {
    expect(suggestBooks('Exodus 19; phil')).toEqual(['Philippians', 'Philemon'])
  })

  it('stops suggesting once a chapter has been typed', () => {
    expect(suggestBooks('John 3:16')).toEqual(['John', '1 John', '2 John', '3 John'])
  })
})

describe('completeBook', () => {
  it('fills an empty field', () => {
    expect(completeBook('jo', 'John')).toBe('John ')
  })

  it('keeps the chapter and verse already typed', () => {
    expect(completeBook('phil 2:5', 'Philippians')).toBe('Philippians 2:5')
  })

  it('leaves an earlier reference alone', () => {
    expect(completeBook('Exodus 19; phil 2:5', 'Philippians')).toBe('Exodus 19; Philippians 2:5')
  })

  it('spaces itself after a separator', () => {
    expect(completeBook('Exodus 19;', 'Mark')).toBe('Exodus 19; Mark ')
  })
})
