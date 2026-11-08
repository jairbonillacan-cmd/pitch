import React from 'react';

import './Login.scss';
import '../components/App.scss';

import Button from '../components/Button';
import HtmlHeaders from '../html-headers';
import { auth } from '../firebase.js';
import { DEFAULT_ORIGIN_REDIRECT } from '../linemate-react-common/src/constants.js';
import { isFieldEmpty, validateEmail } from '../linemate-react-common/src/util.js';
import { withTranslation } from 'react-i18next';

class ForgotPassword extends React.Component {
  constructor(props) {
    super(props);

    this.emailRef = React.createRef();

    this.inputOnKeyUp = this.inputOnKeyUp.bind(this);
    this.submitReset = this.submitReset.bind(this);
    this.redirectUser = this.redirectUser.bind(this);

    this.state = {
      formFilled: false,
      resetInProgress: false,
      resetSent: false,
      submittedEmail: '',
      errorMessage: null
    };
  }

  componentDidMount() {
    document.title = `${this.props.t('web.auth.passwordReset.forgotTitle')} - Linemate`;

    auth.onAuthStateChanged((user) => {
      if (user) {
        this.redirectUser();
      }
    });
  }

  componentDidUpdate() {
    if (this.props.user) {
      this.redirectUser();
    }
  }

  redirectUser() {
    window.location.href = DEFAULT_ORIGIN_REDIRECT;
  }

  inputOnKeyUp(event) {
    event.preventDefault();

    const email = this.emailRef.current.value || '';

    this.setState({
      formFilled: !isFieldEmpty(email),
      errorMessage: null
    });

    if (event.keyCode === 13 && !isFieldEmpty(email)) {
      this.submitReset();
    }
  }

  submitReset() {
    const email = this.state.resetSent
      ? this.state.submittedEmail
      : this.emailRef.current.value || '';

    if (!validateEmail(email) || isFieldEmpty(email)) {
      this.setState({ errorMessage: this.props.t('auth.signup.alerts.emailInvalid') });
      return;
    }

    this.setState({ resetInProgress: true, errorMessage: null }, () => {
      auth.sendPasswordResetEmail(email)
        .then(() => {
          this.setState({
            resetInProgress: false,
            resetSent: true,
            submittedEmail: email
          });
        })
        .catch(() => {
          this.setState({
            resetInProgress: false,
            errorMessage: this.props.t('web.auth.passwordReset.sendError')
          });
        });
    });
  }

  render() {
    const { t } = this.props;
    const title = this.state.resetSent
      ? t('web.auth.passwordReset.resetTitle')
      : t('web.auth.passwordReset.forgotTitle');
    const subtext = this.state.resetSent
      ? t('web.auth.passwordReset.sentInstructions')
      : t('web.auth.passwordReset.instructions');

    return (
      <>
        <HtmlHeaders canonicalRef="https://www.linemate.io/password-reset" />
        <div className="login-page-container">
          <a href="/">
            <img src="assets/linemate-logo.svg" alt="linemate-logo" />
          </a>

          <p className="text-style-h-1-bold login-page-title">{title}</p>

          <div className="login-page-no-account-signup forgot-password-page-subtext">
            <p className="text-style-body-normal">{subtext}</p>
          </div>

          <div className="login-page-form">
            {this.state.errorMessage && (
              <p className="text-style-caption-normal login-page-error">{this.state.errorMessage}</p>
            )}

            {!this.state.resetSent && (
              <>
                <p className="text-style-label-medium login-page-email">{t('common.labels.email')}</p>
                <input
                  ref={this.emailRef}
                  className="text-style-body-normal"
                  onKeyUp={this.inputOnKeyUp}
                  type="email"
                  disabled={this.state.resetInProgress}
                />
              </>
            )}

            <div className="login-page-login-button-wrapper">
              <Button
                text={this.state.resetSent ? t('web.auth.passwordReset.resendInstructions') : t('web.auth.passwordReset.sendInstructions')}
                typography="lg"
                type={this.state.resetSent ? 'secondary' : 'primary'}
                enabled={(this.state.formFilled || this.state.resetSent) && !this.state.resetInProgress}
                onClick={this.submitReset}
              />
            </div>

            <div className="login-page-login-button-wrapper">
              <Button
                text={this.state.resetSent ? t('web.auth.passwordReset.signupPrompt') : t('web.auth.passwordReset.returnToLogin')}
                typography="lg"
                type="invisible"
                enabled={true}
                href={this.state.resetSent ? '/signup' : '/login'}
              />
            </div>
          </div>
        </div>
      </>
    );
  }
}

export default withTranslation()(ForgotPassword);
