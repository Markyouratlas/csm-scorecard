import { createContext, useContext } from 'react'

// Whether the scorecard being rendered is editable (auto-save allowed).
// Defaults TRUE so a user on their OWN scorecard (no provider) edits
// normally. The exec drill-in wrapper (ScorecardViewer) provides false by
// default and flips it true only when the exec explicitly enters Edit mode.
export const ScorecardEditContext = createContext(true)

export function useScorecardEditable() {
  return useContext(ScorecardEditContext)
}
