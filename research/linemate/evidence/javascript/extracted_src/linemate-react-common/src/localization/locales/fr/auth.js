export default {
  auth: {
    separator: "OU",
    signup: {
      title: "Créer un compte",
      placeholders: {
        username: "Entrez votre nom d'utilisateur...",
        confirmPassword: "Confirmez votre mot de passe...",
      },
      alerts: {
        title: "Créer un compte",
        usernameInvalid: "Votre nom d'utilisateur doit contenir au moins 6 caractères. Il ne doit contenir que des lettres et des chiffres.",
        emailInvalid: "L'adresse courriel est invalide. Veuillez réessayer.",
        passwordInvalid: "Votre mot de passe doit contenir au moins 8 caractères. Il doit inclure une majuscule, une minuscule et un chiffre.",
        confirmPasswordMismatch: "La confirmation du mot de passe ne correspond pas.",
        usernameTaken: "Ce nom d'utilisateur est déjà pris. Veuillez en essayer un autre.",
        emailTaken: "Cette adresse courriel est déjà utilisée. Veuillez en essayer une autre.",
      },
    },
    login: {
      title: "Se connecter",
      forgotPassword: "Mot de passe oublié?",
      alerts: {
        title: "Connexion",
        invalidCredentials: "Adresse courriel ou mot de passe incorrect",
      },
    },
    verification: {
      title: "Vérifiez votre courriel",
      subtitle: "Pour vérifier votre adresse courriel, entrez le code que nous venons d'envoyer à",
      missingEmailTitle: "Vous n'avez pas reçu le courriel?",
      missingEmailSubtitle: "Vérifiez vos pourriels ou renvoyez le code.",
      alerts: {
        title: "Vérification",
        expiredCode: "Le code de vérification a expiré. Vous pouvez en demander un nouveau ci-dessous.",
        invalidCode: "Nous n'avons pas pu vérifier votre courriel. Le code est peut-être expiré ou invalide.",
        resendSuccess: "Nous vous avons envoyé le courriel. Si vous ne le voyez pas, vérifiez votre dossier de pourriels ou de courrier indésirable.",
      },
    },
  },
};
