import React from 'react';

import './fonts.css';
import './generic.css';
import './initials-image.css';

// Bit hacky implementation, should consider re-doing
class InitialsImage extends React.Component {
  constructor(props) {
    super(props);
  }

  render() {
    var containerStyle = {};
    var textStyle = {};
    if (this.props.textColor) {
      textStyle['color'] = this.props.textColor;
    }
    if (this.props.backgroundColor) {
      containerStyle['background'] = this.props.backgroundColor;
    }
    const textClass = this.props.textClass || "";
    return(
        <div className="initials-image-container" style={containerStyle}>
            <p className={`font size-${this.props.fontSize || "18"} uppercase ${textClass}`} style={textStyle}>
              {`${this.props.firstLetter || ""}${this.props.secondLetter || ""}`}
            </p>
        </div>
    );
  }
}

export default InitialsImage;
