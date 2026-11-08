export default {
  auth: {
    separator: "OR",
    signup: {
      title: "Create an account",
      placeholders: {
        username: "Enter your username...",
        confirmPassword: "Confirm your password...",
      },
      alerts: {
        title: "Create Account",
        usernameInvalid: "Your username needs to be at least 6 characters. It should only include letters and numbers.",
        emailInvalid: "Email is invalid. Please try again.",
        passwordInvalid: "Your password needs to be at least 8 characters. It should include an uppercase and lowercase letter as well as a digit.",
        confirmPasswordMismatch: "Confirm password does not match.",
        usernameTaken: "Username has already been taken. Please try another username.",
        emailTaken: "Email has already been taken. Please try another email.",
      },
    },
    login: {
      title: "Log in",
      forgotPassword: "Forgot your password?",
      alerts: {
        title: "Log In",
        invalidCredentials: "Incorrect email or password",
      },
    },
    verification: {
      title: "Verify your email",
      subtitle: "To verify your email address, please enter the code that we’ve just sent to",
      missingEmailTitle: "Didn't receive the email?",
      missingEmailSubtitle: "Check your spam or resend code.",
      alerts: {
        title: "Verification",
        expiredCode: "Verification code expired. You can request a new one below.",
        invalidCode: "We were unable to verify your email. This can be due to either an expired or invalid code.",
        resendSuccess: "We have sent you the email. If you do not see the email, check your “junk mail” folder or “spam” folder.",
      },
    },
  },
};