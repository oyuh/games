"use client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";

export function AboutModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs sm:max-w-md w-full max-h-[90vh] overflow-y-auto bg-card text-main border border-secondary shadow-xl pt-8 pb-6">
        <DialogHeader className="w-full p-0 m-0">
          <DialogTitle className="text-3xl font-extrabold text-center bg-gradient-to-r from-[#7ecbff] via-[#3a6ea7] to-[#7ecbff] bg-[400%_auto] bg-clip-text uppercase tracking-widest mb-2 drop-shadow-lg pt-0">
            About This Site
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-6 mt-2">
          <div className="flex flex-col items-center">
            <span className="inline-block text-lg sm:text-xl font-semibold text-primary mb-2 animate-gradient bg-gradient-to-r from-[#7ecbff] via-[#3a6ea7] to-[#7ecbff] bg-[400%_auto] bg-clip-text text-transparent">
              Play with Friends!
            </span>
            <p className="text-main text-center text-base sm:text-lg leading-relaxed max-w-md">
              Welcome to{" "}
              <span className="font-bold text-primary">Lawson&apos;s Games</span> — a modern collection of social board type games to play with friends, online or in person. Enjoy quick setup, beautiful design.
            </p>
            <p className="text-main text-center text-base sm:text-lg leading-relaxed max-w-md">
              I made this because I wanted to play games from TikTok with friends but couldn&apos;t find a good solution for them.
            </p>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-secondary text-center text-xs">This website may have bugs, please report them accordingly.</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
