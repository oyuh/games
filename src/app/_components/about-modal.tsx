"use client";
import { Dialog, DialogContent, DialogTitle } from "../../components/ui/dialog";

export function AboutModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg w-full max-h-[90vh] overflow-y-auto bg-card text-card-foreground border border-border shadow-2xl">
        <div className="flex flex-col items-center space-y-8 py-4">
          <div className="text-center space-y-4">
            <div className="w-20 h-20 mx-auto bg-gradient-to-br from-primary/20 to-primary/10 rounded-full flex items-center justify-center border border-primary/30">
              <div className="text-4xl">🎮</div>
            </div>

            <DialogTitle className="text-4xl font-bold bg-gradient-to-r from-primary via-primary/80 to-primary bg-clip-text text-transparent">
              About This Site
            </DialogTitle>

            <p className="text-lg text-muted-foreground max-w-md">
              Welcome to <span className="font-semibold text-primary">Lawson&apos;s Games</span> — a modern collection of social party games perfect for playing with friends!
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4 w-full max-w-sm">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
                <span className="text-xl">⚡</span>
              </div>
              <p className="text-sm text-muted-foreground font-medium">Quick Setup</p>
            </div>

            <div className="text-center space-y-2">
              <div className="w-12 h-12 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
                <span className="text-xl">👥</span>
              </div>
              <p className="text-sm text-muted-foreground font-medium">Play Together</p>
            </div>

            <div className="text-center space-y-2">
              <div className="w-12 h-12 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
                <span className="text-xl">🎯</span>
              </div>
              <p className="text-sm text-muted-foreground font-medium">Pure Fun</p>
            </div>
          </div>

          <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 w-full">
            <p className="text-sm text-center text-muted-foreground">
              <span className="font-medium text-primary">Why this exists:</span> I wanted to play those viral TikTok games with friends but couldn&apos;t find a good online version. So I built one!
            </p>
          </div>

          <div className="space-y-6 w-full">
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-6">
              <h3 className="font-semibold text-primary mb-3 flex items-center gap-2">
                <span>🎯</span> Our Mission
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Create the best online experience for social party games. No downloads, no accounts required, just pure fun with friends whether you&apos;re together or apart.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-card border border-border rounded-lg p-4">
                <h4 className="font-semibold text-foreground mb-2 text-sm">🚀 Quick Start</h4>
                <p className="text-xs text-muted-foreground">
                  Games start in seconds, not minutes
                </p>
              </div>

              <div className="bg-card border border-border rounded-lg p-4">
                <h4 className="font-semibold text-foreground mb-2 text-sm">📱 Any Device</h4>
                <p className="text-xs text-muted-foreground">
                  Phone, tablet, or computer — all work perfectly
                </p>
              </div>
            </div>

            <div className="text-center">
              <p className="text-xs text-muted-foreground">
                Found a bug? Have suggestions? Let me know!
                <br />
                This site is constantly improving based on player feedback.
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
