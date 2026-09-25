// Single source of truth for shared content (nav, footer, links, assets).
// Components read from here — never hardcode these values elsewhere.

export const ROUTES = {
  home: '/',
  demo: '/demo',
}

// In-page anchors on Home.
export const SECTIONS = [
  { label: 'Features', id: 'features' },
  { label: 'How it works', id: 'how-it-works' },
  { label: 'Contact Us', id: 'contact' },
]

export const CONTACT_EMAIL = 'Faarid@slidingscale.xyz'

// The real Simplr product's own auth pages (confirmed live at simplr.pro).
export const EXTERNAL = {
  signIn: 'https://www.simplr.pro/sign-in',
  signUp: 'https://www.simplr.pro/sign-up',
}

export const SITE = {
  title: 'Simplr | Revenue Operations for Property Managers',
  description:
    'Simplr answers, qualifies, and books tours for every rental inquiry, day or night, so residential property managers never lose a lead to a missed call.',
  // Placeholder domain, same pattern as the original (a slidingscale.xyz subdomain) — NOT
  // simplr.pro itself, which is a separate, already-live site this deploy doesn't own. Update
  // once the real production domain for this rebrand is known.
  url: 'https://simplr.slidingscale.xyz/',
}
