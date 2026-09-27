import { FiCheck, FiRotateCcw, FiShuffle } from "react-icons/fi";
import { Drawer } from "vaul";
import { AvatarChoices, AvatarPreview, useAvatarPicker } from "../../components/shared/AvatarPickerModal";
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
          <button className="m-btn m-btn--quiet" type="button" onClick={picker.reset} disabled={!picker.custom}>
            <FiRotateCcw size={14} /> Reset
          </button>
          <button className="m-btn m-btn--quiet" type="button" onClick={picker.shuffle}>
            <FiShuffle size={14} /> Surprise me
          </button>
          <Drawer.Close asChild>
            <button className="m-btn m-btn--primary" type="button">
              <FiCheck size={14} /> Done
            </button>
          </Drawer.Close>
        </div>
      </div>
    </BottomSheet>
  );
}
