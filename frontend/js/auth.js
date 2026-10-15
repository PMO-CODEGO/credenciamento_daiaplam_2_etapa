// Login, cadastro e sessão (JWT guardado só na aba: sessionStorage).
const CodegoAuth = (function () {
  const API = () => window.CODEGO_API_BASE_URL;
  const CHAVE = 'dianot_token';
  let recaptchaId = null;
  let recaptchaAtivo = false;

  const $ = (id) => document.getElementById(id);

  function somenteDigitos(v) { return (v || '').replace(/\D/g, ''); }

  function cnpjValido(v) {
    const d = somenteDigitos(v);
    if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
    const pesos = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    for (const n of [12, 13]) {
      const p = n === 12 ? pesos : [6, ...pesos];
      const soma = p.reduce((a, peso, i) => a + (i < n ? Number(d[i]) * peso : 0), 0);
      const r = soma % 11;
      if ((r < 2 ? 0 : 11 - r) !== Number(d[n])) return false;
    }
    return true;
  }

  function mascararCnpj(input) {
    input.addEventListener('input', () => {
      const d = somenteDigitos(input.value).slice(0, 14);
      input.value = d
        .replace(/^(\d{2})(\d)/, '$1.$2')
        .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d)/, '.$1/$2')
        .replace(/(\d{4})(\d)/, '$1-$2');
    });
  }

  function erro(campo, msg) {
    const el = document.querySelector(`[data-error-for="${campo}"]`);
    if (el) el.textContent = msg || '';
  }
  function limparErros(form) {
    form.querySelectorAll('[data-error-for]').forEach((e) => (e.textContent = ''));
    const fb = $('feedback'); fb.hidden = true; fb.textContent = '';
  }
  function mostrarFeedback(msg) {
    const fb = $('feedback'); fb.textContent = msg; fb.hidden = false;
  }

  // reCAPTCHA: só aparece se estiver ligado no servidor.
  function iniciarRecaptcha() {
    fetch(`${API()}/api/config`)
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg) => {
        const caixa = $('recaptcha');
        const campo = caixa.closest('.field');
        if (!cfg || !cfg.recaptcha_enabled || !cfg.recaptcha_site_key) {
          // Falha ao ler a config: não esconde nada (o servidor continua exigindo).
          if (cfg) campo.hidden = true;
          return;
        }
        recaptchaAtivo = true;
        window.__recaptchaPronto = () => {
          recaptchaId = grecaptcha.render(caixa, { sitekey: cfg.recaptcha_site_key });
        };
        const s = document.createElement('script');
        s.src = 'https://www.google.com/recaptcha/api.js?onload=__recaptchaPronto&render=explicit';
        s.async = true; s.defer = true;
        document.head.appendChild(s);
      })
      .catch(() => {});
  }
  const tokenRecaptcha = () =>
    recaptchaAtivo && recaptchaId !== null ? grecaptcha.getResponse(recaptchaId) : '';
  const resetRecaptcha = () => { if (recaptchaAtivo && recaptchaId !== null) grecaptcha.reset(recaptchaId); };

  async function enviar(caminho, corpo, btn) {
    btn.disabled = true;
    try {
      const resp = await fetch(`${API()}${caminho}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      });
      const dados = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        let msg = dados.detail;
        if (Array.isArray(msg)) msg = msg.map((e) => (e.msg || '').replace(/^Value error, /, '')).join(' ');
        throw new Error(msg || 'Não foi possível concluir. Tente novamente.');
      }
      return dados;
    } catch (e) {
      mostrarFeedback(e instanceof TypeError ? 'Falha de conexão. Verifique sua internet e tente novamente.' : e.message);
      resetRecaptcha();
      return null;
    } finally {
      btn.disabled = false;
    }
  }

  function salvarSessao(dados) {
    try { sessionStorage.setItem(CHAVE, dados.access_token); } catch (_) {}
    window.location.href = 'home.html';
  }

  function iniciarLogin() {
    const form = $('form-login');
    mascararCnpj($('cnpj'));
    iniciarRecaptcha();
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      limparErros(form);
      let ok = true;
      if (!cnpjValido($('cnpj').value)) { erro('cnpj', 'Informe um CNPJ válido.'); ok = false; }
      if (!$('senha').value) { erro('senha', 'Informe a senha.'); ok = false; }
      if (recaptchaAtivo && !tokenRecaptcha()) { erro('recaptcha', 'Confirme que você não é um robô.'); ok = false; }
      if (!ok) return;
      const dados = await enviar('/api/auth/login', {
        cnpj: somenteDigitos($('cnpj').value),
        senha: $('senha').value,
        g_recaptcha_response: tokenRecaptcha(),
      }, $('btn-enviar'));
      if (dados) salvarSessao(dados);
    });
  }

  function iniciarCadastro() {
    const form = $('form-cadastro');
    mascararCnpj($('cnpj'));
    iniciarRecaptcha();
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      limparErros(form);
      let ok = true;
      const senha = $('senha').value;
      if (!cnpjValido($('cnpj').value)) { erro('cnpj', 'Informe um CNPJ válido.'); ok = false; }
      if ($('nome_empresarial').value.trim().length < 3) { erro('nome_empresarial', 'Informe o nome da empresa.'); ok = false; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test($('email').value.trim())) { erro('email', 'Informe um e-mail válido.'); ok = false; }
      if (senha.length < 8 || !/[A-Za-z]/.test(senha) || !/[0-9]/.test(senha)) {
        erro('senha', 'Mínimo de 8 caracteres, com letras e números.'); ok = false;
      }
      if (senha !== $('senha2').value) { erro('senha2', 'As senhas não conferem.'); ok = false; }
      if (recaptchaAtivo && !tokenRecaptcha()) { erro('recaptcha', 'Confirme que você não é um robô.'); ok = false; }
      if (!ok) return;
      const dados = await enviar('/api/auth/cadastro', {
        cnpj: somenteDigitos($('cnpj').value),
        nome_empresarial: $('nome_empresarial').value.trim(),
        email: $('email').value.trim(),
        senha,
        g_recaptcha_response: tokenRecaptcha(),
      }, $('btn-enviar'));
      if (dados) salvarSessao(dados);
    });
  }

  function sair() {
    try { sessionStorage.removeItem(CHAVE); } catch (_) {}
    window.location.href = 'index.html';
  }

  async function iniciarHome() {
    $('btn-sair').addEventListener('click', sair);
    let token = null;
    try { token = sessionStorage.getItem(CHAVE); } catch (_) {}
    if (!token) return sair();
    try {
      const resp = await fetch(`${API()}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
      if (!resp.ok) return sair();
      const u = await resp.json();
      $('boas-vindas').textContent = `Bem-vindo, ${u.nome_empresarial}`;
      const d = u.cnpj;
      $('dados-usuario').textContent =
        `Login (CNPJ): ${d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')}`;
    } catch (_) {
      $('dados-usuario').textContent = 'Falha de conexão. Recarregue a página.';
    }
  }

  return { iniciarLogin, iniciarCadastro, iniciarHome };
})();
