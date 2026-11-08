import { useState, useEffect } from 'react'
import * as DialogPrimitives from '@radix-ui/react-dialog';
import './BasicDialog.scss'

function BasicDialog({open, onOpenChange, content, additionalClassName}) {
    return (
        <>
            <DialogPrimitives.Root open={open} onOpenChange={(open) => onOpenChange(open)}>
                <DialogPrimitives.Portal>
                    <DialogPrimitives.Overlay className='dialog-overlay'>
                        <DialogPrimitives.Content className={`dialog-container ${additionalClassName ? additionalClassName : ""}`}>
                            {content}
                        </DialogPrimitives.Content>
                    </DialogPrimitives.Overlay>
                </DialogPrimitives.Portal>
            </DialogPrimitives.Root>
        </>
    )
}

export default BasicDialog;