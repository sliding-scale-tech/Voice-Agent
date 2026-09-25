import { Link, useLocation } from 'react-router-dom'
import { EXTERNAL, ROUTES, SECTIONS } from '../config/site'

/**
 * Site nav. Markup mirrors the source 1:1 so the global stylesheet applies unchanged, except the
 * CTA slot: at Umar's request this no longer links to the demo/contact section (the source's own
 * design) — it's Sign In + Sign Up, pointing at the real Simplr product's own auth pages
 * (https://www.simplr.pro/sign-in / /sign-up, confirmed live).
 *
 * The two source pages actually defined different responsive breakpoints for this nav area
 * (900/640/400px vs 760/460px — see the `.nav--demo` CSS in globals.css) even though it's one
 * shared component; kept, since it's unrelated to which buttons render here.
 *
 * SECTIONS are in-page anchors on Home; from any other route (demo) they need to navigate back to
 * "/" first, so every link goes through react-router's <Link> to "/#id".
 * Scroll-shadow + mobile toggle + smooth-anchor-scroll behaviour lives in src/interactions (owned
 * by the interactions layer) — this component only renders the markup it attaches to.
 */
export default function Navbar() {
  const onDemo = useLocation().pathname === ROUTES.demo

  return (
    <header className={onDemo ? 'nav nav--demo' : 'nav'} id="nav">
      <div className="nav-inner">
        <Link to={`${ROUTES.home}#top`} className="logo" aria-label="Simplr home">
          <img src="/Logo.png" alt="Simplr" />
        </Link>
        <nav className="nav-links" id="navLinks">
          {SECTIONS.map((s) => (
            <Link key={s.id} to={`${ROUTES.home}#${s.id}`}>
              {s.label}
            </Link>
          ))}
        </nav>
        <div className="nav-actions">
          <a href={EXTERNAL.signIn} target="_blank" rel="noopener" className="btn btn-outline btn-sm">
            Sign In
          </a>
          <a href={EXTERNAL.signUp} target="_blank" rel="noopener" className="btn btn-black btn-sm">
            Sign Up
          </a>
          <button className="nav-toggle" id="navToggle" type="button" aria-label="Toggle menu">
            <span></span>
          </button>
        </div>
      </div>
    </header>
  )
}
