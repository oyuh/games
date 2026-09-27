import { SoundSection, ThemeSection } from "../../components/shared/OptionsModal";
import { BottomSheet } from "./BottomSheet";

export function MobileOptionsSheet({ onClose }: { onClose: () => void }) {
  return (
    <BottomSheet title="Options" onClose={onClose}>
      <ThemeSection />
      <SoundSection />
    </BottomSheet>
  );
}
