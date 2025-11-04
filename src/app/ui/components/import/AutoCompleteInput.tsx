import React, { useState, useEffect, useCallback, useMemo } from "react";

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
}

export const AutocompleteInput: React.FC<AutocompleteInputProps> = (props) => {
    // Solid's createSignal(false) becomes React's useState(false)
    const [showDropdown, setShowDropdown] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    // Solid's createSignal(props.searchTerm()) becomes React's state initialized from a prop
    const [inputValue, setInputValue] = useState(props.searchTerm);

    // --- SolidJS createEffect Conversions ---

    // 1. Solid Effect: Syncing inputValue with external searchTerm prop
    // createEffect(() => { if (props.searchTerm() !== inputValue()) { setInputValue(props.searchTerm()); } });
    // This is handled by a React useEffect that runs when props.searchTerm changes.
    useEffect(() => {
        // Only update if the external searchTerm is different from the internal input state
        if (props.searchTerm !== inputValue) {
            setInputValue(props.searchTerm);
        }
    }, [props.searchTerm]); // Dependency array ensures it only runs when props.searchTerm changes

    // 2. Solid Effect: Resetting highlightedIndex on results or searchTerm change
    // createEffect(() => { props.results(); props.searchTerm(); setHighlightedIndex(-1); });
    useEffect(() => {
        // Runs when results or searchTerm change to reset the highlighting
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
        if (
            (props.showOnFocus || inputValue.length > 0) &&
            resultsLength > 0
        ) {
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
        <div className="relative w-full mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2">
                {props.label}
            </label>
            <div className="relative">
                <input
                    type="text"
                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                    placeholder={props.placeholder}
                    // Solid's value={inputValue()} becomes React's value={inputValue}
                    value={inputValue}
                    // Solid's onInput={handleInput} becomes React's onChange={handleInputChange}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    onBlur={handleBlur}
                    onFocus={handleFocus}
                />

                {/* Solid's <Show when={props.selectedItem()}> becomes React's conditional rendering with && */}
                {props.selectedItem && (
                    <div className="flex items-center mt-2 p-2 bg-gray-100 rounded">
                        {/* Inline checks are for props.selectedItem being non-null/non-undefined */}
                        {props.showAvatar && props.selectedItem.avatar_url && (
                            <img
                                src={props.selectedItem.avatar_url}
                                alt={props.selectedItem.name}
                                className="w-8 h-8 rounded-full mr-2 object-cover"
                            />
                        )}
                        <span className="font-medium text-gray-800">
                            {props.selectedItem.name}
                            {/* The logic for showing the type is replicated */}
                            {props.selectedItem.type &&
                                props.selectedItem.type !== "repo" && (
                                    <span className="ml-2 text-sm text-gray-500">
                                        ({props.selectedItem.type})
                                    </span>
                                )}
                        </span>
                        <button
                            onClick={() => props.onSelect(null)}
                            className="ml-auto text-red-500 hover:text-red-700 text-sm"
                            aria-label="Clear selection"
                        >
                            Clear
                        </button>
                    </div>
                )}

                {/* Loading State */}
                {/* Solid's <Show when={props.isLoading?.()}> becomes React's conditional rendering */}
                {props.isLoading && (
                    <div className="absolute z-10 w-full bg-white border border-gray-300 rounded-b-lg shadow-lg mt-1 p-2 text-gray-600">
                        Loading...
                    </div>
                )}

                {/* Error State */}
                {props.isError && (
                    <div className="absolute z-10 w-full bg-red-100 border border-red-400 text-red-700 rounded-b-lg shadow-lg mt-1 p-2">
                        Error: {props.errorMessage || "Failed to fetch suggestions."}
                    </div>
                )}

                {/* Results Dropdown */}
                {/* Solid's <Show when={...}> with a complex condition is converted to a pre-calculated variable or direct conditional */}
                {shouldShowResultsDropdown && (
                    <ul className="absolute z-10 w-full bg-white border border-gray-300 rounded-b-lg shadow-lg max-h-48 overflow-y-auto mt-1">
                        {/* Solid's <For each={...}> becomes React's map function */}
                        {props.results!.map((item, index) => (
                            <li
                                key={item.id} // React requires a unique key for list items
                                // Solid's classList becomes a combination of template strings or the 'clsx'/'classnames' pattern
                                className={`px-4 py-2 cursor-pointer hover:bg-blue-100 ${
                                    highlightedIndex === index ? "bg-blue-200" : ""
                                }`}
                                // Solid's onMouseDown is fine in React
                                onMouseDown={() => props.onSelect(item)}
                            >
                                <div className="flex items-center">
                                    {props.showAvatar && item.avatar_url && (
                                        <img
                                            src={item.avatar_url}
                                            alt={item.name}
                                            className="w-8 h-8 rounded-full mr-2 object-cover"
                                        />
                                    )}
                                    <span>{item.name}</span>
                                    {item.type && item.type !== "repo" && (
                                        <span className="ml-2 text-sm text-gray-500">
                                            ({item.type})
                                        </span>
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