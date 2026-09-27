import { useLocation } from "react-router-dom";
import { getGameSlugFromPath } from "@games/shared";
import { useState } from "react";
import { BottomSheet } from "./BottomSheet";
import { InfoContent, InfoFooter } from "../../components/shared/InfoModal";
import { ImposterDemo } from "../../components/demos/ImposterDemo";
import { PasswordDemo } from "../../components/demos/PasswordDemo";
import { ChainDemo } from "../../components/demos/ChainDemo";
import { ShadeDemo } from "../../components/demos/ShadeDemo";
import { LocationDemo } from "../../components/demos/LocationDemo";
import { ShikakuDemo } from "../../components/demos/ShikakuDemo";
import { PipsDemo } from "../../components/demos/PipsDemo";

const DEMOS = {
  imposter: ImposterDemo,
  password: PasswordDemo,
  chain: ChainDemo,
  shade: ShadeDemo,
  location: LocationDemo,
  shikaku: ShikakuDemo,
  pips: PipsDemo,
};

export function MobileInfoSheet({ onClose }: { onClose: () => void }) {
  const location = useLocation();
  const slug = getGameSlugFromPath(location.pathname);
  const Demo = slug === "home" ? null : DEMOS[slug];
  const [showDemo, setShowDemo] = useState(false);

  if (showDemo && Demo) return <Demo onClose={onClose} />;

  return (
    <BottomSheet title="Info" onClose={onClose}>
      <InfoContent
        pageAction={Demo && (
          <button className="m-btn m-btn--quiet m-btn--block m-info-howto" type="button" onClick={() => setShowDemo(true)}>
            How to play
          </button>
        )}
      />
      <div className="m-sheet-foot">
        <InfoFooter />
      </div>
    </BottomSheet>
  );
}
