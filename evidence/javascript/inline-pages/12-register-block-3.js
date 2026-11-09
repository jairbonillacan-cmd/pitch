
      (function () {
        var token = document.querySelector('[data-recaptcha-token]');
        var form = token && token.form;
        if (!form) return;
        form.addEventListener('submit', function (event) {
          if (token.value || !window.grecaptcha || !grecaptcha.execute) return;
          event.preventDefault();
          grecaptcha.ready(function () {
            grecaptcha.execute("6LfFoBcuAAAAAGkOIh5bJsfjA5zXtmktJwN5x3XJ", { action: "register" })
              .then(function (value) { token.value = value; form.submit(); })
              .catch(function () { form.submit(); });
          });
        });
      })();
    