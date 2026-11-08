import React from 'react';

import './Signup.scss'
import './Login.scss'
import '../components/App.scss'
import GlobalContext from '../components/GlobalContext';
import Button from '../components/Button';
import HtmlHeaders from '../html-headers';
import { auth } from '../firebase.js';
import RadioGroup from '../components/RadioGroup';
import { API_HOST } from '../react-web-constants';
import { containsLowercase, containsNumber, containsUppercase, isAlphaNumeric, updateUserAttributes, validateEmail } from '../linemate-react-common/src/util';
import { GoogleAuthProvider, OAuthProvider } from 'firebase/auth';
import { withTranslation } from 'react-i18next';
import { trackGoogleSignUp } from '../analytics';

class Signup extends React.Component {

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

        this.oddsOptions = {
            'american': {text: 'American', annotation: '(-200)'},
            'decimal': {text: 'Decimal', annotation: '(1.5)'}
        }

        this.signupFirstNameRef = React.createRef();
        this.signupLastNameRef = React.createRef();
        this.signupUsernameRef = React.createRef();
        this.signupEmailRef = React.createRef();
        this.signupPasswordRef = React.createRef();
        this.signupConfirmPasswordRef = React.createRef();

        this.inputOnKeyUp = this.inputOnKeyUp.bind(this);
        this.signup = this.signup.bind(this);
        this.setOddsPreference = this.setOddsPreference.bind(this);
        this.validateName = this.validateName.bind(this);
        this.validateUsername = this.validateUsername.bind(this);
        this.validateEmail = this.validateEmail.bind(this);
        this.validatePassword = this.validatePassword.bind(this);
        this.validateConfirmPassword = this.validateConfirmPassword.bind(this);
        
        this.loginWithGoogle = this.loginWithGoogle.bind(this)
        this.loginWithApple = this.loginWithApple.bind(this)
        this.loginWithProvider = this.loginWithProvider.bind(this)

        this.validationFunctions = {
            'name': this.validateName,
            'username': this.validateUsername,
            'email': this.validateEmail,
            'password': this.validatePassword,
            'confirmPassword': this.validateConfirmPassword
        }

        this.state = {
            // Rotate between "signupSourceSelection", "credentials" and "odds-preferences"
            signupStage: "signupSourceSelection",
            formFilled: false,
            signupErrorMessages: {},
            signupInProgress: false,
            oddsFormatSelection: null,
            loading: false,
            signupMethod: null
        }
    }

    componentDidMount() {
        document.title = `${this.props.t('auth.signup.title')} - Linemate`;
    }

    redirectUser() {
        if (!this.origin.startsWith('/')) {
            window.open(this.origin, '_blank')
            window.location.href = this.defaultOrigin;
        } else {
            window.location.href = this.origin;
        }
    }

    validateName(state) {
        const firstNameValue = this.signupFirstNameRef.current.value;
        const lastNameValue = this.signupLastNameRef.current.value;
        if (firstNameValue === null || firstNameValue === "" || firstNameValue === "undefined" || 
            lastNameValue === null || lastNameValue === "" || lastNameValue === "undefined") {
            state.formFilled = false;
        }
        return state;
    }

    // TODO: profanity filter
    validateUsername(state) {
        const value = this.signupUsernameRef.current.value;
        state.signupErrorMessages.username = [];
        if (value === null || value === "" || value === "undefined") {
            state.formFilled = false;
        } else {
            const errors = [];
            if (value.length < 6) {
                errors.push(this.props.t('web.auth.usernameTooShort'))
            }
            if (!isAlphaNumeric(value)) {
                errors.push(this.props.t('web.auth.usernameAlphaNumeric'))
            }
            state.signupErrorMessages.username = errors;
        }
        return state;
    }

    validateEmail(state) {
        const value = this.signupEmailRef.current.value;
        state.signupErrorMessages.email = []
        if (value === null || value === "" || value === "undefined") {
            state.formFilled = false;
        } else if(!validateEmail(value)) {
            state.signupErrorMessages.email = [this.props.t('auth.signup.alerts.emailInvalid')]
        }
        return state;
    }

    validatePassword(state) {
        const value = this.signupPasswordRef.current.value;
        state.signupErrorMessages.password = []
        if (value === null || value === "" || value === "undefined") {
            state.formFilled = false;
        } else if (value.length < 8 || !containsNumber(value) || !containsUppercase(value) || !containsLowercase(value)) {
            state.signupErrorMessages.password = [this.props.t('auth.signup.alerts.passwordInvalid')]
        }
        return state;
    }

    validateConfirmPassword(state) {
        const confirmPassword = this.signupConfirmPasswordRef.current.value;
        state.signupErrorMessages.confirmPassword = []
        if (confirmPassword === null || confirmPassword === "" || confirmPassword === "undefined") {
            state.formFilled = false;
        } else {
            const password = this.signupPasswordRef.current.value;
            if (password !== confirmPassword) {
                state.signupErrorMessages.confirmPassword = [this.props.t('auth.signup.alerts.confirmPasswordMismatch')]
            }
        }
        return state;
    }

    inputOnKeyUp(event) {
        event.preventDefault();
        const state = {
            formFilled: true,
            signupErrorMessages: {}
        }
        this.validateName(state);
        this.validateUsername(state);
        this.validateEmail(state);
        this.validatePassword(state);
        this.validateConfirmPassword(state);
        this.setState({formFilled: state.formFilled})

        if (state.formFilled && (Object.keys(state.signupErrorMessages).length === 0 || Object.keys(state.signupErrorMessages).map(x => state.signupErrorMessages[x]).every(x => x.length === 0)) && event.keyCode === 13) {
            this.signup(state);
        }
    }

    signup(state) {
        if (!state.loading, state.formFilled && (Object.keys(state.signupErrorMessages).length === 0 || Object.keys(state.signupErrorMessages).map(x => state.signupErrorMessages[x]).every(x => x.length === 0))) {
            this.setState({loading: true}, () => {
                // First check if username is available via the backend API otherwise you might create the user without checking the username availability (404 means available), (204 means not available)
                fetch(`${API_HOST}/api/users/v1/checkUsernameAvailability?username=${this.signupUsernameRef.current.value}`)
                .then(data => data.json())
                .then((response) => {
                    if (response.available) {
                        // Username isn't taken, we can continue
                        // Sign up using firebase
                        auth.createUserWithEmailAndPassword(this.signupEmailRef.current.value, this.signupPasswordRef.current.value)
                        .then((response) => {
                            // Update user details via the API
                            response.user.getIdToken().then((data) => { 
                                const postRequestInfo = {
                                    method: 'POST',
                                    headers: {
                                        'Accept': 'application/json',
                                        'Content-Type': 'application/json',
                                        'Authorization': "Bearer " + data
                                    },
                                    body: JSON.stringify(
                                        {
                                            firstName: this.signupFirstNameRef.current.value, 
                                            lastName: this.signupLastNameRef.current.value,
                                            username: this.signupUsernameRef.current.value
                                        }
                                    )
                                };
                                fetch(`${API_HOST}/api/users/v1/setup?sendEmailVerification=false`, postRequestInfo)
                                .then((data) => {
                                    this.setState({loading: false, signupStage: "odds-preferences"})
                                    trackGoogleSignUp('email');
                                })
                                .catch(error => {
                                    console.log("Error on user setup: ", error);
                                    // Re-using the confirm password since it's at the bottom
                                    this.setState({loading: false, signupErrorMessages: {confirmPassword: [this.props.t('web.auth.setupError')]}})
                                });
                            })
                        })
                        .catch((error) => {
                            var errorCode = error.code;
                            var errorMessage = error.message;
                    
                            switch (errorCode) {
                                case 'auth/email-already-in-use':
                                    this.setState({loading: false, signupErrorMessages: {email: [this.props.t('auth.signup.alerts.emailTaken')]}})
                                    break;
                                default:
                                    console.log(`Signup validation error: {errorCode: ${errorCode}, errorMessage: ${errorMessage}}`);
                                    // Re-using the confirm password since it's at the bottom
                                    this.setState({loading: false, signupErrorMessages: {confirmPassword: [this.props.t('common.errors.genericTryAgainLater')]}})
                                    break;
                            }
                        });
                    } else {
                        this.setState({loading: false, signupErrorMessages: {username: [this.props.t('auth.signup.alerts.usernameTaken')]}})
                    }
                })
                .catch(error => {
                    console.log(`Error : ${error}`)
                    // Re-using the confirm password since it's at the bottom
                    this.setState({loading: false, signupErrorMessages: {confirmPassword: [this.props.t('common.errors.genericTryAgainLater')]}})
                });
            })
        }
    }

    // This can probably be extracted from building the request info to the fetch. 
    // The attributes to set passed in to the function and it would return the result of fetch to be handled by the caller
    setOddsPreference() {
        this.setState({loading: true}, () => {
            auth.currentUser?.getIdToken?.().then((data) => { 
                updateUserAttributes(
                    API_HOST, 
                    data, 
                    {
                        preferredOddsFormat: this.state.oddsFormatSelection,
                        // Temporarily set both until we remove the old one completely
                        // TODO: this should be removed eventually
                        preferredLineFormat: this.state.oddsFormatSelection
                    }
                )
                .finally(() => {
                    this.redirectUser()
                })
            })
        })
    }

    buildError(errorMessages) {
        if (!errorMessages || errorMessages.length === 0) {
            return (<></>)
        }
        return (
            <>
            {
                errorMessages.map((message) => 
                    <p key={message} className='text-style-caption-normal signup-page-error'>{message}</p>
                )
            }
            </>
        )
    }

    // TODO: deduplicate logic between login and signup
    
    // Note: the error handling is actually slow from auth.loginWithProvider, may want to look into seeing if we can capture the moment when the popup gets closed for a faster response time
    // TODO: when integrating and pushing the latest common code change implementation to user setupUser()
    // All content under _tokenResponse isn't officially documented but should be there
    async loginWithProvider(provider) {
        try {
            const popupResult = await auth.signInWithProvider(provider)
            console.log(JSON.stringify(popupResult))
            // Not documented but should be there
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
                        this.setState({loading: false, signupStage: "odds-preferences"})
                        trackGoogleSignUp(this.state.signupMethod);
                    })
                    .catch(error => {
                        console.error("Error on user setup: ", error);
                        this.setState({signupInProgress: false, loading: false, signupErrorMessages: {confirmPassword: [this.props.t('common.errors.genericTryAgainLater')]}})
                    });
                } else {
                    this.redirectUser();
                }
            } else {
                console.error("Missing user")
                this.setState({signupInProgress: false, loading: false, signupErrorMessages: {confirmPassword: [this.props.t('common.errors.genericTryAgainLater')]}})
            }
        } catch (error) {
            console.error(error)
            this.setState({signupInProgress: false, loading: false, signupErrorMessages: {confirmPassword: [this.props.t('common.errors.genericTryAgainLater')]}})
        }
    }

    // https://firebase.google.com/docs/auth/web/google-signin
    // Can also look at https://www.npmjs.com/package/@react-oauth/google for google identity service
    async loginWithGoogle() {
        this.setState({signupInProgress: true, signupMethod: 'google'})
        const provider = new GoogleAuthProvider()
        provider.addScope('https://www.googleapis.com/auth/userinfo.email')
        await this.loginWithProvider(provider)
    }

    // TODO: review anonymizing requirements: https://firebase.google.com/docs/auth/web/apple
    async loginWithApple() {
        this.setState({signupInProgress: true, signupMethod: 'apple'})
        const provider = new OAuthProvider("apple.com")
        provider.addScope('email')
        provider.addScope('name')
        await this.loginWithProvider(provider)
    }

    render() {
        const { t } = this.props;
        const oddsOptions = {
            american: { text: t('preferences.display.options.odds.american'), annotation: '(-200)' },
            decimal: { text: t('preferences.display.options.odds.decimal'), annotation: '(1.5)' }
        };
        return (
            <>
                <HtmlHeaders canonicalRef="https://www.linemate.io/signup"/>
                {
                    <div className='signup-page-container'>
                        <a href='/'>
                            <img src='assets/linemate-logo.svg' alt="linemate-logo"/>
                        </a>
                        {
                            this.state.signupStage === "signupSourceSelection" && (
                                <>
                                    <p className='text-style-h-1-bold signup-page-title'>{t('web.auth.signupTitle')}</p>
                                    <div className='signup-page-no-account-signup'>
                                        <p className='text-style-body-normal'>{t('web.auth.alreadyHaveAccount')}</p>
                                        <a className='text-style-body-normal' href={`/login?origin=${this.origin}`}>{t('auth.login.title')}</a>
                                    </div>
                                    <div className='login-page-form'>
                                        <div className='login-page-login-button-wrapper'>
                                            <Button className='login-page-google-button' icon="assets/authentication/icons/google.svg" text={t('common.actions.continueWithGoogle')} typography="lg" type="primary" enabled={!this.state.signupInProgress && !this.state.loading} onClick={this.loginWithGoogle}/>
                                        </div>
                                        <div className='login-page-login-button-wrapper'>
                                            <Button className='login-page-apple-button' icon="assets/authentication/icons/apple.svg" text={t('common.actions.continueWithApple')} typography="lg" type="secondary" enabled={!this.state.signupInProgress && !this.state.loading} onClick={this.loginWithApple}/>
                                        </div>
                                        <div className='login-page-login-button-wrapper'>
                                            <Button text={t('common.actions.continueWithEmail')} typography="lg" type="secondary" enabled={!this.state.signupInProgress && !this.state.loading} onClick={() => this.setState({signupStage: 'credentials'})}/>
                                        </div>
                                    </div>
                                </>
                            )
                        }
                        {
                            this.state.signupStage === "credentials" && (
                                <>
                                    <p className='text-style-h-1-bold signup-page-title'>{t('web.auth.signupTitle')}</p>
                                    <div className='signup-page-no-account-signup'>
                                        <p className='text-style-body-normal'>{t('web.auth.alreadyHaveAccount')}</p>
                                        <a className='text-style-body-normal' href={`/login?origin=${this.origin}`}>{t('auth.login.title')}</a>
                                    </div>
                                    <div className='signup-page-form'>
                                        <div className='signup-page-form-names'>
                                            <div>
                                                <p className='text-style-label-medium'>{t('common.labels.firstName')}</p>
                                                <input ref={this.signupFirstNameRef} className='text-style-body-normal' onKeyUp={this.inputOnKeyUp} type="text"/>
                                            </div>
                                            <div>
                                                <p className='text-style-label-medium'>{t('common.labels.lastName')}</p>
                                                <input ref={this.signupLastNameRef} className='text-style-body-normal' onKeyUp={this.inputOnKeyUp} type="text"/>
                                            </div>
                                        </div>
                                        <p className='text-style-label-medium signup-page-input-title'>{t('common.labels.username')}</p>
                                        <input ref={this.signupUsernameRef} className='text-style-body-normal' onKeyUp={this.inputOnKeyUp} onBlur={() => this.setState(this.validateUsername({signupErrorMessages: this.state.signupErrorMessages}))} type="text"/>
                                        {this.buildError(this.state.signupErrorMessages.username)}
                                        <p className='text-style-label-medium signup-page-email signup-page-input-title'>{t('common.labels.email')}</p>
                                        <input ref={this.signupEmailRef} className='text-style-body-normal' onKeyUp={this.inputOnKeyUp} onBlur={() => this.setState(this.validateEmail({signupErrorMessages: this.state.signupErrorMessages}))} type="email"/>
                                        {this.buildError(this.state.signupErrorMessages.email)}
                                        <p className='text-style-label-medium signup-page-password signup-page-input-title'>{t('common.labels.password')}</p>
                                        <input ref={this.signupPasswordRef} className='text-style-body-normal' onKeyUp={this.inputOnKeyUp} onBlur={() => this.setState(this.validatePassword({signupErrorMessages: this.state.signupErrorMessages}))} type="password"/>
                                        {this.buildError(this.state.signupErrorMessages.password)}
                                        <p className='text-style-label-medium signup-page-password signup-page-input-title'>{t('common.labels.confirmPassword')}</p>
                                        <input ref={this.signupConfirmPasswordRef} className='text-style-body-normal' onKeyUp={this.inputOnKeyUp} onBlur={() => this.setState(this.validateConfirmPassword({signupErrorMessages: this.state.signupErrorMessages}))} type="password"/>
                                        {this.buildError(this.state.signupErrorMessages.confirmPassword)}
                                        <div className='signup-page-terms-and-privacy'>
                                            <p className='text-style-caption-normal'>{t('web.auth.termsPrefix')}&nbsp;</p>
                                            <a className='text-style-caption-normal' href='/terms'>{t('web.auth.termsOfService')}</a>
                                            <p className='text-style-caption-normal'>&nbsp;and&nbsp;</p>
                                            <a className='text-style-caption-normal' href='/privacy'>{t('web.auth.privacyPolicy')}</a>
                                        </div>
                                        <div className='signup-page-login-button-wrapper'>
                                            <Button text={t('common.actions.continue')} typography="lg" type="primary" enabled={!this.state.loading && this.state.formFilled && !this.state.signupInProgress && (Object.keys(this.state.signupErrorMessages).length === 0 || Object.keys(this.state.signupErrorMessages).map(x => this.state.signupErrorMessages[x]).every(x => x.length === 0))} onClick={() => this.inputOnKeyUp({preventDefault: () => {}, keyCode: 13})}/>
                                        </div>
                                    </div>
                                </>
                            )
                        }
                        {
                            this.state.signupStage === "odds-preferences" && (
                                <div className='signup-page-odds-preferences-container'>
                                    <div className='signup-page-odds-preferences-header'>
                                        <p className='text-style-h-1-bold signup-page-title'>{t('web.auth.oddsFormatTitle')}</p>
                                        <p className='text-style-body-normal'>{t('web.auth.oddsFormatDescription')}</p>
                                    </div>
                                    <div className='signup-page-odds-selection'>
                                        <p className='text-style-label-medium'>{t('web.auth.oddsFormat')}</p>
                                        <RadioGroup options={oddsOptions} onValueChange={(value) => this.setState({oddsFormatSelection: value})}/>
                                    </div>
                                    <div className='signup-page-login-button-wrapper'>
                                        <Button text={t('common.actions.continue')} typography="lg" type="primary" enabled={!this.state.loading && this.state.oddsFormatSelection} onClick={this.setOddsPreference}/>
                                    </div>
                                </div>
                            )
                        }
                    </div>
                }
            </>
        );
    }
}

export default withTranslation()(Signup);
