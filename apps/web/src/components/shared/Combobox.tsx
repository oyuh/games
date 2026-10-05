import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { FiCheck, FiChevronDown, FiPlus, FiSearch } from "react-icons/fi";
import { popupHost, revealActiveRow, useAnchoredPopup, useDismiss } from "./popup";
import "../../styles/combobox.css";

export interface ComboboxOption {
  value: string;
  label: string;
  /** Quieter text after the label, the way a setup cell reads "3 rounds". */
  detail?: string;
  /** More words the search matches on, like "90" for a 1m 30s timer. */
  keywords?: string[];
}

/** Lets the host type a value that is not in the list. */
export interface ComboboxCustom {
  /** What was typed, as a value, or null when it is not a legal one. */
  parse: (query: string) => string | null;
  /** How a parsed value reads on the row that offers it. */
  format?: (value: string) => string;
  /** Shown when what was typed matches nothing and parses to nothing. */
  hint: string;
  inputMode?: "numeric" | "text";
}

export interface ComboboxProps {
  value: string;
  options: ComboboxOption[];
  onChange: (value: string) => void;
  /** Names the list, heads the popup, and labels the trigger for screen readers. */
  label: string;
  icon?: ReactNode;
  custom?: ComboboxCustom;
  /** On by default. A short list with nothing to type does not need it. */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Any css color for the selected row. Defaults to the game's accent. */
  tone?: string;
  /** What the trigger shows. Without it, it is the site's select button. */
  children?: ReactNode;
  triggerClassName?: string;
  triggerStyle?: CSSProperties;
  /** Extra attributes for the trigger, dropped while the list is open so a
   *  tooltip does not sit on top of it. */
  triggerAttrs?: Record<string, string>;
  disabled?: boolean;
}

type Row = { value: string; label: string; detail?: string; custom?: boolean };

const matches = (option: ComboboxOption, query: string) =>
  [option.label, option.detail, option.value, ...(option.keywords ?? [])]
    .some((text) => text?.toLowerCase().includes(query));

/**
 * A button that opens a searchable list, after kibo-ui's combobox: a search
 * field on top, the options under it, and a row offering whatever you typed
 * when the list does not have it and `custom` says it is legal.
 *
 * Focus moves into the search field and the highlighted row is named with
 * aria-activedescendant, so arrowing never leaves the field. On a touch
 * screen focus goes to the list instead, because a keyboard sliding up over
 * a list you meant to tap is worse than one more tap to search.
 */
export function Combobox({
  value,
  options,
  onChange,
  label,
  icon,
  custom,
  searchable = true,
  searchPlaceholder = "Search…",
  tone,
  children,
  triggerClassName,
  triggerStyle,
  triggerAttrs,
  disabled,
}: ComboboxProps) {
  const id = useId();
  const listId = `${id}-list`;
  const optionId = (index: number) => `${id}-option-${index}`;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const trimmed = query.trim().toLowerCase();
  const rows = useMemo<Row[]>(() => {
    const found: Row[] = trimmed ? options.filter((option) => matches(option, trimmed)) : options;
    const typed = trimmed && custom ? custom.parse(query) : null;
    if (typed !== null && !options.some((option) => option.value === typed)) {
      return [...found, { value: typed, label: custom?.format?.(typed) ?? typed, custom: true }];
    }
    return found;
  }, [options, trimmed, query, custom]);

  const selected = options.find((option) => option.value === value);
  const style = useAnchoredPopup(open, triggerRef, popupRef, rows.length, 20);

  const close = () => {
    setOpen(false);
    setQuery("");
  };
  useDismiss(open, close, triggerRef, popupRef);

  const openList = () => {
    setQuery("");
    setActive(Math.max(0, options.findIndex((option) => option.value === value)));
    setOpen(true);
  };

  // Into the popup once it has been placed. A frame late, because the first
  // pass renders it hidden to measure it and a hidden field cannot take focus.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const typeFirst = searchable && window.matchMedia("(pointer: fine)").matches;
      (typeFirst ? inputRef.current : listRef.current)?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [open, searchable]);

  useEffect(() => {
    if (open) revealActiveRow(listRef.current);
  }, [open, active, rows.length]);

  const commit = (row: Row | undefined) => {
    if (!row) return;
    if (row.value !== value) onChange(row.value);
    close();
    triggerRef.current?.focus();
  };

  const onPopupKeyDown = (event: KeyboardEvent) => {
    const last = rows.length - 1;
    const move = (next: number) => {
      event.preventDefault();
      setActive(Math.min(last, Math.max(0, next)));
    };
    const inField = event.target === inputRef.current;

    switch (event.key) {
      case "ArrowDown": return move(active + 1);
      case "ArrowUp": return move(active - 1);
      // In the field these move the caret, which is what someone typing wants.
      case "Home": if (!inField) move(0); return;
      case "End": if (!inField) move(last); return;
      case "Enter":
        event.preventDefault();
        commit(rows[active]);
        return;
      case " ":
        if (!inField) {
          event.preventDefault();
          commit(rows[active]);
        }
        return;
      case "Tab":
        close();
        return;
    }
  };

  const onTriggerKeyDown = (event: KeyboardEvent) => {
    if (open || !["ArrowDown", "ArrowUp"].includes(event.key)) return;
    event.preventDefault();
    openList();
  };

  const selectedText = selected ? [selected.label, selected.detail].filter(Boolean).join(" ") : value;
  const typedButInvalid = Boolean(trimmed && custom && rows.length === 0);
  const theme = open ? triggerRef.current?.closest("[data-game-theme]")?.getAttribute("data-game-theme") : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName ?? "solo-select-trigger"}
        style={triggerStyle}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`${label}: ${selectedText}`}
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onTriggerKeyDown}
        {...(open ? {} : triggerAttrs)}
      >
        {children ?? (
          <>
            {icon}
            <span className="solo-select-value">{selectedText}</span>
            <FiChevronDown className="solo-select-chevron" size={14} aria-hidden="true" />
          </>
        )}
      </button>

      {open && createPortal(
        <div
          ref={popupRef}
          className="cbx"
          role="dialog"
          aria-label={label}
          // Portalled out of the game page, so it brings the game's colors along.
          {...(theme ? { "data-game-theme": theme } : {})}
          style={{ ...style, ...(tone ? { "--cbx-tone": tone } : {}) } as CSSProperties}
          onKeyDown={onPopupKeyDown}
        >
          <div className="cbx-head">
            {icon && <span className="cbx-head-icon" aria-hidden="true">{icon}</span>}
            <span>{label}</span>
          </div>

          {searchable && (
            <label className="cbx-search">
              <FiSearch size={14} aria-hidden="true" />
              <input
                ref={inputRef}
                className="cbx-search-input"
                type="text"
                role="combobox"
                aria-label={`Search ${label.toLowerCase()}`}
                aria-expanded="true"
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={rows[active] ? optionId(active) : undefined}
                placeholder={custom ? `${searchPlaceholder.replace(/…$/, "")} or type your own` : searchPlaceholder}
                value={query}
                inputMode={custom?.inputMode ?? "text"}
                enterKeyHint="done"
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActive(0);
                }}
              />
            </label>
          )}

          <div
            ref={listRef}
            id={listId}
            className="cbx-list"
            role="listbox"
            aria-label={label}
            tabIndex={-1}
            aria-activedescendant={!searchable && rows[active] ? optionId(active) : undefined}
            // Keeps focus in the search field when a row is clicked.
            onMouseDown={(event) => event.preventDefault()}
          >
            {rows.map((row, index) => {
              const isSelected = !row.custom && row.value === value;
              return (
                <div
                  key={`${row.custom ? "custom" : "option"}-${row.value}`}
                  id={optionId(index)}
                  role="option"
                  aria-selected={isSelected}
                  className={`cbx-option${row.custom ? " cbx-option--custom" : ""}`}
                  data-active={index === active ? "" : undefined}
                  data-selected={isSelected ? "" : undefined}
                  onPointerMove={() => index !== active && setActive(index)}
                  onClick={() => commit(row)}
                >
                  {row.custom && <FiPlus className="cbx-option-icon" size={13} aria-hidden="true" />}
                  {row.custom && <span className="cbx-option-detail">Use</span>}
                  <span className="cbx-option-value">{row.label}</span>
                  {row.detail && <span className="cbx-option-detail">{row.detail}</span>}
                  {isSelected && <FiCheck className="cbx-check" size={13} aria-hidden="true" />}
                </div>
              );
            })}

            {rows.length === 0 && (
              <p className="cbx-empty" role="status">
                {typedButInvalid ? custom?.hint : "Nothing matches that."}
              </p>
            )}
          </div>
        </div>,
        popupHost(triggerRef.current) ?? document.body,
      )}
    </>
  );
}

export interface MultiComboboxProps {
  values: string[];
  options: ComboboxOption[];
  onChange: (values: string[]) => void;
  /** Names the list, heads the popup, and labels the trigger for screen readers. */
  label: string;
  icon?: ReactNode;
  /** What the trigger says when nothing is on. */
  placeholder?: string;
  /** What it says when everything is. */
  allLabel?: string;
  /** Any css color for the rows that are on. Defaults to the game's accent. */
  tone?: string;
}

/**
 * The same popup as Combobox, for settings that take any number of values.
 * Rows toggle and the list stays open while you pick, since closing after
 * every choice would make turning three things on a three-trip job. There is
 * no search field: a list short enough to toggle through does not need one.
 */
export function MultiCombobox({ values, options, onChange, label, icon, placeholder = "None", allLabel = "All", tone }: MultiComboboxProps) {
  const id = useId();
  const listId = `${id}-list`;
  const optionId = (index: number) => `${id}-option-${index}`;

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const style = useAnchoredPopup(open, triggerRef, popupRef, options.length, 20);
  useDismiss(open, () => setOpen(false), triggerRef, popupRef);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => listRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (open) revealActiveRow(listRef.current);
  }, [open, active]);

  const on = options.filter((option) => values.includes(option.value));
  const summary =
    on.length === 0 ? placeholder
    : on.length === options.length ? allLabel
    : on.length <= 2 ? on.map((option) => option.label).join(", ")
    : `${on.slice(0, 2).map((option) => option.label).join(", ")} and ${on.length - 2} more`;

  const toggle = (index: number) => {
    const option = options[index];
    if (!option) return;
    onChange(values.includes(option.value) ? values.filter((v) => v !== option.value) : [...values, option.value]);
  };

  const onPopupKeyDown = (event: KeyboardEvent) => {
    const move = (next: number) => {
      event.preventDefault();
      setActive(Math.min(options.length - 1, Math.max(0, next)));
    };
    switch (event.key) {
      case "ArrowDown": return move(active + 1);
      case "ArrowUp": return move(active - 1);
      case "Home": return move(0);
      case "End": return move(options.length - 1);
      case "Enter":
      case " ":
        event.preventDefault();
        toggle(active);
        return;
      case "Tab":
        setOpen(false);
        return;
    }
  };

  const onTriggerKeyDown = (event: KeyboardEvent) => {
    if (open || !["ArrowDown", "ArrowUp"].includes(event.key)) return;
    event.preventDefault();
    setActive(0);
    setOpen(true);
  };

  const theme = open ? triggerRef.current?.closest("[data-game-theme]")?.getAttribute("data-game-theme") : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="solo-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`${label}: ${summary}`}
        data-empty={on.length === 0 ? "" : undefined}
        onClick={() => {
          if (!open) setActive(0);
          setOpen((current) => !current);
        }}
        onKeyDown={onTriggerKeyDown}
      >
        {icon}
        <span className="solo-select-value">{summary}</span>
        <span className="solo-select-count">{on.length}/{options.length}</span>
        <FiChevronDown className="solo-select-chevron" size={14} aria-hidden="true" />
      </button>

      {open && createPortal(
        <div
          ref={popupRef}
          className="cbx"
          role="dialog"
          aria-label={label}
          {...(theme ? { "data-game-theme": theme } : {})}
          style={{ ...style, ...(tone ? { "--cbx-tone": tone } : {}) } as CSSProperties}
          onKeyDown={onPopupKeyDown}
        >
          <div className="cbx-head">
            {icon && <span className="cbx-head-icon" aria-hidden="true">{icon}</span>}
            <span>{label}</span>
            <span className="cbx-head-count">{on.length}/{options.length}</span>
          </div>

          <div
            ref={listRef}
            id={listId}
            className="cbx-list"
            role="listbox"
            aria-label={label}
            aria-multiselectable="true"
            tabIndex={-1}
            aria-activedescendant={optionId(active)}
          >
            {options.map((option, index) => {
              const isOn = values.includes(option.value);
              return (
                <div
                  key={option.value}
                  id={optionId(index)}
                  role="option"
                  aria-selected={isOn}
                  className="cbx-option"
                  data-active={index === active ? "" : undefined}
                  data-selected={isOn ? "" : undefined}
                  onPointerMove={() => index !== active && setActive(index)}
                  onClick={() => toggle(index)}
                >
                  <span className="cbx-option-value">{option.label}</span>
                  {option.detail && <span className="cbx-option-detail">{option.detail}</span>}
                  {isOn && <FiCheck className="cbx-check" size={13} aria-hidden="true" />}
                </div>
              );
            })}
          </div>
        </div>,
        popupHost(triggerRef.current) ?? document.body,
      )}
    </>
  );
}
