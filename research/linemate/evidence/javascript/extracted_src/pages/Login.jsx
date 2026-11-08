import React from 'react';

import './Login.scss'
import '../components/App.scss'
import GlobalContext from '../components/GlobalContext';
import Button from '../components/Button';
import HtmlHeaders from '../html-headers';
import { auth } from '../firebase.js';
import { GoogleAuthProvider, OAuthProvider } from 'firebase/auth';
import { API_HOST } from '../react-web-constants.js';
import { withTranslation } from 'react-i18next';

class Login extends React.Component {

    static contextType = GlobalContext;

    constructor(props, context) {
        // https://github.com/facebook/react/issues/13944
        // Looks like this API is being deprecated but it doesn't look like there is any official way of doing it in the new API
        super(props, context);

        const searchParams = new URLSearchParams(window.location.search);

        this.defaultOrigin = `/${context.configuration.defaultLeague}`
        this.origin = this.defaultOrigin;
        if (searchParams.has("origin")) {
            this.origin = searchParams.get("origin");
        }

        if (context.user) {
            this.redirectUser();    
        }

        this.loginEmailRef = React.createRef();
        this.loginPasswordRef = React.createRef();

        this.inputOnKeyUp = this.inputOnKeyUp.bind(this);
        this.login = this.login.bind(this);
        this.loginWithGoogle = this.loginWithGoogle.bind(this)
        this.loginWithApple = this.loginWithApple.bind(this)
        this.loginWithProvider = this.loginWithProvider.bind(this)

        this.state = {
            formFilled: false,
            loginErrorMessage: null,
            loginInProgress: false,
            passwordChangedToastVisible: sessionStorage.getItem('passwordChangedToast') === 'true'
        }
    }

    componentDidMount() {
        document.title = `${this.props.t('auth.login.title')} - Linemate`;

        if (this.state.passwordChangedToastVisible) {
            sessionStorage.removeItem('passwordChangedToast');
            setTimeout(() => {
                this.setState({ passwordChangedToastVisible: false });
            }, 4000);
        }
    }

    redirectUser() {
        if (!this.origin.startsWith('/')) {
            window.open(this.origin, '_blank')
            window.location.href = this.defaultOrigin;
        } else {
            window.location.href = this.origin;
        }
    }

    inputOnKeyUp(event) {
        event.preventDefault();
        const email = this.loginEmailRef.current.value || "";
        const password = this.loginPasswordRef.current.value || "";
        if (email !== null && email !== "" && password !== null && password !== "") {
            if (event.keyCode === 13) {
                this.setState({loginErrorMessage: null}, this.login())
            } else {
                this.setState({formFilled: true})
            }
        } else {
            this.setState({formFilled: false})
        }
    }

    // TODO: deduplicate logic between login and signup

    // Note: the error handling is actually slow from auth.loginWithProvider, may want to look into seeing if we can capture the moment when the popup gets closed for a faster response time
    // TODO: when integrating and pushing the latest common code change implementation to user setupUser()
    // All content under _tokenResponse isn't officially documented but should be there
    async loginWithProvider(provider) {
        try {
            const popupResult = await auth.signInWithProvider(provider)
            if (popupResult?.user) {
                if (popupResult?.['_tokenResponse']?.isNewUser) {
                    const token = await popupResult.user.getIdToken()
                    const postRequestInfo = {
                        method: 'POST',
                        headers: {
                            'Accept': 'application/json',
                            'Content-Type': 'application/json',
                            'Authorization': "Bearer " + token
                        },
                        // TODO: if we have some of these we should fill them in
                        body: JSON.stringify(
                            {
                                firstName: popupResult?.['_tokenResponse']?.firstName || '', 
                                lastName: popupResult?.['_tokenResponse']?.lastName || '',
                                username: ''
                            }
                        )
                    };
                    fetch(`${API_HOST}/api/users/v1/setup?sendEmailVerification=false`, postRequestInfo)
                    .then((data) => {
                        this.redirectUser();
                    })
                    .catch(error => {
                        console.error("Error on user setup: ", error);
                        this.setState({loginInProgress: false, loginErrorMessage: this.props.t('common.errors.genericTryAgainLater')})
                    });
                } else {
                    this.redirectUser();
                }
            } else {
                console.error("Missing user")
                this.setState({loginInProgress: false, loginErrorMessage: this.props.t('common.errors.genericTryAgainLater')})
            }
        } catch (error) {
            console.error(error)
            this.setState({loginInProgress: false, loginErrorMessage: this.props.t('common.errors.genericTryAgainLater')})
        }
    }

    // https://firebase.google.com/docs/auth/web/google-signin
    // Can also look at https://www.npmjs.com/package/@react-oauth/google for google identity service
    async loginWithGoogle() {
        this.setState({loginInProgress: true})
        const provider = new GoogleAuthProvider()
        provider.addScope('https://www.googleapis.com/auth/userinfo.email')
        await this.loginWithProvider(provider)
    }

    // TODO: review anonymizing requirements: https://firebase.google.com/docs/auth/web/apple
    async loginWithApple() {
        this.setState({loginInProgress: true})
        const provider = new OAuthProvider("apple.com")
        provider.addScope('email')
        provider.addScope('name')
        await this.loginWithProvider(provider)
    }

    login() {
        const email = this.loginEmailRef.current.value;
        const password = this.loginPasswordRef.current.value;
        this.setState({loginInProgress: true}, () => {
            auth.signInWithEmailAndPassword(email, password)
            .then((userCredentials) => {
                this.redirectUser();
            })
            .catch((error) => {
                var errorCode = error.code;
                console.log(errorCode);
                switch (errorCode) {
                    case 'auth/user-not-found':
                    case 'auth/wrong-password':
                    case 'auth/invalid-email':
                        this.setState({loginInProgress: false, loginErrorMessage: this.props.t('auth.login.alerts.invalidCredentials')})
                        break;
                    default:
                        this.setState({loginInProgress: false, loginErrorMessage: this.props.t('common.errors.genericTryAgainLater')})
                        break;
                }
            });
        })
    }

    render() {
        const { t } = this.props;
        return (
            <>
                <HtmlHeaders canonicalRef="https://www.linemate.io/login"/>
                {this.state.passwordChangedToastVisible && (
                    <div className="login-page-toast text-style-label-medium">
                        <div className="login-page-toast-left">
                            <img className="login-page-toast-chevron" src="assets/chevron-right.svg" alt="" />
                            <span>{t('web.auth.changePassword.passwordChanged')}</span>
                        </div>
                        <img className="login-page-toast-chevron" src="assets/chevron-right.svg" alt="" />
                    </div>
                )}
                <div className='login-page-container'>
                    <a href='/'>
                        <img src='assets/linemate-logo.svg' alt="linemate-logo"/>
                    </a>
                    <p className='text-style-h-1-bold login-page-title'>{t('web.auth.loginTitle')}</p>
                    <div className='login-page-no-account-signup'>
                        <p className='text-style-body-normal'>{t('web.auth.noAccount')}</p>
                        <a className='text-style-body-normal' href={`/signup?origin=${this.origin}`}>{t('web.auth.signUp')}</a>
                    </div>
                    <div className='login-page-form'>
                        <div className='login-page-login-button-wrapper'>
                            <Button className='login-page-google-button' icon="assets/authentication/icons/google.svg" text={t('common.actions.continueWithGoogle')} typography="lg" type="secondary" enabled={!this.state.loginInProgress} onClick={this.loginWithGoogle}/>
                        </div>
                        <div className='login-page-login-button-wrapper'>
                            <Button className='login-page-apple-button' icon="assets/authentication/icons/apple.svg" text={t('common.actions.continueWithApple')} typography="lg" type="secondary" enabled={!this.state.loginInProgress} onClick={this.loginWithApple}/>
                        </div>

                        <div className='login-page-separator'>
                            <div></div>
                            <p className='text-style-caption-semibold'>{t('auth.separator')}</p>
                            <div></div>
                        </div>

                        {
                            this.state.loginErrorMessage && (
                                <p className='text-style-caption-normal login-page-error'>{this.state.loginErrorMessage}</p>
                            )
                        }
                        <p className='text-style-label-medium login-page-email'>{t('common.labels.email')}</p>
                        <input ref={this.loginEmailRef} className='text-style-body-normal' onKeyUp={this.inputOnKeyUp} type="email"/>
                        <p className='text-style-label-medium login-page-password'>{t('common.labels.password')}</p>
                        <input ref={this.loginPasswordRef} className='text-style-body-normal' onKeyUp={this.inputOnKeyUp} type="password"/>
                        <a className='text-style-label-normal' href='/password-reset'>{t('auth.login.forgotPassword')}</a>
                        <div className='login-page-login-button-wrapper'>
                            <Button text={t('auth.login.title')} typography="lg" type="primary" enabled={this.state.formFilled && !this.state.loginInProgress} onClick={() => this.inputOnKeyUp({preventDefault: () => {}, keyCode: 13})}/>
                        </div>
                    </div>
                </div>
            </>
        );
    }
}

export default withTranslation()(Login);
