import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { FiX } from "react-icons/fi";
import { Drawer } from "vaul";

interface BottomSheetProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

const CLOSE_DELAY_MS = 220;

export function BottomSheet({ title, onClose, children }: BottomSheetProps) {
  const [open, setOpen] = useState(true);
  const closeTimerRef = useRef<number | null>(null);

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) return;

    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      onClose();
    }, CLOSE_DELAY_MS);
  }, [onClose]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  return (
    <Drawer.Root
      open={open}
      onOpenChange={handleOpenChange}
      shouldScaleBackground={false}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="m-sheet-backdrop" />
        <Drawer.Content className="m-sheet" aria-describedby={undefined}>
          <Drawer.Handle className="m-sheet-handle" />
          <div className="m-sheet-header">
            <Drawer.Title className="m-sheet-title">{title}</Drawer.Title>
            <Drawer.Close asChild>
              <button className="m-sheet-close" type="button" aria-label={`Close ${title}`}>
                <FiX size={18} />
              </button>
            </Drawer.Close>
          </div>
          <div className="m-sheet-body">{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
