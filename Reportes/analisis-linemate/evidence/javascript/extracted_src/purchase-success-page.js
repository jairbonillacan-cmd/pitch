import React from 'react';
import './fonts.css';
import HtmlHeaders from './html-headers';

class PurchaseSuccessPage extends React.Component {
  constructor(props) {
    super(props);
    const searchParams = new URLSearchParams(window.location.search);

    this.session = "";
    if (searchParams.has('session')) {
        this.session = searchParams.get('session');
    }
  }

  render() {
    return(
      <>
      <HtmlHeaders canonicalRef="https://www.linemate.io/success"/>
      Success, keep this identifier with you as a backup: {this.session}
      </>
    );
  }
}

export default PurchaseSuccessPage;
