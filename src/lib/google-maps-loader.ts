// Client-only loader for the Google Maps JavaScript API + Places library
// (New). Lazy and memoized: nothing is injected until the first caller
// requests the Places library (typically on focus of an address field), and
// every caller after that shares the same load. Server-side travel-time
// checks live in src/lib/google-routes.ts and do not use this module.

export type GoogleMapsLoadErrorReason = "missing_key" | "load_failed" | "places_unavailable";

export class GoogleMapsLoadError extends Error {
  reason: GoogleMapsLoadErrorReason;

  constructor(reason: GoogleMapsLoadErrorReason, message: string) {
    super(message);
    this.name = "GoogleMapsLoadError";
    this.reason = reason;
  }
}

const SCRIPT_LOAD_TIMEOUT_MS = 10_000;
const CALLBACK_NAME = "__powerwashGoogleMapsLoaded";

let placesLibraryPromise: Promise<google.maps.PlacesLibrary> | null = null;

// The ambient @types/google.maps declarations describe `window.google` as
// always present, which is only true after the script has actually loaded.
// Cast to an optional shape here so this check reflects the real runtime
// state (the script may not have loaded yet) instead of TS's post-load view.
function getLoadedGoogleMaps() {
  return (window as unknown as { google?: { maps?: typeof google.maps } }).google?.maps;
}

function loadBaseScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (getLoadedGoogleMaps()?.importLibrary) {
      resolve();
      return;
    }

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      reject(new GoogleMapsLoadError("missing_key", "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set."));
      return;
    }

    const timeout = setTimeout(() => {
      reject(new GoogleMapsLoadError("load_failed", "Google Maps script load timed out."));
    }, SCRIPT_LOAD_TIMEOUT_MS);

    (window as unknown as Record<string, () => void>)[CALLBACK_NAME] = () => {
      clearTimeout(timeout);
      resolve();
    };

    const script = document.createElement("script");
    script.async = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&loading=async&callback=${CALLBACK_NAME}`;
    script.onerror = () => {
      clearTimeout(timeout);
      reject(new GoogleMapsLoadError("load_failed", "Google Maps script failed to load."));
    };

    document.head.appendChild(script);
  });
}

export function loadPlacesLibrary(): Promise<google.maps.PlacesLibrary> {
  if (placesLibraryPromise) {
    return placesLibraryPromise;
  }

  placesLibraryPromise = (async () => {
    try {
      await loadBaseScript();
      return (await google.maps.importLibrary("places")) as google.maps.PlacesLibrary;
    } catch (error) {
      // Reset so a later retry (e.g. after the network recovers) starts over
      // instead of replaying this rejection forever.
      placesLibraryPromise = null;

      if (error instanceof GoogleMapsLoadError) {
        throw error;
      }

      throw new GoogleMapsLoadError("places_unavailable", "Places library failed to load.");
    }
  })();

  return placesLibraryPromise;
}
