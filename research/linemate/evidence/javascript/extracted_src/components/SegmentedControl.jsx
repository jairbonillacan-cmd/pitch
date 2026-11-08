import React from 'react'

import './SegmentedControl.scss'
import './App.scss'

/**
 * Props
 * - options: {key: displayName|ReactNode}
 * - selection: string
 * - selectionHandler: fn(string)
 * - fillWidth: bool
 * - contentType: text|icon
 */
class SegmentedControl extends React.Component {
  render() {
    const controlsCount = Object.keys(this.props.options).length
    const contentType = this.props.contentType || 'text'

    return (
      <div
        className={`segmented-control-wrapper segmented-control-wrapper-${contentType}`}
        style={{ width: this.props.fillWidth ? '100%' : 'auto' }}>
        {Object.keys(this.props.options).map((option, index) => {
          const selectedOption = option === this.props.selection
          const addSeparator =
            index > 0 &&
            controlsCount > 2 &&
            !selectedOption &&
            Object.keys(this.props.options)[index - 1] !== this.props.selection

          return (
            <div
              key={option}
              style={{ padding: this.props.fillWidth ? 0 : undefined }}
              className={`clickable segmented-control segmented-control-${contentType} ${selectedOption ? 'segmented-control-selection' : ''} ${addSeparator ? 'segmented-control-selection-separated' : ''}`}
              onClick={() => this.props.selectionHandler(option)}>
              {contentType === 'icon' ? (
                <div className='segmented-control-icon-content'>
                  {this.props.options[option]}
                </div>
              ) : (
                <p
                  className={`${selectedOption ? 'text-style-label-semibold color-fig-default' : 'text-style-label-medium color-fig-subtle'}`}>
                  {this.props.options[option]}
                </p>
              )}
            </div>
          )
        })}
      </div>
    )
  }
}

export default SegmentedControl