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
  const dataPorExtenso = (d) => `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
  const percentual = () => Number(digitos($('ocupacao_percentual').value)) || 0;

  let aceitaEm = null; // data da última assinatura salva
  let conhecimentoEm = null; // idem, Anexo IX
  let liquidacaoEm = null; // idem, Anexo XII
  let sedeEditada = false;
  // Campos que mudam o texto da declaração: alterar algum desfaz o aceite.
  const CAMPOS_DECLARACAO = new Set(['nome_empresarial', 'representante_nome', 'representante_cargo',
    'ocupacao_percentual', 'declaracao_cidade', 'administrador_nome']);
  // Os que entram no texto do Anexo IX.
  const CAMPOS_CONHECIMENTO = new Set(['nome_empresarial', 'representante_nome', 'declaracao_cidade',
    'administrador_nome']);
  // Os que entram no texto do Anexo XII.
  const CAMPOS_LIQUIDACAO = new Set(['nome_empresarial', 'representante_nome', 'representante_cargo',
    'declaracao_cidade', 'declaracao_uf', 'administrador_nome', 'sede_endereco', 'endereco_correspondencia',
    'liquidacao_prazo_meses', 'liquidacao_forma_a_vista', 'liquidacao_forma_parcelado']);
  const prazoLiquidacao = () => Number(digitos($('liquidacao_prazo_meses').value)) || 0;
  // Tabela de pontuação do Anexo XII.
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
    lacuna('cidade', $('declaracao_cidade').value.trim());
    lacuna('cidadeuf', $('declaracao_cidade').value.trim() && `${$('declaracao_cidade').value.trim()}/${$('declaracao_uf').value}`);
    lacuna('data', dataPorExtenso(aceitaEm || new Date()));
    lacuna('data9', dataPorExtenso(conhecimentoEm || new Date()));
    lacuna('sede', $('sede_endereco').value.trim());
    const prazo = prazoLiquidacao();
    const prazoOk = prazo >= 1 && prazo <= 36;
    lacuna('prazo', prazoOk ? String(prazo).padStart(2, '0') : '');
    // Concordância: "01 mês", "12 meses".
    $('prazo-unidade').textContent = prazo === 1 ? 'mês' : 'meses';
    $('prazo-sufixo').textContent = prazo === 1 ? 'mês' : 'meses';
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
  // Forma de pagamento: à vista trava o prazo em 1 mês; parcelado libera de 1 a 36.
  const formaPagamento = () => (document.querySelector('input[name="liquidacao_forma"]:checked') || {}).value || null;
  function aplicarFormaPagamento() {
    const prazo = $('liquidacao_prazo_meses');
    const aVista = formaPagamento() === 'a_vista';
    if (aVista) prazo.value = '1';
    else if (prazo.readOnly) prazo.value = '';
    prazo.readOnly = aVista;
    $('liquidacao-pontos').textContent = aVista ? 'Pagamento à vista: prazo de 1 mês.' : 'De 1 a 36 meses.';
    atualizarDeclaracao();
  }
  document.querySelectorAll('input[name="liquidacao_forma"]').forEach((r) => r.addEventListener('change', aplicarFormaPagamento));

  // Prazo de liquidação: só aceita de 1 a 36 (o que passar disso nem entra no campo).
  let prazoValido = '';
  // O valor pode ter vindo do que já estava salvo: parte dele ao começar a digitar.
  $('liquidacao_prazo_meses').addEventListener('focus', (e) => { prazoValido = e.target.value; });
  $('liquidacao_prazo_meses').addEventListener('input', (e) => {
    const v = digitos(e.target.value).slice(0, 2);
    const n = Number(v);
    if (v === '' || (n >= 1 && n <= 36)) prazoValido = v;
    e.target.value = prazoValido;
  });
  $('sede_endereco').addEventListener('input', () => { sedeEditada = true; });
  // Enquanto não for alterada, a sede acompanha o endereço para correspondência.
  $('endereco_correspondencia').addEventListener('input', () => {
    if (!sedeEditada) $('sede_endereco').value = $('endereco_correspondencia').value;
  });
  // Enquanto não for alterado, o representante acompanha o administrador.
  $('administrador_nome').addEventListener('input', () => {
    $('representante_nome').value = $('administrador_nome').value;
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

  function marcarFormaPagamento(forma) {
    const radio = document.querySelector(`input[name="liquidacao_forma"][value="${forma}"]`);
    if (!radio) return;
    radio.checked = true;
    const prazo = $('liquidacao_prazo_meses');
    prazo.readOnly = forma === 'a_vista';
    $('liquidacao-pontos').textContent = forma === 'a_vista' ? 'Pagamento à vista: prazo de 1 mês.' : 'De 1 a 36 meses.';
  }

  // ---------- Carregar dados ----------
  function preencher(s) {
    $('area_m2').value = formatarArea(s.area_m2);
    $('nome_empresarial').value = s.nome_empresarial;
    $('endereco_correspondencia').value = s.endereco_correspondencia;
    $('email').value = s.email;
    $('telefone').value = mascaraTel(s.telefone);
    $('preenchimento_nome').value = s.preenchimento_nome || '';
    $('administrador_nome').value = s.administrador_nome;
    $('administrador_cpf').value = mascaraCpf(s.administrador_cpf);
    $('cnae').value = mascaraCnae(s.cnae_codigo);
    conferirCnae();
    $('representante_nome').value = s.administrador_nome;
    $('representante_cargo').value = s.representante_cargo || $('representante_cargo').value;
    $('ocupacao_percentual').value = s.ocupacao_percentual || '';
    if (s.declaracao_cidade) $('declaracao_cidade').value = s.declaracao_cidade;
    if (s.declaracao_uf) $('declaracao_uf').value = s.declaracao_uf;
    aceitaEm = s.declaracao_aceita_em ? new Date(s.declaracao_aceita_em) : null;
    $('declaracao_aceita').checked = !!aceitaEm;
    conhecimentoEm = s.conhecimento_objeto_aceito_em ? new Date(s.conhecimento_objeto_aceito_em) : null;
    $('conhecimento_objeto_aceito').checked = !!conhecimentoEm;
    $('sede_endereco').value = s.sede_endereco || s.endereco_correspondencia;
    sedeEditada = !!s.sede_endereco && s.sede_endereco !== s.endereco_correspondencia;
    $('liquidacao_prazo_meses').value = s.liquidacao_prazo_meses || '';
    marcarFormaPagamento(s.liquidacao_forma);
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
      'representante_cargo', 'declaracao_cidade', 'declaracao_uf', 'sede_endereco']
      .forEach((k) => { if (tem(k)) $(k).value = d[k]; });
    if (tem('telefone')) $('telefone').value = mascaraTel(d.telefone);
    if (tem('preenchimento_nome')) $('preenchimento_nome').value = d.preenchimento_nome;
    if (tem('administrador_cpf')) $('administrador_cpf').value = mascaraCpf(d.administrador_cpf);
    if (tem('ocupacao_percentual')) $('ocupacao_percentual').value = String(d.ocupacao_percentual);
    if (tem('liquidacao_prazo_meses')) $('liquidacao_prazo_meses').value = String(d.liquidacao_prazo_meses);
    if (tem('liquidacao_forma')) marcarFormaPagamento(d.liquidacao_forma);
    ['declaracao_aceita', 'conhecimento_objeto_aceito', 'liquidacao_aceita']
      .forEach((k) => { if (tem(k)) $(k).checked = !!d[k]; });
    if (tem('cnae')) { $('cnae').value = mascaraCnae(String(d.cnae)); conferirCnae(); }
    $('representante_nome').value = $('administrador_nome').value;
    sedeEditada = $('sede_endereco').value !== $('endereco_correspondencia').value;
    atualizarDeclaracao();
  }

  // Dados que vêm do cadastro: preenchidos e bloqueados (o servidor também usa sempre
  // os do cadastro). Cadastro antigo sem o dado: o campo continua editável.
  function travarDadosDoCadastro(u) {
    // O administrador da sociedade é o representante legal do cadastro.
    [['nome_empresarial', u.nome_empresarial], ['email', u.email],
      ['administrador_nome', u.representante_nome],
      ['administrador_cpf', u.representante_cpf && mascaraCpf(u.representante_cpf)],
      ['representante_cargo', u.representante_cargo]]
      .forEach(([id, valor]) => {
        if (!valor) return;
        const campo = $(id);
        campo.value = valor;
        campo.readOnly = true;
        let dica = campo.parentElement.querySelector('.field__hint');
        if (!dica) {
          dica = document.createElement('p');
          dica.className = 'field__hint';
          campo.after(dica);
        }
        dica.textContent = 'Vem do cadastro e não pode ser alterado aqui.';
      });
    $('representante_nome').value = $('administrador_nome').value;
    atualizarDeclaracao();
  }

  (async function iniciar() {
    try {
      const u = await api('/api/auth/me');
      $('usuario-nome').textContent = u.nome_empresarial;
      $('usuario-cnpj').textContent = u.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
      $('usuario-logado').hidden = false;
      $('cnpj').value = u.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
      $('nome_empresarial').value = u.nome_empresarial;
      $('email').value = u.email;
      // Cargo informado no cadastro: já vem no Anexo IV (a solicitação salva, se houver, vale mais).
      if (u.representante_cargo) $('representante_cargo').value = u.representante_cargo;
      const s = await api('/api/solicitacoes/minha');
      if (s) preencher(s); else atualizarDeclaracao();
      const r = await api('/api/solicitacoes/minha/rascunho');
      if (r) aplicarRascunho(r.dados);
      travarDadosDoCadastro(u);
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
    // Mede o conteúdo (body), não a página: a altura da página nunca fica menor que
    // o próprio iframe, e o painel não encolheria ao trocar a Opção 2 pela Opção 1.
    const medir = () => { iframe.style.height = `${Math.ceil(doc.body.getBoundingClientRect().height)}px`; };
    medir();
    new ResizeObserver(medir).observe(doc.body);
  }

  // Botão "Próximo" no fim de cada painel: fecha este anexo e leva ao seguinte, na
  // ordem da página (outro card de anexo, que já abre, ou uma seção do formulário).
  const PARADAS = '[data-painel-estatico], .inciso-link__botao[data-pagina], #anexo4-titulo, '
    + '#form-solicitacao h3.section-title, #form-solicitacao h3.anexo-titulo, #envio-titulo';
  function rotuloDaParada(el) {
    if (el.dataset.rotuloProximo) return el.dataset.rotuloProximo;
    const tag = el.querySelector('.doc-list__tag');
    if (tag) return tag.textContent.trim();
    const anexo = el.textContent.trim().match(/^Anexo [IVX]+/);
    return anexo ? anexo[0] : el.textContent.trim();
  }
  // Rolagem suave e mais lenta que a do navegador (que não deixa escolher a velocidade):
  // dura de 0,7 s a 1,4 s conforme a distância. Quem pediu menos movimento no sistema vai
  // direto; se a pessoa rolar a página no meio do caminho, a animação para.
  function rolarAte(el) {
    const destino = Math.max(0, window.scrollY + el.getBoundingClientRect().top - 16);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      window.scrollTo(0, destino);
      return;
    }
    const inicio = window.scrollY;
    const distancia = destino - inicio;
    const duracao = Math.min(1400, Math.max(700, Math.abs(distancia) * 0.4));
    const suavizar = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    let parado = false;
    const parar = () => { parado = true; };
    const eventos = ['wheel', 'touchstart', 'keydown'];
    eventos.forEach((ev) => window.addEventListener(ev, parar, { once: true, passive: true }));
    const t0 = performance.now();
    const passo = (agora) => {
      if (parado) return;
      const t = Math.min(1, (agora - t0) / duracao);
      window.scrollTo(0, inicio + distancia * suavizar(t));
      if (t < 1) requestAnimationFrame(passo);
      else eventos.forEach((ev) => window.removeEventListener(ev, parar));
    };
    requestAnimationFrame(passo);
  }

  function botaoProximo(parada, aoClicar) {
    const paradas = [...document.querySelectorAll(PARADAS)];
    const seguinte = paradas[paradas.indexOf(parada) + 1];
    if (!seguinte) return null;
    const proximo = document.createElement('button');
    proximo.type = 'button';
    proximo.className = 'inciso-painel__proximo';
    proximo.textContent = `Próximo: ${rotuloDaParada(seguinte)} →`;
    proximo.addEventListener('click', () => {
      // Fechar o painel faz o que vem depois subir de uma vez (às vezes para fora da tela,
      // e a rolagem iria para cima). Corrige a posição na hora para o anexo seguinte ficar
      // onde estava, e a rolagem suave parte dali, sempre para a frente.
      const antes = seguinte.getBoundingClientRect().top;
      if (aoClicar) aoClicar();
      const depois = seguinte.getBoundingClientRect().top;
      if (depois !== antes) window.scrollTo(0, window.scrollY + depois - antes);
      if (seguinte.matches('[data-painel-estatico], [data-pagina]') && seguinte.getAttribute('aria-expanded') !== 'true') {
        seguinte.click();
      }
      rolarAte(seguinte);
      seguinte.focus({ preventScroll: true });
    });
    return proximo;
  }
  function adicionarProximo(botao) {
    const painel = botao.nextElementSibling;
    const proximo = botaoProximo(botao, () => {
      botao.setAttribute('aria-expanded', 'false');
      painel.classList.add('sem-animacao'); // fecha na hora (ver .sem-animacao no CSS)
      painel.hidden = true;
      requestAnimationFrame(() => painel.classList.remove('sem-animacao'));
    });
    if (proximo) painel.appendChild(proximo);
  }

  // Seções que ficam abertas no formulário (Anexo IV, itens 1 a 9, Anexos VI, IX e XII e
  // documentação complementar): o "Próximo" vai no fim da seção.
  document.querySelectorAll('#anexo4-titulo, #form-solicitacao h3.section-title, #form-solicitacao h3.anexo-titulo')
    .forEach((titulo) => {
      const proximo = botaoProximo(titulo);
      if (!proximo) return;
      // Anexo IV e declarações têm um bloco próprio; os outros títulos ficam soltos no
      // formulário e a seção vai até a próxima parada (ou o fim dos campos).
      const bloco = titulo.closest('.anexo-secao, .declaracao');
      if (bloco) { bloco.appendChild(proximo); return; }
      let fim = titulo.nextElementSibling;
      while (fim && !fim.matches(`${PARADAS}, .feedback, .autosalvar`) && !fim.querySelector(PARADAS)) {
        fim = fim.nextElementSibling;
      }
      titulo.parentNode.insertBefore(proximo, fim);
    });

  // Painel com conteúdo fixo (ex.: imagem do Anexo II): só abre e fecha.
  document.querySelectorAll('[data-painel-estatico]').forEach((botao) => {
    adicionarProximo(botao);
    botao.addEventListener('click', () => {
      const abrir = botao.getAttribute('aria-expanded') !== 'true';
      botao.setAttribute('aria-expanded', String(abrir));
      botao.nextElementSibling.hidden = !abrir;
    });
  });

  // Ciência nos anexos só de leitura (data-ciencia): a marcação "Declaro ciência" fica no
  // fim do painel e a situação aparece no card. É salva na hora, separada do formulário.
  const caixasCiencia = {};
  function mostrarCiencias(lista) {
    lista.forEach((c) => {
      const item = caixasCiencia[c.anexo];
      if (!item) return;
      item.caixa.checked = Boolean(c.ciente_em);
      if (!item.status) return; // o texto de responsabilidade não tem selo de situação
      item.status.textContent = c.ciente_em ? 'Ciente' : 'Pendente';
      item.status.classList.toggle('is-ok', Boolean(c.ciente_em));
      item.status.classList.toggle('is-pendente', !c.ciente_em);
    });
  }
  document.querySelectorAll('[data-ciencia]').forEach((botao) => {
    const anexo = botao.dataset.ciencia;
    const status = document.createElement('span');
    status.className = 'inciso-link__status';
    botao.appendChild(status);
    const rotulo = document.createElement('label');
    rotulo.className = 'checkbox-item ciencia-anexo';
    const caixa = document.createElement('input');
    caixa.type = 'checkbox';
    const texto = document.createElement('span');
    texto.textContent = `Declaro que li e tenho ciência do Anexo ${anexo}.`;
    rotulo.append(caixa, texto);
    const erro = document.createElement('p');
    erro.className = 'field__error';
    erro.setAttribute('role', 'alert');
    const painel = botao.nextElementSibling;
    const fechar = painel.querySelector('.inciso-painel__proximo');
    painel.insertBefore(rotulo, fechar);
    painel.insertBefore(erro, fechar);
    ligarCiencia(anexo, caixa, erro, status);
  });
  // Caixas já no HTML (ex.: ciência do texto de responsabilidade, no início do formulário).
  document.querySelectorAll('[data-ciencia-caixa]').forEach((caixa) => {
    ligarCiencia(caixa.dataset.cienciaCaixa, caixa, document.getElementById(caixa.dataset.erro), null);
  });

  function ligarCiencia(anexo, caixa, erro, status) {
    caixasCiencia[anexo] = { caixa, status };
    // Alguns anexos ficam dentro do formulário: a marcação não dispara o salvamento automático.
    caixa.addEventListener('input', (e) => e.stopPropagation());
    caixa.addEventListener('change', async (e) => {
      e.stopPropagation();
      caixa.disabled = true;
      erro.textContent = '';
      try {
        const r = await api(`/api/anexos/${anexo}/ciencia`, { method: 'PUT', body: JSON.stringify({ ciente: caixa.checked }) });
        mostrarCiencias(r.anexos);
        // "Finalizar credenciamento" confere as pendências de novo.
        window.postMessage({ tipo: 'dianot:inciso-atualizado' }, window.location.origin);
      } catch (err) {
        caixa.checked = !caixa.checked;
        erro.textContent = err.message || 'Não foi possível salvar. Tente de novo.';
      } finally {
        caixa.disabled = false;
      }
    });
  }
  // Pop-up da responsabilidade pelo preenchimento: abre ao entrar e só fecha depois da ciência.
  const fundoTermo = document.getElementById('termo-fundo');
  const botaoContinuar = document.getElementById('termo-continuar');
  const caixaTermo = document.getElementById('ciencia-responsabilidade');
  function fecharTermo() {
    fundoTermo.classList.remove('is-modal');
    document.documentElement.classList.remove('termo-aberto');
    fundoTermo.removeAttribute('aria-hidden');
    const sec = document.getElementById('termo-inicio');
    sec.removeAttribute('role');
    sec.removeAttribute('aria-modal');
  }
  if (fundoTermo && botaoContinuar && caixaTermo) {
    const sec = document.getElementById('termo-inicio');
    sec.setAttribute('role', 'dialog');
    sec.setAttribute('aria-modal', 'true');
    document.documentElement.classList.add('termo-aberto');
    caixaTermo.addEventListener('change', () => { botaoContinuar.disabled = !caixaTermo.checked; });
    botaoContinuar.addEventListener('click', () => { if (caixaTermo.checked) fecharTermo(); });
    // Mantém o foco dentro do pop-up enquanto ele estiver aberto.
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab' || !fundoTermo.classList.contains('is-modal')) return;
      const itens = [...sec.querySelectorAll('input, button')].filter((x) => !x.disabled);
      if (!itens.length) { e.preventDefault(); return; }
      const primeiro = itens[0], ultimo = itens[itens.length - 1];
      if (!sec.contains(document.activeElement)) { e.preventDefault(); primeiro.focus(); }
      else if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
    });
    caixaTermo.focus();
  }
  if (Object.keys(caixasCiencia).length) {
    api('/api/anexos/ciencias').then((r) => {
      mostrarCiencias(r.anexos);
      // Quem já declarou ciência antes não precisa ver o pop-up de novo.
      if (fundoTermo && caixaTermo && caixaTermo.checked) fecharTermo();
      else if (botaoContinuar) botaoContinuar.disabled = !caixaTermo.checked;
    }).catch(() => {});
  }

  // Anexos com várias páginas (III, X, XI e XIII): uma página por vez, com Anterior/Próxima
  // e um campo para ir direto a uma página, para o painel não ficar enorme.
  // As páginas escondidas nem são baixadas (loading="lazy").
  document.querySelectorAll('[data-anexo-paginas]').forEach((grupo) => {
    const paginas = [...grupo.querySelectorAll('img')];
    if (paginas.length < 2) return;
    const nav = document.createElement('div');
    nav.className = 'anexo-paginacao';
    // Setas pequenas (e não "Anterior/Próxima"), para não confundir com o botão
    // "Próximo" do fim do painel, que leva ao anexo seguinte.
    const anterior = document.createElement('button');
    anterior.type = 'button'; anterior.className = 'anexo-paginacao__seta'; anterior.textContent = '‹';
    anterior.setAttribute('aria-label', 'Página anterior');
    const proxima = document.createElement('button');
    proxima.type = 'button'; proxima.className = 'anexo-paginacao__seta'; proxima.textContent = '›';
    proxima.setAttribute('aria-label', 'Próxima página');
    const indicador = document.createElement('label');
    indicador.className = 'anexo-paginacao__indicador';
    const numero = document.createElement('input');
    numero.type = 'number'; numero.min = '1'; numero.max = String(paginas.length);
    numero.inputMode = 'numeric'; numero.className = 'anexo-paginacao__numero';
    numero.setAttribute('aria-label', `Número da página (1 a ${paginas.length})`);
    indicador.append('Página ', numero, ` de ${paginas.length}`);
    nav.append(anterior, indicador, proxima);
    grupo.after(nav);
    let atual = 0;
    const mostrar = (i) => {
      atual = Math.max(0, Math.min(paginas.length - 1, i));
      paginas.forEach((img, k) => { img.hidden = k !== atual; });
      numero.value = String(atual + 1);
      anterior.disabled = atual === 0;
      proxima.disabled = atual === paginas.length - 1;
    };
    // A navegação fica embaixo: ao trocar, volta rolando suavemente para o começo da nova
    // página (a página nova aparece com um leve fade, ver CSS).
    const ir = (i) => {
      mostrar(i);
      if (grupo.getBoundingClientRect().top < 0) rolarAte(grupo);
    };
    anterior.addEventListener('click', () => ir(atual - 1));
    proxima.addEventListener('click', () => ir(atual + 1));
    // Digitar o número e dar Enter (ou sair do campo) vai direto para a página.
    // O campo está dentro do formulário: o Enter não pode enviá-lo, e as mudanças
    // aqui não disparam o salvamento automático.
    const irParaDigitada = () => {
      const n = parseInt(numero.value, 10);
      if (Number.isNaN(n)) numero.value = String(atual + 1);
      else if (n - 1 !== atual) ir(n - 1);
      else numero.value = String(atual + 1);
    };
    numero.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); irParaDigitada(); }
    });
    numero.addEventListener('change', (e) => { e.stopPropagation(); irParaDigitada(); });
    numero.addEventListener('input', (e) => e.stopPropagation());
    mostrar(0);
  });

  const botoesInciso = [...document.querySelectorAll('.inciso-link__botao[data-pagina]')];
  botoesInciso.forEach((botao) => {
    const painel = botao.nextElementSibling;
    atualizarSituacao(botao);
    adicionarProximo(botao);
    botao.addEventListener('click', () => {
      const abrir = botao.getAttribute('aria-expanded') !== 'true';
      botao.setAttribute('aria-expanded', String(abrir));
      painel.hidden = !abrir;
      if (abrir && !painel.querySelector('iframe')) {
        const iframe = document.createElement('iframe');
        iframe.title = botao.querySelector('.doc-list__title').textContent;
        iframe.src = botao.dataset.pagina;
        iframe.addEventListener('load', () => ajustarAltura(iframe));
        painel.insertBefore(iframe, painel.querySelector('.inciso-painel__proximo'));
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
      preenchimento_nome: $('preenchimento_nome').value.trim(),
      representante_nome: $('representante_nome').value.trim(),
      representante_cargo: $('representante_cargo').value.trim(),
      ocupacao_percentual: percentual() || null,
      declaracao_cidade: $('declaracao_cidade').value.trim(),
      declaracao_uf: $('declaracao_uf').value,
      declaracao_aceita: $('declaracao_aceita').checked,
      conhecimento_objeto_aceito: $('conhecimento_objeto_aceito').checked,
      sede_endereco: $('sede_endereco').value.trim(),
      liquidacao_forma: formaPagamento(),
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
