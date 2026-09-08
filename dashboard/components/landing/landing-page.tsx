"use client";

import Link from "next/link";
import { CallDemoWidget } from "./call-demo-widget";
import "./landing.css";

function LeaseOpsLogo({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={className ?? "brand-logo"} src="/landing/Logo.png" alt="LeaseOps" />
  );
}

export function LandingPage({ className }: { className?: string }) {
  return (
    <div className={`landing-root${className ? ` ${className}` : ""}`}>
      <div className="page-shell">
        <nav className="site-nav" aria-label="Primary navigation">
          <Link className="brand" href="/" aria-label="LeaseOps home">
            <LeaseOpsLogo />
          </Link>
          <span className="nav-cta" role="link" aria-disabled="true" tabIndex={0}>
            Book a Call
          </span>
        </nav>

        <main className="hero" id="demo">
          <div className="eyebrow">
            <span className="eyebrow-dot" /> Live after hours leasing demo
          </div>
          <h1>Watch LeaseOps answer a renter call</h1>
          <p className="hero-copy">
            A calm, realistic walkthrough of how LeaseOps answers, qualifies, and books a tour while your leasing team
            is offline.
          </p>
          <CallDemoWidget />
        </main>

        <footer className="site-footer">
          <div className="footer-container">
            <div className="footer-top">
              <div className="footer-brand">
                <Link className="brand" href="/" aria-label="LeaseOps home">
                  <LeaseOpsLogo />
                </Link>
                <p>
                  LeaseOps answers, qualifies, and books tours for every rental inquiry, day or night, so residential
                  property managers never lose a lead to a missed call.
                </p>
              </div>
              <div className="footer-right">
                <nav className="footer-nav" aria-label="Footer navigation">
                  <ul>
                    <li>
                      <span role="link" aria-disabled="true" tabIndex={0}>
                        Book a Call
                      </span>
                    </li>
                    <li>
                      <a
                        className="linkedin-link"
                        href="https://www.linkedin.com/in/aleem-ansari/"
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Aleem Ansari on LinkedIn"
                        title="Aleem Ansari on LinkedIn"
                      >
                        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.049c.476-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.124 2.062 2.062 0 0 1 0 4.124zM7.119 20.452H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                        </svg>
                      </a>
                    </li>
                  </ul>
                </nav>
              </div>
            </div>
            <div className="footer-bottom">
              <span>© 2026 LeaseOps | All Rights Reserved</span>
              <span className="made">
                Created by <strong>Sliding Scale Technologies</strong>
              </span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
