// Comportamentos comuns dos formulários: erros por campo, botão ocupado e
// mostrar/ocultar senha. Carregar antes de auth.js / solicitacao.js.
const CodegoForm = (function () {
  const campoDe = (nome) => document.getElementById(nome);

  // Mostra (ou limpa, sem msg) o erro de um campo: texto, borda e leitores de tela.
  function erro(nome, msg) {
    const el = document.querySelector(`[data-error-for="${nome}"]`);
    if (el) {
      el.textContent = msg || '';
      if (!el.id) el.id = `erro-${nome}`;
    }
    const input = campoDe(nome);
    const field = (input || el) && (input || el).closest('.field');
    if (field) field.classList.toggle('field--invalid', !!msg);
    if (input) {
      if (msg) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
      // Liga a mensagem ao campo, mantendo descrições que ele já tinha (ex.: dica).
      const ids = (input.getAttribute('aria-describedby') || '').split(' ').filter(Boolean);
      if (el && !ids.includes(el.id)) input.setAttribute('aria-describedby', [...ids, el.id].join(' '));
    }
  }

  function limparErros(form) {
    form.querySelectorAll('[data-error-for]').forEach((e) => erro(e.dataset.errorFor, ''));
  }

  // Leva o usuário ao primeiro campo com erro (em vez de deixá-lo procurar).
  function focarPrimeiroErro(form) {
    const input = form.querySelector('[aria-invalid="true"]');
    if (!input) return false;
    input.focus({ preventScroll: true });
    input.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return true;
  }

  // O erro de um campo some assim que a pessoa começa a corrigi-lo.
  function limparAoEditar(form) {
    form.addEventListener('input', (ev) => {
      const nome = ev.target.id;
      if (nome && ev.target.getAttribute('aria-invalid') === 'true') erro(nome, '');
    });
  }

  // Botão "ocupado": troca o texto (ex.: "Entrando…") e bloqueia novo clique.
  function ocupado(btn, texto) {
    if (!btn.dataset.textoOriginal) btn.dataset.textoOriginal = btn.textContent;
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    btn.textContent = texto;
  }
  function livre(btn) {
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
    if (btn.dataset.textoOriginal) btn.textContent = btn.dataset.textoOriginal;
  }

  // Botão "Mostrar" dentro de cada campo de senha.
  function alternarSenhas(form) {
    form.querySelectorAll('input[type="password"]').forEach((input) => {
      const caixa = document.createElement('div');
      caixa.className = 'field__password';
      input.parentNode.insertBefore(caixa, input);
      caixa.appendChild(input);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'field__password-toggle';
      btn.textContent = 'Mostrar';
      btn.setAttribute('aria-label', 'Mostrar senha');
      btn.setAttribute('aria-pressed', 'false');
      btn.addEventListener('click', () => {
        const mostrar = input.type === 'password';
        input.type = mostrar ? 'text' : 'password';
        btn.textContent = mostrar ? 'Ocultar' : 'Mostrar';
        btn.setAttribute('aria-label', mostrar ? 'Ocultar senha' : 'Mostrar senha');
        btn.setAttribute('aria-pressed', String(mostrar));
        input.focus();
      });
      caixa.appendChild(btn);
    });
  }

  return { erro, limparErros, focarPrimeiroErro, limparAoEditar, ocupado, livre, alternarSenhas };
})();
