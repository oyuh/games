import { useEffect, useRef } from "react";
import { FiX } from "react-icons/fi";

interface BottomSheetProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export function BottomSheet({ title, onClose, children }: BottomSheetProps) {
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <div
      className="m-sheet-backdrop"
      ref={backdropRef}
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
    >
      <div className="m-sheet">
        <div className="m-sheet-handle" />
        <div className="m-sheet-header">
          <h2 className="m-sheet-title">{title}</h2>
          <button className="m-sheet-close" onClick={onClose}>
            <FiX size={18} />
          </button>
        </div>
        <div className="m-sheet-body">
          {children}
        </div>
      </div>
    </div>
  );
}
