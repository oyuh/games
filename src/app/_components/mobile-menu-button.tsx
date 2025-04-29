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

    // Map action names to their corresponding event names
    const eventMap: Record<string, string> = {
      'profile': 'open-session-profile-editor-modal',
      'join-game': 'open-join-game-modal',
      'settings': 'open-settings-modal'
    };

    // Get the correct event name from the map, or fall back to the old pattern
    const eventName = eventMap[action] || `open-${action}-modal`;

    // Dispatch custom events that the individual components can listen for
    const event = new CustomEvent(eventName);
    document.dispatchEvent(event);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {/* Mobile menu button */}
      <button
        className="bg-primary text-white border-4 border-secondary/60 rounded-full shadow-2xl p-5 flex items-center justify-center hover:bg-primary/80 transition duration-150 outline-none focus:ring-2 focus:ring-primary/60"
        onClick={toggleMenu}
        aria-label="Menu"
        style={{ width: 72, height: 72 }}
      >
        <Menu size={32} />
      </button>

      {/* Dropdown menu */}
      {isMenuOpen && (
        <>
          {/* Backdrop to handle clicks outside the menu */}
          <div
            className="fixed inset-0 z-40"
            onClick={closeMenu}
          />

          <div className="absolute right-0 bottom-20 z-50 bg-card border border-secondary rounded-xl shadow-lg p-2 w-44">
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
