// Página inicial (após o login): formulário de solicitação de área.
(function () {
  const API = window.CODEGO_API_BASE_URL;
  const CHAVE = 'dianot_token';
  const $ = (id) => document.getElementById(id);
  const digitos = (v) => (v || '').replace(/\D/g, '');

  let token = null;
  try { token = sessionStorage.getItem(CHAVE); } catch (_) {}
  // Alterações digitadas e ainda não salvas (o formulário é longo: não perder).
  let alterado = false;
  function sair() {
    alterado = false;
    try { sessionStorage.removeItem(CHAVE); } catch (_) {}
    window.location.href = 'index.html';
  }
  if (!token) { sair(); return; }
  $('btn-sair').addEventListener('click', () => {
    if (alterado && !window.confirm('Há alterações não salvas. Sair mesmo assim?')) return;
    sair();
  });
  window.addEventListener('beforeunload', (ev) => {
    if (alterado) { ev.preventDefault(); ev.returnValue = ''; }
  });
  CodegoForm.limparAoEditar($('form-solicitacao'));
  $('form-solicitacao').addEventListener('input', (ev) => {
    if (ev.target.type === 'file') return; // documentos são salvos na hora do envio
    alterado = true;
    // Um "salvo com sucesso" antigo não vale mais depois de nova edição.
    if ($('feedback').classList.contains('feedback--success')) $('feedback').hidden = true;
  });

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
  // Enquanto digita, o campo só aceita números e uma vírgula (até 2 casas).
  // O ponto digitado vira vírgula (teclado numérico); colado, "1.000,50" e
  // "1000.50" são entendidos. Os pontos de milhar voltam ao sair do campo.
  function limparArea(texto, digitado) {
    let t = texto.replace(/[^\d.,]/g, '');
    if (digitado) t = t.replace(/\./g, ',');
    else if (!t.includes(',') && /^\d+\.\d{1,2}$/.test(t)) t = t.replace('.', ',');
    t = t.replace(/\./g, '');
    const i = t.indexOf(',');
    if (i === -1) return t.slice(0, 12);
    return `${t.slice(0, i).slice(0, 12)},${t.slice(i + 1).replace(/,/g, '').slice(0, 2)}`;
  }
  $('area_m2').addEventListener('input', (ev) => {
    const campo = ev.target;
    const digitado = ev.inputType === 'insertText';
    const pos = campo.selectionStart;
    const limpo = limparArea(campo.value, digitado);
    if (limpo === campo.value) return;
    // Mantém o cursor no lugar, descontando os caracteres removidos antes dele.
    const antes = limparArea(campo.value.slice(0, pos), digitado).length;
    campo.value = limpo;
    campo.setSelectionRange(antes, antes);
  });
  $('area_m2').addEventListener('focus', () => {
    $('area_m2').value = $('area_m2').value.replace(/\./g, '');
  });
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

  // ---------- Declaração de compromisso ----------
  const UNIDADES = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez',
    'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro',
    'outubro', 'novembro', 'dezembro'];
  function porExtenso(n) { // 0 a 99
    if (n < 20) return UNIDADES[n];
    const d = Math.floor(n / 10), u = n % 10;
    return u ? `${DEZENAS[d]} e ${UNIDADES[u]}` : DEZENAS[d];
  }
  const mesAno = (v) => (/^\d{4}-\d{2}$/.test(v || '') ? `${v.slice(5)}/${v.slice(0, 4)}` : '');
  const dataPorExtenso = (d) => `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
  // Meses da obra contando o de início e o de fim (null se faltar alguma data).
  function mesesObra(inicio, fim) {
    if (!inicio || !fim) return null;
    const [ai, mi] = inicio.split('-').map(Number);
    const [af, mf] = fim.split('-').map(Number);
    return (af - ai) * 12 + (mf - mi) + 1;
  }
  const percentual = () => Number(digitos($('ocupacao_percentual').value)) || 0;

  let aceitaEm = null; // data da última assinatura salva
  let conhecimentoEm = null; // idem, Anexo IX
  let representanteEditado = false;
  // Campos que mudam o texto da declaração: alterar algum desfaz o aceite.
  const CAMPOS_DECLARACAO = new Set(['nome_empresarial', 'representante_nome', 'representante_cargo',
    'ocupacao_percentual', 'obra_inicio', 'obra_fim', 'declaracao_cidade', 'administrador_nome']);
  // Os que entram no texto do Anexo IX.
  const CAMPOS_CONHECIMENTO = new Set(['nome_empresarial', 'representante_nome', 'declaracao_cidade',
    'administrador_nome']);
  const assinadoEm = (d) =>
    `Assinado eletronicamente em ${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

  function lacuna(chave, texto) {
    document.querySelectorAll(`[data-decl="${chave}"]`).forEach((el) => {
      el.textContent = texto || '______';
      el.classList.toggle('is-vazio', !texto);
    });
  }
  function atualizarDeclaracao() {
    lacuna('razao', $('nome_empresarial').value.trim());
    lacuna('cnpj', $('cnpj').value);
    lacuna('responsavel', $('representante_nome').value.trim());
    lacuna('cargo', $('representante_cargo').value.trim());
    const p = percentual();
    lacuna('percentual', p >= 33 && p <= 80 ? `${p}% (${porExtenso(p)} por cento)` : '');
    lacuna('inicio', mesAno($('obra_inicio').value));
    lacuna('fim', mesAno($('obra_fim').value));
    lacuna('cidade', $('declaracao_cidade').value.trim());
    lacuna('data', dataPorExtenso(aceitaEm || new Date()));
    lacuna('data9', dataPorExtenso(conhecimentoEm || new Date()));
    document.querySelector('[data-decl="assinado9"]').textContent =
      conhecimentoEm && $('conhecimento_objeto_aceito').checked ? assinadoEm(conhecimentoEm) : '';
    const hora = aceitaEm && aceitaEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    document.querySelector('[data-decl="assinado"]').textContent = aceitaEm && $('declaracao_aceita').checked
      ? `Assinado eletronicamente em ${aceitaEm.toLocaleDateString('pt-BR')} às ${hora}`
      : '';
  }

  $('ocupacao_percentual').addEventListener('input', (e) => (e.target.value = digitos(e.target.value).slice(0, 2)));
  $('representante_nome').addEventListener('input', () => { representanteEditado = true; });
  // Enquanto não for alterado, o representante acompanha o administrador.
  $('administrador_nome').addEventListener('input', () => {
    if (!representanteEditado) $('representante_nome').value = $('administrador_nome').value;
  });
  $('form-solicitacao').addEventListener('input', (ev) => {
    if (CAMPOS_DECLARACAO.has(ev.target.id) && $('declaracao_aceita').checked) {
      $('declaracao_aceita').checked = false; // o texto mudou: precisa aceitar de novo
    }
    if (CAMPOS_CONHECIMENTO.has(ev.target.id)) $('conhecimento_objeto_aceito').checked = false;
    atualizarDeclaracao();
  });
  $('declaracao_aceita').addEventListener('change', atualizarDeclaracao);
  $('conhecimento_objeto_aceito').addEventListener('change', atualizarDeclaracao);
  atualizarDeclaracao();

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
    $('representante_nome').value = s.representante_nome || s.administrador_nome;
    representanteEditado = !!s.representante_nome && s.representante_nome !== s.administrador_nome;
    $('representante_cargo').value = s.representante_cargo || '';
    $('ocupacao_percentual').value = s.ocupacao_percentual || '';
    $('obra_inicio').value = s.obra_inicio || '';
    $('obra_fim').value = s.obra_fim || '';
    if (s.declaracao_cidade) $('declaracao_cidade').value = s.declaracao_cidade;
    aceitaEm = s.declaracao_aceita_em ? new Date(s.declaracao_aceita_em) : null;
    $('declaracao_aceita').checked = !!aceitaEm;
    conhecimentoEm = s.conhecimento_objeto_aceito_em ? new Date(s.conhecimento_objeto_aceito_em) : null;
    $('conhecimento_objeto_aceito').checked = !!conhecimentoEm;
    atualizarDeclaracao();
  }
  (async function iniciar() {
    try {
      const u = await api('/api/auth/me');
      $('usuario-logado').textContent = `${u.nome_empresarial} — login (CNPJ): ${u.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')}`;
      $('cnpj').value = u.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
      $('nome_empresarial').value = u.nome_empresarial;
      $('email').value = u.email;
      const s = await api('/api/solicitacoes/minha');
      if (s) preencher(s); else atualizarDeclaracao();
    } catch (_) {
      mostrar('error', 'Falha de conexão. Recarregue a página.');
    }
  })();

  // ---------- Envio ----------
  const erro = CodegoForm.erro;
  function mostrar(tipo, msg) {
    const fb = $('feedback'); fb.className = `feedback feedback--${tipo}`; fb.textContent = msg; fb.hidden = false;
  }
  $('form-solicitacao').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    CodegoForm.limparErros($('form-solicitacao'));
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
    if (!DianotDocumentos.conferirObrigatorios()) ok = false;
    if ($('representante_nome').value.trim().length < 3) { erro('representante_nome', 'Informe o nome do representante legal.'); ok = false; }
    if ($('representante_cargo').value.trim().length < 2) { erro('representante_cargo', 'Informe o cargo.'); ok = false; }
    const pct = percentual();
    if (pct < 33 || pct > 80) { erro('ocupacao_percentual', 'Informe um percentual entre 33% e 80%.'); ok = false; }
    if (!$('obra_inicio').value) { erro('obra_inicio', 'Informe o mês e o ano de início.'); ok = false; }
    if (!$('obra_fim').value) { erro('obra_fim', 'Informe o mês e o ano de fim.'); ok = false; }
    const meses = mesesObra($('obra_inicio').value, $('obra_fim').value);
    if (meses !== null && meses < 1) { erro('obra_fim', 'O fim deve ser igual ou posterior ao início.'); ok = false; }
    if (meses !== null && meses > 24) { erro('obra_fim', `A obra não pode passar de 24 meses (informado: ${meses}).`); ok = false; }
    if ($('declaracao_cidade').value.trim().length < 2) { erro('declaracao_cidade', 'Informe a cidade.'); ok = false; }
    if (!$('declaracao_aceita').checked) { erro('declaracao_aceita', 'Marque para assinar a declaração.'); ok = false; }
    if (!$('conhecimento_objeto_aceito').checked) { erro('conhecimento_objeto_aceito', 'Marque para assinar a declaração.'); ok = false; }
    if (!ok) {
      mostrar('error', 'Corrija os campos destacados e tente novamente.');
      CodegoForm.focarPrimeiroErro($('form-solicitacao'));
      return;
    }

    CodegoForm.ocupado($('btn-salvar'), 'Salvando…');
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
          representante_nome: $('representante_nome').value.trim(),
          representante_cargo: $('representante_cargo').value.trim(),
          ocupacao_percentual: pct,
          obra_inicio: $('obra_inicio').value,
          obra_fim: $('obra_fim').value,
          declaracao_cidade: $('declaracao_cidade').value.trim(),
          declaracao_aceita: true,
          conhecimento_objeto_aceito: true,
        }),
      });
      preencher(s);
      alterado = false;
      mostrar('success', 'Solicitação salva com sucesso. Você pode voltar e alterar os dados quando precisar.');
    } catch (e) {
      mostrar('error', e instanceof TypeError ? 'Falha de conexão. Tente novamente.' : e.message);
    } finally {
      CodegoForm.livre($('btn-salvar'));
    }
  });
})();
