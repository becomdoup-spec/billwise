import { useEffect, useRef, useState } from 'react'

/**
 * Animates a number towards `value` with an ease-out-expo curve.
 * Starts from 0 on mount so totals "count up" on reveal, then follows
 * later changes from the previously displayed value.
 */
export function useCountUp(value: number, durationMs = 750): number {
  const [display, setDisplay] = useState(0)
  const displayRef = useRef(0)
  const frameRef = useRef(0)

  useEffect(() => {
    const reduceMotion = typeof window !== 'undefined'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion || durationMs <= 0) {
      displayRef.current = value
      setDisplay(value)
      return
    }

    const from = displayRef.current
    if (Math.abs(from - value) < 0.005) {
      displayRef.current = value
      setDisplay(value)
      return
    }

    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs)
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t)
      const next = from + (value - from) * eased
      displayRef.current = next
      setDisplay(next)
      if (t < 1) frameRef.current = requestAnimationFrame(tick)
    }
    frameRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameRef.current)
  }, [value, durationMs])

  return display
}
