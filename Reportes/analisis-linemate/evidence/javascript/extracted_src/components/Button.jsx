import React from 'react';

import './Button.scss'
import './App.scss'

const TYPOGRAPHY_CLASSES = {
    sm: 'text-style-caption-medium',
    md: 'text-style-label-medium',
    lg: 'text-style-body-medium',
    xl: 'text-style-h-4-medium'
}

const TYPE_CLASSES = {
    primary: 'button-primary',
    secondary: 'button-secondary',
    invisible: 'button-invisible',
    destructive: 'button-destructive'
}

// TODO: should we change this to have children instead of accepting text and icon?
/**
 * Button will use up the entire available space of its parent container.
 * Either text or icon should be provided. They are mutually exclusive.
 * Props
 * - text: <>
 * - icon: <icon asset path>
 * - typography: sm|md|lg|xl
 * - type: primary|secondary|invisible|destructive
 * - enabled: true|false
 * - onClick: fn(), mutually exclusive with href
 * - href: mutually exclusive with onClick
 * - className: added classes to be applied
 */
class Button extends React.Component {

  constructor(props) {
    super(props)

    this.getContent = this.getContent.bind(this)
  }

  // A bit of a hack allowing us to use the button as a Radix Dialog trigger which calls the focus() function of the trigger content when dismissing the dialog via a click on the overlay
  focus() {}

  getContent() {
    return (
      <>
        {/* TODO: revisit iconLeft and remove it in favor of just icon */}
        {
          this.props.iconLeft && (<img style={this.props.iconLeftStyle} src={this.props.iconLeft} alt=""/>)
        }
        {
          this.props.icon && (<img src={this.props.icon} alt=""/>)
        }
        {
          this.props.text && (<p className={TYPOGRAPHY_CLASSES[this.props.typography]}>{this.props.text}</p>)
        }
      </>
    )
  }

  render() {
    const buttonProps = {
      className: `button-container ${TYPE_CLASSES[this.props.type]}${!this.props.enabled ? "-disabled" : ""} ${this.props.className || ""}`
    }
    if (this.props.enabled) {
      buttonProps.onClick = this.props.onClick
      buttonProps.href = this.props.href
    }
    if (this.props.href) {
      return (
        <a {...buttonProps}>
          {this.getContent()}
        </a>
      )
    }
    return (
      <div {...buttonProps}>
        {this.getContent()}
      </div>
    )
  }
}

export default Button;