import React from 'react';

import './EmptyState.scss';
import './App.scss';

import { getTheme } from '../react-web-utils';

/**
 * Props:
 * - [optional] variant: "default" | "advanced-tool"
 * - [optional] iconPath
 * - [optional] lightIconPath
 * - [optional] darkIconPath
 * - [optional] title
 * - [optional] subtitle
 * - [optional] text
 * - [optional] className
 * - [optional] minHeight
 * - [optional] maxWidth
 */
function EmptyState({
  variant = 'default',
  iconPath,
  lightIconPath,
  darkIconPath,
  title,
  subtitle,
  text,
  className = '',
  minHeight,
  maxWidth,
}) {
  const isDark = getTheme() === 'dark';

  if (variant === 'advanced-tool') {
    const themedIconPath = isDark
      ? (darkIconPath || '/assets/advanced-tools-empty-state-dark.svg')
      : (lightIconPath || '/assets/advanced-tools-empty-state-light.svg');

    return (
      <div
        className={`${className} empty-state-container empty-state-container--advanced-tool`}
        style={{
          minHeight: minHeight || 600,
          maxWidth: maxWidth || 520,
        }}
      >
        <img
          src={themedIconPath}
          alt="Empty State"
          className="empty-state-image empty-state-image--advanced-tool"
        />

        <div className="empty-state-copy empty-state-copy--advanced-tool">
          <p className="text-style-body-semibold color-fig-default">
            {title || 'Nothing here yet'}
          </p>
          <p className="text-style-label-normal color-fig-subtle">
            {subtitle || 'Please check back later.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`${className} empty-state-container`}>
      <img
        src={iconPath || '/assets/trend-missing.svg'}
        alt="Empty State"
        className="empty-state-image"
      />
      <p className="text-style-h-4-normal color-fig-disabled">{text}</p>
    </div>
  );
}

export default EmptyState;