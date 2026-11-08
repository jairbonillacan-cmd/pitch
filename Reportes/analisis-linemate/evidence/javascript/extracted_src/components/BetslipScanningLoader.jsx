import React, { useEffect, useMemo, useState } from 'react';
import './BetslipScanningLoader.scss';

const DEFAULT_ROTATING_MESSAGES = [
    'Reading picks',
    'Detecting odds',
    'Preparing results',
];

const DEFAULT_SIZE = 480;
const SCAN_LINE_HEIGHT = 4;
const MESSAGE_ROTATION_MS = 1800;
const FRAME_INSET = 24;
const DEFAULT_IMAGE_ASPECT_RATIO = 0.62;
const FRAME_MAX_WIDTH = 360;
const FRAME_MAX_HEIGHT = 348;
const IMAGE_FRAME_RADIUS = 10;
const OUTER_CONTAINER_RADIUS = IMAGE_FRAME_RADIUS + FRAME_INSET;
const CORNER_SIZE = 38;
const CORNER_OFFSET = 14;
const BRACKET_STROKE_WIDTH = 4;

function resolveObjectFit(imageResizeMode) {
    return imageResizeMode === 'stretch' ? 'fill' : imageResizeMode;
}

function getScaledValue(value, scale, minimum = 0) {
    return Math.max(Math.round(value * scale), minimum);
}

function getScannerFrame(aspectRatio, size) {
    const scale = size / DEFAULT_SIZE;
    const frameInset = getScaledValue(FRAME_INSET, scale, 12);
    const scanLineHeight = getScaledValue(SCAN_LINE_HEIGHT, scale, 2);
    const maxFrameWidth = getScaledValue(FRAME_MAX_WIDTH, scale, 240);
    const maxFrameHeight = getScaledValue(FRAME_MAX_HEIGHT, scale, 240);
    const maxImageWidth = maxFrameWidth - frameInset * 2;
    const maxImageHeight = maxFrameHeight - frameInset * 2;
    let imageWidth = maxImageWidth;
    let imageHeight = imageWidth / aspectRatio;

    if (imageHeight > maxImageHeight) {
        imageHeight = maxImageHeight;
        imageWidth = imageHeight * aspectRatio;
    }

    return {
        contentPadding: getScaledValue(24, scale, 16),
        cornerOffset: getScaledValue(CORNER_OFFSET, scale, 10),
        cornerSize: getScaledValue(CORNER_SIZE, scale, 28),
        frameHeight: Math.round(imageHeight + frameInset * 2),
        frameInset,
        frameRadius: getScaledValue(OUTER_CONTAINER_RADIUS, scale, 20),
        frameWidth: Math.round(imageWidth + frameInset * 2),
        imageHeight: Math.round(imageHeight),
        imageRadius: getScaledValue(IMAGE_FRAME_RADIUS, scale, 8),
        imageWidth: Math.round(imageWidth),
        loadingFontSize: getScaledValue(16, scale, 13),
        loadingMarginTop: getScaledValue(8, scale, 6),
        scanLineHeight,
        subtextFontSize: getScaledValue(20, scale, 16),
        subtextMarginTop: getScaledValue(20, scale, 14),
        subtextMinHeight: getScaledValue(32, scale, 24),
    };
}

function getCssVariables(frame, size) {
    return {
        '--scanner-size': `${size}px`,
        '--scanner-content-padding': `${frame.contentPadding}px`,
        '--scanner-corner-offset': `${frame.cornerOffset}px`,
        '--scanner-corner-size': `${frame.cornerSize}px`,
        '--scanner-frame-height': `${frame.frameHeight}px`,
        '--scanner-frame-inset': `${frame.frameInset}px`,
        '--scanner-frame-radius': `${frame.frameRadius}px`,
        '--scanner-frame-width': `${frame.frameWidth}px`,
        '--scanner-image-height': `${frame.imageHeight}px`,
        '--scanner-image-radius': `${frame.imageRadius}px`,
        '--scanner-image-width': `${frame.imageWidth}px`,
        '--scanner-loading-font-size': `${frame.loadingFontSize}px`,
        '--scanner-loading-margin-top': `${frame.loadingMarginTop}px`,
        '--scanner-scan-line-height': `${frame.scanLineHeight}px`,
        '--scanner-scan-travel': `${Math.max(frame.imageHeight - frame.scanLineHeight, 0)}px`,
        '--scanner-subtext-font-size': `${frame.subtextFontSize}px`,
        '--scanner-subtext-margin-top': `${frame.subtextMarginTop}px`,
        '--scanner-subtext-min-height': `${frame.subtextMinHeight}px`,
    };
}

function CornerBracket({ position }) {
    return (
        <svg
            aria-hidden="true"
            className={`betslip-scanning-loader__corner betslip-scanning-loader__corner--${position}`}
            focusable="false"
            viewBox="0 0 38 38"
        >
            <path
                d="M 36 2 H 13 Q 2 2 2 13 V 36"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={BRACKET_STROKE_WIDTH}
            />
        </svg>
    );
}

export default function BetslipScanningLoader({
    imageUri,
    ariaLabel,
    className,
    imageAlt = '',
    imageAspectRatio = DEFAULT_IMAGE_ASPECT_RATIO,
    imageResizeMode = 'contain',
    loadingText = 'Scanning your betslip...',
    rotatingMessages = DEFAULT_ROTATING_MESSAGES,
    showRotatingMessages = true,
    size = DEFAULT_SIZE,
    style,
    theme = 'dark',
}) {
    const [resolvedAspectRatio, setResolvedAspectRatio] = useState(
        imageAspectRatio || DEFAULT_IMAGE_ASPECT_RATIO
    );
    const [messageIndex, setMessageIndex] = useState(0);

    useEffect(() => {
        setResolvedAspectRatio(imageAspectRatio || DEFAULT_IMAGE_ASPECT_RATIO);
    }, [imageAspectRatio]);

    useEffect(() => {
        let isActive = true;
        const image = new window.Image();

        image.onload = () => {
            if (!isActive || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
                return;
            }

            setResolvedAspectRatio(image.naturalWidth / image.naturalHeight);
        };

        image.onerror = () => {
            if (isActive) {
                setResolvedAspectRatio((current) => current || DEFAULT_IMAGE_ASPECT_RATIO);
            }
        };

        image.src = imageUri;

        return () => {
            isActive = false;
        };
    }, [imageUri]);

    const normalizedMessages = useMemo(() => {
        if (!showRotatingMessages) {
            return [];
        }

        const filteredMessages = rotatingMessages.filter(Boolean);
        return filteredMessages.length > 0
            ? filteredMessages
            : DEFAULT_ROTATING_MESSAGES;
    }, [rotatingMessages, showRotatingMessages]);

    useEffect(() => {
        setMessageIndex(0);
    }, [normalizedMessages]);

    useEffect(() => {
        if (normalizedMessages.length <= 1) {
            return undefined;
        }

        const rotation = window.setInterval(() => {
            setMessageIndex((current) => (current + 1) % normalizedMessages.length);
        }, MESSAGE_ROTATION_MS);

        return () => window.clearInterval(rotation);
    }, [normalizedMessages]);

    const frame = useMemo(
        () => getScannerFrame(resolvedAspectRatio || DEFAULT_IMAGE_ASPECT_RATIO, size),
        [resolvedAspectRatio, size]
    );

    const rootClassName = [
        'betslip-scanning-loader',
        `betslip-scanning-loader--${theme}`,
        className,
    ]
        .filter(Boolean)
        .join(' ');

    const rootStyle = {
        ...getCssVariables(frame, size),
        ...style,
    };

    return (
        <div
            aria-label={ariaLabel || loadingText}
            aria-live="polite"
            className={rootClassName}
            role="status"
            style={rootStyle}
        >
            <div className="betslip-scanning-loader__content">
                <div className="betslip-scanning-loader__frame">
                    <div className="betslip-scanning-loader__image-inset">
                        <img
                            alt={imageAlt}
                            className="betslip-scanning-loader__image"
                            src={imageUri}
                            style={{ objectFit: resolveObjectFit(imageResizeMode) }}
                        />

                        <div
                            aria-hidden="true"
                            className="betslip-scanning-loader__image-overlay"
                        />

                        <div
                            aria-hidden="true"
                            className="betslip-scanning-loader__scan-line"
                        >
                            <div className="betslip-scanning-loader__scan-line-glow" />
                            <div className="betslip-scanning-loader__scan-line-core" />
                        </div>
                    </div>

                    <CornerBracket position="top-left" />
                    <CornerBracket position="top-right" />
                    <CornerBracket position="bottom-left" />
                    <CornerBracket position="bottom-right" />
                </div>

                {normalizedMessages.length > 0 ? (
                    <div className="betslip-scanning-loader__subtext-wrap">
                        <span
                            className="betslip-scanning-loader__subtext"
                            key={normalizedMessages[messageIndex]}
                        >
                            {normalizedMessages[messageIndex]}
                        </span>
                    </div>
                ) : null}

                <div className="betslip-scanning-loader__loading-text">
                    {loadingText}
                </div>
            </div>
        </div>
    );
}