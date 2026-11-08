export default {
  userProfile: {
    header: {
      title: "Profile Settings",
      subtitle: "Manage your Linemate profile",
    },
    sections: {
      accountDetails: "Account details",
      billing: "Billing",
    },
    labels: {
      oldPassword: "Old password",
      newPassword: "New password",
      confirmNewPassword: "Confirm new password",
      enterYourPassword: "Enter your password",
      showAll: "Show all",
    },
    descriptions: {
      changePassword: "Change your Linemate account password",
      preferredOdds: "Choose your preferred odds for trends and My Picks",
      language: "Select the language you want Linemate to be displayed in.",
      odds: "Select the format you want the odds to be displayed in.",
      theme: "Select how Linemate is displayed.",
      billingPrimary: "Keep track of your plan and option for payments",
      billingSecondary: "Linemate partners with Stripe for simplified billing and payment management.",
      deleteAccount: "Delete your account and account data",
      deleteAccountSecondary: "If you want to permanently delete your account, you can do so on your right.",
    },
    actions: {
      update: "Update",
      choosePreferredOdds: "Choose your preferred odds",
      saveMyChoices: "Save my choices",
      manageBilling: "Manage billing",
      deleteThisAccount: "Delete this account",
    },
    deleteAccount: {
      confirmMessage: "Are you sure you want to delete your account? If so, please continue below.",
      permanentWarning: "Keep in mind that all of your data will be permanently removed from our servers forever. This action will end your subscription for the next billing period and cannot be undone.",
      acknowledgment: "I acknowledge that all of the data in this account will be deleted and want to proceed.",
    },
    validation: {
      passwordRequirements: "Password needs to include an uppercase letter, a lowercase letter and be at least 8 characters long.",
      confirmPasswordMismatch: "Confirm password does not match.",
      incorrectPassword: "Incorrect password.",
    },
  },
};