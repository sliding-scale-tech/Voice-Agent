"use client";

import Link from "next/link";
import { CallDemoWidget } from "./call-demo-widget";
import "./landing.css";

const BOOK_A_CALL_URL = "https://calendar.app.google/t99M1z5e9BUTVe1K6";

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
          <a
            className="nav-cta"
            href={BOOK_A_CALL_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Book a Call
          </a>
        </nav>

        <main className="hero" id="demo">
          <div className="eyebrow">
            <span className="eyebrow-dot" /> Live after hours leasing demo
          </div>
          <h1>Watch Sarah answer a renter call</h1>
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
                      <a href={BOOK_A_CALL_URL} target="_blank" rel="noopener noreferrer">
                        Book a Call
                      </a>
                    </li>
                    <li>
                      <a
                        href="https://www.linkedin.com/in/aleem-ansari/"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Chat with me on LinkedIn
                      </a>
                    </li>
                    <li>
                      <Link href="/sign-in">Login</Link>
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
