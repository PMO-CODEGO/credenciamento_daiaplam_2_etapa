// Cabeçalho das páginas com login: nome da empresa e botão "Sair".
// O botão leva à tela de login com ?saiu=1, que apaga a sessão (js/auth.js).
// Assim, se a página avisar de alterações não salvas e a pessoa ficar, ela
// continua logada.
(function () {
  const cabecalho = document.querySelector('.letterhead');
  // Dentro do painel do formulário (js/config.js) o cabeçalho nem aparece.
  if (!cabecalho || document.documentElement.classList.contains('embutida')) return;

  const caixa = document.createElement('div');
  caixa.className = 'letterhead__sessao';
  const empresa = document.createElement('span');
  empresa.className = 'letterhead__empresa';
  const botao = document.createElement('a');
  botao.className = 'letterhead__sair';
  botao.href = 'index.html?saiu=1';
  botao.textContent = 'Sair';
  caixa.append(empresa, botao);
  cabecalho.appendChild(caixa);

  let token = null;
  try { token = sessionStorage.getItem('dianot_token'); } catch (_) {}
  if (!token) return;
  fetch(`${window.CODEGO_API_BASE_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
    .then((r) => (r.ok ? r.json() : null))
    .then((u) => { if (u) { empresa.textContent = u.nome_empresarial; empresa.title = u.nome_empresarial; } })
    .catch(() => {});
})();
