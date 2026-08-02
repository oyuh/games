import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { FiCheck, FiChevronDown } from "react-icons/fi";

export interface SelectOption {
  value: string;
  label: string;
}

/** Gap between the trigger and its list, and the list and the window edge. */
const GAP = 6;

/**
 * A select that is a button and a floating list rather than a native
 * <select>, because the popup a native one opens is drawn by the browser and
 * cannot be themed past its background colour. Same parts as the rest of the
 * site: a bordered control, a panel with a hairline, one accent colour.
 *
 * Focus stays on the trigger the whole time and the highlighted row is named
 * by aria-activedescendant, which is the combobox pattern and saves moving
 * focus into a list that is not in the tab order.
 */
export function Select({
  id,
  value,
  options,
  onChange,
  icon,
  label,
}: {
  id: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  /** Small glyph on the left of the trigger, e.g. the category book. */
  icon?: ReactNode;
  /** Names the control for screen readers, since the visible label is separate. */
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = Math.max(0, options.findIndex((option) => option.value === value));
  // Which row the keyboard is on. Follows the selection every time it opens.
  const [active, setActive] = useState(selected);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const optionId = (index: number) => `${id}-option-${index}`;

  // Anchor the list to the trigger. It is portalled to the body so the cards,
  // which clip their own overflow, cannot cut it off.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const trigger = triggerRef.current;
      const popup = popupRef.current;
      if (!trigger || !popup) return;
      const rect = trigger.getBoundingClientRect();
      const height = popup.offsetHeight;
      const below = window.innerHeight - rect.bottom - GAP;
      // Flip above only when there is genuinely more room up there.
      const flip = below < height && rect.top - GAP > below;
      setPos({
        left: rect.left,
        width: rect.width,
        top: flip ? Math.max(GAP, rect.top - GAP - height) : rect.bottom + GAP,
      });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, options.length]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || popupRef.current?.contains(target)) return;
      setOpen(false);
    };
    // On the document rather than the trigger, so escape still closes the list
    // when focus has wandered off somewhere else.
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  // Keep the highlighted row in view, both on open and while arrowing.
  useEffect(() => {
    if (!open) return;
    popupRef.current?.querySelector("[data-active]")?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const commit = (index: number) => {
    const option = options[index];
    if (option) onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const step = (next: number) => {
      event.preventDefault();
      const clamped = Math.min(options.length - 1, Math.max(0, next));
      if (open) setActive(clamped);
      else { setActive(clamped); setOpen(true); }
    };

    switch (event.key) {
      case "ArrowDown": return step(open ? active + 1 : selected);
      case "ArrowUp": return step(open ? active - 1 : selected);
      case "Home": return step(0);
      case "End": return step(options.length - 1);
      case "Enter":
      case " ":
        event.preventDefault();
        if (open) commit(active);
        else { setActive(selected); setOpen(true); }
        return;
      case "Tab":
        setOpen(false);
        return;
    }
  };

  return (
    <div className="solo-select">
      <button
        id={id}
        ref={triggerRef}
        type="button"
        className="solo-select-trigger"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-activedescendant={open ? optionId(active) : undefined}
        aria-label={label}
        onClick={() => { setActive(selected); setOpen((current) => !current); }}
        onKeyDown={onKeyDown}
      >
        {icon}
        <span className="solo-select-value">{options[selected]?.label ?? value}</span>
        <FiChevronDown className="solo-select-chevron" size={14} aria-hidden="true" />
      </button>

      {open && createPortal(
        <div
          id={`${id}-list`}
          ref={popupRef}
          className="solo-select-popup"
          role="listbox"
          aria-label={label}
          style={pos
            ? { top: pos.top, left: pos.left, minWidth: pos.width }
            // First pass, before the layout effect has measured: off-screen so
            // the measurement is real but nothing flashes in the wrong place.
            : { top: -9999, left: 0, visibility: "hidden" }}
        >
          {options.map((option, index) => (
            <div
              key={option.value}
              id={optionId(index)}
              role="option"
              aria-selected={index === selected}
              className="solo-select-option"
              data-active={index === active ? "" : undefined}
              data-selected={index === selected ? "" : undefined}
              onPointerEnter={() => setActive(index)}
              onClick={() => commit(index)}
            >
              <span className="solo-select-option-label">{option.label}</span>
              {index === selected && <FiCheck className="solo-select-check" size={13} aria-hidden="true" />}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
