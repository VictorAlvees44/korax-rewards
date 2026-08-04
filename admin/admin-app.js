/**
 * admin-app.js
 * Bootstrap do painel administrativo (/admin).
 * Edita um "perfil" em memória (Estado.config) e permite:
 *  - Salvar esse perfil na biblioteca central (backend)
 *  - Publicá-lo como o perfil ativo que a roleta pública exibe
 *  - Carregar/excluir perfis já salvos
 */
import {
  Estado, Roleta,
  buscarConfigAtivoRemoto, listarPerfisRemoto, salvarPerfilRemoto,
  ativarPerfilRemoto, excluirPerfilRemoto,
  gerarId, gerarCorAleatoria, mostrarToast, carregarHistorico,
  aplicarVisualNaTela, carregarSonsNosElementos, sortearPremioAleatorio,
  girarRoleta, obterUrlBackend
} from "../core.js";

let Perfis = {}; // cache local em memória do que veio do backend: { nome: config }

/* ========================================================================
   CONFIGURAÇÃO DE PARTIDA (SEM BACKEND / MODO OFFLINE)
   ======================================================================== */

function configPadraoNova() {
  return structuredClone(window.CONFIG_PADRAO);
}

/* ========================================================================
   PAINEL — ABAS
   ======================================================================== */

function configurarAbas() {
  document.querySelectorAll(".aba").forEach((botao) => {
    botao.addEventListener("click", () => {
      document.querySelectorAll(".aba").forEach((b) => { b.classList.remove("ativa"); b.setAttribute("aria-selected", "false"); });
      botao.classList.add("ativa");
      botao.setAttribute("aria-selected", "true");
      const alvo = botao.dataset.aba;
      document.querySelectorAll(".painel__conteudo").forEach((secao) => {
        secao.classList.toggle("oculto", secao.dataset.conteudo !== alvo);
      });
      if (alvo === "historico" || alvo === "estatisticas") HistoricoEstatisticas.atualizar();
      if (alvo === "perfis") renderizarListaPerfis();
    });
  });
}

/* ========================================================================
   PRÊMIOS — cor sempre sorteada automaticamente, sem "peso"
   ======================================================================== */

function configurarPremios() {
  document.getElementById("btnAdicionarPremio").addEventListener("click", () => {
    Estado.config.premios.push({
      id: gerarId(), nome: "Novo prêmio", cor: gerarCorAleatoria(),
      categoria: "Brinde", descricao: "", positivo: true, som: ""
    });
    renderizarListaPremios();
    Roleta.desenhar(Estado.anguloAtual);
  });
}

function renderizarListaPremios() {
  const lista = document.getElementById("listaPremios");
  lista.innerHTML = "";
  Estado.config.premios.forEach((premio) => {
    const cartao = document.createElement("div");
    cartao.className = "cartao-premio";
    cartao.innerHTML = `
      <input type="color" class="cartao-premio__cor" value="${premio.cor}" data-campo="cor" title="Cor (sorteada automaticamente, mas você pode ajustar)">
      <input type="text" value="${premio.nome}" data-campo="nome" placeholder="Nome do prêmio">
      <input type="text" value="${premio.categoria}" data-campo="categoria" placeholder="Categoria">
      <select data-campo="positivo">
        <option value="true" ${premio.positivo ? "selected" : ""}>Positivo</option>
        <option value="false" ${!premio.positivo ? "selected" : ""}>Negativo</option>
      </select>
      <button class="botao-remover" title="Remover prêmio">Remover</button>
    `;

    cartao.querySelectorAll("[data-campo]").forEach((campo) => {
      campo.addEventListener("input", () => {
        const chave = campo.dataset.campo;
        let valor = campo.value;
        if (chave === "positivo") valor = valor === "true";
        premio[chave] = valor;
        Roleta.desenhar(Estado.anguloAtual);
      });
    });

    cartao.querySelector(".botao-remover").addEventListener("click", () => {
      if (Estado.config.premios.length <= 2) { mostrarToast("A roleta precisa de pelo menos 2 prêmios."); return; }
      Estado.config.premios = Estado.config.premios.filter((p) => p.id !== premio.id);
      renderizarListaPremios();
      Roleta.desenhar(Estado.anguloAtual);
    });

    lista.appendChild(cartao);
  });
}

/* ========================================================================
   VISUAL
   ======================================================================== */

function configurarVisual() {
  document.getElementById("inputNomeEmpresa").addEventListener("input", (e) => {
    Estado.config.empresa.nome = e.target.value;
  });
  document.getElementById("inputTituloRoleta").addEventListener("input", (e) => {
    Estado.config.empresa.tituloRoleta = e.target.value;
  });
  document.getElementById("inputCorPrimaria").addEventListener("input", (e) => {
    Estado.config.empresa.corPrimaria = e.target.value;
    aplicarVisualNaTela(Estado.config);
  });
  document.getElementById("inputCorSecundaria").addEventListener("input", (e) => {
    Estado.config.empresa.corSecundaria = e.target.value;
    aplicarVisualNaTela(Estado.config);
  });
  document.getElementById("selectFonte").addEventListener("change", (e) => {
    Estado.config.empresa.fonte = e.target.value;
    aplicarVisualNaTela(Estado.config);
  });
  configurarUploadImagem("inputLogoUpload", (dataUrl) => {
    Estado.config.empresa.logoUrl = dataUrl;
    aplicarVisualNaTela(Estado.config);
  });
  configurarUploadImagem("inputFundoUpload", (dataUrl) => {
    Estado.config.empresa.planoFundoUrl = dataUrl;
    aplicarVisualNaTela(Estado.config);
  });
}

function configurarUploadImagem(idInput, aoCarregar) {
  document.getElementById(idInput).addEventListener("change", (e) => {
    const arquivo = e.target.files[0];
    if (!arquivo) return;
    const leitor = new FileReader();
    leitor.onload = () => aoCarregar(leitor.result);
    leitor.readAsDataURL(arquivo);
  });
}

/* ========================================================================
   SONS
   ======================================================================== */

function configurarSons() {
  const mapa = {
    uploadSomGiro: { chave: "giro", audio: "audioGiro" },
    uploadSomVitoria: { chave: "vitoria", audio: "audioVitoria" },
    uploadSomDerrota: { chave: "derrota", audio: "audioDerrota" },
    uploadSomClique: { chave: "clique", audio: "audioClique" },
    uploadSomParada: { chave: "parada", audio: "audioParada" }
  };
  Object.entries(mapa).forEach(([idInput, info]) => {
    document.getElementById(idInput).addEventListener("change", (e) => {
      const arquivo = e.target.files[0];
      if (!arquivo) return;
      const leitor = new FileReader();
      leitor.onload = () => {
        Estado.config.sons[info.chave] = leitor.result;
        document.getElementById(info.audio).src = leitor.result;
      };
      leitor.readAsDataURL(arquivo);
    });
  });
}

/* ========================================================================
   PERFIS — biblioteca central (backend) + ativação
   ======================================================================== */

function atualizarRotuloPerfilAtual() {
  const rotulo = document.getElementById("rotuloPerfilAtual");
  const selo = document.getElementById("seloPerfilAtivoTopo");
  rotulo.textContent = Estado.nomePerfilAtivo || "novo perfil (não salvo)";
  selo.classList.toggle("oculto", !Estado._ehPerfilPublicadoAgora);
}

function configurarPerfis() {
  document.getElementById("btnSalvarNovoPerfil").addEventListener("click", async () => {
    const campoNome = document.getElementById("inputNomeNovoPerfil");
    const nome = campoNome.value.trim() || Estado.nomePerfilAtivo;
    if (!nome) { mostrarToast("Digite um nome para o perfil."); return; }
    if (!obterUrlBackend()) { mostrarToast("Configure a URL do backend na aba Configurações antes de salvar."); return; }

    if (Perfis[nome] && nome !== Estado.nomePerfilAtivo && !confirm(`Já existe um perfil chamado "${nome}". Substituir?`)) return;

    try {
      await salvarPerfilRemoto(nome, Estado.config);
      Perfis[nome] = structuredClone(Estado.config);
      Estado.nomePerfilAtivo = nome;
      Estado._ehPerfilPublicadoAgora = false;
      campoNome.value = "";
      atualizarRotuloPerfilAtual();
      renderizarListaPerfis();
      mostrarToast(`Perfil "${nome}" salvo na biblioteca.`);
    } catch (erro) {
      mostrarToast("Não foi possível salvar: " + erro.message);
    }
  });

  document.getElementById("btnAtivarPerfil").addEventListener("click", async () => {
    if (!obterUrlBackend()) { mostrarToast("Configure a URL do backend na aba Configurações antes de publicar."); return; }
    let nome = Estado.nomePerfilAtivo;
    if (!nome) {
      nome = (document.getElementById("inputNomeNovoPerfil").value || "").trim();
      if (!nome) { mostrarToast("Dê um nome ao perfil (aba Perfis) antes de publicar."); return; }
    }
    try {
      await salvarPerfilRemoto(nome, Estado.config); // mantém a biblioteca sincronizada
      await ativarPerfilRemoto(nome, Estado.config);
      Perfis[nome] = structuredClone(Estado.config);
      Estado.nomePerfilAtivo = nome;
      Estado._ehPerfilPublicadoAgora = true;
      atualizarRotuloPerfilAtual();
      renderizarListaPerfis();
      mostrarToast(`"${nome}" agora está ativo na roleta pública!`);
    } catch (erro) {
      mostrarToast("Não foi possível publicar: " + erro.message);
    }
  });

  document.getElementById("btnTestarGiro").addEventListener("click", () => {
    if (Estado.girando || Estado.config.premios.length < 2) return;
    Estado.girando = true;
    const premioEscolhido = sortearPremioAleatorio(Estado.config.premios);
    girarRoleta(premioEscolhido, 2600, () => {
      Estado.girando = false;
      mostrarToast(`Teste: saiu "${premioEscolhido.nome}" (nada foi registrado).`);
    });
  });
}

async function carregarPerfilNaTela(nome, ativarNoTopo) {
  Estado.config = structuredClone(Perfis[nome]);
  Estado.nomePerfilAtivo = nome;
  Estado._ehPerfilPublicadoAgora = !!ativarNoTopo;
  preencherCampos();
  atualizarRotuloPerfilAtual();
  Roleta.desenhar(Estado.anguloAtual);
}

function renderizarListaPerfis() {
  const lista = document.getElementById("listaPerfis");
  const nomes = Object.keys(Perfis);
  lista.innerHTML = "";
  if (nomes.length === 0) {
    lista.innerHTML = `<p class="painel__dica">Nenhum perfil salvo ainda. Monte o layout nas outras abas e salve aqui com um nome.</p>`;
    return;
  }
  nomes.forEach((nome) => {
    const ehAtivo = nome === Estado.nomePerfilAtivo && Estado._ehPerfilPublicadoAgora;
    const cartao = document.createElement("div");
    cartao.className = "cartao-perfil" + (ehAtivo ? " ativo" : "");
    cartao.innerHTML = `
      <span class="cartao-perfil__nome">${nome}${ehAtivo ? '<span class="cartao-perfil__selo">ATIVO</span>' : ""}</span>
      <div class="cartao-perfil__acoes">
        <button class="botao-secundario" data-acao="carregar">Carregar para editar</button>
        <button class="botao-remover" data-acao="excluir">Excluir</button>
      </div>
    `;
    cartao.querySelector('[data-acao="carregar"]').addEventListener("click", async () => {
      let dados;
      try { dados = await buscarConfigAtivoRemoto(); } catch (e) { dados = null; }
      const publicadoAgora = !!(dados && dados.nome === nome);
      carregarPerfilNaTela(nome, publicadoAgora);
      mostrarToast(`Perfil "${nome}" carregado para edição.`);
    });
    cartao.querySelector('[data-acao="excluir"]').addEventListener("click", async () => {
      if (!confirm(`Excluir o perfil "${nome}"? Essa ação não pode ser desfeita.`)) return;
      try {
        await excluirPerfilRemoto(nome);
        delete Perfis[nome];
        if (Estado.nomePerfilAtivo === nome) { Estado.nomePerfilAtivo = ""; atualizarRotuloPerfilAtual(); }
        renderizarListaPerfis();
        mostrarToast(`Perfil "${nome}" excluído.`);
      } catch (erro) {
        mostrarToast("Não foi possível excluir: " + erro.message);
      }
    });
    lista.appendChild(cartao);
  });
}

/* ========================================================================
   CONFIGURAÇÕES GERAIS
   ======================================================================== */

function configurarConfiguracoesGerais() {
  document.getElementById("inputUrlWebhook").addEventListener("change", (e) => {
    window.CONFIG_PADRAO.webhook.url = e.target.value.trim();
    mostrarToast("URL aplicada neste navegador para teste. Lembre-se de editar config.js para valer para todos.");
  });
  document.getElementById("inputDuracaoGiro").addEventListener("input", (e) => {
    Estado.config.roleta.duracaoGiroMs = Math.round(Number(e.target.value) * 1000);
  });
  document.getElementById("inputVoltasMinimas").addEventListener("input", (e) => {
    Estado.config.roleta.voltasMinimas = Number(e.target.value);
  });

  document.getElementById("btnExportarJson").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(Estado.config, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `perfil-${Estado.nomePerfilAtivo || "sem-nome"}.json`;
    link.click();
  });

  document.getElementById("inputImportarJson").addEventListener("change", (e) => {
    const arquivo = e.target.files[0];
    if (!arquivo) return;
    const leitor = new FileReader();
    leitor.onload = () => {
      try {
        Estado.config = JSON.parse(leitor.result);
        Estado.nomePerfilAtivo = "";
        Estado._ehPerfilPublicadoAgora = false;
        preencherCampos();
        atualizarRotuloPerfilAtual();
        Roleta.desenhar(Estado.anguloAtual);
        mostrarToast("Configuração importada — dê um nome e salve para adicionar à biblioteca.");
      } catch (erro) {
        mostrarToast("Arquivo JSON inválido.");
      }
    };
    leitor.readAsText(arquivo);
  });
}

/* ========================================================================
   HISTÓRICO E ESTATÍSTICAS (espelho local deste navegador)
   ======================================================================== */

const HistoricoEstatisticas = {
  atualizar() {
    const historico = carregarHistorico();
    this._renderizarTabela(historico.slice(0, 20));
    this._renderizarEstatisticas(historico);
  },

  _renderizarTabela(linhas) {
    const corpo = document.getElementById("corpoHistorico");
    corpo.innerHTML = "";
    linhas.forEach((registro) => {
      const tr = document.createElement("tr");
      const celula = (texto) => { const td = document.createElement("td"); td.textContent = texto; return td; };
      tr.appendChild(celula(registro.nome));
      tr.appendChild(celula(registro.premio));
      tr.appendChild(celula(registro.perfil || "-"));
      tr.appendChild(celula(registro.data));
      tr.appendChild(celula(registro.hora));
      corpo.appendChild(tr);
    });
  },

  _renderizarEstatisticas(historico) {
    document.getElementById("estatTotalGiros").textContent = historico.length;
    const contagem = {};
    historico.forEach((r) => { contagem[r.premio] = (contagem[r.premio] || 0) + 1; });
    const entradas = Object.entries(contagem);

    if (entradas.length === 0) {
      document.getElementById("estatMaisSorteado").textContent = "-";
      document.getElementById("estatMenosSorteado").textContent = "-";
      this._desenharGrafico([]);
      return;
    }
    entradas.sort((a, b) => b[1] - a[1]);
    document.getElementById("estatMaisSorteado").textContent = entradas[0][0];
    document.getElementById("estatMenosSorteado").textContent = entradas[entradas.length - 1][0];
    this._desenharGrafico(entradas);
  },

  _desenharGrafico(entradas) {
    const canvas = document.getElementById("canvasGrafico");
    canvas.width = canvas.clientWidth;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (entradas.length === 0) return;

    const maximo = Math.max(...entradas.map((e) => e[1]));
    const larguraBarra = canvas.width / entradas.length;

    entradas.forEach(([nome, valor], i) => {
      const alturaBarra = (valor / maximo) * (canvas.height - 40);
      const x = i * larguraBarra + 10;
      const y = canvas.height - alturaBarra - 24;
      ctx.fillStyle = "#C9A227";
      ctx.fillRect(x, y, larguraBarra - 20, alturaBarra);
      ctx.fillStyle = "#F5F3EE";
      ctx.font = "12px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(nome.slice(0, 10), x + (larguraBarra - 20) / 2, canvas.height - 6);
      ctx.fillText(String(valor), x + (larguraBarra - 20) / 2, y - 6);
    });
  }
};

/* ========================================================================
   PREENCHIMENTO DE CAMPOS / INICIALIZAÇÃO
   ======================================================================== */

function preencherCampos() {
  const c = Estado.config;
  document.getElementById("inputNomeEmpresa").value = c.empresa.nome;
  document.getElementById("inputTituloRoleta").value = c.empresa.tituloRoleta || "Roleta da Sorte";
  document.getElementById("inputCorPrimaria").value = c.empresa.corPrimaria;
  document.getElementById("inputCorSecundaria").value = c.empresa.corSecundaria;
  document.getElementById("selectFonte").value = c.empresa.fonte;
  document.getElementById("inputUrlWebhook").value = obterUrlBackend();
  document.getElementById("inputDuracaoGiro").value = (c.roleta.duracaoGiroMs / 1000).toFixed(1);
  document.getElementById("inputVoltasMinimas").value = c.roleta.voltasMinimas;
  renderizarListaPremios();
  carregarSonsNosElementos(c);
}

async function iniciarAplicacao() {
  configurarAbas();
  configurarPremios();
  configurarVisual();
  configurarSons();
  configurarPerfis();
  configurarConfiguracoesGerais();

  try {
    Perfis = await listarPerfisRemoto();
  } catch (erro) {
    console.warn("Não foi possível carregar a biblioteca de perfis:", erro);
    mostrarToast("Backend indisponível — configure a URL na aba Configurações.");
  }

  let ativo = null;
  try { ativo = await buscarConfigAtivoRemoto(); } catch (e) { /* segue sem ativo */ }

  if (ativo && ativo.config) {
    Estado.config = ativo.config;
    Estado.nomePerfilAtivo = ativo.nome;
    Estado._ehPerfilPublicadoAgora = true;
  } else {
    const primeiroNome = Object.keys(Perfis)[0];
    if (primeiroNome) {
      Estado.config = structuredClone(Perfis[primeiroNome]);
      Estado.nomePerfilAtivo = primeiroNome;
    } else {
      Estado.config = configPadraoNova();
      Estado.nomePerfilAtivo = "";
    }
    Estado._ehPerfilPublicadoAgora = false;
  }

  preencherCampos();
  atualizarRotuloPerfilAtual();
  Roleta.iniciar("canvasRoleta");
  HistoricoEstatisticas.atualizar();
}

document.addEventListener("DOMContentLoaded", iniciarAplicacao);
