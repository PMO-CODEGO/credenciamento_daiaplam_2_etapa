// Página inicial (após o login): formulário de solicitação de área.
(function () {
  const API = window.CODEGO_API_BASE_URL;
  const CHAVE = 'dianot_token';
  const $ = (id) => document.getElementById(id);
  const digitos = (v) => (v || '').replace(/\D/g, '');

  let token = null;
  try { token = sessionStorage.getItem(CHAVE); } catch (_) {}
  // Alterações digitadas e ainda não salvas (o salvamento automático cuida delas).
  let alterado = false;
  function sair() {
    alterado = false;
    try { sessionStorage.removeItem(CHAVE); } catch (_) {}
    window.location.href = 'index.html';
  }
  if (!token) { sair(); return; }
  // Saindo da página (ex.: "Sair" do cabeçalho) com alteração ainda não salva:
  // envia na hora, sem perguntar nada.
  window.addEventListener('pagehide', () => { if (alterado) salvarAgora({ aoSair: true }); });
  CodegoForm.limparAoEditar($('form-solicitacao'));
  $('form-solicitacao').addEventListener('input', (ev) => {
    if (ev.target.type === 'file') return; // documentos são salvos na hora do envio
    alterado = true;
    agendarSalvamento();
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
  const percentual = () => Number(digitos($('ocupacao_percentual').value)) || 0;

  let aceitaEm = null; // data da última assinatura salva
  let conhecimentoEm = null; // idem, Anexo IX
  let liquidacaoEm = null; // idem, Anexo XIII
  let sedeEditada = false;
  let representanteEditado = false;
  // Campos que mudam o texto da declaração: alterar algum desfaz o aceite.
  const CAMPOS_DECLARACAO = new Set(['nome_empresarial', 'representante_nome', 'representante_cargo',
    'ocupacao_percentual', 'obra_inicio', 'obra_fim', 'declaracao_cidade', 'administrador_nome']);
  // Os que entram no texto do Anexo IX.
  const CAMPOS_CONHECIMENTO = new Set(['nome_empresarial', 'representante_nome', 'declaracao_cidade',
    'administrador_nome']);
  // Os que entram no texto do Anexo XIII.
  const CAMPOS_LIQUIDACAO = new Set(['nome_empresarial', 'representante_nome', 'representante_cargo',
    'declaracao_cidade', 'declaracao_uf', 'administrador_nome', 'sede_endereco', 'endereco_correspondencia',
    'liquidacao_prazo_meses']);
  const prazoLiquidacao = () => Number(digitos($('liquidacao_prazo_meses').value)) || 0;
  // Tabela de pontuação do Anexo XIII.
  function pontosLiquidacao(meses) {
    if (meses <= 6) return 100;
    if (meses <= 12) return 75;
    if (meses <= 18) return 50;
    if (meses <= 24) return 25;
    return 0;
  }
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
    lacuna('cidadeuf', $('declaracao_cidade').value.trim() && `${$('declaracao_cidade').value.trim()}/${$('declaracao_uf').value}`);
    lacuna('data', dataPorExtenso(aceitaEm || new Date()));
    lacuna('data9', dataPorExtenso(conhecimentoEm || new Date()));
    lacuna('sede', $('sede_endereco').value.trim());
    const prazo = prazoLiquidacao();
    const prazoOk = prazo >= 1 && prazo <= 36;
    lacuna('prazo', prazoOk ? String(prazo).padStart(2, '0') : '');
    $('liquidacao-pontos').textContent = prazoOk
      ? `Pontuação correspondente: ${pontosLiquidacao(prazo)} pontos.`
      : 'De 1 a 36 meses.';
    lacuna('data13', dataPorExtenso(liquidacaoEm || new Date()));
    document.querySelector('[data-decl="assinado13"]').textContent =
      liquidacaoEm && $('liquidacao_aceita').checked ? assinadoEm(liquidacaoEm) : '';
    document.querySelector('[data-decl="assinado9"]').textContent =
      conhecimentoEm && $('conhecimento_objeto_aceito').checked ? assinadoEm(conhecimentoEm) : '';
    const hora = aceitaEm && aceitaEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    document.querySelector('[data-decl="assinado"]').textContent = aceitaEm && $('declaracao_aceita').checked
      ? `Assinado eletronicamente em ${aceitaEm.toLocaleDateString('pt-BR')} às ${hora}`
      : '';
  }

  $('ocupacao_percentual').addEventListener('input', (e) => (e.target.value = digitos(e.target.value).slice(0, 2)));
  $('representante_nome').addEventListener('input', () => { representanteEditado = true; });
  $('liquidacao_prazo_meses').addEventListener('input', (e) => (e.target.value = digitos(e.target.value).slice(0, 2)));
  $('sede_endereco').addEventListener('input', () => { sedeEditada = true; });
  // Enquanto não for alterada, a sede acompanha o endereço para correspondência.
  $('endereco_correspondencia').addEventListener('input', () => {
    if (!sedeEditada) $('sede_endereco').value = $('endereco_correspondencia').value;
  });
  // Enquanto não for alterado, o representante acompanha o administrador.
  $('administrador_nome').addEventListener('input', () => {
    if (!representanteEditado) $('representante_nome').value = $('administrador_nome').value;
  });
  $('form-solicitacao').addEventListener('input', (ev) => {
    if (CAMPOS_DECLARACAO.has(ev.target.id) && $('declaracao_aceita').checked) {
      $('declaracao_aceita').checked = false; // o texto mudou: precisa aceitar de novo
    }
    if (CAMPOS_CONHECIMENTO.has(ev.target.id)) $('conhecimento_objeto_aceito').checked = false;
    if (CAMPOS_LIQUIDACAO.has(ev.target.id)) $('liquidacao_aceita').checked = false;
    atualizarDeclaracao();
  });
  $('declaracao_aceita').addEventListener('change', atualizarDeclaracao);
  $('conhecimento_objeto_aceito').addEventListener('change', atualizarDeclaracao);
  $('liquidacao_aceita').addEventListener('change', atualizarDeclaracao);
  $('declaracao_uf').addEventListener('change', () => {
    $('liquidacao_aceita').checked = false;
    atualizarDeclaracao();
  });
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
    if (s.declaracao_uf) $('declaracao_uf').value = s.declaracao_uf;
    aceitaEm = s.declaracao_aceita_em ? new Date(s.declaracao_aceita_em) : null;
    $('declaracao_aceita').checked = !!aceitaEm;
    conhecimentoEm = s.conhecimento_objeto_aceito_em ? new Date(s.conhecimento_objeto_aceito_em) : null;
    $('conhecimento_objeto_aceito').checked = !!conhecimentoEm;
    $('sede_endereco').value = s.sede_endereco || s.endereco_correspondencia;
    sedeEditada = !!s.sede_endereco && s.sede_endereco !== s.endereco_correspondencia;
    $('liquidacao_prazo_meses').value = s.liquidacao_prazo_meses || '';
    liquidacaoEm = s.liquidacao_aceita_em ? new Date(s.liquidacao_aceita_em) : null;
    $('liquidacao_aceita').checked = !!liquidacaoEm;
    atualizarDeclaracao();
  }

  // Rascunho (formulário incompleto salvo automaticamente): por cima do salvo.
  function aplicarRascunho(d) {
    const tem = (k) => d[k] !== undefined && d[k] !== null;
    if (tem('area_m2')) {
      const r = lerArea(String(d.area_m2).replace('.', ','));
      $('area_m2').value = r.valor ? formatarArea(r.valor) : String(d.area_m2);
    }
    ['nome_empresarial', 'endereco_correspondencia', 'email', 'administrador_nome', 'representante_nome',
      'representante_cargo', 'obra_inicio', 'obra_fim', 'declaracao_cidade', 'declaracao_uf', 'sede_endereco']
      .forEach((k) => { if (tem(k)) $(k).value = d[k]; });
    if (tem('telefone')) $('telefone').value = mascaraTel(d.telefone);
    if (tem('administrador_cpf')) $('administrador_cpf').value = mascaraCpf(d.administrador_cpf);
    if (tem('ocupacao_percentual')) $('ocupacao_percentual').value = String(d.ocupacao_percentual);
    if (tem('liquidacao_prazo_meses')) $('liquidacao_prazo_meses').value = String(d.liquidacao_prazo_meses);
    ['declaracao_aceita', 'conhecimento_objeto_aceito', 'liquidacao_aceita']
      .forEach((k) => { if (tem(k)) $(k).checked = !!d[k]; });
    if (tem('cnae')) { $('cnae').value = mascaraCnae(String(d.cnae)); conferirCnae(); }
    representanteEditado = $('representante_nome').value !== $('administrador_nome').value;
    sedeEditada = $('sede_endereco').value !== $('endereco_correspondencia').value;
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
      const r = await api('/api/solicitacoes/minha/rascunho');
      if (r) aplicarRascunho(r.dados);
    } catch (_) {
      mostrar('error', 'Falha de conexão. Recarregue a página.');
    }
  })();

  // ---------- Incisos com formulário próprio (XI, XII e XIII) ----------
  // Abrem num painel aqui mesmo: a página do inciso é carregada num iframe sem
  // cabeçalho (modo "embutida", ver js/config.js), com a altura do conteúdo.
  async function atualizarSituacao(botao) {
    const status = botao.querySelector('.inciso-link__status');
    try {
      const estado = await api(botao.dataset.estado);
      status.textContent = estado.concluido ? 'Concluído' : 'Pendente';
      status.classList.toggle('is-ok', estado.concluido);
      status.classList.toggle('is-pendente', !estado.concluido);
    } catch (_) { /* sem situação: o painel continua funcionando */ }
  }

  function ajustarAltura(iframe) {
    const doc = iframe.contentDocument;
    if (!doc || !doc.body) return;
    const medir = () => { iframe.style.height = `${doc.documentElement.scrollHeight}px`; };
    medir();
    new ResizeObserver(medir).observe(doc.body);
  }

  // Painel com conteúdo fixo (ex.: imagem do Anexo II): só abre e fecha.
  document.querySelectorAll('[data-painel-estatico]').forEach((botao) => {
    botao.addEventListener('click', () => {
      const abrir = botao.getAttribute('aria-expanded') !== 'true';
      botao.setAttribute('aria-expanded', String(abrir));
      botao.nextElementSibling.hidden = !abrir;
    });
  });
  const linkAnexo2 = (window.DIANOT_LINKS || {}).anexo2;
  if (linkAnexo2 && $('anexo2-pdf')) $('anexo2-pdf').href = linkAnexo2;

  const botoesInciso = [...document.querySelectorAll('.inciso-link__botao[data-pagina]')];
  botoesInciso.forEach((botao) => {
    const painel = botao.nextElementSibling;
    atualizarSituacao(botao);
    botao.addEventListener('click', () => {
      const abrir = botao.getAttribute('aria-expanded') !== 'true';
      botao.setAttribute('aria-expanded', String(abrir));
      painel.hidden = !abrir;
      if (abrir && !painel.querySelector('iframe')) {
        const iframe = document.createElement('iframe');
        iframe.title = botao.querySelector('.doc-list__title').textContent;
        iframe.src = botao.dataset.pagina;
        iframe.addEventListener('load', () => ajustarAltura(iframe));
        painel.appendChild(iframe);
      }
    });
  });

  // A página do painel avisa quando salvou algo: atualiza a situação do inciso.
  window.addEventListener('message', (ev) => {
    if (ev.origin !== window.location.origin || !ev.data || ev.data.tipo !== 'dianot:inciso-atualizado') return;
    const botao = botoesInciso.find((b) => {
      const iframe = b.nextElementSibling.querySelector('iframe');
      return iframe && iframe.contentWindow === ev.source;
    });
    if (botao) atualizarSituacao(botao);
  });

  // ---------- Salvamento automático ----------
  // Cada alteração é salva sozinha, pouco depois de a pessoa parar de digitar.
  // Completo e válido, vira a solicitação oficial; incompleto, fica como
  // rascunho (nada se perde) e o que falta aparece em "Finalizar credenciamento".
  function mostrar(tipo, msg) {
    const fb = $('feedback'); fb.className = `feedback feedback--${tipo}`; fb.textContent = msg; fb.hidden = false;
  }

  function corpoDoFormulario() {
    const area = lerArea($('area_m2').value);
    return {
      area_m2: area.valor || $('area_m2').value.trim(),
      nome_empresarial: $('nome_empresarial').value.trim(),
      cnpj: digitos($('cnpj').value),
      endereco_correspondencia: $('endereco_correspondencia').value.trim(),
      email: $('email').value.trim(),
      telefone: digitos($('telefone').value),
      administrador_nome: $('administrador_nome').value.trim(),
      administrador_cpf: digitos($('administrador_cpf').value),
      cnae: digitos($('cnae').value),
      representante_nome: $('representante_nome').value.trim(),
      representante_cargo: $('representante_cargo').value.trim(),
      ocupacao_percentual: percentual() || null,
      obra_inicio: $('obra_inicio').value,
      obra_fim: $('obra_fim').value,
      declaracao_cidade: $('declaracao_cidade').value.trim(),
      declaracao_uf: $('declaracao_uf').value,
      declaracao_aceita: $('declaracao_aceita').checked,
      conhecimento_objeto_aceito: $('conhecimento_objeto_aceito').checked,
      sede_endereco: $('sede_endereco').value.trim(),
      liquidacao_prazo_meses: prazoLiquidacao() || null,
      liquidacao_aceita: $('liquidacao_aceita').checked,
    };
  }

  function indicador(tipo, texto) {
    const el = $('autosalvar');
    el.className = `autosalvar autosalvar--${tipo}`;
    el.textContent = texto;
    el.hidden = false;
  }
  const hora = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  let timerSalvar = null;
  let salvando = null; // salvamento em andamento
  let deNovo = false; // houve alteração durante o salvamento

  function agendarSalvamento() {
    clearTimeout(timerSalvar);
    timerSalvar = setTimeout(() => salvarAgora(), 1200);
  }

  async function salvarAgora({ aoSair = false } = {}) {
    clearTimeout(timerSalvar);
    if (aoSair) {
      // Página fechando: envia sem esperar a resposta.
      fetch(`${API}/api/solicitacoes/minha/automatico`, {
        method: 'PUT', keepalive: true,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(corpoDoFormulario()),
      }).catch(() => {});
      return;
    }
    if (salvando) { deNovo = true; return salvando; }
    salvando = (async () => {
      alterado = false;
      indicador('salvando', 'Salvando…');
      try {
        const r = await api('/api/solicitacoes/minha/automatico', { method: 'PUT', body: JSON.stringify(corpoDoFormulario()) });
        if (r.situacao === 'salvo') {
          const s = r.solicitacao;
          aceitaEm = s.declaracao_aceita_em ? new Date(s.declaracao_aceita_em) : null;
          conhecimentoEm = s.conhecimento_objeto_aceito_em ? new Date(s.conhecimento_objeto_aceito_em) : null;
          liquidacaoEm = s.liquidacao_aceita_em ? new Date(s.liquidacao_aceita_em) : null;
          atualizarDeclaracao();
          indicador('ok', `✔ Salvo automaticamente às ${hora(r.salvo_em)}`);
        } else {
          indicador('rascunho', `✔ Rascunho salvo às ${hora(r.salvo_em)} — ainda falta preencher ${r.faltando.length} item(ns); veja em "Finalizar credenciamento".`);
        }
        $('feedback').hidden = true;
        // "Finalizar credenciamento" confere as pendências de novo.
        window.postMessage({ tipo: 'dianot:inciso-atualizado' }, window.location.origin);
      } catch (_) {
        alterado = true;
        indicador('erro', 'Não foi possível salvar agora. Tentando de novo…');
        setTimeout(() => { if (alterado) salvarAgora(); }, 5000);
      } finally {
        salvando = null;
        if (deNovo) { deNovo = false; salvarAgora(); }
      }
    })();
    return salvando;
  }

  // Enter num campo não recarrega a página: só salva na hora.
  $('form-solicitacao').addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (alterado) salvarAgora();
  });
})();
