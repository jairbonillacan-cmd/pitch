export default {
  auth: {
    separator: "O",
    signup: {
      title: "Crear una cuenta",
      placeholders: {
        username: "Ingresa tu nombre de usuario...",
        confirmPassword: "Confirma tu contraseña...",
      },
      alerts: {
        title: "Crear cuenta",
        usernameInvalid: "Tu nombre de usuario debe tener al menos 6 caracteres. Solo debe incluir letras y números.",
        emailInvalid: "El correo electrónico no es válido. Vuelve a intentarlo.",
        passwordInvalid: "Tu contraseña debe tener al menos 8 caracteres. Debe incluir una letra mayúscula, una minúscula y un número.",
        confirmPasswordMismatch: "La confirmación de la contraseña no coincide.",
        usernameTaken: "Ese nombre de usuario ya está en uso. Prueba con otro.",
        emailTaken: "Ese correo electrónico ya está en uso. Prueba con otro.",
      },
    },
    login: {
      title: "Iniciar sesión",
      forgotPassword: "¿Olvidaste tu contraseña?",
      alerts: {
        title: "Iniciar sesión",
        invalidCredentials: "Correo electrónico o contraseña incorrectos",
      },
    },
    verification: {
      title: "Verifica tu correo",
      subtitle: "Para verificar tu correo electrónico, ingresa el código que acabamos de enviarte a",
      missingEmailTitle: "¿No recibiste el correo?",
      missingEmailSubtitle: "Revisa tu carpeta de spam o vuelve a enviar el código.",
      alerts: {
        title: "Verificación",
        expiredCode: "El código de verificación expiró. Puedes solicitar uno nuevo abajo.",
        invalidCode: "No pudimos verificar tu correo electrónico. Puede deberse a un código vencido o no válido.",
        resendSuccess: "Te enviamos el correo. Si no lo ves, revisa tu carpeta de correo no deseado o spam.",
      },
    },
  },
};