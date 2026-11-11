import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

type UnlockContextValue = {
  unlocked: boolean
  unlock: () => void
}

const UnlockContext = createContext<UnlockContextValue>({
  unlocked: false,
  unlock: () => {},
})

export function UnlockProvider({
  initialUnlocked,
  onUnlock,
  children,
}: {
  initialUnlocked: boolean
  onUnlock?: () => void
  children: ReactNode
}) {
  const [unlocked, setUnlocked] = useState(initialUnlocked)
  const value = useMemo(
    () => ({
      unlocked,
      unlock: () => {
        setUnlocked(true)
        onUnlock?.()
      },
    }),
    [unlocked, onUnlock],
  )
  return <UnlockContext.Provider value={value}>{children}</UnlockContext.Provider>
}

export function useUnlock() {
  return useContext(UnlockContext)
}
