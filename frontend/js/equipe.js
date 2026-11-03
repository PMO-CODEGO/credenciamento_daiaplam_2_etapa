// Tela da equipe da CODEGO: login próprio (separado das empresas), lista de todas
// as empresas com a situação e, ao clicar numa, os dados, documentos e comprovantes.
// Só leitura, exceto "Apagar cadastro" (ex.: cadastros de teste), que pede o CNPJ para confirmar.
(function () {
  const API = window.CODEGO_API_BASE_URL;
  const CHAVE = 'daiaplam_equipe_token';
  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  let token = null;
  try { token = sessionStorage.getItem(CHAVE); } catch (_) {}
  let empresas = [];
  let filtro = 'todas';

  // ---------- Formatos ----------
  const cnpj = (d) => (d || '').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  const cpf = (d) => (d || '').replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  const tel = (d) => (d || '').length === 11 ? d.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3') : (d || '').replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3');
  const dataHora = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
  const area = (v) => (v == null ? '—' : `${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`);
  const tamanho = (b) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`);
  const SITUACAO = { finalizado: 'Finalizado', preenchendo: 'Em preenchimento', cadastrado: 'Apenas cadastro (login)' };

  // ---------- Sessão ----------
  function mostrarLogin(msg) {
    token = null;
    try { sessionStorage.removeItem(CHAVE); } catch (_) {}
    $('tela-painel').hidden = true;
    $('sessao-equipe').hidden = true;
    $('tela-login').hidden = false;
    if (msg) { $('feedback-login').textContent = msg; $('feedback-login').hidden = false; }
  }

  async function api(caminho) {
    const resp = await fetch(`${API}${caminho}`, { headers: { Authorization: `Bearer ${token}` } });
    if (resp.status === 401) { mostrarLogin('Sua sessão expirou. Entre novamente.'); throw new Error('sessão'); }
    if (!resp.ok) {
      const dados = await resp.json().catch(() => null);
      throw new Error((dados && dados.detail) || 'Não foi possível carregar.');
    }
    return resp;
  }

  // Abre um arquivo (documento ou PDF) numa aba nova, com a sessão da equipe.
  async function abrir(caminho, botao) {
    const aba = window.open('', '_blank');
    botao.disabled = true;
    try {
      const url = URL.createObjectURL(await (await api(caminho)).blob());
      if (aba) aba.location.href = url; else window.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      if (aba) aba.close();
      if (e.message !== 'sessão') window.alert(e.message);
    } finally {
      botao.disabled = false;
    }
  }

  // ---------- Login ----------
  const form = $('form-login-equipe');
  CodegoForm.alternarSenhas(form);
  CodegoForm.limparAoEditar(form);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    CodegoForm.limparErros(form);
    $('feedback-login').hidden = true;
    let ok = true;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test($('email').value.trim())) { CodegoForm.erro('email', 'Informe o seu e-mail.'); ok = false; }
    if (!$('senha').value) { CodegoForm.erro('senha', 'Informe a senha.'); ok = false; }
    if (!ok) { CodegoForm.focarPrimeiroErro(form); return; }
    CodegoForm.ocupado($('btn-entrar'), 'Entrando…');
    try {
      const resp = await fetch(`${API}/api/equipe/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: $('email').value.trim(), senha: $('senha').value }),
      });
      const dados = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(dados.detail || 'Não foi possível entrar.');
      token = dados.access_token;
      try { sessionStorage.setItem(CHAVE, token); } catch (_) {}
      $('senha').value = '';
      iniciarPainel(dados.membro);
    } catch (e) {
      $('feedback-login').textContent = e instanceof TypeError ? 'Falha de conexão. Tente novamente.' : e.message;
      $('feedback-login').hidden = false;
      $('senha').focus(); $('senha').select();
    } finally {
      CodegoForm.livre($('btn-entrar'));
    }
  });

  $('btn-sair-equipe').addEventListener('click', () => {
    $('feedback-login').hidden = true;
    mostrarLogin();
    $('email').focus();
  });

  // ---------- Lista ----------
  function iniciarPainel(membro) {
    $('tela-login').hidden = true;
    $('tela-painel').hidden = false;
    $('sessao-equipe').hidden = false;
    $('membro-nome').textContent = membro.nome;
    carregar();
  }

  async function carregar() {
    $('painel-status').textContent = 'Carregando…';
    try {
      empresas = await (await api('/api/equipe/empresas')).json();
      $('painel-status').textContent = `Atualizado às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`;
      desenhar();
    } catch (e) {
      if (e.message !== 'sessão') $('painel-status').textContent = e.message;
    }
  }

  function desenhar() {
    const total = { todas: empresas.length, finalizado: 0, preenchendo: 0, cadastrado: 0 };
    empresas.forEach((e) => { total[e.situacao] += 1; });
    Object.entries(total).forEach(([k, n]) => { document.querySelector(`[data-total="${k}"]`).textContent = n; });

    const termo = $('busca').value.trim().toLowerCase();
    const termoDigitos = termo.replace(/\D/g, '');
    const lista = empresas.filter((e) => (filtro === 'todas' || e.situacao === filtro) && (!termo
      || e.nome_empresarial.toLowerCase().includes(termo)
      || (termoDigitos && e.cnpj.includes(termoDigitos))
      || (e.protocolo || '').toLowerCase().includes(termo)));

    $('painel-vazio').hidden = lista.length > 0;
    $('lista-empresas').innerHTML = lista.map((e) => `
      <tr class="painel-linha" data-id="${e.id}" tabindex="0" aria-expanded="false">
        <td data-rotulo="Empresa"><strong>${esc(e.nome_empresarial)}</strong><br><small>${esc(cnpj(e.cnpj))}</small></td>
        <td data-rotulo="Situação"><span class="selo selo--${e.situacao}">${SITUACAO[e.situacao]}</span>${e.alterado_apos_envio ? '<br><small class="painel-alerta">alterado depois do envio</small>' : ''}</td>
        <td data-rotulo="Protocolo">${e.protocolo ? `${esc(e.protocolo)}<br><small>${dataHora(e.enviado_em)}</small>` : '—'}</td>
        <td data-rotulo="Pendências">${e.pendencias ? e.pendencias : '<span class="painel-ok">nenhuma</span>'}</td>
        <td data-rotulo="Última atividade">${dataHora(e.ultima_atividade)}</td>
      </tr>`).join('');
  }

  document.querySelectorAll('[data-filtro]').forEach((b) => b.addEventListener('click', () => {
    filtro = b.dataset.filtro;
    document.querySelectorAll('[data-filtro]').forEach((x) => x.classList.toggle('is-ativo', x === b));
    desenhar();
  }));
  $('busca').addEventListener('input', desenhar);
  $('btn-atualizar').addEventListener('click', carregar);

  // ---------- Detalhe da empresa (abre embaixo da linha) ----------
  async function alternarDetalhe(linha) {
    const aberta = linha.getAttribute('aria-expanded') === 'true';
    const prox = linha.nextElementSibling;
    if (prox && prox.classList.contains('painel-detalhe')) prox.remove();
    linha.setAttribute('aria-expanded', String(!aberta));
    if (aberta) return;
    const det = document.createElement('tr');
    det.className = 'painel-detalhe';
    det.innerHTML = '<td colspan="5"><p class="field__hint">Carregando…</p></td>';
    linha.after(det);
    try {
      const d = await (await api(`/api/equipe/empresas/${linha.dataset.id}`)).json();
      det.firstElementChild.innerHTML = detalheHtml(d);
    } catch (e) {
      if (e.message !== 'sessão') det.firstElementChild.innerHTML = `<p class="field__error">${esc(e.message)}</p>`;
    }
  }

  const linhaDado = (rotulo, valor) => `<div class="det-linha"><dt>${esc(rotulo)}</dt><dd>${valor}</dd></div>`;
  const arquivoBtn = (a) => `<li><button type="button" class="det-arquivo" data-abrir="/api/equipe/documentos/${a.id}/arquivo">${esc(a.nome_original)}</button> <small>${tamanho(a.tamanho)} · ${dataHora(a.data_envio)}</small></li>`;

  // Empresa que finalizou mais de uma vez: o que mudou em relação ao envio anterior.
  function mudancasHtml(envio, anterior) {
    if (!anterior) return '';
    const titulo = `Diferenças em relação a ${esc(anterior.protocolo)}`;
    if (!envio.mudancas.length) return `<p class="det-mudancas__vazio"><small>${titulo}: nenhuma.</small></p>`;
    return `<div class="det-mudancas"><small>${titulo}:</small><ul>${envio.mudancas.map((m) => `<li>${esc(m)}</li>`).join('')}</ul></div>`;
  }

  function detalheHtml(d) {
    const c = d.cadastro;
    const s = d.solicitacao;
    const partes = [];

    partes.push(`<section class="det-secao"><h4>Cadastro</h4><dl>
      ${linhaDado('CNPJ', esc(cnpj(c.cnpj)))}
      ${linhaDado('Razão social', esc(c.nome_empresarial))}
      ${linhaDado('E-mail', esc(c.email))}
      ${linhaDado('Representante legal', `${esc(c.representante_nome || '—')}${c.representante_cargo ? ` (${esc(c.representante_cargo)})` : ''}${c.representante_cpf ? ` — CPF ${esc(cpf(c.representante_cpf))}` : ''}`)}
      ${linhaDado('Cadastrado em', dataHora(c.cadastrado_em))}
      ${linhaDado('Ciência do Aviso de Privacidade (LGPD)', c.privacidade_ciente_em ? dataHora(c.privacidade_ciente_em) : 'não registrada (cadastro anterior ao aviso)')}
    </dl></section>`);

    if (s) {
      partes.push(`<section class="det-secao"><h4>Anexo IV — Requerimento para solicitação de áreas</h4><dl>
        ${linhaDado('Área solicitada', area(s.area_m2))}
        ${linhaDado('Endereço para correspondência', esc(s.endereco_correspondencia))}
        ${linhaDado('Telefone / e-mail', `${esc(tel(s.telefone))} · ${esc(s.email)}`)}
        ${linhaDado('Administrador', `${esc(s.administrador_nome)} — CPF ${esc(cpf(s.administrador_cpf))}`)}
        ${linhaDado('CNAE', `${esc(s.cnae_codigo.replace(/^(\d{4})(\d)$/, '$1-$2'))} — ${esc(s.cnae_descricao)}`)}
        ${linhaDado('Responsável pelo preenchimento', s.preenchimento_nome
          ? `${esc(s.preenchimento_nome)}${s.preenchimento_cargo ? ` — ${esc(s.preenchimento_cargo)}` : ''}${s.preenchimento_cpf ? ` — CPF ${esc(cpf(s.preenchimento_cpf))}` : ''}`
          : '—')}
      </dl></section>`);
      partes.push(`<section class="det-secao"><h4>Declarações</h4><dl>
        ${linhaDado('Anexo VI - POA — Taxa de ocupação', s.ocupacao_percentual ? `${s.ocupacao_percentual}% · assinada em ${dataHora(s.declaracao_aceita_em)}` : '—')}
        ${linhaDado('Anexo IX — Pleno conhecimento, responsabilidade e aceitação', s.conhecimento_objeto_aceito_em ? `assinada em ${dataHora(s.conhecimento_objeto_aceito_em)}` : '—')}
        ${linhaDado('Anexo XII — Liquidação', s.liquidacao_prazo_meses ? `${s.liquidacao_forma === 'a_vista' ? 'à vista (1 mês)' : `parcelado em ${s.liquidacao_prazo_meses} ${s.liquidacao_prazo_meses === 1 ? 'mês' : 'meses'}`} · sede: ${esc(s.sede_endereco)} · assinada em ${dataHora(s.liquidacao_aceita_em)}` : '—')}
        ${linhaDado('Representante / local', `${esc(s.representante_nome || '—')}${s.representante_cargo ? ` (${esc(s.representante_cargo)})` : ''} · ${esc(s.declaracao_cidade || '—')}${s.declaracao_uf ? `/${esc(s.declaracao_uf)}` : ''}`)}
      </dl></section>`);
    } else {
      partes.push('<section class="det-secao"><h4>Anexo IV — Requerimento para solicitação de áreas</h4><p class="field__hint">Ainda não preenchido por completo.</p></section>');
    }
    if (d.rascunho_em) {
      partes.push(`<p class="field__hint field__hint--warn">Há alterações no formulário salvas como rascunho (incompletas) em ${dataHora(d.rascunho_em)}.</p>`);
    }

    partes.push(`<section class="det-secao"><h4>Documentos (itens 1 a 9 e complementar)</h4><ul class="det-docs">${d.documentos.map((t) => `
      <li><span class="det-doc-rotulo">${esc(t.rotulo)}${t.obrigatorio ? '' : ' <small>(opcional)</small>'}</span>
        ${t.arquivos.length ? `<ul>${t.arquivos.map(arquivoBtn).join('')}</ul>` : `<span class="${t.obrigatorio ? 'painel-alerta' : 'field__hint'}">não enviado</span>`}
      </li>`).join('')}</ul></section>`);

    const inc = d.incisos;
    const blocoInciso = (chave, i) => `
      <li><span class="det-doc-rotulo">${esc(i.rotulo)} — ${i.concluido ? '<span class="painel-ok">concluído</span>' : '<span class="painel-alerta">pendente</span>'}</span>
        <ul>
          ${i.formulario ? `<li><button type="button" class="det-arquivo" data-abrir="/api/equipe/empresas/${d.resumo.id}/${chave}.pdf">PDF gerado pelo formulário</button> <small>salvo em ${dataHora(i.atualizado_em)}</small></li>` : ''}
          ${i.arquivos.map(arquivoBtn).join('')}
          ${!i.formulario && !i.arquivos.length ? '<li class="field__hint">nada enviado</li>' : ''}
        </ul>
        ${chave === 'mce' ? `<p class="field__hint">Ciência da rede de água e esgoto: ${i.ciencia ? `${i.ciencia === 'aceito' ? 'Aceito' : 'Recuso'} em ${dataHora(i.ciencia_em)}` : 'não respondida'}</p>` : ''}
      </li>`;
    partes.push(`<section class="det-secao"><h4>Anexos V, VI A e VII</h4><ul class="det-docs">
      ${blocoInciso('evtf', inc.evtf)}${blocoInciso('cronograma', inc.cronograma)}${blocoInciso('mce', inc.mce)}
    </ul></section>`);

    partes.push(`<section class="det-secao"><h4>Ciências (responsabilidade e anexos)</h4><dl>${d.ciencias.map((c) =>
      linhaDado(c.rotulo, c.ciente_em ? `ciente em ${dataHora(c.ciente_em)}` : '<span class="painel-alerta">pendente</span>')).join('')}
    </dl></section>`);

    partes.push(`<section class="det-secao"><h4>Envios (protocolos)</h4>${d.envios.length ? `<ul class="det-docs">${d.envios.map((v, k) => `
      <li><strong>${esc(v.protocolo)}</strong> — ${dataHora(v.enviado_em)}${k === 0 ? ' <small>(mais recente)</small>' : ''}
        <button type="button" class="det-arquivo" data-abrir="/api/equipe/envios/${v.id}/comprovante.pdf">Comprovante (PDF)</button>
        <button type="button" class="det-arquivo" data-email="${v.id}" data-protocolo="${esc(v.protocolo)}">Enviar por e-mail à CODEGO</button>
        ${mudancasHtml(v, d.envios[k + 1])}</li>`).join('')}</ul>`
      : '<p class="field__hint">Ainda não finalizou o credenciamento.</p>'}</section>`);

    partes.push(`<section class="det-secao"><h4>Pendências para finalizar</h4>${d.pendencias.length
      ? `<ul class="det-pendencias">${d.pendencias.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>`
      : '<p class="painel-ok">Nenhuma.</p>'}</section>`);

    partes.push(`<section class="det-secao det-apagar"><h4>Apagar cadastro</h4>
      <p class="field__hint">Apaga a empresa e tudo o que ela enviou (dados, documentos${d.envios.length ? ', protocolos e comprovantes' : ''}). Use para cadastros de teste. Não tem como desfazer.</p>
      <button type="button" class="btn-perigo" data-apagar="${d.resumo.id}" data-nome="${esc(c.nome_empresarial)}" data-finalizado="${d.envios.length ? '1' : ''}">Apagar este cadastro</button>
    </section>`);

    return `<div class="det">${partes.join('')}</div>`;
  }

  async function apagar(botao) {
    const { apagar: id, nome, finalizado } = botao.dataset;
    const aviso = finalizado ? `ATENÇÃO: "${nome}" já FINALIZOU o envio. O protocolo e o comprovante também serão apagados.

` : '';
    const digitado = window.prompt(`${aviso}Para apagar o cadastro de "${nome}" e tudo o que a empresa enviou, digite o CNPJ dela:`);
    if (digitado === null) return;
    botao.disabled = true;
    try {
      const resp = await fetch(`${API}/api/equipe/empresas/${id}/apagar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ cnpj: digitado }),
      });
      if (resp.status === 401) { mostrarLogin('Sua sessão expirou. Entre novamente.'); return; }
      if (!resp.ok) {
        const dados = await resp.json().catch(() => null);
        throw new Error((dados && dados.detail) || 'Não foi possível apagar.');
      }
      window.alert(`Cadastro de "${nome}" apagado.`);
      carregar();
    } catch (e) {
      window.alert(e.message);
      botao.disabled = false;
    }
  }

  // E-mail do envio para a CODEGO (edital@...), com as respostas e os arquivos.
  async function enviarEmail(botao) {
    if (!window.confirm(`Enviar o protocolo ${botao.dataset.protocolo} por e-mail para a CODEGO, com as respostas e os arquivos?`)) return;
    botao.disabled = true;
    try {
      const resp = await fetch(`${API}/api/equipe/envios/${botao.dataset.email}/enviar-codego`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      });
      if (resp.status === 401) { mostrarLogin('Sua sessão expirou. Entre novamente.'); return; }
      const dados = await resp.json().catch(() => null);
      if (!resp.ok) throw new Error((dados && dados.detail) || 'Não foi possível enviar.');
      botao.textContent = `E-mail pedido para ${dados.destino}`;
    } catch (e) {
      window.alert(e.message);
      botao.disabled = false;
    }
  }

  $('lista-empresas').addEventListener('click', (ev) => {
    const emailBtn = ev.target.closest('[data-email]');
    if (emailBtn) { enviarEmail(emailBtn); return; }
    const botao = ev.target.closest('[data-abrir]');
    if (botao) { abrir(botao.dataset.abrir, botao); return; }
    const apagarBtn = ev.target.closest('[data-apagar]');
    if (apagarBtn) { apagar(apagarBtn); return; }
    const linha = ev.target.closest('.painel-linha');
    if (linha) alternarDetalhe(linha);
  });
  $('lista-empresas').addEventListener('keydown', (ev) => {
    const linha = ev.target.closest('.painel-linha');
    if (linha && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); alternarDetalhe(linha); }
  });

  // ---------- Início ----------
  (async function iniciar() {
    if (!token) { mostrarLogin(); return; }
    try {
      iniciarPainel(await (await api('/api/equipe/me')).json());
    } catch (_) { /* mostrarLogin já foi chamado no 401 */ }
  })();
})();
