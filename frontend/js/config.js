// Endereço da API (backend) usado por todas as páginas do site.
// Carregar antes dos outros scripts da página.
//
// - Desenvolvimento (docker-compose.yml: site na porta 8080, API na 8000, ou
//   arquivo aberto direto): http://<mesma máquina>:8000.
// - Site e API em endereços diferentes (ex.: site num serviço, backend em outro):
//   preencher API_PRODUCAO com o endereço https do backend.
// - Produção (Render, ou a VM com o Caddy — ver deploy/): site e API ficam no
//   mesmo endereço, então a API é o próprio endereço do site.
(function () {
  const API_PRODUCAO = '';

  const { protocol, hostname, port, origin } = window.location;

  if (protocol === 'file:' || port === '8080') {
    window.CODEGO_API_BASE_URL = `http://${hostname || 'localhost'}:8000`;
  } else if (API_PRODUCAO) {
    window.CODEGO_API_BASE_URL = API_PRODUCAO.replace(/\/+$/, '');
  } else {
    window.CODEGO_API_BASE_URL = origin;
  }

  // reCAPTCHA: o site só exige a caixa "Não sou um robô" quando ela está
  // ligada no servidor (RECAPTCHA_ENABLED). Desligada, a caixa é escondida —
  // senão, num domínio que a chave não conhece, ela mostraria erro e travaria
  // o envio. Até a resposta chegar (ou se falhar), vale a regra mais segura:
  // exigir.
  window.CODEGO_RECAPTCHA_ATIVO = true;
  fetch(`${window.CODEGO_API_BASE_URL}/api/config`)
    .then((resposta) => (resposta.ok ? resposta.json() : null))
    .then((config) => {
      if (!config || config.recaptcha_enabled) return;
      window.CODEGO_RECAPTCHA_ATIVO = false;
      document.querySelectorAll('.g-recaptcha').forEach((caixa) => {
        (caixa.closest('.field') || caixa).hidden = true;
      });
    })
    .catch(() => {});
})();
