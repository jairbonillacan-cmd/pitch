const LOCATION_CACHE_TTL_MS = 60 * 60 * 1000;

function normalizeLocationPart(part) {
  const value = part && typeof part === 'object' && !Array.isArray(part) ? part : {};
  return {
    ...value,
    code: typeof value.code === 'string' && value.code.trim() ? value.code : null,
    name: typeof value.name === 'string' ? value.name : null,
  };
}

export function normalizeLocation(location) {
  const value = location && typeof location === 'object' && !Array.isArray(location) ? location : {};
  // Keep unknown regions unknown, rather than substituting a country code.
  // UI consumers can safely read location.country.code / location.region.code.
  return {
    ...value,
    country: normalizeLocationPart(value.country),
    region: normalizeLocationPart(value.region),
  };
}

export async function fetchCurrentLocation(apiHost, fetcher = fetch, timeoutMs = 4000) {
  const controller = new AbortController();
  let timeout;
  try {
    return await Promise.race([
      fetcher(`${apiHost}/api/localization/v1/getCurrentLocation`, {
        cache: 'no-store',
        signal: controller.signal,
      })
        .then(response => response.ok ? response.json() : null)
        .catch(() => null),
      new Promise(resolve => {
        timeout = setTimeout(() => {
          controller.abort();
          resolve(null);
        }, timeoutMs);
      }),
    ]);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// Both product localization and privacy use the same cached result. Never
// extend an entry's expiry on a cache hit or fall back to an expired location.
export async function loadCachedLocation(databaseWrapper, fetchLocation, skipFetch = false) {
  try {
    const cached = await databaseWrapper.getDataById('location');
    const cachedLocation = normalizeLocation(cached?.value);
    // A known country with an unresolved region is still a usable location.
    // In particular, an unknown U.S. state continues to select strict opt-in.
    if (cachedLocation.country.code
      && Number.isFinite(cached.expiration) && cached.expiration >= Date.now()) {
      return cachedLocation;
    }
  } catch {
    // A cache read failure still allows the normal location request.
  }

  if (skipFetch) return null;

  let location;
  try {
    location = normalizeLocation(await fetchLocation());
  } catch {
    return null;
  }
  if (!location.country.code) return null;

  try {
    await databaseWrapper.addData({
      version: 1,
      expiration: Date.now() + LOCATION_CACHE_TTL_MS,
      value: location,
    }, 'location');
  } catch {
    // The fetched location remains usable when browser storage is unavailable.
  }
  return location;
}
