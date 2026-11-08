export default {
  auth: {
    separator: "OPPURE",
    signup: {
      title: "Crea un account",
      placeholders: {
        username: "Inserisci il tuo nome utente...",
        confirmPassword: "Conferma la password...",
      },
      alerts: {
        title: "Crea account",
        usernameInvalid: "Il nome utente deve avere almeno 6 caratteri. Deve contenere solo lettere e numeri.",
        emailInvalid: "L'email non è valida. Riprova.",
        passwordInvalid: "La password deve avere almeno 8 caratteri. Deve includere una lettera maiuscola, una minuscola e un numero.",
        confirmPasswordMismatch: "La conferma della password non corrisponde.",
        usernameTaken: "Questo nome utente è già in uso. Provane un altro.",
        emailTaken: "Questa email è già in uso. Prova un'altra email.",
      },
    },
    login: {
      title: "Accedi",
      forgotPassword: "Hai dimenticato la password?",
      alerts: {
        title: "Accedi",
        invalidCredentials: "Email o password non corretti",
      },
    },
    verification: {
      title: "Verifica la tua email",
      subtitle: "Per verificare il tuo indirizzo email, inserisci il codice che abbiamo appena inviato a",
      missingEmailTitle: "Non hai ricevuto l'email?",
      missingEmailSubtitle: "Controlla lo spam o reinvia il codice.",
      alerts: {
        title: "Verifica",
        expiredCode: "Il codice di verifica è scaduto. Puoi richiederne uno nuovo qui sotto.",
        invalidCode: "Non siamo riusciti a verificare la tua email. Il codice potrebbe essere scaduto o non valido.",
        resendSuccess: "Ti abbiamo inviato l'email. Se non la vedi, controlla la cartella “posta indesiderata” o “spam”.",
      },
    },
  },
};