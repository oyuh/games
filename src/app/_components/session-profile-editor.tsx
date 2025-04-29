"use client";
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { useSessionInfo } from "./session-modal";

export function SessionProfileEditor() {
  const { session, loading } = useSessionInfo();
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Event name constant to avoid typos
  const EVENT_NAME = 'open-session-profile-editor-modal';

  // Event listener with cleanup - important fixes:
  // 1. Using a named function reference to properly remove the listener
  // 2. Setting stopPropagation and stopImmediatePropagation to prevent event bubbling
  useEffect(() => {
    function handleOpenModal(e) {
      // Stop propagation to prevent duplicate handling
      e.stopPropagation();
      e.stopImmediatePropagation();

      // Reset state and open modal
      setError("");
      setConfirmDelete(false);
      setOpen(true);
    }

    // Add the event listener
    document.addEventListener(EVENT_NAME, handleOpenModal);

    // Clean up function
    return () => {
      document.removeEventListener(EVENT_NAME, handleOpenModal);
    };
  }, []);

  // Delete session logic
  const handleDelete = async () => {
    setIsSubmitting(true);
    setError("");
    const res = await fetch("/api/session/entered-name", { method: "DELETE" });
    if (res.ok) {
      window.location.reload();
    } else {
      setError("Failed to delete session");
    }
    setIsSubmitting(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-xs sm:max-w-md w-full bg-card text-main border border-secondary shadow-xl">
        <DialogHeader>
          <DialogTitle className="text-primary text-center">Profile Settings</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="text-center text-main">Loading...</div>
        ) : session ? (
          <div className="w-full flex flex-col gap-2 items-center">
            <div className="text-sm text-main">Current name:</div>
            <div className="font-bold text-lg text-primary mb-2">{session.entered_name}</div>
            <div className="text-xs text-main bg-main/80 rounded-lg p-2 mb-2 border border-secondary w-full text-center">
              <div>Created: <span className="font-semibold">{session.created_at ? new Date(session.created_at).toLocaleString() : "-"}</span></div>
              <div>Expires: <span className="font-semibold">{session.expires_at ? new Date(session.expires_at).toLocaleString() : "-"}</span></div>
            </div>

            {!confirmDelete ? (
              <Button
                variant="destructive"
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="w-full"
              >
                Delete Session
              </Button>
            ) : (
              <div className="w-full bg-destructive/10 border border-destructive/30 rounded-md p-3 mt-3">
                <p className="text-center text-destructive text-sm mb-2">Are you sure you want to delete your session?</p>
                <div className="flex gap-2 w-full">
                  <Button
                    variant="destructive"
                    type="button"
                    onClick={handleDelete}
                    disabled={isSubmitting}
                    className="w-full"
                  >
                    {isSubmitting ? "Deleting..." : "Confirm"}
                  </Button>
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="w-full"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {error && <div className="text-destructive text-sm font-medium text-center w-full mt-2">{error}</div>}
          </div>
        ) : (
          <div className="text-center text-main">No session found.</div>
        )}
        <DialogFooter />
      </DialogContent>
    </Dialog>
  );
}
