import React from "react"
import './InformationalBanner.scss'
import './App.scss'
import GlobalContext from './GlobalContext';

const ASSET_MAPPING = {
    info: 'info',
    warning: 'warning',
    critical: 'critical'
}

/**
 * Props:
 * - severity: info|warning|critical
 * - text: content of the banner
 * - onDismiss: function handling the dismiss action
 */
class InformationalBanner extends React.Component {
    
    static contextType = GlobalContext;

    render() {
        const severity = this.props.severity && this.props.severity in ASSET_MAPPING ? this.props.severity : 'info'
        return (
            <div className={`information-banner information-banner-${severity}`}>
                <div>
                    <img className="information-banner-icon" src={`assets/${ASSET_MAPPING[severity]}.svg`} alt={severity}/>
                    <p className="text-style-label-medium color-fig-default">{this.props.text}</p>
                </div>
                {
                    this.props.onDismiss && (
                        <img className="information-banner-close" src='assets/close.svg' alt='close' onClick={this.props.onDismiss}/>
                    )
                }
            </div>
        )
    }
}

export default InformationalBanner