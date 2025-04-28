"use client";
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { useSessionInfo } from "./session-modal";
import { FaUser } from "react-icons/fa";

export function SessionProfileEditor() {
  const { session, loading } = useSessionInfo();
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [showTooltip, setShowTooltip] = useState(false);

  // Open menu
  const handleOpen = () => {
    setError("");
    setConfirmDelete(false);
    setOpen(true);
  };

  // Listen for custom event from mobile menu
  useEffect(() => {
    const openModalListener = () => handleOpen();
    document.addEventListener('open-profile-modal', openModalListener);

    return () => {
      document.removeEventListener('open-profile-modal', openModalListener);
    };
  }, []);

  // Delete session logic
  const handleDelete = async () => {
    setSubmitting(true);
    setError("");
    const res = await fetch("/api/session/entered-name", { method: "DELETE" });
    if (res.ok) {
      window.location.reload();
    } else {
      setError("Failed to delete session");
    }
    setSubmitting(false);
  };

  return (
    <div className="relative">
      <button
        className="bg-card text-primary border border-secondary rounded-full shadow-lg p-5 flex items-center justify-center hover:bg-secondary/20 transition"
        onClick={handleOpen}
        aria-label="Edit Profile/Session"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        style={{ width: 76, height: 76 }}
      >
        <FaUser size={32} />
      </button>

      {showTooltip && (
        <div className="absolute left-[-140px] top-1/2 transform -translate-y-1/2 bg-card px-4 py-2 rounded-md text-sm whitespace-nowrap border border-secondary shadow-lg z-50 w-[120px] text-center">
          Profile
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm w-full bg-card text-main border border-secondary shadow-xl">
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
                <Button type="button" onClick={() => setConfirmDelete(true)} disabled={submitting} className="w-full mt-2 bg-destructive text-main hover:bg-destructive/90">
                  Delete Session
                </Button>
              ) : (
                <div className="w-full flex flex-col gap-2 items-center mt-2">
                  <div className="text-center text-destructive font-semibold">Are you sure you want to delete your session?</div>
                  <Button type="button" onClick={handleDelete} disabled={submitting} className="w-full bg-destructive text-main hover:bg-destructive/90 mt-2">
                    Confirm Delete
                  </Button>
                  <Button type="button" onClick={() => setConfirmDelete(false)} disabled={submitting} className="w-full bg-secondary text-main hover:bg-secondary/90 mt-2">
                    Cancel
                  </Button>
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
    </div>
  );
}
