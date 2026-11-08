import React from 'react';
import { Buffer } from 'buffer';

/**
 * Dummy component to act as a redirect bridge for a secondary window
 * This is to dodge the effects of adblock preventing a new tab from being opened with the affiliate link
 * Instead what we will be doing is opening up this page which adblock shouldn't interfer with, 
 *  passing in the encoded url we want to get to (encoded in order to avoid adblock's detection of links with certain patterns like *ads*) 
 *  and then redirecting the user to the link within the same page which adblock shouldn't stop
 */
class AffiliateRedirect extends React.Component {
  constructor(props) {
    super(props);

    const searchParams = new URLSearchParams(window.location.search);

    // By default redirect to home if we don't have a link provided
    this.redirect = "/";
    if (searchParams.has('link')) {
      const decodedLink = Buffer.from(searchParams.get('link'), 'base64').toString('utf-8');
      this.redirect = /^https?:\/\//i.test(decodedLink)
        ? decodedLink
        : `https://${decodedLink}`;
    }
  }

  componentDidMount() {
    // This is needed to fool adblock. If we do it on page load it will block it
    setTimeout(() => window.location.href = this.redirect, 500);
  }

  // TODO: check with johnson if we can have a 'redirecting...' page design
  render() {
    return (<></>)
  }
}

export default AffiliateRedirect;