"use client";
import { useState } from "react";
import { Menu } from "lucide-react";
import { FaUser, FaUsers, FaCog } from "react-icons/fa";
import { useSessionInfo } from "./session-modal";
import { Button } from "~/components/ui/button";

export function MobileMenuButton() {
  const { session } = useSessionInfo();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Function to toggle the menu open/closed
  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  // Close the menu when clicking outside
  const closeMenu = () => {
    setIsMenuOpen(false);
  };

  // Handle clicks on specific menu items
  const handleItemClick = (action: string) => {
    // Close the menu
    setIsMenuOpen(false);

    // Dispatch custom events that the individual components can listen for
    const event = new CustomEvent(`open-${action}-modal`);
    document.dispatchEvent(event);
  };

  return (
    <div className="relative">
      {/* Mobile menu button */}
      <button
        className="bg-card text-primary border border-secondary rounded-full shadow-lg p-4 flex items-center justify-center hover:bg-secondary/20 transition"
        onClick={toggleMenu}
        aria-label="Menu"
        style={{ width: 60, height: 60 }}
      >
        <Menu size={28} />
      </button>

      {/* Dropdown menu */}
      {isMenuOpen && (
        <>
          {/* Backdrop to handle clicks outside the menu */}
          <div
            className="fixed inset-0 z-40"
            onClick={closeMenu}
          />

          <div className="absolute right-0 bottom-16 z-50 bg-card border border-secondary rounded-xl shadow-lg p-2 w-44">
            <div className="flex flex-col space-y-1">
              <Button
                variant="ghost"
                className="flex items-center justify-start space-x-2 w-full px-3 py-2"
                onClick={() => handleItemClick('profile')}
              >
                <FaUser size={16} />
                <span className="ml-2">Profile</span>
              </Button>

              <Button
                variant="ghost"
                className="flex items-center justify-start space-x-2 w-full px-3 py-2"
                onClick={() => handleItemClick('join-game')}
              >
                <FaUsers size={16} />
                <span className="ml-2">Join Game</span>
              </Button>

              <Button
                variant="ghost"
                className="flex items-center justify-start space-x-2 w-full px-3 py-2"
                onClick={() => handleItemClick('settings')}
              >
                <FaCog size={16} />
                <span className="ml-2">Settings</span>
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
