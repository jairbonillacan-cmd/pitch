import React from 'react';

import './Login.scss';
import '../components/App.scss';

import Button from '../components/Button';
import HtmlHeaders from '../html-headers';
import { auth } from '../firebase.js';
import {
  base64Encode,
  containsLowercase,
  containsNumber,
  containsUppercase,
  isFieldEmpty,
  stringPresent
} from '../linemate-react-common/src/util.js';
import { withTranslation } from 'react-i18next';

class PasswordResetAction extends React.Component {
  constructor(props) {
    super(props);

    this.passwordRef = React.createRef();
    this.confirmPasswordRef = React.createRef();

    this.inputOnKeyUp = this.inputOnKeyUp.bind(this);
    this.submitPasswordChange = this.submitPasswordChange.bind(this);

    this.state = {
      formFilled: false,
      resetInProgress: false,
      errorMessage: null
    };
  }

  componentDidMount() {
    document.title = `${this.props.t('web.auth.changePassword.title')} - Linemate`;
  }

  inputOnKeyUp(event) {
    event.preventDefault();

    const password = this.passwordRef.current.value || '';
    const confirmPassword = this.confirmPasswordRef.current.value || '';

    this.setState({
      formFilled: stringPresent(password) && stringPresent(confirmPassword),
      errorMessage: null
    });

    if (event.keyCode === 13 && stringPresent(password) && stringPresent(confirmPassword)) {
      this.submitPasswordChange();
    }
  }

  validatePassword(password) {
    return (
      !isFieldEmpty(password) &&
      password.length >= 8 &&
      containsNumber(password) &&
      containsUppercase(password) &&
      containsLowercase(password)
    );
  }

  getResetErrorMessage(error) {
    switch (error.code) {
      case 'auth/expired-action-code':
      case 'auth/invalid-action-code':
        return this.props.t('web.auth.changePassword.invalidLink');
      case 'auth/weak-password':
        return this.props.t('auth.signup.alerts.passwordInvalid');
      default:
        return this.props.t('web.auth.changePassword.genericError', {
          code: base64Encode(JSON.stringify(error))
        });
    }
  }

  submitPasswordChange() {
    const password = this.passwordRef.current.value || '';
    const confirmPassword = this.confirmPasswordRef.current.value || '';

    if (!this.validatePassword(password)) {
      this.setState({
        errorMessage: this.props.t('auth.signup.alerts.passwordInvalid')
      });
      return;
    }

    if (password !== confirmPassword) {
      this.setState({ errorMessage: this.props.t('auth.signup.alerts.confirmPasswordMismatch') });
      return;
    }

    this.setState({ resetInProgress: true, errorMessage: null }, () => {
      auth.checkActionCode(this.props.code)
        .then(() => auth.confirmPasswordReset(this.props.code, password))
        .then(() => {
          sessionStorage.setItem('passwordChangedToast', 'true');
          window.location.href = '/login';
        })
        .catch((error) => {
          this.setState({
            resetInProgress: false,
            errorMessage: this.getResetErrorMessage(error)
          });
        });
    });
  }

  render() {
    return (
      <>
        <HtmlHeaders canonicalRef="https://www.linemate.io/authentication/action" />
        <div className="login-page-container">
          <a href="/">
            <img src="assets/linemate-logo.svg" alt="linemate-logo" />
          </a>

          <p className="text-style-h-1-bold login-page-title">{this.props.t('web.auth.changePassword.title')}</p>

          <div className="login-page-no-account-signup forgot-password-page-subtext">
            <p className="text-style-body-normal">
              {this.props.t('web.auth.changePassword.subtitle')}
            </p>
          </div>

          <div className="login-page-form">
            {this.state.errorMessage && (
              <p className="text-style-caption-normal login-page-error">{this.state.errorMessage}</p>
            )}

            <p className="text-style-label-medium login-page-password">{this.props.t('web.auth.changePassword.newPassword')}</p>
            <input
              ref={this.passwordRef}
              className="text-style-body-normal"
              onKeyUp={this.inputOnKeyUp}
              type="password"
              disabled={this.state.resetInProgress}
            />

            <p className="text-style-label-medium login-page-password">{this.props.t('web.auth.changePassword.confirmNewPassword')}</p>
            <input
              ref={this.confirmPasswordRef}
              className="text-style-body-normal"
              onKeyUp={this.inputOnKeyUp}
              type="password"
              disabled={this.state.resetInProgress}
            />

            <div className="login-page-login-button-wrapper">
              <Button
                text={this.props.t('common.actions.changePassword')}
                typography="lg"
                type="primary"
                enabled={this.state.formFilled && !this.state.resetInProgress}
                onClick={this.submitPasswordChange}
              />
            </div>
          </div>
        </div>
      </>
    );
  }
}

export default withTranslation()(PasswordResetAction);
