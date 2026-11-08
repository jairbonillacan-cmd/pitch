import React from 'react';

import './RadioGroup.scss'
import './App.scss'
import GlobalContext from './GlobalContext';
import * as RadixRadioGroup from '@radix-ui/react-radio-group';

/**
 * Props
 * - options: {key:string -> {text:string, annotation:string?}}
 * - onValueChange: fn(string)
 */
class RadioGroup extends React.Component {

    static contextType = GlobalContext;

    render() {
        return (
            <RadixRadioGroup.Root className='radio-group-root' onValueChange={this.props.onValueChange}>
                {
                    Object.keys(this.props.options).map((key) => {
                        const option = this.props.options[key];
                        return (
                            <div key={key} className='radio-group-item'>
                                <RadixRadioGroup.Item className='radio-group-indicator' value={key}>
                                    <div></div>
                                </RadixRadioGroup.Item>
                                <p className='text-style-label-normal'>{option.text}</p>
                                {
                                    option.annotation && (
                                        <p className='text-style-label-normal'>&nbsp;{option.annotation}</p>
                                    )
                                }
                            </div>
                        )
                    })
                }
            </RadixRadioGroup.Root>
        );
    }
}

export default RadioGroup;