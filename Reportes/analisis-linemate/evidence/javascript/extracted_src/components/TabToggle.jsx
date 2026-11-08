import React from 'react';

import './TabToggle.scss'
import './App.scss'

/**
 * Props
 * - options: {key:value}
 * - selection: string
 * - selectionHandler: fn(selection)
 * - includeLegend: bool    At a certain screen width this will be ignored and stop showing the legend
 * - onLegendOpen: fn()
 */
class TabToggle extends React.Component {

    render() {
        return (
            <div className="tab-toggle-container">
                <div className="tab-toggle-container-left">
                {
                    Object.keys(this.props.options).map((option) =>
                        <div key={option} className={this.props.selection === option ? "tab-toggle-container-left-selected" : ""} onClick={() => this.props.selectionHandler(option)}>
                            <p className='text-style-label-medium'>{this.props.options[option]}</p>
                        </div>
                    )
                }
                </div>
                <div className="tab-toggle-container-right" onClick={this.props.onLegendOpen}>
                    {
                        this.props.includeLegend && (
                            <p className='text-style-caption-medium'>Legend</p>
                        )
                    }
                </div>
            </div>
        );
    }
}

export default TabToggle;