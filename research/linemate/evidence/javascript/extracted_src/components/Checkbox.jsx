import React from 'react';

import './Checkbox.scss'
import './App.scss'
/**
 * Props
 * - checked:bool
 * - onClick:fn()
 */
class Checkbox extends React.Component {

  render() {
    return (
        <div className={`checkbox-component ${this.props.checked ? "checkbox-component-checked" : ""}`} onClick={this.props.onClick}>
            {this.props.checked && <img src='assets/check.svg' alt="check"/>}
        </div>
    );
  }
}

export default Checkbox;