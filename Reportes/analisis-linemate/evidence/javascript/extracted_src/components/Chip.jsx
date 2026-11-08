import React from 'react';

import './Chip.scss'
import './App.scss'

const SIZE_CLASSES = {
    'sm': 'text-style-label-normal',
    'lg': 'text-style-body-normal'
}

/**
 * Props
 * - text:string
 * - size:string        sm|md
 * - selected:boolean   
 * - onClick:fn()
 */
class Chip extends React.Component {

  render() {
    return (
        <div
            className={`chip-wrapper chip-wrapper-${this.props.size} ${this.props.variant === 'pill' ? 'chip-wrapper-pill' : ''} ${this.props.selected ? 'chip-wrapper-selected' : ''}`}
            onClick={this.props.onClick}
        >
            <p className={this.props.variant === 'pill' ? 'text-style-body-medium' : SIZE_CLASSES[this.props.size]}>
                {this.props.text}
            </p>
        </div>
    );
  }
}

export default Chip;