import { Link, useLocation } from "react-router-dom";
import { FiActivity, FiChevronRight } from "react-icons/fi";
import { getGameSlugFromPath, type GameSlug } from "@games/shared";
import { useState, type ComponentType } from "react";
import { Button } from "../../components/shared/Button";
import { BottomSheet } from "./BottomSheet";
import { InfoContent, InfoFooter } from "../../components/shared/InfoModal";
import { ImposterDemo } from "../../components/demos/ImposterDemo";
import { PasswordDemo } from "../../components/demos/PasswordDemo";
import { ChainDemo } from "../../components/demos/ChainDemo";
import { ShadeDemo } from "../../components/demos/ShadeDemo";
import { LocationDemo } from "../../components/demos/LocationDemo";
import { ShikakuDemo } from "../../components/demos/ShikakuDemo";
import { PipsDemo } from "../../components/demos/PipsDemo";
import { ZipDemo } from "../../components/zip/ZipDemo";

// Partial because a game can ship before its walkthrough does.
const DEMOS: Partial<Record<GameSlug, ComponentType<{ onClose: () => void }>>> = {
  imposter: ImposterDemo,
  password: PasswordDemo,
  chain: ChainDemo,
  shade: ShadeDemo,
  location: LocationDemo,
  shikaku: ShikakuDemo,
  pips: PipsDemo,
  zip: ZipDemo,
};

export function MobileInfoSheet({ onClose }: { onClose: () => void }) {
  const location = useLocation();
  const slug = getGameSlugFromPath(location.pathname);
  const Demo = DEMOS[slug] ?? null;
  const [showDemo, setShowDemo] = useState(false);

  if (showDemo && Demo) return <Demo onClose={onClose} />;

  return (
    <BottomSheet title="Info" onClose={onClose}>
      <InfoContent
        pageAction={Demo && (
          <Button size="lg" full className="m-info-howto" onClick={() => setShowDemo(true)}>
            How to play
          </Button>
        )}
      />
      {/* Phones have no footer, so the status page's way in lives here. */}
      <Link className="m-link m-info-status" to="/status">
        <FiActivity size={14} aria-hidden="true" /> Service status <FiChevronRight size={14} aria-hidden="true" />
      </Link>
      <div className="m-sheet-foot">
        <InfoFooter />
      </div>
    </BottomSheet>
  );
}
