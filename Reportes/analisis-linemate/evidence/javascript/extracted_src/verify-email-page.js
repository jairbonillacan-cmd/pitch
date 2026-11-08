import React from 'react';
import { isFieldEmpty } from './linemate-react-common/src/util.js';
import { DEFAULT_ORIGIN_REDIRECT } from './linemate-react-common/src/constants.js';
import {API_HOST} from './react-web-constants.js';
import './fonts.css';
import './generic.css';
import HtmlHeaders from './html-headers.js';

const STATUS_LOADING = 'LOADING';
const STATUS_VERIFIED = 'VERIFIED';
const STATUS_ERROR = 'ERROR';
const STATUS_EXPIRED = 'EXPIRED';

class VerifyEmailPage extends React.Component {
  constructor(props) {
    super(props);

    this.resendEmailVerification = this.resendEmailVerification.bind(this);

    const searchParams = new URLSearchParams(window.location.search);

    this.email = "";
    if (searchParams.has('email')) {
      this.email = searchParams.get('email');
    }
    this.code = "";
    if (searchParams.has('code')) {
      this.code = searchParams.get('code');
    }

    this.state = {
        status: STATUS_LOADING
    }
  }

  componentDidMount() {
    // Used to remove the pseudo element :before which pushes the content down in most pages to allow for the navbar
    // In this case we don't use the navbar so we don't want it
    document.body.classList.remove('push');
    if (isFieldEmpty(this.email) || isFieldEmpty(this.code)) {
        this.redirectUser();
    }

    fetch(`${API_HOST}/api/users/verifyEmail?email=${encodeURIComponent(this.email)}&hash=${this.code}`, {method: 'PUT'})
    .then((response) => {
        switch (response.status) {
            case 200:
                this.setState({status: STATUS_VERIFIED});
                break;
            case 400:
                this.setState({status: STATUS_EXPIRED});
                break;
            case 404:
                // In reality this is a mismatch between email and hash (either user not found based on email or hash doesn't match the user that was found)
                this.setState({status: STATUS_ERROR});
                break;
            default:
                this.setState({status: STATUS_ERROR});
                break;
        }
    })
    .catch(error => {
            console.log("Error verifying email: ", error);
            console.log(error.stack);
            this.setState({status: STATUS_ERROR});
        }
    );
  }

  redirectUser() {
    window.location.href = DEFAULT_ORIGIN_REDIRECT;
  }

  resendEmailVerification() {
    fetch(`${API_HOST}/api/users/sendEmailVerificationCode?email=${encodeURIComponent(this.email)}`, {method: 'PUT'})
    .then((response) => {

    })
    .catch(error => {
            console.log("Error sending verification email: ", error);
            console.log(error.stack);
            this.setState({status: STATUS_ERROR});
        }
    );
  }

  render() {
    return (
        <>
            <HtmlHeaders canonicalRef="https://www.linemate.io/verify-email"/>
            <img class="authentication-hero-image absolute" src="assets/authentication/hero-big.jpg" alt=""/>
            <div class="authentication-hero">
                <a href="https://linemate.io">
                    <img src="assets/logo-white-nobg.svg" alt=""/>
                </a>
                <div class="authentication-full-header">
                    <p class="font white size-64 weight-800 spaced-negative-low" style={{marginTop: "20%"}} >Start your research with Linemate.</p>
                </div>
                <div class="authentication-mobile-header">
                    <p class="font white size-30 weight-700 spaced-negative-low" style={{marginTop: "20%"}} >Start your research with Linemate.</p>
                </div>
            </div>
            <div class="authentication-content">
                {
                    this.state.status === STATUS_LOADING ?
                    <p class="font size-36 weight-700 dark full-width align-center" style={{marginBottom: '24px', display: 'flex'}}>Verifying...</p>
                    :
                    <></>
                }
                                {
                    this.state.status === STATUS_ERROR ?
                    <p class="font size-36 weight-700 dark full-width align-center" style={{marginBottom: '24px', display: 'flex'}}>Something went wrong, please try again later</p>
                    :
                    <></>
                }
                {
                    this.state.status === STATUS_EXPIRED ? 
                    <>
                        <p class="font size-36 weight-700 dark display-block full-width" style={{marginBottom: '24px'}}>Verification link expired</p>
                        <p class="font size-16 dark full-width align-center">The verification link you followed is no longer valid. This is because the link has expired. You can request a new one below.</p>
                        <button type="button" class="generic-button anchor-button-primary" onClick={this.resendEmailVerification} style={{marginTop: '32px', marginBottom: '16px'}}>
                            Send new verification email
                        </button>
                        <a href="mailto:support@linemate.io" class="font size-14 green display-block full-width align-center">Need help? Contact us</a>
                    </>
                    :
                    <></>
                }
                {
                    this.state.status === STATUS_VERIFIED ?
                    <>
                        <p class="font size-36 weight-700 dark full-width align-center">Your email has been verified</p>
                        <button type="button" class="generic-button anchor-button-primary" onClick={this.redirectUser} style={{marginTop: '32px', marginBottom: '16px'}}>
                            Go to Gameday
                        </button>
                    </>
                    :
                    <>
                    </>
                }
            </div>
        </>
    )
  }
}

export default VerifyEmailPage;
