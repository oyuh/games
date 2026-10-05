import { FiCheck, FiRotateCcw, FiShuffle } from "react-icons/fi";
import { Drawer } from "vaul";
import { AvatarChoices, AvatarPreview, useAvatarPicker } from "../../components/shared/AvatarPickerModal";
import { Button } from "../../components/shared/Button";
import { BottomSheet } from "./BottomSheet";
import "../../styles/avatar-picker.css";

/** The avatar picker as a drawer: preview pinned on top, actions pinned below. */
export function AvatarPickerSheet({ sessionId, name, onClose }: { sessionId: string; name: string; onClose: () => void }) {
  const picker = useAvatarPicker(sessionId);

  return (
    <BottomSheet title="Choose an avatar" onClose={onClose}>
      <div className="ap-sheet">
        <AvatarPreview picker={picker} name={name} />
        <div className="ap-sheet-choices">
          <AvatarChoices picker={picker} />
        </div>
        <div className="ap-sheet-actions">
          <Button variant="ghost" size="lg" icon={<FiRotateCcw />} onClick={picker.reset} disabled={!picker.custom}>
            Reset
          </Button>
          <Button size="lg" icon={<FiShuffle />} onClick={picker.shuffle}>
            Surprise me
          </Button>
          <Drawer.Close asChild>
            <Button variant="primary" size="lg" icon={<FiCheck />}>
              Done
            </Button>
          </Drawer.Close>
        </div>
      </div>
    </BottomSheet>
  );
}
