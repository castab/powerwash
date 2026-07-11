"use client";

import { useEffect, useRef, useState } from "react";
import { GoogleMapsLoadError, loadPlacesLibrary } from "@/lib/google-maps-loader";

export type AddressComponentValue = google.maps.places.AddressComponent[];

export type AddressValue = {
  formattedAddress: string;
  placeId?: string;
  lat?: number;
  lng?: number;
  components?: AddressComponentValue;
  validated: boolean;
};

const FALLBACK_MESSAGE = "Address suggestions are temporarily unavailable. Please try again.";
const MIN_QUERY_LENGTH = 3;
const DEBOUNCE_MS = 250;

type Mode = "loading" | "ready" | "manual";

// Shared address-autocomplete field for the booking wizard and the admin
// service-area settings form. Uses the Places API (New) programmatic classes
// (not the <gmp-place-autocomplete> web component) so this component can own
// input state and implement the full graceful-degradation matrix: missing
// key, script/library load failure, no selection, incomplete place data,
// post-selection edits, and network errors all fall back to a plain,
// fully-usable text input. The booking/settings server actions are always
// the authoritative validator — this component only ever produces a
// best-effort AddressValue.
export function AddressAutocompleteInput({
  id,
  label,
  value,
  onChange,
  error,
  placeholder,
  hint,
  autoComplete,
}: {
  id: string;
  label: string;
  value: AddressValue;
  onChange: (value: AddressValue) => void;
  error?: string;
  placeholder?: string;
  hint?: string;
  autoComplete?: string;
}) {
  const [mode, setMode] = useState<Mode>("loading");
  const [showFallbackMessage, setShowFallbackMessage] = useState(false);
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompleteSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const placesLibraryRef = useRef<google.maps.PlacesLibrary | null>(null);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = `${id}-listbox`;
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  useEffect(() => {
    let isCancelled = false;

    loadPlacesLibrary()
      .then((library) => {
        if (isCancelled) return;
        placesLibraryRef.current = library;
        sessionTokenRef.current = new library.AutocompleteSessionToken();
        setMode("ready");
      })
      .catch((loadError: unknown) => {
        if (isCancelled) return;
        // Missing key is a configuration issue, not something a retry fixes —
        // stay silent. Every other load failure gets the shared customer-
        // friendly fallback line.
        const isMissingKey =
          loadError instanceof GoogleMapsLoadError && loadError.reason === "missing_key";
        setShowFallbackMessage(!isMissingKey);
        setMode("manual");
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  async function fetchSuggestions(input: string) {
    const library = placesLibraryRef.current;
    if (!library) return;

    try {
      const { suggestions: results } = await library.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input,
        sessionToken: sessionTokenRef.current ?? undefined,
        includedRegionCodes: ["us"],
      });

      const withPredictions = results.filter((result) => result.placePrediction !== null);
      setSuggestions(withPredictions);
      setIsOpen(withPredictions.length > 0);
      setActiveIndex(-1);
    } catch {
      // Suggestion-list fetch failed over the network. Nothing was selected
      // yet, so this degrades silently to plain manual typing rather than
      // showing an error for a field the customer hasn't finished entering.
      setSuggestions([]);
      setIsOpen(false);
    }
  }

  function handleInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const text = event.target.value;
    // Any edit — including editing after a prior selection — clears
    // placeId/coordinates/components and marks the value unvalidated.
    onChange({ formattedAddress: text, validated: false });
    setShowFallbackMessage(false);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (mode !== "ready" || text.trim().length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      void fetchSuggestions(text);
    }, DEBOUNCE_MS);
  }

  async function selectSuggestion(suggestion: google.maps.places.AutocompleteSuggestion) {
    const prediction = suggestion.placePrediction;
    if (!prediction) return;

    const predictedText = prediction.text.text;
    setIsOpen(false);
    setSuggestions([]);
    setActiveIndex(-1);
    // Show the picked text immediately; fields resolve a moment later.
    onChange({ formattedAddress: predictedText, validated: false });

    try {
      const { place } = await prediction.toPlace().fetchFields({
        fields: ["formattedAddress", "location", "addressComponents", "id"],
      });

      if (!place.formattedAddress || !place.location) {
        // Selected result has incomplete address components — keep the typed
        // text as a manual (unvalidated) entry rather than surfacing an error.
        return;
      }

      onChange({
        formattedAddress: place.formattedAddress,
        placeId: place.id,
        lat: place.location.lat(),
        lng: place.location.lng(),
        components: place.addressComponents,
        validated: true,
      });

      // The session concludes once fetchFields is called; start a fresh one
      // for the next search so later queries are billed as a new session.
      if (placesLibraryRef.current) {
        sessionTokenRef.current = new placesLibraryRef.current.AutocompleteSessionToken();
      }
    } catch {
      // Network error fetching fields — keep the typed text as manual entry.
      setShowFallbackMessage(true);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen || suggestions.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current <= 0 ? suggestions.length - 1 : current - 1));
    } else if (event.key === "Enter") {
      if (activeIndex >= 0) {
        event.preventDefault();
        void selectSuggestion(suggestions[activeIndex]);
      }
    } else if (event.key === "Escape") {
      setIsOpen(false);
    }
  }

  const describedBy =
    [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className="relative" ref={containerRef}>
      <label className="stack gap-2" htmlFor={id}>
        <span className="text-sm font-medium">{label}</span>
        <input
          aria-activedescendant={activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-describedby={describedBy}
          aria-expanded={isOpen}
          autoComplete={autoComplete ?? "off"}
          className="field"
          id={id}
          onChange={handleInputChange}
          onFocus={() => {
            if (suggestions.length) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          role="combobox"
          value={value.formattedAddress}
        />
      </label>

      {isOpen && suggestions.length ? (
        <ul
          className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-2xl bg-white py-1 text-sm shadow-lg ring-1 ring-foreground/10"
          id={listboxId}
          role="listbox"
        >
          {suggestions.map((suggestion, index) => {
            const prediction = suggestion.placePrediction;
            if (!prediction) return null;

            return (
              <li
                aria-selected={index === activeIndex}
                className={`cursor-pointer px-4 py-2 ${
                  index === activeIndex ? "bg-surface-strong/60" : ""
                }`}
                id={`${id}-option-${index}`}
                key={prediction.placeId}
                onMouseDown={(event) => {
                  event.preventDefault();
                  void selectSuggestion(suggestion);
                }}
                role="option"
              >
                {prediction.text.text}
              </li>
            );
          })}
        </ul>
      ) : null}

      {hint && !error ? (
        <span className="text-sm text-muted" id={hintId}>
          {hint}
        </span>
      ) : null}

      {error ? (
        <span className="text-sm text-danger" id={errorId}>
          {error}
        </span>
      ) : null}

      {!error && showFallbackMessage ? (
        <p className="text-sm text-muted">{FALLBACK_MESSAGE}</p>
      ) : null}
    </div>
  );
}
