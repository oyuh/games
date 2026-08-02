import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { FiCheck, FiChevronDown } from "react-icons/fi";

export interface SelectOption {
  value: string;
  label: string;
}

/** Gap between the trigger and its list, and the list and the window edge. */
const GAP = 6;

/**
 * Anchor a floating list to its trigger. The list is portalled to the body so
 * cards, which clip their own overflow, cannot cut it off, which means it has
 * to be positioned by hand and kept in place while the page scrolls.
 */
function useAnchoredPopup(
  open: boolean,
  triggerRef: RefObject<HTMLButtonElement | null>,
  popupRef: RefObject<HTMLDivElement | null>,
  optionCount: number,
) {
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

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
  }, [open, optionCount, triggerRef, popupRef]);

  return pos
    ? { top: pos.top, left: pos.left, minWidth: pos.width }
    // First pass, before the layout effect has measured: off-screen so the
    // measurement is real but nothing flashes in the wrong place.
    : { top: -9999, left: 0, visibility: "hidden" as const };
}

/** Close on a click anywhere outside, or on escape from anywhere. */
function useDismiss(
  open: boolean,
  close: () => void,
  triggerRef: RefObject<HTMLButtonElement | null>,
  popupRef: RefObject<HTMLDivElement | null>,
) {
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || popupRef.current?.contains(target)) return;
      close();
    };
    // On the document rather than the trigger, so escape still closes the list
    // when focus has wandered off somewhere else.
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close();
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open, close, triggerRef, popupRef]);
}

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

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const optionId = (index: number) => `${id}-option-${index}`;

  const style = useAnchoredPopup(open, triggerRef, popupRef, options.length);
  useDismiss(open, () => setOpen(false), triggerRef, popupRef);

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
          style={style}
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

/**
 * The same control, for settings that take any number of values at once. The
 * list stays open while you pick, since closing after every choice would make
 * turning three things on a three-trip job. The trigger summarises what is on.
 */
export function MultiSelect({
  id,
  values,
  options,
  onChange,
  label,
  placeholder = "None",
  summary,
}: {
  id: string;
  values: string[];
  options: SelectOption[];
  onChange: (values: string[]) => void;
  label: string;
  /** Shown when nothing is selected. */
  placeholder?: string;
  /** Overrides the "A, B and 2 more" summary on the trigger. */
  summary?: (selected: SelectOption[]) => string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const optionId = (index: number) => `${id}-option-${index}`;

  const style = useAnchoredPopup(open, triggerRef, popupRef, options.length);
  useDismiss(open, () => setOpen(false), triggerRef, popupRef);

  useEffect(() => {
    if (!open) return;
    popupRef.current?.querySelector("[data-active]")?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const selected = options.filter((option) => values.includes(option.value));

  const toggle = (index: number) => {
    const option = options[index];
    if (!option) return;
    onChange(values.includes(option.value)
      ? values.filter((v) => v !== option.value)
      : [...values, option.value]);
  };

  const defaultSummary = () => {
    if (selected.length === 0) return placeholder;
    if (selected.length === options.length) return "All";
    if (selected.length <= 2) return selected.map((option) => option.label).join(", ");
    return `${selected.slice(0, 2).map((option) => option.label).join(", ")} and ${selected.length - 2} more`;
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const step = (next: number) => {
      event.preventDefault();
      const clamped = Math.min(options.length - 1, Math.max(0, next));
      setActive(clamped);
      if (!open) setOpen(true);
    };

    switch (event.key) {
      case "ArrowDown": return step(open ? active + 1 : 0);
      case "ArrowUp": return step(open ? active - 1 : 0);
      case "Home": return step(0);
      case "End": return step(options.length - 1);
      case "Enter":
      case " ":
        event.preventDefault();
        if (open) toggle(active);
        else setOpen(true);
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
        data-empty={selected.length === 0 ? "" : undefined}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={onKeyDown}
      >
        <span className="solo-select-value">{summary ? summary(selected) : defaultSummary()}</span>
        <span className="solo-select-count">{selected.length}/{options.length}</span>
        <FiChevronDown className="solo-select-chevron" size={14} aria-hidden="true" />
      </button>

      {open && createPortal(
        <div
          id={`${id}-list`}
          ref={popupRef}
          className="solo-select-popup"
          role="listbox"
          aria-multiselectable="true"
          aria-label={label}
          style={style}
        >
          {options.map((option, index) => {
            const on = values.includes(option.value);
            return (
              <div
                key={option.value}
                id={optionId(index)}
                role="option"
                aria-selected={on}
                className="solo-select-option"
                data-active={index === active ? "" : undefined}
                data-selected={on ? "" : undefined}
                onPointerEnter={() => setActive(index)}
                onClick={() => toggle(index)}
              >
                <span className={`solo-select-box${on ? " solo-select-box--on" : ""}`}>
                  {on && <FiCheck size={11} aria-hidden="true" />}
                </span>
                <span className="solo-select-option-label">{option.label}</span>
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}
