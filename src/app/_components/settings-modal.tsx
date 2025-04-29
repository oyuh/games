"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";

export function SettingsModal() {
  const [open, setOpen] = useState(false);
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="bg-card border border-secondary rounded-xl shadow-lg p-8 w-full max-w-md flex flex-col items-center gap-6">
        <DialogHeader className="w-full">
          <DialogTitle className="text-3xl font-bold text-primary text-center uppercase tracking-wide">
            Settings
          </DialogTitle>
        </DialogHeader>

        <div className="w-full bg-secondary/10 rounded-lg p-4 border border-secondary/30">
          <div className="text-base font-bold text-primary border-b border-primary/30 pb-2 mb-3">
            Appearance
          </div>

          <div className="flex flex-col items-center gap-4">
            <div className="text-sm font-semibold text-primary">Theme</div>
            <div className="grid grid-cols-3 gap-2 w-full">
              <Button
                size="sm"
                type="button"
                onClick={() => handleThemeChange('system')}
                className={theme === 'system'
                  ? 'bg-primary text-white font-semibold border-2 border-primary shadow-sm'
                  : 'bg-secondary/10 hover:bg-secondary/20 text-main border border-secondary/30'
                }
              >
                System
              </Button>
              <Button
                size="sm"
                type="button"
                onClick={() => handleThemeChange('light')}
                className={theme === 'light'
                  ? 'bg-primary text-white font-semibold border-2 border-primary shadow-sm'
                  : 'bg-secondary/10 hover:bg-secondary/20 text-main border border-secondary/30'
                }
              >
                Light
              </Button>
              <Button
                size="sm"
                type="button"
                onClick={() => handleThemeChange('dark')}
                className={theme === 'dark'
                  ? 'bg-primary text-white font-semibold border-2 border-primary shadow-sm'
                  : 'bg-secondary/10 hover:bg-secondary/20 text-main border border-secondary/30'
                }
              >
                Dark
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
