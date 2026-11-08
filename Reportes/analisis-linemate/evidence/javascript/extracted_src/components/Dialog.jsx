import React from 'react';

import * as DialogPrimitives from '@radix-ui/react-dialog';

import './Dialog.scss'
import './App.scss'

/**
 * Custom Dialog implementation as a wrapper to the Radix Dialog primitive component
 * Props
 * - open:bool
 * - onOpenChange:fn(bool)
 * - trigger:ReactNode
 * - title:string
 * - content:ReactNode
 * - footer:ReactNode
 * - className:string?
 */
class Dialog extends React.Component {

  render() {
    const {title, content, trigger, footer} = this.props;
    return (
        <DialogPrimitives.Root open={this.props.open} onOpenChange={(open) => this.props.onOpenChange(open)}>
            <DialogPrimitives.Trigger asChild>
                {trigger}
            </DialogPrimitives.Trigger>
            <DialogPrimitives.Portal>
                <DialogPrimitives.Overlay className='dialog-overlay'>
                    <DialogPrimitives.Content
                        className={`dialog-container ${this.props.className ? this.props.className : ""}`}
                        onOpenAutoFocus={(event) => {
                            if (this.props.disableAutoFocus) {
                                event.preventDefault()
                            }
                        }}
                    >
                        {
                            title && (
                                <div className='dialog-container-header'>
                                    <p className='text-style-h-3-bold'>{title}</p>
                                    <img src='assets/close-icon.svg' alt="close" onClick={() => this.props.onOpenChange(false)}/>
                                </div>
                            )
                        }
                        <div className='dialog-container-content'>
                            {content}
                        </div>
                        {
                            footer && (
                                <div className='dialog-container-footer'>
                                    {footer}
                                </div>
                            )
                        }
                    </DialogPrimitives.Content>
                </DialogPrimitives.Overlay>
            </DialogPrimitives.Portal>
        </DialogPrimitives.Root>
    );
  }
}

export default Dialog;