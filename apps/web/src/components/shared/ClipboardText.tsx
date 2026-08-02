import { useEffect, useRef, useState } from "react";
import { FiCheck, FiCopy } from "react-icons/fi";
import "../../styles/controls.css";

/**
 * A read-only value with a copy button welded to its right edge. Used for
 * things you are meant to hand to someone else, like a session id.
 *
 * The value truncates rather than wrapping, so a long id can never grow the
 * panel it sits in, and the full string still goes to the clipboard.
 */
export function ClipboardText({
  text,
  textToCopy,
  label = "Copy",
}: {
  text: string;
  /** Copy something other than what is shown, e.g. when the display is masked. */
  textToCopy?: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textRef = useRef<HTMLSpanElement>(null);

  // The timeout outlives the component if the modal closes mid-flash.
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(textToCopy ?? text);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // The clipboard API can be refused: denied permission, an insecure
      // origin, or a document that is not focused. Select the value so it can
      // still be copied by hand, rather than flashing a "Copied" that never
      // happened.
      const node = textRef.current;
      if (!node) return;
      const range = document.createRange();
      range.selectNodeContents(node);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  };

  return (
    <div className="ui-clip">
      <span className="ui-clip-text" ref={textRef} title={text}>{text}</span>
      <button
        type="button"
        className="ui-clip-btn"
        onClick={() => void copy()}
        aria-label={copied ? "Copied" : label}
        data-tooltip={copied ? "Copied" : label}
        data-tooltip-pos="top"
      >
        {copied ? <FiCheck size={14} /> : <FiCopy size={14} />}
      </button>
    </div>
  );
}
