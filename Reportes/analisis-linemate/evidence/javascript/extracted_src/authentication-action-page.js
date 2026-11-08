import React from 'react';
import PasswordResetAction from './pages/PasswordResetAction.jsx';
import {validateEmail, isAlphaNumeric, stringPresent, isFieldEmpty} from './linemate-react-common/src/util.js';
import {DEFAULT_ORIGIN_REDIRECT} from './linemate-react-common/src/constants.js';
import {auth} from './firebase.js';

import './fonts.css';
import './generic.css';

class AuthenticationActionPage extends React.Component {
  constructor(props) {
    super(props);

    const searchParams = new URLSearchParams(window.location.search);

    // resetPassword
    this.action = "";
    if (searchParams.has('mode')) {
      this.action = searchParams.get('mode');
    }
    this.actionCode = "";
    if (searchParams.has('oobCode')) {
      this.actionCode = searchParams.get('oobCode');
    }
  }

  componentDidMount() {
    if (isFieldEmpty(this.actionCode)) {
        this.redirectUser();
    }
    switch(this.action) {
        case "resetPassword":
            document.title = 'Password Reset Confirmation - Linemate';
            break;
        default:
            this.redirectUser();
            break;
    }
    // Used to remove the pseudo element :before which pushes the content down in most pages to allow for the navbar
    // In this case we don't use the navbar so we don't want it
    document.body.classList.remove('push');

    if (this.props.currentUser) {
        this.redirectUser();    
    }
  }

  redirectUser() {
    window.location.href = DEFAULT_ORIGIN_REDIRECT;
  }

  render() {
    switch(this.action) {
        case "resetPassword":
            return(<PasswordResetAction code={this.actionCode}/>);
            break;
        default:
            this.redirectUser();
            break;
    }
  }
}

export default AuthenticationActionPage;
