"use client";
import { SessionNameModal, useSessionInfo } from "./_components/session-modal";
import { useState } from "react";

export function ClientRoot({ children }: { children: React.ReactNode }) {
  const { session, loading } = useSessionInfo();
  const [modalClosed, setModalClosed] = useState(false);
  const showModal = !loading && (!session || !session.entered_name) && !modalClosed;
  return (
    <>
      {showModal && <SessionNameModal onNameSet={() => setModalClosed(true)} />}
      {children}
    </>
  );
}
