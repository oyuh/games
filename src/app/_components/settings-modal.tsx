"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { FaCog } from "react-icons/fa";

export function SettingsModal() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') || 'system';
    }
    return 'system';
  });

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
    <div className="relative">
      <button
        className="bg-card text-primary border border-secondary rounded-full shadow-lg p-5 flex items-center justify-center hover:bg-secondary/20 transition"
        onClick={() => setOpen(true)}
        aria-label="Settings"
        style={{ width: 76, height: 76 }}
      >
        <FaCog size={32} />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm w-full bg-card text-main border border-secondary shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-primary text-center">Settings</DialogTitle>
          </DialogHeader>
          <div className="w-full flex flex-col gap-4 items-center justify-center py-4">
            <div className="text-sm font-medium text-main mb-1">Theme</div>
            <div className="grid grid-cols-3 gap-2 w-full px-3">
              <Button
                size="sm"
                type="button"
                onClick={() => handleThemeChange('system')}
                className={theme === 'system'
                  ? 'bg-primary text-white font-semibold border-2 border-primary shadow-sm'
                  : 'bg-secondary/10 hover:bg-secondary/20 text-main border border-secondary/50'
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
                  : 'bg-secondary/10 hover:bg-secondary/20 text-main border border-secondary/50'
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
                  : 'bg-secondary/10 hover:bg-secondary/20 text-main border border-secondary/50'
                }
              >
                Dark
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
