// client/src/utils/image.js
//
// Image helpers for CONTRACT.md §7 R7.
//
// getImage(image):
//   - empty/missing input  -> the placeholder image, prefixed with VITE_STORAGE_URL
//   - a `blob:` URL        -> passed through untouched (it is already a full,
//                             locally-valid object URL; prefixing it would break it)
//   - anything else        -> prefixed with VITE_STORAGE_URL
//
// errorImage(event):
//   - an <img onError> handler that swaps the broken image for the same placeholder.

// Falls back to this repo's own .env.example value when VITE_STORAGE_URL is not
// available (e.g. running under plain Node, before Vite injects import.meta.env).
const DEFAULT_STORAGE_URL = 'http://localhost:5000/storage/';

const PLACEHOLDER_PATH = 'default/images/hero-placeholder.jpg';

function storageBaseUrl() {
  if (
    typeof import.meta !== 'undefined' &&
    import.meta.env &&
    import.meta.env.VITE_STORAGE_URL
  ) {
    return import.meta.env.VITE_STORAGE_URL;
  }
  return DEFAULT_STORAGE_URL;
}

function joinStorageUrl(relativePath) {
  const base = storageBaseUrl();
  const normalisedBase = base.endsWith('/') ? base : `${base}/`;
  const normalisedPath = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
  return `${normalisedBase}${normalisedPath}`;
}

export function getImage(image) {
  if (!image) {
    return joinStorageUrl(PLACEHOLDER_PATH);
  }
  if (typeof image === 'string' && image.startsWith('blob:')) {
    return image;
  }
  return joinStorageUrl(image);
}

export function errorImage(event) {
  const target = event && event.target;
  if (!target) return;
  // Prevent an infinite loop if the placeholder itself ever fails to load.
  target.onerror = null;
  target.src = joinStorageUrl(PLACEHOLDER_PATH);
}
