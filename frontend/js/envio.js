// Envio final: checklist do que já foi feito e do que falta, protocolo e comprovante em PDF.
(function () {
  const API = window.CODEGO_API_BASE_URL;
  const CHAVE = 'dianot_token';
  const $ = (id) => document.getElementById(id);
  let token = null;
  try { token = sessionStorage.getItem(CHAVE); } catch (_) { /* sem sessionStorage */ }
  if (!token || !$('envio-final')) return;

  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const dataHora = (iso) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

  async function api(caminho, opcoes = {}) {
    const resp = await fetch(`${API}${caminho}`, {
      ...opcoes,
      headers: { Authorization: `Bearer ${token}`, ...(opcoes.body ? { 'Content-Type': 'application/json' } : {}) },
    });
    if (resp.status === 401) { window.location.href = 'index.html'; throw new Error('Sessão expirada.'); }
    return resp;
  }

  // "Finalizar" só libera com tudo concluído e o "Li e Concordo" marcado.
  let podeFinalizar = false;
  const liberarFinalizar = () => { $('btn-finalizar').disabled = !(podeFinalizar && $('li-e-concordo').checked); };
  $('li-e-concordo').addEventListener('change', liberarFinalizar);

  // Checklist completo, na ordem do formulário: ✓ no que já foi feito.
  function desenhar(estado) {
    const lista = $('envio-checklist');
    lista.innerHTML = estado.checklist.map((i) => {
      const classe = i.feito ? 'is-feito' : (i.obrigatorio ? 'is-pendente' : 'is-opcional');
      const situacao = i.feito ? 'feito' : (i.obrigatorio ? 'pendente' : 'opcional');
      return `<li class="checklist__item ${classe}">
        <span class="visualmente-oculto">${situacao}: </span>${esc(i.rotulo)}${i.obrigatorio ? '' : ' <span class="doc-upload__opcional">Opcional</span>'}
        ${i.detalhe && !i.feito ? `<span class="checklist__detalhe">${esc(i.detalhe)}</span>` : ''}
      </li>`;
    }).join('');
    lista.hidden = false;
    const obrigatorios = estado.checklist.filter((i) => i.obrigatorio);
    const feitos = obrigatorios.filter((i) => i.feito).length;
    if (estado.pendencias.length) {
      $('envio-situacao').textContent = `${feitos} de ${obrigatorios.length} itens obrigatórios concluídos:`;
      $('envio-situacao').className = 'field__hint field__hint--warn';
    } else {
      $('envio-situacao').textContent = `✔ Todos os ${obrigatorios.length} itens concluídos. Você já pode finalizar e gerar o comprovante.`;
      $('envio-situacao').className = 'field__hint field__hint--ok';
    }
    podeFinalizar = estado.pode_finalizar;
    liberarFinalizar();
    $('btn-finalizar').textContent = estado.protocolo ? 'Finalizar novamente (gera novo protocolo)' : 'Finalizar e gerar comprovante';

    const caixa = $('envio-protocolo');
    if (estado.protocolo) {
      caixa.hidden = false;
      caixa.innerHTML = `<p class="feedback__title">Último envio registrado: <strong>${esc(estado.protocolo)}</strong></p>
        <p>Em ${esc(dataHora(estado.enviado_em))}. Guarde o número de protocolo e o comprovante.</p>
        <div class="feedback__actions"><button type="button" class="feedback__link" id="btn-comprovante">Baixar comprovante (PDF)</button></div>`;
      $('btn-comprovante').addEventListener('click', baixarComprovante);
    } else {
      caixa.hidden = true;
    }
  }

  async function atualizar() {
    try { desenhar(await (await api('/api/envio/minha')).json()); } catch (_) { /* tenta de novo depois */ }
  }

  async function baixarComprovante() {
    const resp = await api('/api/envio/minha/pdf');
    if (!resp.ok) { $('envio-erro').textContent = 'Não foi possível gerar o comprovante.'; return; }
    window.open(URL.createObjectURL(await resp.blob()), '_blank', 'noopener');
  }

  $('btn-finalizar').addEventListener('click', async () => {
    const btn = $('btn-finalizar');
    $('envio-erro').textContent = '';
    btn.disabled = true;
    try {
      const resp = await api('/api/envio', { method: 'POST', body: JSON.stringify({ li_e_concordo: $('li-e-concordo').checked }) });
      const dados = await resp.json().catch(() => null);
      if (!resp.ok) {
        $('envio-erro').textContent = (dados && typeof dados.detail === 'string') ? dados.detail : 'Não foi possível finalizar.';
        await atualizar();
        return;
      }
      desenhar(dados);
      $('envio-protocolo').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) {
      $('envio-erro').textContent = 'Falha de conexão. Tente novamente.';
      liberarFinalizar();
    }
  });

  // A situação muda por vários lugares (formulário, painéis dos incisos, envio de arquivos):
  // confere de novo ao voltar para a aba, quando um painel avisa e de tempos em tempos.
  window.addEventListener('focus', atualizar);
  window.addEventListener('message', (e) => {
    if (e.origin === window.location.origin && e.data && e.data.tipo === 'dianot:inciso-atualizado') atualizar();
  });
  setInterval(() => { if (!document.hidden) atualizar(); }, 10000);
  atualizar();
})();
