import React from 'react';
import {validateEmail, isAlphaNumeric, containsNumber, containsUppercase, containsLowercase, stringPresent} from './linemate-react-common/src/util.js';
import {DEFAULT_ORIGIN_REDIRECT} from './linemate-react-common/src/constants.js';
import {API_HOST} from './react-web-constants.js';
import {auth} from './firebase.js';

import './fonts.css';
import './generic.css';
import './authentication-page.css';
import HtmlHeaders from './html-headers.js';

const headerTexts = {
    signup: "Join Linemate",
    login: "Welcome back Linemate"
};

class AuthenticationPage extends React.Component {
  constructor(props) {
    super(props);

    const searchParams = new URLSearchParams(window.location.search);

    this.checkout = "";
    if (searchParams.has("checkout")) {
        this.checkout = searchParams.get("checkout");
    }

    this.origin = DEFAULT_ORIGIN_REDIRECT;
    if (searchParams.has("origin")) {
        this.origin = searchParams.get("origin");
    }
    
    var tab = 'signup';
    if (searchParams.has('tab')) {
      const queryParamTab = searchParams.get('tab').toLowerCase();
      if (queryParamTab in headerTexts) {
        tab = queryParamTab;
      }
    }

    this.state = {
        selectedTab: tab,
        headerText: headerTexts[tab]
    };

    // Signup form refs
    this.signupFirstNameRef = React.createRef();
    this.signupLastNameRef = React.createRef();
    this.signupUsernameRef = React.createRef();
    this.signupUsernameValidationRef = React.createRef();
    this.signupUsernameInvalidRef = React.createRef();
    this.signupEmailRef = React.createRef();
    this.signupEmailValidationRef = React.createRef();
    this.signupEmailInUseRef = React.createRef();
    this.signupPasswordRef = React.createRef();
    this.signupPasswordValidationRef = React.createRef();
    this.signupConfirmPasswordRef = React.createRef();
    this.signupConfirmPasswordValidationRef = React.createRef();
    this.signupButtonEnabled = React.createRef();
    this.signupButtonDisabled = React.createRef();
    this.handleSignupInputKeyUp = this.handleSignupInputKeyUp.bind(this);

    // Login form refs
    this.loginEmailRef = React.createRef();
    this.loginPasswordRef = React.createRef();
    this.loginAuthenticationErrorRef = React.createRef();
    this.loginGenericErrorRef = React.createRef();
    this.loginButtonEnabled = React.createRef();
    this.loginButtonDisabled = React.createRef();
    this.handleLoginInputKeyUp = this.handleLoginInputKeyUp.bind(this);

    this.selectTab = this.selectTab.bind(this);
    this.validateName = this.validateName.bind(this);
    this.validateUsername = this.validateUsername.bind(this);
    this.validateEmail = this.validateEmail.bind(this);
    this.validatePassword = this.validatePassword.bind(this);
    this.validateConfirmPassword = this.validateConfirmPassword.bind(this);
    this.submitSignup = this.submitSignup.bind(this);
    this.submitLogin = this.submitLogin.bind(this);

    this.redirectUser = this.redirectUser.bind(this);
  }

  componentDidMount() {
    document.title = 'Authentication - Linemate';
    // Used to remove the pseudo element :before which pushes the content down in most pages to allow for the navbar
    // In this case we don't use the navbar so we don't want it
    document.body.classList.remove('push');

    if (this.props.user) {
        this.redirectUser(this.props.user);    
    }

    // // If they are already logged in they have no business in the authentication page, redirect to another page
    // auth.onAuthStateChanged(user => {
    //     if (user) {
    //         this.redirectUser(user);
    //     }
    // });
  }

  componentDidUpdate() {
    if (this.props.user) {
        // this.redirectUser(this.props.user);
    }
  }

  redirectUser(user) {
    if (this.checkout !== "") {
        user.getIdToken().then((token) => { 
            const requestInfo = {
                headers: {
                    'Authorization': "Bearer " + token
                }
            };
            fetch(`${API_HOST}/api/payment/v1/checkout?id=${this.checkout}&origin=${this.origin}`, requestInfo).then(data => {return data.json();})
            .then(result => {
                window.location.href = result.redirect;
            })
            .catch(error => {
                console.log("Error getting checkout session: " + error);
            });
        });
    } else {
        window.location.href = this.origin;
    }
  }

  selectTab(event) {
    const selection = event.currentTarget.dataset.selection;
    this.setState(
        {
            selectedTab: selection,
            headerText: headerTexts[selection]
        }
    );
  }

  // TODO: some actual visual validation
  validateName() {
    const firstNameValue = this.signupFirstNameRef.current.value;
    const lastNameValue = this.signupLastNameRef.current.value;
    if (firstNameValue === null || firstNameValue === "" || firstNameValue === "undefined" || 
        lastNameValue === null || lastNameValue === "" || lastNameValue === "undefined") {
        return false;
    } else {
        return true;
    }
  }

  // TODO: profanity filter
  validateUsername() {
    const value = this.signupUsernameRef.current.value;
    if (value === null || value === "" || value === "undefined" || value.length < 6 || !isAlphaNumeric(value)) {
        this.signupUsernameValidationRef.current.style.display = 'block';
        return false;
    } else {
        this.signupUsernameValidationRef.current.style.display = 'none';
        return true;
    }
  }

  validateEmail() {
    const value = this.signupEmailRef.current.value;
    if (value === null || value === "" || value === "undefined" || !validateEmail(value)) {
        this.signupEmailValidationRef.current.style.display = 'block';
        return false;
    } else {
        this.signupEmailValidationRef.current.style.display = 'none';
        return true;
    }
  }

  //TODO: Clear up the password/confirm password fields if they have validation errors
  validatePassword() {
    const value = this.signupPasswordRef.current.value;
    if (value === null || value === "" || value === "undefined" || 
        value.length < 8 || !containsNumber(value) || !containsUppercase(value) || !containsLowercase(value)) {
        this.signupPasswordValidationRef.current.style.display = 'block';
        return false;
    } else {
        this.signupPasswordValidationRef.current.style.display = 'none';
        return true;
    }
  }

  validateConfirmPassword() {
    const password = this.signupPasswordRef.current.value;
    const confirmPassword = this.signupConfirmPasswordRef.current.value;
    if (password === confirmPassword) {
        this.signupConfirmPasswordValidationRef.current.style.display = 'none';
        return true;
    } else {
        this.signupConfirmPasswordValidationRef.current.style.display = 'block';
        return false;
    }
  }

  // TODO: set red background on bad/missing fields
  submitSignup(event) {
    event.preventDefault();
    const nameValid = this.validateName();
    const usernameValid = this.validateUsername();
    const emailValid = this.validateEmail();
    const passwordValid = this.validatePassword();
    const confirmationPasswordValid = this.validateConfirmPassword();
    this.signupEmailInUseRef.current.style.display = 'none';

    if (nameValid && usernameValid && emailValid && passwordValid && confirmationPasswordValid) {
        // Set button to inactive (doing this via 2 separate buttons to avoid a state update)
        this.signupButtonEnabled.current.style.display = 'none';
        this.signupButtonDisabled.current.style.display = 'block';
        
        // First check if username is available via the backend API otherwise you might create the user without checking the username availability (404 means available), (204 means not available)
        fetch(`${API_HOST}/api/users/checkUsernameAvailability?username=${this.signupUsernameRef.current.value}`)
        .then(data => data.json())
        .then((response) => {
            // console.log("Username available: ", response.available);
                // const responseCode = response.status;
                if (response.available) {
                    // Username isn't taken, we can continue
                    // Sign up using firebase
                    this.signupUsernameInvalidRef.current.style.display = 'none';
                    auth.createUserWithEmailAndPassword(this.signupEmailRef.current.value, this.signupPasswordRef.current.value)
                    .then((response) => {
                        // const actionSettings = {
                        //     url: 'https://linemate.io/'
                        // };
                        // response.user.sendEmailVerification(actionSettings).then(() => {
                        //     console.log("Email verification sent!");
                        // })
                        // .catch(() => {
                        //     console.log("Error sending email verification");
                        // });
                        // Update user details via the API
                        response.user.getIdToken().then((data) => { 
                            // TODO: review what we want to do about the casing of username
                            // console.log(`User token: ${data}`);
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
                            fetch(`${API_HOST}/api/users/setup?sendEmailVerification=false`, postRequestInfo)
                            .then((data) => {
                                // console.log("User setup complete");
                                window.location.href = this.origin;
                            })
                            .catch(error => {
                                    console.log("Error on user setup: ", error);
                                    this.signupButtonEnabled.current.style.display = 'block';
                                    this.signupButtonDisabled.current.style.display = 'none';
                                }
                            );
                        })
                    })
                    .catch((error) => {
                        var errorCode = error.code;
                        var errorMessage = error.message;
                
                        switch (errorCode) {
                            case 'auth/email-already-in-use':
                                this.signupEmailInUseRef.current.style.display = 'block';
                                break;
                            // We should be covering these via our own validation
                            // case 'auth/invalid-email':
                            //     alert("Please enter a valid email");
                            //     break;
                            // case 'auth/weak-password':
                            //     alert("Password is not strong enough");
                            //     break;
                            default:
                                console.log(`Signup validation error: {errorCode: ${errorCode}, errorMessage: ${errorMessage}}`);
                                break;
                        }
                    });
                } else {
                    // Username is taken, can't continue
                    this.signupUsernameInvalidRef.current.style.display = 'block';
                    this.signupButtonEnabled.current.style.display = 'block';
                    this.signupButtonDisabled.current.style.display = 'none';
                }
                // switch (responseCode) {
                //     case 204:

                //         break;
                //     case 404:
                        
                //         break;
                //     default:
                //         console.log("Default username availability handler");
                //         break;
                // }
            }
        )
        .catch(error => {
                console.log(`Error : ${error}`)
            }
        );
    }
  }

  handleSignupInputKeyUp(event) {
    event.preventDefault();
    const firstName = this.signupFirstNameRef.current.value;
    const lastName = this.signupLastNameRef.current.value;
    const username = this.signupUsernameRef.current.value;
    const email = this.signupEmailRef.current.value;
    const password = this.signupPasswordRef.current.value;
    const confirmPassword = this.signupConfirmPasswordRef.current.value;
    if (stringPresent(firstName) && stringPresent(lastName) && stringPresent(username) && stringPresent(email) && stringPresent(password) && stringPresent(confirmPassword)) {
        this.signupButtonEnabled.current.style.display = 'block';
        this.signupButtonDisabled.current.style.display = 'none';
        if (event.keyCode === 13 && this.state.selectedTab === "signup") {
            this.signupButtonEnabled.current.click();
        }
    } else {
        this.signupButtonEnabled.current.style.display = 'none';
        this.signupButtonDisabled.current.style.display = 'block';
    }
  }

  submitLogin(event) {
    event.preventDefault();
    this.loginButtonEnabled.current.style.display = 'none';
    this.loginButtonDisabled.current.style.display = 'block';
    const email = this.loginEmailRef.current.value;
    const password = this.loginPasswordRef.current.value;
    auth.signInWithEmailAndPassword(email, password)
    .then((userCredentials) => {
        this.redirectUser(userCredentials.user);
    })
    .catch((error) => {
        var errorCode = error.code;
        switch (errorCode) {
            case 'auth/user-not-found':
            case 'auth/wrong-password':
            case 'auth/invalid-email':
                this.loginAuthenticationErrorRef.current.style.display = 'block';
                break;
            default:
                console.log(errorCode);
                this.loginGenericErrorRef.current.style.display = 'block';
                break;
        }
        this.loginButtonEnabled.current.style.display = 'block';
        this.loginButtonDisabled.current.style.display = 'none';
    });
  }

  handleLoginInputKeyUp(event) {
    event.preventDefault();
    const email = this.loginEmailRef.current.value || "";
    const password = this.loginPasswordRef.current.value || "";
    if (email !== null && email !== "" && password !== null && password !== "") {
        this.loginButtonEnabled.current.style.display = 'block';
        this.loginButtonDisabled.current.style.display = 'none';

        if (event.keyCode === 13 && this.state.selectedTab === "login") {
            this.loginButtonEnabled.current.click();
        }
    } else {
        this.loginButtonEnabled.current.style.display = 'none';
        this.loginButtonDisabled.current.style.display = 'block';
    }
}

  // TODO: instead of the list of errors always show, just display the ones that apply
  render() {
    return(
        <>
            <HtmlHeaders canonicalRef="https://www.linemate.io/authentication"/>
            <img class="authentication-hero-image absolute" src="assets/authentication/hero-big.jpg" alt=""/>
            <div class="authentication-hero">
                <a href="/">
                    <img src="assets/logo-white-nobg.svg" alt=""/>
                </a>
                <div class="authentication-full-header">
                    <p class="font white size-64 weight-800 spaced-negative-low" style={{marginTop: "20%"}} >Start your research with Linemate.</p>
                    <p class="font light-grey size-18 weight-600" style={this.state.selectedTab === "signup" ? {marginTop: "3.5%"} : {display: 'none'}} >Join to be a part of a community where sports analytics is for everyone.</p>
                </div>
                <div class="authentication-mobile-header">
                    <p class="font white size-30 weight-700 spaced-negative-low" style={{marginTop: "20%"}} >Start your research with Linemate.</p>
                </div>
            </div>
            <div class="authentication-content">
                <p class="authentication-content-header font black size-36 weight-700">
                    {this.state.headerText}
                </p>
                <div class="authentication-content-picker">
                        <span class={this.state.selectedTab === "signup" ? "clickable table-toggle selected-table-toggle" : "clickable table-toggle"}
                              onClick={this.selectTab} 
                              data-selection="signup">
                            <p class={this.state.selectedTab === "signup" ? "font size-14 dark unselectable" : "font size-14 grey unselectable"}>
                                Sign up
                            </p>
                        </span>
                        <span class={this.state.selectedTab === "login" ? "clickable table-toggle selected-table-toggle" : "clickable table-toggle"}
                              onClick={this.selectTab} 
                              data-selection="login">
                            <p class={this.state.selectedTab === "login" ? "font size-14 dark unselectable" : "font size-14 grey unselectable"}>
                                Log in
                            </p>
                        </span>
                </div>
                <div class="authentication-content-signup" style={ this.state.selectedTab === "signup" ? {} : {display: 'none'} }>
                    <input onKeyUp={this.handleSignupInputKeyUp} ref={this.signupFirstNameRef} type="text" class="generic-input" placeholder="First name"/>
                    <input onKeyUp={this.handleSignupInputKeyUp} ref={this.signupLastNameRef} type="text" class="generic-input" placeholder="Last name"/>

                    <input onKeyUp={this.handleSignupInputKeyUp} ref={this.signupUsernameRef} type="text" class="generic-input" placeholder="Username"/>
                    <p class="font size-14 dark" style={{display: 'none'}}>Your username needs to be at least 6 characters. It should only include letters and numbers.</p>
                    <p ref={this.signupUsernameInvalidRef} class="font size-14 red" style={{display: 'none'}}>Username is already taken</p>
                    <ul ref={this.signupUsernameValidationRef} class="font size-14 red" style={{display: 'none'}}>
                        <li>Username is too short (min. 6 characters)</li>
                        <li>Username may only contain letters and numbers</li>
                        <li>Username with profanities are not allowed</li>
                    </ul>

                    <input onKeyUp={this.handleSignupInputKeyUp} ref={this.signupEmailRef} type="email" class="generic-input" placeholder="Email address"/>
                    <p ref={this.signupEmailValidationRef} class="font size-14 red" style={{display: 'none'}}>Email is invalid.</p>
                    <p ref={this.signupEmailInUseRef} class="font size-14 red" style={{display: 'none'}}>This email is already in use.</p>

                    <input onKeyUp={this.handleSignupInputKeyUp} ref={this.signupPasswordRef} type="password" class="generic-input" placeholder="Password"/>
                    <p class="font size-14 dark" style={{display: 'none'}}>Your password needs to be at least 8 characters. It should include numbers, lowercase and uppercase letters.</p>
                    <ul ref={this.signupPasswordValidationRef} class="font size-14 red" style={{display: 'none'}}>
                        <li>Password is too short (min. 8 characters)</li>
                        <li>Password needs to include uppercase and lowercase letter</li>
                        <li>Password needs to include number</li>
                    </ul>

                    <input onKeyUp={this.handleSignupInputKeyUp} ref={this.signupConfirmPasswordRef} type="password" class="generic-input" placeholder="Confirm password"/>
                    <p ref={this.signupConfirmPasswordValidationRef} class="font size-14 red" style={{display: 'none'}}>Confirm password does not match.</p>

                    {/* Workaround to avoid having to update state and re-render since we're going to update the state when completing the action */}
                    <button ref={this.signupButtonEnabled} type="button" class="generic-button" onClick={this.submitSignup} style={{display: 'none'}}>
                        <p class="font white size-14">Create account</p>
                    </button>
                    <button ref={this.signupButtonDisabled} disabled type="button" class="generic-button generic-button-disabled">
                        <p class="font white size-14">Create account</p>
                    </button>
                    <p class="font size-14 dark authentication-content-signup-privacy">
                        By clicking "Create account" you agree to Linemate’s&nbsp;
                        <a class="green" href="/terms">Terms</a>
                        &nbsp;and&nbsp;
                        <a class="green" href="/privacy">Privacy Policy</a>
                        {/* <br/>
                        <p class="font size-14 grey display-block" style={{marginTop: '8px', marginBottom: '40px'}}>Start with a 7-day trial of Linemate Pro. If you don’t like it, keep using Linemate for free.</p> */}
                    </p>
                </div>
                <div class="authentication-content-login" style={ this.state.selectedTab === "login" ? {} : {display: 'none'} }>
                    <input onKeyUp={this.handleLoginInputKeyUp} ref={this.loginEmailRef} type="email" class="generic-input" placeholder="Email address"/>
                    <input onKeyUp={this.handleLoginInputKeyUp} ref={this.loginPasswordRef} type="password" class="generic-input" placeholder="Password"/>
                    <p ref={this.loginAuthenticationErrorRef} class="font size-14 red" style={{display: 'none'}}>Incorrect email or password.</p>
                    <p ref={this.loginGenericErrorRef} class="font size-14 red" style={{display: 'none'}}>Something went wrong, please try again later.</p>
                    <button ref={this.loginButtonEnabled} type="button" class="generic-button" onClick={this.submitLogin} style={{display: 'none'}}>
                        <p class="font white size-14">Log in</p>
                    </button>
                    <button ref={this.loginButtonDisabled} type="button" disabled class="generic-button generic-button-disabled">
                        <p class="font white size-14">Log in</p>
                    </button>
                    <a href="/password-reset" class="font size-14 green authentication-content-login-forgot-password">Forgot your password?</a>
                </div>
            </div>
        </>
    );
  }
}

export default AuthenticationPage;
