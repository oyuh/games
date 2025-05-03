"use client";
import Image from "next/image";
import { FaTwitter, FaGithub } from "react-icons/fa";
import { SiDiscord } from "react-icons/si";
import { useEffect, useState } from "react";
import { IoIosPerson } from "react-icons/io";
import { LuScrollText } from "react-icons/lu";
export const Footer = () => {
  const [commit, setCommit] = useState<{ date: string; url: string } | null>(null);

  useEffect(() => {
    async function fetchCommit() {
      try {
        const res = await fetch("https://api.github.com/repos/oyuh/games/commits?per_page=1");
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const commitDate = data[0].commit.committer.date;
          const commitUrl = data[0].html_url;
          setCommit({
            date: new Date(commitDate).toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            }),
            url: commitUrl,
          });
        }
      } catch {
        setCommit(null);
      }
    }
    fetchCommit();
  }, []);

  return (
    <footer className="footer-vercel-style">
      <div className="footer-main-row">
        <div className="footer-left">
          <div className="footer-logo">
            <a href="/">
              <Image src="/favicon.ico" alt="Logo" width={24} height={24} />
            </a>
          </div>
          <nav className="footer-nav">
            <a href="https://lawsonhart.me" className="footer-link" target="_blank" rel="noopener noreferrer"><IoIosPerson style={{ verticalAlign: 'middle' }} /> Lawson&#39;s Website</a>
            <a href="https://lawsonhart.me/policy" className="footer-link" target="_blank" rel="noopener noreferrer"><LuScrollText style={{ verticalAlign: 'middle' }} /> Policies</a>
            <a href="https://x.com/sumboutlaw" className="footer-link" target="_blank" rel="noopener noreferrer"><FaTwitter style={{ verticalAlign: 'middle' }} /> Twitter</a>
            <a href="https://discordapp.com/users/527167786200465418" className="footer-link" target="_blank" rel="noopener noreferrer"><SiDiscord style={{ verticalAlign: 'middle' }} /> Discord</a>
            <a href="https://github.com/oyuh/games" className="footer-link" target="_blank" rel="noopener noreferrer"><FaGithub style={{ verticalAlign: 'middle' }} /> GitHub</a>
          </nav>
        </div>
        <div className="footer-right">
          <div className="footer-status">
            <span className="footer-status-dot" />
            {commit ? (
              <a href={commit.url} target="_blank" rel="noopener noreferrer" className="footer-link">
                Last updated: {commit.date}
              </a>
            ) : (
              <span>Last updated: ...</span>
            )}
          </div>
        </div>
      </div>
      <div className="footer-bottom-row">
        <span>© {new Date().getFullYear()} Lawson Hart. All rights reserved.</span>
      </div>
      <style jsx>{`
        .footer-vercel-style {
          width: 100%;
          background: #121414;
          color: #a1a1aa;
          border-top: 1px solid #23232a;
          padding: 0 1rem 0.5rem 1rem;
        }
        .footer-main-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          max-width: 1200px;
          margin: 1.2rem auto 1.2rem auto;
          padding: 0;
        }
        .footer-left {
          display: flex;
          align-items: center;
          gap: 1.5rem;
        }
        .footer-logo {
          display: flex;
          align-items: center;
        }
        .footer-nav {
          display: flex;
          gap: 1.1rem;
        }
        .footer-link {
          color: #a1a1aa;
          text-decoration: none;
          font-size: 1rem;
          transition: color 0.2s;
          display: inline-flex;
          align-items: center;
          gap: 0.3em;
        }
        .footer-link:hover {
          color: #7ecbff;
        }
        .footer-right {
          display: flex;
          align-items: center;
          gap: 1.5rem;
        }
        .footer-status {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 1rem;
        }
        .footer-status-dot {
          width: 0.7em;
          height: 0.7em;
          background: #7ecbff;
          border-radius: 50%;
          display: inline-block;
        }
        .footer-bottom-row {
          max-width: 1200px;
          margin: 0 auto;
          padding-top: 0.7rem;
          border-top: 1px solid #23232a;
          font-size: 0.95rem;
          color: #71717a;
          text-align: center;
        }
        @media (max-width: 800px) {
          .footer-main-row {
            flex-direction: column;
            align-items: flex-start;
            gap: 1.2rem;
            padding: 1.2rem 0 0.5rem 0;
          }
          .footer-bottom-row {
            text-align: center;
          }
        }
      `}</style>
    </footer>
  );
};
