import { describe, it, expect } from 'vitest'
import { useConfirm } from './useConfirm.js'

describe('useConfirm', () => {
  it('drives the dialog from `shown`', () => {
    const c = useConfirm()
    expect(c.shown.value).toBeNull()
    c.ask({ id: '1' })
    expect(c.shown.value).toEqual({ id: '1' })
  })

  // The regression this exists for. Reka closes the dialog first, so
  // @update:open → dismiss() runs before the click handler → take().
  it('still yields the payload when the dialog closed first', () => {
    const c = useConfirm()
    c.ask({ id: '1' })
    c.dismiss()
    expect(c.shown.value).toBeNull()
    expect(c.take()).toEqual({ id: '1' })
  })

  it('yields the payload only once', () => {
    const c = useConfirm()
    c.ask({ id: '1' })
    expect(c.take()).toEqual({ id: '1' })
    expect(c.take()).toBeNull()
  })

  it('does not fire for a subject that was never asked about', () => {
    expect(useConfirm().take()).toBeNull()
  })

  it('replaces the subject when asked again', () => {
    const c = useConfirm()
    c.ask({ id: '1' })
    c.ask({ id: '2' })
    expect(c.take()).toEqual({ id: '2' })
  })

  // Cancelling leaves the payload behind — nothing consumes it, because only
  // the action button calls take(). Confirming a different row afterwards must
  // act on that row, not the abandoned one.
  it('does not leak a cancelled subject into a later confirm', () => {
    const c = useConfirm()
    c.ask({ id: 'cancelled' })
    c.dismiss()
    c.ask({ id: 'wanted' })
    expect(c.take()).toEqual({ id: 'wanted' })
  })
})
