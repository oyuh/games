"use client";

import React from "react";

export const Footer = () => {
  return (
    <footer className="footer-bar">
      <div className="footer-left">
      </div>
      <div className="footer-right gradient-text">
        <div className="desktop-footer">
          Made by <a href="https://lawsonhart.me" target="_blank" rel="noopener noreferrer">Lawson Hart</a> with 💙 | © {new Date().getFullYear()} Lawson Hart. All rights reserved. <a href="https://lawsonhart.me/policy" className="privacy-link">View my Policies.</a>
        </div>
        <div className="mobile-footer">
          Made by <a href="https://lawsonhart.me" target="_blank" rel="noopener noreferrer">Lawson Hart</a> with 💙
          <div className="mobile-footer-secondary">
            © {new Date().getFullYear()} Lawson Hart. All rights reserved. <a href="https://lawsonhart.me/policy" className="privacy-link">View my Policies.</a>
          </div>
        </div>
      </div>
      <style jsx>{`
        .footer-bar {
          position: fixed;
          left: 0;
          bottom: 0;
          width: 100%;
          z-index: 100;
          display: flex;
          flex-direction: row;
          justify-content: space-between;
          align-items: flex-end;
          padding: 0.25rem 2rem;
          background: transparent;
          font-size: 0.9rem;
          font-weight: 500;
        }
        .footer-left {
          display: flex;
          align-items: center;
        }
        .footer-right {
          text-align: right;
        }
        .privacy-link {
          color: inherit;
          text-decoration: underline;
          margin-left: 0.5em;
        }
        .privacy-link:hover {
          color: #2b6cb0;
        }
        .gradient-text {
          background: linear-gradient(90deg, #60a5fa, #93c5fd, #60a5fa);
          background-size: 300% 300%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: gradient 12s ease infinite;
          font-size: 0.9rem;
          font-weight: 500;
          white-space: nowrap;
        }
        .gradient-text a {
          color: #3182ce;
          text-decoration: none;
          position: relative;
          font-weight: 600;
        }
        .gradient-text a::after {
          content: '';
          position: absolute;
          width: 100%;
          height: 1px;
          bottom: -2px;
          left: 0;
          background: linear-gradient(90deg, #4299e1, #3182ce, #2b6cb0);
          transform: scaleX(0);
          transform-origin: right;
          transition: transform 0.3s ease;
        }
        .gradient-text a:hover::after {
          transform: scaleX(1);
          transform-origin: left;
        }
        /* Hide/show elements based on screen size */
        .mobile-footer {
          display: none;
        }
        .desktop-footer {
          display: block;
        }
        @keyframes gradient {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @media (max-width: 600px) {
          .footer-bar {
            flex-direction: column;
            align-items: center;
            gap: 0.25rem;
            padding: 0.5rem 1rem;
            background-color: rgba(0, 0, 0, 0.05);
          }
          .mobile-footer {
            display: block;
            text-align: center;
            color: #3182ce;
          }
          .mobile-footer a {
            color: #3182ce;
            font-weight: 600;
            text-decoration: underline;
          }
          .desktop-footer {
            display: none;
          }
          .mobile-footer-secondary {
            font-size: 0.75rem;
            margin-top: 0.25rem;
          }
          .footer-left, .footer-right {
            text-align: center;
            font-size: 0.85rem;
          }
          /* Override gradient text for better visibility on mobile */
          .gradient-text {
            background: none;
            -webkit-background-clip: initial;
            background-clip: initial;
            color: #3182ce;
            animation: none;
          }
        }
      `}</style>
    </footer>
  );
}
