export default {
  auth: {
    separator: "ODER",
    signup: {
      title: "Konto erstellen",
      placeholders: {
        username: "Benutzernamen eingeben...",
        confirmPassword: "Passwort bestätigen...",
      },
      alerts: {
        title: "Konto erstellen",
        usernameInvalid: "Dein Benutzername muss mindestens 6 Zeichen lang sein und darf nur Buchstaben und Zahlen enthalten.",
        emailInvalid: "Die E-Mail-Adresse ist ungültig. Bitte versuche es erneut.",
        passwordInvalid: "Dein Passwort muss mindestens 8 Zeichen lang sein. Es muss einen Großbuchstaben, einen Kleinbuchstaben und eine Zahl enthalten.",
        confirmPasswordMismatch: "Die Passwortbestätigung stimmt nicht überein.",
        usernameTaken: "Dieser Benutzername ist bereits vergeben. Bitte versuche einen anderen.",
        emailTaken: "Diese E-Mail-Adresse ist bereits vergeben. Bitte versuche eine andere.",
      },
    },
    login: {
      title: "Einloggen",
      forgotPassword: "Passwort vergessen?",
      alerts: {
        title: "Einloggen",
        invalidCredentials: "Falsche E-Mail-Adresse oder falsches Passwort",
      },
    },
    verification: {
      title: "E-Mail bestätigen",
      subtitle: "Gib zur Bestätigung deiner E-Mail-Adresse bitte den Code ein, den wir gerade gesendet haben an",
      missingEmailTitle: "Keine E-Mail erhalten?",
      missingEmailSubtitle: "Prüfe deinen Spam-Ordner oder sende den Code erneut.",
      alerts: {
        title: "Bestätigung",
        expiredCode: "Der Bestätigungscode ist abgelaufen. Du kannst unten einen neuen anfordern.",
        invalidCode: "Wir konnten deine E-Mail nicht bestätigen. Der Code ist möglicherweise abgelaufen oder ungültig.",
        resendSuccess: "Wir haben dir die E-Mail gesendet. Wenn du sie nicht siehst, prüfe deinen Junk- oder Spam-Ordner.",
      },
    },
  },
};
