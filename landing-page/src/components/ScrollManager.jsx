import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const MAX_MS = 3000
const POLL_MS = 50

/**
 * On a route change: scroll to the #hash target (e.g. a cross-page nav link back to
 * "/#features") once it exists in the DOM, or to the top when there's no hash. The source's own
 * smooth-anchor-scroll script (see interactions) only handles same-page clicks; this covers
 * cross-route navigation, which react-router doesn't scroll-restore on its own.
 */
export default function ScrollManager() {
  const { pathname, hash } = useLocation()

  useEffect(() => {
    if (!hash) {
      window.scrollTo(0, 0)
      return
    }
    const id = hash.slice(1)
    let elapsed = 0
    const timer = setInterval(() => {
      const el = document.getElementById(id)
      if (el) {
        const nav = document.getElementById('nav')
        const offset = nav ? nav.offsetHeight : 80
        window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - offset })
        clearInterval(timer)
        return
      }
      elapsed += POLL_MS
      if (elapsed >= MAX_MS) clearInterval(timer)
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [pathname, hash])

  return null
}
