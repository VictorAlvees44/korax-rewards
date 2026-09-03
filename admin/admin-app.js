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
  autenticarAdminRemoto, configurarCredencialAdmin, validarConfiguracao,
  gerarId, gerarCorAleatoria, corrigirCoresRepetidas, mostrarToast, carregarHistorico,
  aplicarVisualNaTela, carregarSonsNosElementos, sortearPremioAleatorio,
  girarRoleta, obterUrlBackend
} from "../core.js?v=20260903-sons";

let Perfis = {}; // cache local em memória do que veio do backend: { nome: config }
let painelOcupado = false;
const CHAVE_SESSAO_ADMIN = "roletaCorp_admin_secret_v1";
const TAMANHO_MAX_UPLOAD = 2 * 1024 * 1024;

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
    if (Estado.girando) return;
    if (Estado.config.premios.length >= 50) { mostrarToast("Cada perfil aceita no máximo 50 prêmios."); return; }
    Estado.config.premios.push({
      id: gerarId(), nome: "Novo prêmio", cor: gerarCorAleatoria(Estado.config.premios.map((p) => p.cor)),
      categoria: "Brinde", descricao: "", positivo: true, som: ""
    });
    marcarEdicaoPremios();
    renderizarListaPremios();
    Roleta.desenhar(Estado.anguloAtual);
  });
}

function marcarEdicaoPremios() {
  Estado._ehPerfilPublicadoAgora = false;
  atualizarRotuloPerfilAtual();
  document.getElementById("statusEdicaoPremios").textContent = "Alterações ainda não publicadas. Clique em Publicar este layout para aplicá-las na roleta.";
}

function atualizarResumoPremios() {
  const quantidade = Estado.config.premios.length;
  const chance = (100 / quantidade).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  document.getElementById("resumoPremios").textContent = `${quantidade} prêmios • Chance de cada um: 1 em ${quantidade} (aprox. ${chance}%) • Cores exclusivas`;
  document.getElementById("btnAdicionarPremio").disabled = painelOcupado || Estado.girando || quantidade >= 50;
}

function bloquearEdicaoPainel() {
  painelOcupado = true;
  const controles = Array.from(document.querySelectorAll("#painelAdmin input, #painelAdmin select, #painelAdmin button"));
  const estadosAnteriores = controles.map((controle) => controle.disabled);
  controles.forEach((controle) => { controle.disabled = true; });
  return () => {
    controles.forEach((controle, indice) => { controle.disabled = estadosAnteriores[indice]; });
    painelOcupado = false;
    atualizarResumoPremios();
  };
}

function renderizarListaPremios() {
  const lista = document.getElementById("listaPremios");
  lista.replaceChildren();
  Estado.config.premios.forEach((premio, indice) => {
    const cartao = document.createElement("div");
    cartao.className = "cartao-premio";

    const criarInput = (tipo, valor, campo, placeholder = "") => {
      const input = document.createElement("input");
      input.type = tipo;
      input.value = valor;
      input.dataset.campo = campo;
      input.placeholder = placeholder;
      input.setAttribute("aria-label", `${placeholder} — prêmio ${indice + 1}`);
      return input;
    };
    const cor = document.createElement("button");
    cor.type = "button";
    cor.className = "cartao-premio__cor";
    cor.textContent = "↻";
    const atualizarCor = () => {
      cor.style.backgroundColor = premio.cor;
      cor.title = `Cor ${premio.cor}. Clique para sortear outra cor exclusiva.`;
      cor.setAttribute("aria-label", `Sortear outra cor — prêmio ${indice + 1}`);
    };
    atualizarCor();
    cor.addEventListener("click", () => {
      if (Estado.girando) return;
      premio.cor = gerarCorAleatoria(Estado.config.premios.map((p) => p.cor));
      atualizarCor();
      marcarEdicaoPremios();
      Roleta.desenhar(Estado.anguloAtual);
    });
    const nome = criarInput("text", premio.nome, "nome", "Nome do prêmio");
    nome.maxLength = 80;
    const categoria = criarInput("text", premio.categoria, "categoria", "Categoria");
    categoria.maxLength = 60;
    const positivo = document.createElement("select");
    positivo.dataset.campo = "positivo";
    positivo.setAttribute("aria-label", `Tipo do resultado — prêmio ${indice + 1}`);
    [["true", "Positivo"], ["false", "Negativo"]].forEach(([valor, texto]) => {
      const opcao = document.createElement("option");
      opcao.value = valor;
      opcao.textContent = texto;
      opcao.selected = premio.positivo === (valor === "true");
      positivo.appendChild(opcao);
    });
    const remover = document.createElement("button");
    remover.className = "botao-remover";
    remover.title = `Remover prêmio ${indice + 1}`;
    remover.setAttribute("aria-label", remover.title);
    remover.textContent = "Remover";
    const descricao = criarInput("text", premio.descricao || "", "descricao", "Mensagem do resultado");
    descricao.maxLength = 240;
    descricao.className = "cartao-premio__descricao";
    cartao.append(cor, nome, categoria, positivo, remover, descricao);

    cartao.querySelectorAll("[data-campo]").forEach((campo) => {
      campo.addEventListener("input", () => {
        const chave = campo.dataset.campo;
        let valor = campo.value;
        if (chave === "positivo") valor = valor === "true";
        premio[chave] = valor;
        marcarEdicaoPremios();
        Roleta.desenhar(Estado.anguloAtual);
      });
    });

    remover.addEventListener("click", () => {
      if (Estado.girando) return;
      if (Estado.config.premios.length <= 2) { mostrarToast("A roleta precisa de pelo menos 2 prêmios."); return; }
      Estado.config.premios = Estado.config.premios.filter((p) => p.id !== premio.id);
      marcarEdicaoPremios();
      renderizarListaPremios();
      Roleta.desenhar(Estado.anguloAtual);
    });

    lista.appendChild(cartao);
  });
  atualizarResumoPremios();
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
    if (!/^image\/(png|jpeg|webp|gif)$/.test(arquivo.type) || arquivo.size > TAMANHO_MAX_UPLOAD) {
      mostrarToast("Use PNG, JPEG, WebP ou GIF com no máximo 2 MB.");
      e.target.value = "";
      return;
    }
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
      if (!/^audio\/(mpeg|mp3|wav|ogg|webm|mp4|x-m4a)$/.test(arquivo.type) || arquivo.size > TAMANHO_MAX_UPLOAD) {
        mostrarToast("Use MP3, WAV, OGG, WebM ou M4A com no máximo 2 MB.");
        e.target.value = "";
        return;
      }
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
    if (painelOcupado) return;
    const campoNome = document.getElementById("inputNomeNovoPerfil");
    const nome = campoNome.value.trim() || Estado.nomePerfilAtivo;
    if (!nome) { mostrarToast("Digite um nome para o perfil."); return; }
    if (!obterUrlBackend()) { mostrarToast("Configure a URL do backend na aba Configurações antes de salvar."); return; }

    if (Perfis[nome] && nome !== Estado.nomePerfilAtivo && !confirm(`Já existe um perfil chamado "${nome}". Substituir?`)) return;

    const configSalva = structuredClone(Estado.config);
    const liberar = bloquearEdicaoPainel();
    try {
      await salvarPerfilRemoto(nome, configSalva);
      Perfis[nome] = configSalva;
      Estado.nomePerfilAtivo = nome;
      Estado._ehPerfilPublicadoAgora = false;
      campoNome.value = "";
      atualizarRotuloPerfilAtual();
      renderizarListaPerfis();
      document.getElementById("statusEdicaoPremios").textContent = "Perfil salvo na biblioteca. Publique o layout para atualizar a roleta pública.";
      mostrarToast(`Perfil "${nome}" salvo na biblioteca.`);
    } catch (erro) {
      mostrarToast("Não foi possível salvar: " + erro.message);
    } finally {
      liberar();
    }
  });

  document.getElementById("btnAtivarPerfil").addEventListener("click", async () => {
    if (painelOcupado) return;
    if (!obterUrlBackend()) { mostrarToast("Configure a URL do backend na aba Configurações antes de publicar."); return; }
    let nome = Estado.nomePerfilAtivo;
    if (!nome) {
      nome = (document.getElementById("inputNomeNovoPerfil").value || "").trim();
      if (!nome) { mostrarToast("Dê um nome ao perfil (aba Perfis) antes de publicar."); return; }
    }
    const configPublicada = structuredClone(Estado.config);
    const liberar = bloquearEdicaoPainel();
    try {
      await salvarPerfilRemoto(nome, configPublicada); // mantém a biblioteca sincronizada
      await ativarPerfilRemoto(nome, configPublicada);
      Perfis[nome] = configPublicada;
      Estado.nomePerfilAtivo = nome;
      Estado._ehPerfilPublicadoAgora = true;
      atualizarRotuloPerfilAtual();
      renderizarListaPerfis();
      document.getElementById("statusEdicaoPremios").textContent = "Perfil publicado. Os próximos giros usarão estes prêmios.";
      mostrarToast(`"${nome}" agora está ativo na roleta pública!`);
    } catch (erro) {
      mostrarToast("Não foi possível publicar: " + erro.message);
    } finally {
      liberar();
    }
  });

  document.getElementById("btnTestarGiro").addEventListener("click", () => {
    if (painelOcupado || Estado.girando || Estado.config.premios.length < 2) return;
    try { validarConfiguracao(Estado.config); }
    catch (erro) { mostrarToast("Revise os prêmios: " + erro.message); return; }
    Estado.girando = true;
    const liberarEdicao = bloquearEdicaoPainel();
    const liberar = () => {
      Estado.girando = false;
      liberarEdicao();
    };
    try {
      const premioEscolhido = sortearPremioAleatorio(Estado.config.premios);
      girarRoleta(premioEscolhido, 2600, () => {
        liberar();
        mostrarToast(`Teste: saiu "${premioEscolhido.nome}" (nada foi registrado).`);
      });
    } catch (erro) {
      liberar();
      mostrarToast("Não foi possível testar: " + erro.message);
    }
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
  lista.replaceChildren();
  if (nomes.length === 0) {
    const vazio = document.createElement("p");
    vazio.className = "painel__dica";
    vazio.textContent = "Nenhum perfil salvo ainda. Monte o layout nas outras abas e salve aqui com um nome.";
    lista.appendChild(vazio);
    return;
  }
  nomes.forEach((nome) => {
    const ehAtivo = nome === Estado.nomePerfilAtivo && Estado._ehPerfilPublicadoAgora;
    const cartao = document.createElement("div");
    cartao.className = "cartao-perfil" + (ehAtivo ? " ativo" : "");
    const rotulo = document.createElement("span");
    rotulo.className = "cartao-perfil__nome";
    rotulo.textContent = nome;
    if (ehAtivo) {
      const selo = document.createElement("span");
      selo.className = "cartao-perfil__selo";
      selo.textContent = "ATIVO";
      rotulo.appendChild(selo);
    }
    const acoes = document.createElement("div");
    acoes.className = "cartao-perfil__acoes";
    const carregar = document.createElement("button");
    carregar.className = "botao-secundario";
    carregar.textContent = "Carregar para editar";
    const excluir = document.createElement("button");
    excluir.className = "botao-remover";
    excluir.textContent = "Excluir";
    acoes.append(carregar, excluir);
    cartao.append(rotulo, acoes);

    carregar.addEventListener("click", async () => {
      let dados;
      try { dados = await buscarConfigAtivoRemoto(); } catch (e) { dados = null; }
      const publicadoAgora = !!(dados && dados.nome === nome);
      carregarPerfilNaTela(nome, publicadoAgora);
      mostrarToast(`Perfil "${nome}" carregado para edição.`);
    });
    excluir.addEventListener("click", async () => {
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
    if (!obterUrlBackend()) {
      mostrarToast("Use uma URL HTTPS válida de implantação do Google Apps Script terminada em /exec.");
      e.target.value = "";
      return;
    }
    e.target.value = obterUrlBackend();
    mostrarToast("URL aplicada nesta aba para teste. Edite config.js para valer para todos.");
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
        const importada = JSON.parse(leitor.result);
        validarConfiguracao(importada, { permitirCoresRepetidas: true });
        Estado.config = importada;
        Estado.nomePerfilAtivo = "";
        Estado._ehPerfilPublicadoAgora = false;
        preencherCampos();
        atualizarRotuloPerfilAtual();
        Roleta.desenhar(Estado.anguloAtual);
        mostrarToast("Configuração importada — dê um nome e salve para adicionar à biblioteca.");
      } catch (erro) {
        mostrarToast("Configuração inválida: " + erro.message);
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
    corpo.replaceChildren();
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
  validarConfiguracao(c, { permitirCoresRepetidas: true });
  const coresCorrigidas = corrigirCoresRepetidas(c.premios);
  if (coresCorrigidas) {
    marcarEdicaoPremios();
    document.getElementById("statusEdicaoPremios").textContent = `${coresCorrigidas} cor(es) repetida(s) receberam novas cores aleatórias. Publique para aplicar na roleta.`;
  } else {
    document.getElementById("statusEdicaoPremios").textContent = "Edite os prêmios e publique o layout para aplicar as alterações na roleta pública.";
  }
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

async function iniciarPainel() {
  // Carrega primeiro para que uma falha de backend não registre listeners
  // duplicados quando o usuário tentar entrar novamente.
  Perfis = await listarPerfisRemoto();

  configurarAbas();
  configurarPremios();
  configurarVisual();
  configurarSons();
  configurarPerfis();
  configurarConfiguracoesGerais();

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

function configurarLoginAdmin() {
  const tela = document.getElementById("telaLoginAdmin");
  const formulario = document.getElementById("formLoginAdmin");
  const input = document.getElementById("inputSegredoAdmin");
  const erro = document.getElementById("erroLoginAdmin");
  const botao = document.getElementById("btnEntrarAdmin");

  const entrar = async (segredo) => {
    botao.disabled = true;
    erro.classList.add("oculto");
    try {
      await autenticarAdminRemoto(segredo);
      sessionStorage.setItem(CHAVE_SESSAO_ADMIN, segredo);
      tela.classList.add("oculto");
      const painel = document.getElementById("painelAdmin");
      painel.removeAttribute("inert");
      painel.setAttribute("aria-hidden", "false");
      await iniciarPainel();
    } catch (falha) {
      configurarCredencialAdmin("");
      sessionStorage.removeItem(CHAVE_SESSAO_ADMIN);
      erro.textContent = falha.message;
      erro.classList.remove("oculto");
      tela.classList.remove("oculto");
      const painel = document.getElementById("painelAdmin");
      painel.setAttribute("inert", "");
      painel.setAttribute("aria-hidden", "true");
      input.focus();
    } finally {
      botao.disabled = false;
    }
  };

  formulario.addEventListener("submit", (evento) => {
    evento.preventDefault();
    entrar(input.value);
  });

  document.getElementById("btnSairAdmin").addEventListener("click", () => {
    configurarCredencialAdmin("");
    sessionStorage.removeItem(CHAVE_SESSAO_ADMIN);
    location.reload();
  });

  const salvo = sessionStorage.getItem(CHAVE_SESSAO_ADMIN);
  if (salvo) {
    input.value = salvo;
    entrar(salvo);
  } else {
    tela.classList.remove("oculto");
    input.focus();
  }
}

document.addEventListener("DOMContentLoaded", configurarLoginAdmin);
