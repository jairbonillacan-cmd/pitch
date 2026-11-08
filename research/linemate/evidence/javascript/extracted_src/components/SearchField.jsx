import React from 'react';

import './SearchField.scss'
import '../components/App.scss'

/**
 * Props:
 * - placeholder: string
 * - defaultValue: string
 * - onInput: fn(event)
 * - inputRef
 * - textStyleClass
 */
class SearchField extends React.Component {

    render() {
        return (
            <div className='search-field'>
                <img src='assets/search.svg' alt="search"/>
                <input ref={this.props.inputRef} name='search-field' className={this.props.textStyleClass ?? 'text-style-body-normal'} defaultValue={this.props.defaultValue} onInput={this.props.onInput} type="text" placeholder={this.props.placeholder}/>
            </div>
        )
    }

}

export default SearchField;