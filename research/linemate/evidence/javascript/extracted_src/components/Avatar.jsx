import React from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

import './Avatar.scss';
// Re-using some of the input selection styling for the dropdown
import './InputSelection.scss';

const TYPOGRAPHY_CLASSES = {
    sm: 'text-style-caption-uppercase-semibold',
    md: 'text-style-label-semibold',
    lg: 'text-style-h-4-uppercase-semibold'
}

/**
 * Avatar will use up the entire available space of its parent container.
 * Props
 * - text: <>
 * - typography: sm|md|lg
 * - clickable: true|false
 * - menuItems: {displayText: fn()}
 */
class Avatar extends React.Component {

  render() {
    if (this.props.clickable) {
      return (
        <DropdownMenu.Root>
          <DropdownMenu.Trigger className='avatar-trigger'>
            <div className="avatar-container avatar-container-clickable">
              <div className='avatar-container-circle'>
                <p className={TYPOGRAPHY_CLASSES[this.props.typography]}>{this.props.text}</p>
              </div>
            </div>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className='input-selection-dropdown avatar-dropdown' sideOffset={4} align='end' alignOffset={8}>
              {(this.props.menuEntries || []).map((entry, index) => {
                if (entry.type === 'custom') {
                  return (
                    <DropdownMenu.Item
                      key={entry.key || `custom-row-${index}`}
                      className='input-selection-dropdown-item avatar-dropdown-item avatar-dropdown-item-static'
                      disabled
                      asChild
                    >
                      <div className='avatar-dropdown-custom-row'>
                        <p className="text-style-label-normal color-fig-default avatar-dropdown-item-text">
                          {entry.label}
                        </p>
                        <div className='avatar-dropdown-custom-row-control'>
                          {entry.content}
                        </div>
                      </div>
                    </DropdownMenu.Item>
                  )
                }

                return (
                  <DropdownMenu.Item
                    key={entry.key || entry.label || `menu-item-${index}`}
                    className='input-selection-dropdown-item avatar-dropdown-item'
                    onSelect={entry.onSelect}
                  >
                    <p className="text-style-label-normal input-selection-dropdown-item-text avatar-dropdown-item-text">
                      {entry.label}
                    </p>
                  </DropdownMenu.Item>
                )
              })}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      )
    }
    return (
      <div className="avatar-container">
        <div className='avatar-container-circle'>
          <p className={TYPOGRAPHY_CLASSES[this.props.typography]}>{this.props.text}</p>
        </div>
      </div>
    );
  }
}

export default Avatar;