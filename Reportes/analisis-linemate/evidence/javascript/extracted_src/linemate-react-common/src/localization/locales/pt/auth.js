export default {
  auth: {
    separator: "OU",
    signup: {
      title: "Criar uma conta",
      placeholders: {
        username: "Digite seu nome de usuário...",
        confirmPassword: "Confirme sua senha...",
      },
      alerts: {
        title: "Criar conta",
        usernameInvalid: "Seu nome de usuário precisa ter pelo menos 6 caracteres. Use apenas letras e números.",
        emailInvalid: "O e-mail é inválido. Tente novamente.",
        passwordInvalid: "Sua senha precisa ter pelo menos 8 caracteres. Ela deve incluir uma letra maiúscula, uma minúscula e um número.",
        confirmPasswordMismatch: "A confirmação da senha não corresponde.",
        usernameTaken: "Esse nome de usuário já está em uso. Tente outro.",
        emailTaken: "Esse e-mail já está em uso. Tente outro.",
      },
    },
    login: {
      title: "Entrar",
      forgotPassword: "Esqueceu sua senha?",
      alerts: {
        title: "Entrar",
        invalidCredentials: "E-mail ou senha incorretos",
      },
    },
    verification: {
      title: "Verifique seu e-mail",
      subtitle: "Para verificar seu endereço de e-mail, digite o código que acabamos de enviar para",
      missingEmailTitle: "Não recebeu o e-mail?",
      missingEmailSubtitle: "Verifique o spam ou reenvie o código.",
      alerts: {
        title: "Verificação",
        expiredCode: "O código de verificação expirou. Você pode solicitar um novo abaixo.",
        invalidCode: "Não foi possível verificar seu e-mail. Isso pode ter ocorrido por um código expirado ou inválido.",
        resendSuccess: "Enviamos o e-mail. Se você não o encontrar, verifique a pasta de lixo eletrônico ou spam.",
      },
    },
  },
};