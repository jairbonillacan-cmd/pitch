import { useEffect, useRef } from 'react';

const DEFAULT_VISIBLE_RATIO = 0.5;
const DEFAULT_MINIMUM_VIEW_TIME_MS = 1000;

/**
 * Tracks impressions for a single DOM element using viewport intersection.
 *
 * How it works:
 * - Attach the returned ref to the element that represents the placement.
 * - Once the element is at least `visibleRatioThreshold` visible, we start a
 *   dwell timer.
 * - If it stays above that threshold for `minimumViewTimeMs`, `onImpression`
 *   fires once for that visible stint.
 * - After the element drops below the threshold, the hook re-arms so a later
 *   re-entry can count as a new impression.
 * - If `resetKey` changes, the hook resets its internal state so content that
 *   swapped in-place can earn a fresh impression without requiring the DOM
 *   node itself to unmount.
 *
 */
function useImpressionTracker({
    enabled = true,
    resetKey,
    visibleRatioThreshold = DEFAULT_VISIBLE_RATIO,
    minimumViewTimeMs = DEFAULT_MINIMUM_VIEW_TIME_MS,
    onImpression
} = {}) {
    const elementRef = useRef(null);
    const onImpressionRef = useRef(onImpression);
    const observerRef = useRef(null);
    const impressionTimeoutRef = useRef(null);
    const isAboveThresholdRef = useRef(false);
    const hasImpressedForCurrentVisibilityRef = useRef(false);

    useEffect(() => {
        onImpressionRef.current = onImpression;
    }, [onImpression]);

    useEffect(() => {
        if (impressionTimeoutRef.current) {
            clearTimeout(impressionTimeoutRef.current);
            impressionTimeoutRef.current = null;
        }
        isAboveThresholdRef.current = false;
        hasImpressedForCurrentVisibilityRef.current = false;
    }, [resetKey]);

    useEffect(() => {
        const clearImpressionTimeout = () => {
            if (impressionTimeoutRef.current) {
                clearTimeout(impressionTimeoutRef.current);
                impressionTimeoutRef.current = null;
            }
        };

        const handleVisibilityChange = (isVisibleEnough) => {
            if (!enabled) {
                clearImpressionTimeout();
                isAboveThresholdRef.current = false;
                hasImpressedForCurrentVisibilityRef.current = false;
                return;
            }

            if (!isVisibleEnough) {
                clearImpressionTimeout();
                isAboveThresholdRef.current = false;
                hasImpressedForCurrentVisibilityRef.current = false;
                return;
            }

            // Only start one dwell timer while the placement remains above the
            // threshold, and do not re-log until it has left view again.
            if (hasImpressedForCurrentVisibilityRef.current || isAboveThresholdRef.current) {
                return;
            }

            isAboveThresholdRef.current = true;
            clearImpressionTimeout();
            impressionTimeoutRef.current = setTimeout(() => {
                impressionTimeoutRef.current = null;

                if (!enabled || !isAboveThresholdRef.current || hasImpressedForCurrentVisibilityRef.current) {
                    return;
                }

                hasImpressedForCurrentVisibilityRef.current = true;
                onImpressionRef.current?.();
            }, minimumViewTimeMs);
        };

        if (!enabled || typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') {
            clearImpressionTimeout();
            return () => clearImpressionTimeout();
        }

        if (observerRef.current) {
            observerRef.current.disconnect();
        }

        observerRef.current = new IntersectionObserver(
            (entries) => {
                const entry = entries[0];
                if (!entry) {
                    return;
                }

                // Treat the placement as eligible only when enough of its area
                // is inside the viewport, not just barely intersecting it.
                const isVisibleEnough = entry.isIntersecting && entry.intersectionRatio >= visibleRatioThreshold;
                handleVisibilityChange(isVisibleEnough);
            },
            {
                threshold: [visibleRatioThreshold]
            }
        );

        const currentElement = elementRef.current;
        if (currentElement) {
            observerRef.current.observe(currentElement);
        }

        const handleDocumentVisibilityChange = () => {
            if (document.hidden) {
                // Cancel any pending impression if the browser tab is hidden so
                // background tabs do not continue accumulating dwell time.
                handleVisibilityChange(false);
            }
        };

        document.addEventListener('visibilitychange', handleDocumentVisibilityChange);

        return () => {
            clearImpressionTimeout();
            observerRef.current?.disconnect();
            observerRef.current = null;
            document.removeEventListener('visibilitychange', handleDocumentVisibilityChange);
        };
    }, [enabled, minimumViewTimeMs, resetKey, visibleRatioThreshold]);

    return elementRef;
}

export default useImpressionTracker;
