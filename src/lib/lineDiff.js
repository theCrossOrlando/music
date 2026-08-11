// Line-level diff for comparing two versions of a song.
//
// LCS over lines, not characters. A song is a few dozen short lines, so the
// O(n·m) table is trivial here — unlike the character-level comparison used
// for duplicate detection, which had to run across every pair in the library.

const key = (line) => line.trim().toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ')

/**
 * Compare two lyric bodies line by line.
 * @returns {{ rows: Array<{ text: string, status: 'same'|'added'|'removed' }>,
 *             changed: number, identical: boolean }}
 *   `rows` is the b-side view: lines present in b, marked 'added' where they
 *   differ from a, with a's dropped lines interleaved as 'removed'.
 */
export function diffLines(a, b) {
  // ''.split('\n') is [''], which would show up as a phantom blank line
  // removed. An empty body is zero lines.
  const split = (v) => (String(v ?? '').trim() ? String(v).split('\n') : [])
  const linesA = split(a)
  const linesB = split(b)
  const keyA = linesA.map(key)
  const keyB = linesB.map(key)

  // table[i][j] = LCS length of keyA[i:] and keyB[j:]
  const table = Array.from({ length: linesA.length + 1 },
    () => new Array(linesB.length + 1).fill(0))
  for (let i = linesA.length - 1; i >= 0; i -= 1) {
    for (let j = linesB.length - 1; j >= 0; j -= 1) {
      table[i][j] = keyA[i] === keyB[j]
        ? table[i + 1][j + 1] + 1
        : Math.max(table[i + 1][j], table[i][j + 1])
    }
  }

  const rows = []
  let i = 0
  let j = 0
  while (i < linesA.length && j < linesB.length) {
    if (keyA[i] === keyB[j]) {
      rows.push({ text: linesB[j], status: 'same' })
      i += 1
      j += 1
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      rows.push({ text: linesA[i], status: 'removed' })
      i += 1
    } else {
      rows.push({ text: linesB[j], status: 'added' })
      j += 1
    }
  }
  while (i < linesA.length) { rows.push({ text: linesA[i], status: 'removed' }); i += 1 }
  while (j < linesB.length) { rows.push({ text: linesB[j], status: 'added' }); j += 1 }

  const changed = rows.filter((r) => r.status !== 'same').length
  return { rows, changed, identical: changed === 0 }
}

// Which non-lyric fields differ, for the header of a comparison.
export function diffFields(a, b, fields = ['song', 'artist', 'ccliNumber', 'copyright']) {
  return fields
    .filter((f) => String(a?.[f] ?? '').trim() !== String(b?.[f] ?? '').trim())
    .map((f) => ({ field: f, a: a?.[f] ?? '', b: b?.[f] ?? '' }))
}
