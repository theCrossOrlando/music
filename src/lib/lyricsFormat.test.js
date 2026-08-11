import { describe, it, expect } from 'vitest'
import { normalize, parseSections, looksLikeChordPro } from './lyricsFormat.js'

const structural = { structural: true }

describe('normalize — safe pass (what runs on every save)', () => {
  it('leaves already-clean lyrics alone', () => {
    const input = 'Verse 1\nline one\nline two\n\nChorus\nline three'
    expect(normalize(input).text).toBe(input)
  })

  it('does not restructure without the structural flag', () => {
    // A chord left in place is the point: an ordinary save must never rewrite
    // something a human formatted deliberately.
    const input = '[G]Amazing grace'
    expect(normalize(input).text).toBe('[G]Amazing grace')
  })

  it('trims edges, trailing spaces and runs of blank lines', () => {
    const { text, changes } = normalize('\n\n  line one   \n\n\n\nline two\n\n\n')
    expect(text).toBe('  line one\n\nline two')
    expect(changes).toContain('Removed trailing spaces')
    expect(changes).toContain('Collapsed extra blank lines')
  })

  it('normalises CRLF', () => {
    expect(normalize('a\r\nb').text).toBe('a\nb')
  })

  it('standardises apostrophes', () => {
    expect(normalize("Jesus' blood, don't stop").text).toBe('Jesus’ blood, don’t stop')
  })
})

describe('normalize — structural pass (what runs on paste)', () => {
  it('converts ChordPro sections to plain labels', () => {
    const input = [
      '{start_of_verse: Verse 1}',
      'My hope is built',
      '{end_of_verse}',
      '{soc}',
      'Christ alone',
      '{eoc}',
    ].join('\n')
    expect(normalize(input, structural).text).toBe('Verse 1\nMy hope is built\n\nChorus\nChrist alone')
  })

  it('strips inline chords but keeps bracketed lyric directions', () => {
    const { text } = normalize('[G]Amazing [D/F#]grace [Bbsus4]how sweet\n[repeat]', structural)
    expect(text).toBe('Amazing grace how sweet\n[repeat]')
  })

  it('drops chord-only lines', () => {
    expect(normalize('G   D   Em   C\nAmazing grace', structural).text).toBe('Amazing grace')
  })

  it('extracts the CCLI number and removes the footer', () => {
    const input = [
      'Verse 1',
      'line',
      '',
      'CCLI Song # 7654321',
      '© 2011 Hillsong Music Publishing',
      'For use solely with the SongSelect® Terms of Use.',
      'CCLI License # 1234567',
    ].join('\n')
    const { text, ccliNumber, changes } = normalize(input, structural)
    expect(ccliNumber).toBe('7654321')
    expect(text).toBe('Verse 1\nline')
    expect(changes).toContain('Removed the CCLI footer')
  })

  // Verified against a real SongSelect export (Goodness Of God, CCLI 7117726):
  // labels are Title Case with a number, and the footer is these four lines.
  it('matches the real SongSelect footer, keeping the copyright', () => {
    const input = [
      'Verse 1', 'placeholder lyric line', '', 'Chorus', 'placeholder lyric line', '',
      'CCLI Song # 7117726',
      '© 2018 Capitol CMG Paragon; Fellow Ships Music; Bethel Music Publishing',
      'For use solely with the SongSelect® Terms of Use. All rights reserved. www.ccli.com',
      'CCLI License # 1073963',
    ].join('\n')
    const { text, ccliNumber, copyright } = normalize(input, structural)
    expect(ccliNumber).toBe('7117726')
    expect(copyright).toBe('2018 Capitol CMG Paragon; Fellow Ships Music; Bethel Music Publishing')
    expect(text).toBe('Verse 1\nplaceholder lyric line\n\nChorus\nplaceholder lyric line')
  })

  it('pulls the song details out of ChordPro metadata', () => {
    const input = [
      '{title: Goodness Of God}',
      '{artist: Bethel Music}',
      '{ccli: 7117726}',
      '{key: G}',
      '{start_of_verse: Verse 1}',
      'placeholder lyric line',
      '{end_of_verse}',
    ].join('\n')
    const { text, title, artist, ccliNumber } = normalize(input, structural)
    expect(title).toBe('Goodness Of God')
    expect(artist).toBe('Bethel Music')
    expect(ccliNumber).toBe('7117726')
    expect(text).toBe('Verse 1\nplaceholder lyric line')
  })

  it('tidies label casing and spacing', () => {
    expect(normalize('VERSE 1\nline\nCHORUS:\nline', structural).text)
      .toBe('Verse 1\nline\n\nChorus\nline')
    expect(normalize('pre-chorus\nline', structural).text).toBe('Pre-Chorus\nline')
  })

  it('puts exactly one blank line before a label and none after', () => {
    expect(normalize('line\n\n\n\nChorus\n\n\nline', structural).text)
      .toBe('line\n\nChorus\nline')
  })

  it('reports what it changed', () => {
    const { changes } = normalize('{soc}\n[G]line\n{eoc}', structural)
    expect(changes).toEqual(expect.arrayContaining([
      expect.stringContaining('ChordPro'),
      'Removed chords',
    ]))
  })
})

describe('looksLikeChordPro', () => {
  it.each([
    ['{start_of_chorus}', true],
    ['{soc}', true],
    ['[G]Amazing grace', true],
    ['Verse 1\nAmazing grace', false],
    ['', false],
  ])('%s → %s', (input, expected) => {
    expect(looksLikeChordPro(input)).toBe(expected)
  })
})

describe('parseSections — must agree with the public page', () => {
  it('returns null when there are no labels, so old songs render untouched', () => {
    expect(parseSections('just\nsome\nlines')).toBeNull()
  })

  it('splits on labels', () => {
    expect(parseSections('Verse 1\na\nb\n\nChorus\nc')).toEqual([
      { label: 'Verse 1', body: 'a\nb' },
      { label: 'Chorus', body: 'c' },
    ])
  })

  it('keeps a preamble that appears before the first label', () => {
    expect(parseSections('intro line\n\nChorus\nc')).toEqual([
      { label: null, body: 'intro line' },
      { label: 'Chorus', body: 'c' },
    ])
  })

  it('handles a label with no body', () => {
    expect(parseSections('Chorus\n\nBridge\nb')).toEqual([
      { label: 'Chorus', body: '' },
      { label: 'Bridge', body: 'b' },
    ])
  })
})
