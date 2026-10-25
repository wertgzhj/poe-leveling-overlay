import { create } from 'zustand'

// Parsed log events for the dev-only DebugPanel, deliberately kept OUT of the
// overlay store. They arrive on every zone change and level-up, and every arrival
// replaces the array — so while they lived alongside the UI state, each one
// invalidated the whole store and re-rendered the panel tree during play. Nothing
// on the overlay reads them.

interface DebugStore {
  recentEvents: LogEventSummaryBridge[]
  setEvents: (events: LogEventSummaryBridge[]) => void
  pushEvent: (event: LogEventSummaryBridge) => void
}

const RECENT_MAX = 100

export const useDebugStore = create<DebugStore>((set) => ({
  recentEvents: [],
  setEvents: (recentEvents) => set({ recentEvents: recentEvents.slice(-RECENT_MAX) }),
  pushEvent: (event) =>
    set((s) => ({ recentEvents: [...s.recentEvents, event].slice(-RECENT_MAX) }))
}))
