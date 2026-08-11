import { ref } from 'vue'

// Confirmation dialogs whose action survives the dialog closing.
//
// Reka's AlertDialogAction closes the dialog as part of the click, so
// `@update:open` fires *before* the click handler body runs. Anything that
// keeps the pending payload in reactive state has already been cleared by the
// time the handler reads it — the dialog dismisses and the action silently
// does nothing. That bug shipped twice before this existed.
//
// `shown` drives the dialog and may be cleared at will. `payload` is a plain
// variable the close cannot touch, and only `take()` consumes it.
export function useConfirm() {
  const shown = ref(null)
  let payload = null

  return {
    shown,

    // Open the dialog for a subject.
    ask(value) {
      payload = value
      shown.value = value
    },

    // What `@update:open` calls. Deliberately leaves the payload alone: a
    // cancel and a confirm both close the dialog, and only the confirm path
    // should consume it.
    dismiss() {
      shown.value = null
    },

    // What the action button calls. Returns the subject exactly once.
    take() {
      const value = payload
      payload = null
      shown.value = null
      return value
    },
  }
}
