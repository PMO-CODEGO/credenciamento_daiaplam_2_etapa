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

  function cpfValido(v) {
    const d = somenteDigitos(v);
    if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
    for (const n of [9, 10]) {
      let soma = 0;
      for (let i = 0; i < n; i += 1) soma += Number(d[i]) * (n + 1 - i);
      if (((soma * 10) % 11) % 10 !== Number(d[n])) return false;
    }
    return true;
  }

  function mascararCpf(input) {
    input.addEventListener('input', () => {
      input.value = somenteDigitos(input.value).slice(0, 11)
        .replace(/^(\d{3})(\d)/, '$1.$2')
        .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d)/, '.$1-$2');
    });
  }

  const erro = CodegoForm.erro;
  function limparErros(form) {
    CodegoForm.limparErros(form);
    const fb = $('feedback'); fb.hidden = true; fb.textContent = '';
  }

  // Preparação comum das telas de login e cadastro.
  function prepararForm(form) {
    mascararCnpj($('cnpj'));
    CodegoForm.alternarSenhas(form);
    CodegoForm.limparAoEditar(form);
    // CNPJ conferido ao sair do campo, não só no envio.
    $('cnpj').addEventListener('blur', () => {
      if ($('cnpj').value && !cnpjValido($('cnpj').value)) erro('cnpj', 'Informe um CNPJ válido.');
    });
    iniciarRecaptcha();
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
        if (cfg && cfg.recaptcha_enabled && !cfg.recaptcha_site_key) {
          caixa.textContent = 'reCAPTCHA ligado, mas sem RECAPTCHA_SITE_KEY no servidor.';
          caixa.className = 'field__error';
          return;
        }
        if (!cfg || !cfg.recaptcha_enabled) {
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

  async function enviar(caminho, corpo, btn, textoOcupado) {
    CodegoForm.ocupado(btn, textoOcupado);
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
      CodegoForm.livre(btn);
    }
  }

  function salvarSessao(dados) {
    try { sessionStorage.setItem(CHAVE, dados.access_token); } catch (_) {}
    window.location.href = 'home.html';
  }

  // Depois do cadastro: mostra a senha gerada (única vez) antes de entrar no sistema.
  function mostrarSenhaGerada(dados) {
    try { sessionStorage.setItem(CHAVE, dados.access_token); } catch (_) {}
    const card = document.querySelector('main.card');
    card.innerHTML = `
      <div class="card__intro">
        <h2 class="card__title">Cadastro concluído</h2>
        <p class="card__desc">Guarde a senha abaixo: ela é mostrada <strong>somente agora</strong> e será pedida em todo acesso, junto com o CNPJ.</p>
      </div>
      <div class="field">
        <label>Login (CNPJ)</label>
        <input type="text" id="login-final" readonly>
      </div>
      <div class="field">
        <label for="senha-gerada">Senha gerada</label>
        <input type="text" id="senha-gerada" readonly autocomplete="off" spellcheck="false" style="font-family: monospace; font-size: 1.15rem; letter-spacing: .05em;">
        <p class="field__hint" id="copiado" aria-live="polite"></p>
      </div>
      <div class="card__footer">
        <button type="button" class="btn-secondary" id="btn-copiar">Copiar senha</button>
        <button type="button" class="btn-primary" id="btn-continuar" disabled>Continuar</button>
      </div>
      <label class="field__hint" style="display:flex; gap:8px; align-items:center; margin-top:14px;">
        <input type="checkbox" id="anotei"> Já guardei a senha em local seguro.
      </label>`;
    $('login-final').value = dados.usuario.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
    $('senha-gerada').value = dados.senha_gerada;
    $('senha-gerada').addEventListener('focus', (e) => e.target.select());
    $('btn-copiar').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(dados.senha_gerada); $('copiado').textContent = 'Senha copiada.'; }
      catch (_) { $('senha-gerada').select(); $('copiado').textContent = 'Selecione e copie a senha manualmente (Ctrl+C).'; }
    });
    $('anotei').addEventListener('change', (e) => { $('btn-continuar').disabled = !e.target.checked; });
    $('btn-continuar').addEventListener('click', () => { window.location.href = 'home.html'; });
    window.scrollTo({ top: 0 });
  }

  function iniciarLogin() {
    const form = $('form-login');
    // Saída pelo botão "Sair" (js/sessao.js): a sessão só é apagada aqui, depois
    // que a página anterior foi de fato deixada.
    if (new URLSearchParams(window.location.search).has('saiu')) {
      try { sessionStorage.removeItem(CHAVE); } catch (_) {}
      history.replaceState(null, '', window.location.pathname);
      const aviso = document.createElement('p');
      aviso.className = 'feedback feedback--success';
      aviso.setAttribute('role', 'status');
      aviso.textContent = 'Você saiu da sua conta.';
      form.prepend(aviso);
      form.addEventListener('submit', () => aviso.remove(), { once: true });
    }
    prepararForm(form);
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      limparErros(form);
      let ok = true;
      if (!cnpjValido($('cnpj').value)) { erro('cnpj', 'Informe um CNPJ válido.'); ok = false; }
      if (!$('senha').value) { erro('senha', 'Informe a senha.'); ok = false; }
      if (recaptchaAtivo && !tokenRecaptcha()) { erro('recaptcha', 'Confirme que você não é um robô.'); ok = false; }
      if (!ok) { CodegoForm.focarPrimeiroErro(form); return; }
      const dados = await enviar('/api/auth/login', {
        cnpj: somenteDigitos($('cnpj').value),
        senha: $('senha').value,
        g_recaptcha_response: tokenRecaptcha(),
      }, $('btn-enviar'), 'Entrando…');
      if (dados) return salvarSessao(dados);
      // Login recusado: o CNPJ fica, a senha fica selecionada para redigitar.
      $('senha').focus();
      $('senha').select();
    });
  }

  function iniciarCadastro() {
    const form = $('form-cadastro');
    prepararForm(form);
    mascararCpf($('representante_cpf'));
    $('representante_cpf').addEventListener('blur', () => {
      if ($('representante_cpf').value && !cpfValido($('representante_cpf').value)) {
        erro('representante_cpf', 'Informe um CPF válido.');
      }
    });
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      limparErros(form);
      let ok = true;
      if (!cnpjValido($('cnpj').value)) { erro('cnpj', 'Informe um CNPJ válido.'); ok = false; }
      if ($('nome_empresarial').value.trim().length < 3) { erro('nome_empresarial', 'Informe o nome da empresa.'); ok = false; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test($('email').value.trim())) { erro('email', 'Informe um e-mail válido.'); ok = false; }
      if (!/^[\p{L}]+([ '.-][\p{L}]+)+\.?$/u.test($('representante_nome').value.trim())) {
        erro('representante_nome', 'Informe o nome completo do Representante Legal.'); ok = false;
      }
      if (!cpfValido($('representante_cpf').value)) { erro('representante_cpf', 'Informe um CPF válido.'); ok = false; }
      if ($('representante_cargo').value.trim().length < 2) { erro('representante_cargo', 'Informe o cargo do Representante Legal.'); ok = false; }
      if (!$('privacidade_ciente').checked) { erro('privacidade_ciente', 'Declare ciência do Aviso de Privacidade para continuar.'); ok = false; }
      if (recaptchaAtivo && !tokenRecaptcha()) { erro('recaptcha', 'Confirme que você não é um robô.'); ok = false; }
      if (!ok) { CodegoForm.focarPrimeiroErro(form); return; }
      const dados = await enviar('/api/auth/cadastro', {
        cnpj: somenteDigitos($('cnpj').value),
        nome_empresarial: $('nome_empresarial').value.trim(),
        email: $('email').value.trim(),
        representante_nome: $('representante_nome').value.trim(),
        representante_cpf: somenteDigitos($('representante_cpf').value),
        representante_cargo: $('representante_cargo').value.trim(),
        privacidade_ciente: $('privacidade_ciente').checked,
        g_recaptcha_response: tokenRecaptcha(),
      }, $('btn-enviar'), 'Cadastrando…');
      if (dados) mostrarSenhaGerada(dados);
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
