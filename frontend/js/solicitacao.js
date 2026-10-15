// Página inicial (após o login): formulário de solicitação de área.
(function () {
  const API = window.CODEGO_API_BASE_URL;
  const CHAVE = 'dianot_token';
  const $ = (id) => document.getElementById(id);
  const digitos = (v) => (v || '').replace(/\D/g, '');

  let token = null;
  try { token = sessionStorage.getItem(CHAVE); } catch (_) {}
  function sair() {
    try { sessionStorage.removeItem(CHAVE); } catch (_) {}
    window.location.href = 'index.html';
  }
  if (!token) { sair(); return; }
  $('btn-sair').addEventListener('click', sair);

  async function api(caminho, opcoes = {}) {
    const resp = await fetch(`${API}${caminho}`, {
      ...opcoes,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    if (resp.status === 401) { sair(); throw new Error('Sessão expirada.'); }
    const dados = await resp.json().catch(() => null);
    if (!resp.ok) {
      let msg = dados && dados.detail;
      if (Array.isArray(msg)) msg = msg.map((e) => (e.msg || '').replace(/^Value error, /, '')).join(' ');
      const e = new Error(msg || 'Não foi possível concluir.'); e.status = resp.status; throw e;
    }
    return dados;
  }

  // ---------- Links dos anexos ----------
  document.querySelectorAll('[data-link]').forEach((a) => {
    a.addEventListener('click', (ev) => {
      const url = (window.DIANOT_LINKS || {})[a.dataset.link];
      if (!url) { ev.preventDefault(); $('aviso-link').hidden = false; return; }
      a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    });
  });

  // ---------- Máscaras e validações ----------
  function cpfValido(v) {
    const d = digitos(v);
    if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
    for (const n of [9, 10]) {
      let soma = 0;
      for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
      if (((soma * 10) % 11) % 10 !== Number(d[n])) return false;
    }
    return true;
  }
  const mascaraCpf = (v) => digitos(v).slice(0, 11)
    .replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2');
  const mascaraTel = (v) => {
    const d = digitos(v).slice(0, 11);
    if (d.length <= 2) return d ? `(${d}` : '';
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  };
  const mascaraCnae = (v) => {
    const d = digitos(v).slice(0, 7);
    return d.replace(/^(\d{4})(\d)/, '$1-$2').replace(/^(\d{4}-\d)(\d)/, '$1/$2');
  };
  $('administrador_cpf').addEventListener('input', (e) => (e.target.value = mascaraCpf(e.target.value)));
  $('telefone').addEventListener('input', (e) => (e.target.value = mascaraTel(e.target.value)));

  // Área: aceita 1000, 1.000,5 ou 1000,50 -> exibe 1.000,50. Devolve "1000.50" ou null.
  function lerArea(texto) {
    const t = (texto || '').trim().replace(/\s*m\s*[²2]\s*$/i, '');
    if (!/^(\d{1,3}(\.\d{3})+|\d+)(,\d+)?$/.test(t)) return { erro: 'Informe apenas números (ex.: 1.000,00).' };
    const [int, dec = ''] = t.replace(/\./g, '').split(',');
    if (dec.length > 2) return { erro: 'Use no máximo duas casas depois da vírgula.' };
    const valor = `${int}.${dec.padEnd(2, '0')}`;
    if (Number(valor) <= 0) return { erro: 'A área deve ser maior que zero.' };
    if (int.length > 12) return { erro: 'Valor muito grande.' };
    return { valor };
  }
  const formatarArea = (valor) =>
    Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  $('area_m2').addEventListener('blur', () => {
    const r = lerArea($('area_m2').value);
    if (r.valor) $('area_m2').value = formatarArea(r.valor);
  });

  // ---------- CNAE ----------
  let cnaeValido = null; // { codigo, descricao } confirmado pelo servidor
  let seq = 0;
  function statusCnae(msg, cls) {
    const el = $('cnae-status'); el.textContent = msg || '';
    el.className = 'field__hint' + (cls ? ` field__hint--${cls}` : '');
  }
  let pendente = Promise.resolve();
  function conferirCnae() { pendente = _conferirCnae(); return pendente; }
  async function _conferirCnae() {
    const d = digitos($('cnae').value);
    if (cnaeValido && cnaeValido.codigo === d) return; // já confirmado
    cnaeValido = null; $('cnae_descricao').value = '';
    if (d.length !== 7) { statusCnae(d.length ? 'O CNAE tem 7 dígitos (ex.: 0000-0/00).' : '', d.length ? 'warn' : ''); return; }
    const minha = ++seq;
    statusCnae('Conferindo na tabela de CNAEs…');
    try {
      const c = await api(`/api/cnae/${d}`);
      if (minha !== seq) return;
      cnaeValido = c; $('cnae').value = c.codigo_formatado; $('cnae_descricao').value = c.descricao;
      statusCnae('CNAE válido.', 'ok');
    } catch (e) {
      if (minha !== seq) return;
      statusCnae(e.status === 404 ? 'CNAE não consta na tabela de CNAEs aceitos.' : e.message, 'warn');
    }
  }
  let timer = null;
  $('cnae').addEventListener('input', () => {
    const v = $('cnae').value;
    // texto livre (letras) = busca por descrição; só dígitos = máscara do código
    if (!/[A-Za-zÀ-ÿ]/.test(v)) $('cnae').value = mascaraCnae(v);
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const q = $('cnae').value.trim();
      if (q.length >= 2) {
        try {
          const lista = await api(`/api/cnae?q=${encodeURIComponent(q)}`);
          $('cnae-sugestoes').innerHTML = '';
          lista.forEach((c) => {
            const o = document.createElement('option');
            o.value = c.codigo_formatado; o.label = c.descricao; o.textContent = c.descricao;
            $('cnae-sugestoes').appendChild(o);
          });
        } catch (_) {}
      }
      if (!/[A-Za-zÀ-ÿ]/.test(q)) conferirCnae();
    }, 300);
  });
  $('cnae').addEventListener('change', () => { if (!/[A-Za-zÀ-ÿ]/.test($('cnae').value)) conferirCnae(); });
  $('cnae').addEventListener('blur', () => { if (!cnaeValido && digitos($('cnae').value).length === 7) conferirCnae(); });

  // ---------- Carregar dados ----------
  function preencher(s) {
    $('area_m2').value = formatarArea(s.area_m2);
    $('nome_empresarial').value = s.nome_empresarial;
    $('endereco_correspondencia').value = s.endereco_correspondencia;
    $('email').value = s.email;
    $('telefone').value = mascaraTel(s.telefone);
    $('administrador_nome').value = s.administrador_nome;
    $('administrador_cpf').value = mascaraCpf(s.administrador_cpf);
    $('cnae').value = mascaraCnae(s.cnae_codigo);
    conferirCnae();
  }
  (async function iniciar() {
    try {
      const u = await api('/api/auth/me');
      $('usuario-logado').textContent = `${u.nome_empresarial} — login (CNPJ): ${u.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')}`;
      $('cnpj').value = u.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
      $('nome_empresarial').value = u.nome_empresarial;
      $('email').value = u.email;
      const s = await api('/api/solicitacoes/minha');
      if (s) preencher(s);
    } catch (_) {
      mostrar('error', 'Falha de conexão. Recarregue a página.');
    }
  })();

  // ---------- Envio ----------
  function erro(campo, msg) { const el = document.querySelector(`[data-error-for="${campo}"]`); if (el) el.textContent = msg || ''; }
  function mostrar(tipo, msg) {
    const fb = $('feedback'); fb.className = `feedback feedback--${tipo}`; fb.textContent = msg; fb.hidden = false;
  }
  $('form-solicitacao').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    document.querySelectorAll('[data-error-for]').forEach((e) => (e.textContent = ''));
    $('feedback').hidden = true;

    await pendente; // espera a conferência do CNAE em andamento
    let ok = true;
    const area = lerArea($('area_m2').value);
    if (!area.valor) { erro('area_m2', area.erro); ok = false; }
    if ($('nome_empresarial').value.trim().length < 3) { erro('nome_empresarial', 'Informe o nome empresarial.'); ok = false; }
    if ($('endereco_correspondencia').value.trim().length < 5) { erro('endereco_correspondencia', 'Informe o endereço para correspondência.'); ok = false; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test($('email').value.trim())) { erro('email', 'Informe um e-mail válido.'); ok = false; }
    if (![10, 11].includes(digitos($('telefone').value).length)) { erro('telefone', 'Informe o telefone com DDD.'); ok = false; }
    if ($('administrador_nome').value.trim().length < 3) { erro('administrador_nome', 'Informe o nome do administrador.'); ok = false; }
    if (!cpfValido($('administrador_cpf').value)) { erro('administrador_cpf', 'Informe um CPF válido.'); ok = false; }
    if (!cnaeValido) { erro('cnae', 'Informe um CNAE válido, que conste na tabela.'); ok = false; }
    if (!ok) { mostrar('error', 'Corrija os campos destacados e tente novamente.'); return; }

    $('btn-salvar').disabled = true;
    try {
      const s = await api('/api/solicitacoes/minha', {
        method: 'PUT',
        body: JSON.stringify({
          area_m2: area.valor,
          nome_empresarial: $('nome_empresarial').value.trim(),
          cnpj: digitos($('cnpj').value),
          endereco_correspondencia: $('endereco_correspondencia').value.trim(),
          email: $('email').value.trim(),
          telefone: digitos($('telefone').value),
          administrador_nome: $('administrador_nome').value.trim(),
          administrador_cpf: digitos($('administrador_cpf').value),
          cnae: cnaeValido.codigo,
        }),
      });
      preencher(s);
      mostrar('success', 'Solicitação salva com sucesso. Você pode voltar e alterar os dados quando precisar.');
    } catch (e) {
      mostrar('error', e instanceof TypeError ? 'Falha de conexão. Tente novamente.' : e.message);
    } finally {
      $('btn-salvar').disabled = false;
    }
  });
})();
