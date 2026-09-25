import { Link } from 'react-router-dom'
import { ROUTES, SECTIONS } from '../config/site'

export default function Footer() {
  return (
    <footer>
      <div className="container">
        <div className="footer-top">
          <div className="footer-brand">
            <Link to={`${ROUTES.home}#top`} className="logo">
              <img src="/Logo.png" alt="Simplr" />
            </Link>
            <p>
              Leasops answers, qualifies, and books tours for every rental inquiry, day or night, so residential
              property managers never lose a lead to a missed call.
            </p>
          </div>
          <div className="footer-right">
            <div className="footer-nav">
              <ul>
                {SECTIONS.map((s) => (
                  <li key={s.id}>
                    <Link to={`${ROUTES.home}#${s.id}`}>{s.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 Simplr | All Rights Reserved</span>
          <span className="made">
            Created by <strong>Sliding Scale Technologies</strong>
          </span>
        </div>
      </div>
    </footer>
  )
}
