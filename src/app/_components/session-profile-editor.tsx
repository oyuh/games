"use client";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { useSessionInfo } from "./session-modal";

export function SessionProfileEditor() {
  const { session, loading } = useSessionInfo();
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Open menu
  const handleOpen = () => {
    setError("");
    setConfirmDelete(false);
    setOpen(true);
  };

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
    <>
      {/* Floating button */}
      <button
        className="fixed top-4 left-4 z-50 bg-card text-primary border border-secondary rounded-full shadow-lg p-3 flex items-center justify-center hover:bg-secondary/20 transition"
        onClick={handleOpen}
        aria-label="Edit Profile/Session"
        style={{ minWidth: 48, minHeight: 48 }}
      >
        <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="feather feather-user-edit"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M18.5 2.5l3 3-7.5 7.5H11v-3.5l7.5-7.5z"/></svg>
      </button>
      {/* Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm w-full bg-card text-main border border-secondary shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-primary text-center">Session/Profile</DialogTitle>
          </DialogHeader>
          {loading ? (
            <div className="text-center text-secondary">Loading...</div>
          ) : session ? (
            <div className="w-full flex flex-col gap-2 items-center">
              <div className="text-sm text-secondary">Current name:</div>
              <div className="font-bold text-lg text-primary mb-2">{session.entered_name}</div>
              <div className="text-xs text-secondary bg-main/80 rounded-lg p-2 mb-2 border border-secondary w-full text-center">
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
            <div className="text-center text-secondary">No session found.</div>
          )}
          <DialogFooter />
        </DialogContent>
      </Dialog>
    </>
  );
}
