
    (function () {
      function sameOriginEndpoint(value) {
        if (!value) return value;

        try {
          const parsed = new URL(String(value), window.location.origin);

          if (parsed.origin === window.location.origin) {
            return parsed.href;
          }

          return `${window.location.origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
        } catch {
          return value;
        }
      }

      function normalizeLivewireEndpointConfig() {
        const livewireScript = document.querySelector('script[data-update-uri]');

        if (livewireScript) {
          const updateUri = sameOriginEndpoint(livewireScript.getAttribute('data-update-uri'));
          const moduleUrl = sameOriginEndpoint(livewireScript.getAttribute('data-module-url'));

          if (updateUri) {
            livewireScript.setAttribute('data-update-uri', updateUri);
          }

          if (moduleUrl) {
            livewireScript.setAttribute('data-module-url', moduleUrl);
          }
        }

        if (window.livewireScriptConfig) {
          window.livewireScriptConfig.uri = sameOriginEndpoint(window.livewireScriptConfig.uri);
          window.livewireScriptConfig.moduleUrl = sameOriginEndpoint(window.livewireScriptConfig.moduleUrl);
        }
      }

      normalizeLivewireEndpointConfig();
      document.addEventListener('livewire:navigated', normalizeLivewireEndpointConfig);
    })();
  