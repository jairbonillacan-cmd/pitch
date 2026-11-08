import React from 'react';
import { Helmet, HelmetData } from 'react-helmet-async';

const helmetData = new HelmetData({});

/**
 * Props:
 * - canonicalRef
 */
class HtmlHeaders extends React.Component {
  constructor(props) {
    super(props);
  }

  render() {
    return(
        <Helmet helmetData={helmetData}>
            <link rel="canonical" href={this.props.canonicalRef} />
        </Helmet>
    );
  }
}

export default HtmlHeaders;
