import React from "react";

export function MobileFooter() {
  return (
    <footer className="block sm:hidden w-full bg-card text-main border-t border-secondary py-3 px-4 mt-8">
      <div className="flex flex-col items-center gap-1 text-xs">
        <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 w-full">
          <span>
            <span className="inline-block w-2 h-2 bg-primary rounded-full align-middle mr-1" />
            Last updated: April 29, 2025
          </span>
          <span className="hidden xs:inline-block">|</span>
          <a>•</a>
          <a href="https://lawsonhart.me/policy" className="underline text-primary">
            Policies
          </a>
        </div>
        <div className="w-full text-center text-[0.95em] text-secondary mt-1">
          © {new Date().getFullYear()} Lawson Hart. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
