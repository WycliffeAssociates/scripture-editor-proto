import { Trans, useLingui } from "@lingui/react/macro";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import * as styles from "@/app/ui/styles/modules/projectCreate.css.ts";

// The core item structure remains the same
export interface AutocompleteItem {
  id: string | number;
  name: string;
  avatar_url?: string;
  type?: "user" | "organization" | "repo";
}

// Solid's Accessor<T> and Setter<T> props are converted to regular React props
// where data is passed directly and setters are functions.
export interface AutocompleteInputProps {
  label: string;
  placeholder: string;
  // Solid's Accessor<string> -> string
  searchTerm: string;
  // Solid's Setter<string> -> (value: string) => void
  setSearchTerm: (value: string) => void;
  // Solid's Accessor<AutocompleteItem[] | undefined> -> AutocompleteItem[] | undefined
  results: AutocompleteItem[] | undefined;
  onSelect: (item: AutocompleteItem | null) => void;
  selectedItem: AutocompleteItem | null;
  showAvatar?: boolean;
  // Solid's Accessor<boolean> -> boolean | undefined (optional booleans are often just passed)
  isLoading?: boolean;
  isError?: boolean;
  // Solid's Accessor<string | undefined> -> string | undefined
  errorMessage?: string;
  showOnFocus?: boolean;
  isDisabled?: boolean;
}

export const AutocompleteInput: React.FC<AutocompleteInputProps> = (props) => {
  const { t } = useLingui();
  // Solid's createSignal(false) becomes React's useState(false)
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  // Solid's createSignal(props.searchTerm()) becomes React's state initialized from a prop
  const [inputValue, setInputValue] = useState(props.searchTerm);

  // biome-ignore lint/correctness/useExhaustiveDependencies: <  // Only update if the external searchTerm is different from the internal input state>
  useEffect(() => {
    if (props.searchTerm !== inputValue) {
      setInputValue(props.searchTerm);
    }
  }, [props.searchTerm]); // Dependency array ensures it only runs when props.searchTerm changes

  // biome-ignore lint/correctness/useExhaustiveDependencies: <  // Runs when results or searchTerm change to reset the highlighting>
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [props.results, props.searchTerm]); // Dependencies on props.results and props.searchTerm

  // --- Event Handlers ---

  // Solid's handleInput converts from Solid's Event to React's ChangeEvent<HTMLInputElement>
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value); // Update local state for input
    props.setSearchTerm(value); // Call external setter to trigger search
    setShowDropdown(true); // Show dropdown on input
  };

  // Solid's handleKeyDown converts from Solid's KeyboardEvent to React's KeyboardEvent<HTMLInputElement>
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const results = props.results || [];
    if (e.key === "ArrowDown") {
      e.preventDefault();
      // Using functional state update is the same pattern in React
      setHighlightedIndex((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightedIndex !== -1 && results[highlightedIndex]) {
        props.onSelect(results[highlightedIndex]);
        setShowDropdown(false);
      } else if (results.length === 1 && inputValue === results[0].name) {
        props.onSelect(results[0]);
        setShowDropdown(false);
      }
    } else if (e.key === "Escape") {
      setShowDropdown(false);
    }
  };

  const handleBlur = () => {
    // Use setTimeout to allow click/mousedown events on the list item to register first
    // before the input blur hides the dropdown.
    setTimeout(() => setShowDropdown(false), 150);
  };

  const handleFocus = () => {
    const resultsLength = props.results?.length || 0;
    // Check if showOnFocus is true OR if there is input, AND there are results.
    if ((props.showOnFocus || inputValue.length > 0) && resultsLength > 0) {
      setShowDropdown(true);
    }
  };

  // Memoize the condition for showing the results dropdown
  const shouldShowResultsDropdown = useMemo(() => {
    return (
      showDropdown &&
      (props.results?.length || 0) > 0 &&
      !props.isLoading &&
      !props.isError
    );
  }, [showDropdown, props.results, props.isLoading, props.isError]);

  // --- Render Logic ---

  return (
    // SolidJS's class="" becomes React's className=""
    <div className={styles.acContainer}>
      <label htmlFor="autoCompleteInput" className={styles.acLabel}>
        <Trans>{props.label}</Trans>
      </label>
      <div>
        <input
          id={"autoCompleteInput"}
          type="text"
          className={styles.repoInput}
          placeholder={t`${props.placeholder}`}
          // Solid's value={inputValue()} becomes React's value={inputValue}
          value={inputValue}
          // Solid's onInput={handleInput} becomes React's onChange={handleInputChange}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          onFocus={handleFocus}
        />

        {props.selectedItem && (
          <div className={styles.acSelected}>
            {props.showAvatar && props.selectedItem.avatar_url && (
              <img
                src={props.selectedItem.avatar_url}
                alt={props.selectedItem.name}
                className={styles.acSelectedAvatar}
              />
            )}
            <span className={styles.acSelectedText}>
              {props.selectedItem.name}
              {props.selectedItem.type &&
                props.selectedItem.type !== "repo" && (
                  <span className={styles.acItemText}>
                    ({props.selectedItem.type})
                  </span>
                )}
            </span>
            <button
              type="button"
              onClick={() => props.onSelect(null)}
              className={styles.acClearButton}
              aria-label="Clear selection"
            >
              <Trans>Clear</Trans>
            </button>
          </div>
        )}

        {props.isLoading && (
          <div className={styles.acLoading}>
            <Trans>Loading...</Trans>
          </div>
        )}

        {props.isError && (
          <div className={styles.acError}>
            <Trans>
              Error: {props.errorMessage || t`Failed to fetch suggestions.`}
            </Trans>
          </div>
        )}

        {shouldShowResultsDropdown && (
          <ul className={styles.acDropdown}>
            {props.results?.map((item, index) => (
              <li
                key={item.id}
                className={`${styles.acListItem} ${highlightedIndex === index ? styles.acHighlighted : ""}`}
                onMouseDown={() => props.onSelect(item)}
              >
                <div className={styles.acItemContent}>
                  {props.showAvatar && item.avatar_url && (
                    <img
                      src={item.avatar_url}
                      alt={item.name}
                      className={styles.acItemAvatar}
                    />
                  )}
                  <span className={styles.acItemText}>{item.name}</span>
                  {item.type && item.type !== "repo" && (
                    <span className={styles.acItemText}>({item.type})</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default AutocompleteInput;
