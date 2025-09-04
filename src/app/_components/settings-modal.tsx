"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { AboutModal } from "./about-modal";

export function SettingsModal() {
  const [open, setOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [theme, setTheme] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') ?? 'system';
    }
    return 'system';
  });

  // Listen for custom event from FloatingHeader
  useEffect(() => {
    const openModalListener = () => setOpen(true);
    document.addEventListener('open-settings-modal', openModalListener);

    return () => {
      document.removeEventListener('open-settings-modal', openModalListener);
    };
  }, []);

  // Set theme on mount and when theme changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (theme === 'system') {
        document.documentElement.removeAttribute('data-theme');
      } else {
        document.documentElement.setAttribute('data-theme', theme);
      }
      localStorage.setItem('theme', theme);
    }
  }, [theme]);

  const handleThemeChange = (newTheme: 'system' | 'light' | 'dark') => {
    setTheme(newTheme);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg w-full max-h-[90vh] overflow-y-auto bg-card text-card-foreground border border-border shadow-2xl">
          <div className="flex flex-col items-center space-y-8 py-4">
            <div className="text-center space-y-4">
              <div className="w-20 h-20 mx-auto bg-gradient-to-br from-primary/20 to-primary/10 rounded-full flex items-center justify-center border border-primary/30">
                <div className="text-4xl">⚙️</div>
              </div>

              <DialogTitle className="text-4xl font-bold bg-gradient-to-r from-primary via-primary/80 to-primary bg-clip-text text-transparent">
                Settings
              </DialogTitle>

              <p className="text-lg text-muted-foreground max-w-md">
                Customize your <span className="font-semibold text-primary">gaming experience</span> to your liking!
              </p>
            </div>

            <div className="w-full space-y-6">
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-6">
                <h3 className="font-semibold text-primary mb-4 flex items-center gap-2">
                  <span>🎨</span> Appearance
                </h3>

                <div className="space-y-4">
                  <div className="text-center">
                    <div className="text-sm font-semibold text-foreground mb-3">Theme Preference</div>
                    <div className="grid grid-cols-3 gap-3">
                      <button
                        onClick={() => handleThemeChange('system')}
                        className={`p-4 rounded-lg border transition-all text-center ${
                          theme === 'system'
                            ? 'border-primary bg-primary/10 shadow-md'
                            : 'border-border hover:border-primary/50 bg-background'
                        }`}
                      >
                        <div className="space-y-2">
                          <div className="text-xl">🖥️</div>
                          <div className="font-semibold text-sm">System</div>
                          <div className="text-xs text-muted-foreground">
                            Auto detect
                          </div>
                        </div>
                      </button>

                      <button
                        onClick={() => handleThemeChange('light')}
                        className={`p-4 rounded-lg border transition-all text-center ${
                          theme === 'light'
                            ? 'border-primary bg-primary/10 shadow-md'
                            : 'border-border hover:border-primary/50 bg-background'
                        }`}
                      >
                        <div className="space-y-2">
                          <div className="text-xl">☀️</div>
                          <div className="font-semibold text-sm">Light</div>
                          <div className="text-xs text-muted-foreground">
                            Bright mode
                          </div>
                        </div>
                      </button>

                      <button
                        onClick={() => handleThemeChange('dark')}
                        className={`p-4 rounded-lg border transition-all text-center ${
                          theme === 'dark'
                            ? 'border-primary bg-primary/10 shadow-md'
                            : 'border-border hover:border-primary/50 bg-background'
                        }`}
                      >
                        <div className="space-y-2">
                          <div className="text-xl">🌙</div>
                          <div className="font-semibold text-sm">Dark</div>
                          <div className="text-xs text-muted-foreground">
                            Night mode
                          </div>
                        </div>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-card border border-border rounded-lg p-4">
                  <h4 className="font-semibold text-foreground mb-2 text-sm">💾 Auto Save</h4>
                  <p className="text-xs text-muted-foreground">
                    Settings saved automatically
                  </p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4">
                  <h4 className="font-semibold text-foreground mb-2 text-sm">🔄 Sync</h4>
                  <p className="text-xs text-muted-foreground">
                    Works across all your devices
                  </p>
                </div>
              </div>

              <Button
                onClick={() => setAboutOpen(true)}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
                size="lg"
              >
                Learn More About This Site 📖
              </Button>

              <div className="text-center">
                <p className="text-xs text-muted-foreground">
                  Settings are stored locally in your browser
                </p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <AboutModal open={aboutOpen} onOpenChange={setAboutOpen} />
    </>
  );
}
