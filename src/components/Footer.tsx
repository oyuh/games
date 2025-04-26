"use client";

import React from "react";

export const Footer = () => {
  return (
    <footer>
      <span className="gradient-text">
        Made by <a href="https://lawsonhart.me" target="_blank" rel="noopener noreferrer">Lawson Hart</a> with 💙
      </span>
      <style jsx>{`
        footer {
          text-align: center;
          padding: 1rem;
          font-size: 0.9rem;
          margin-top: 2rem;
          font-weight: 500;
        }

        .gradient-text {
          background: linear-gradient(90deg, #2d3748, #4a5568, #718096, #4299e1, #3182ce, #2b6cb0, #4a5568, #2d3748);
          background-size: 300% 300%;
          background-clip: text;
          -webkit-background-clip: text;
          color: transparent;
          animation: gradient 12s ease infinite;
        }

        a {
          background: linear-gradient(90deg, #2d3748, #4a5568, #718096, #4299e1, #3182ce, #2b6cb0, #4a5568, #2d3748);
          background-size: 300% 300%;
          background-clip: text;
          -webkit-background-clip: text;
          color: transparent;
          animation: gradient 12s ease infinite;
          text-decoration: none;
          position: relative;
        }

        a::after {
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

        a:hover::after {
          transform: scaleX(1);
          transform-origin: left;
        }

        @keyframes gradient {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>
    </footer>
  );
};
