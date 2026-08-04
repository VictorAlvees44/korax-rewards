/**
 * script.js
 * Lógica completa da Roleta da Sorte Corporativa.
 * Organizado em módulos internos (objetos) para manter separação de
 * responsabilidades: Estado, Roleta (canvas), Modais, Confete, Rede
 * (Google Apps Script), Histórico/Estatísticas e PainelAdmin.
 *
 * Apenas configurações de interface são salvas em LocalStorage.
 * Todo sorteio é enviado obrigatoriamente ao backend (Google Sheets via
 * Apps Script); se o envio falhar, o giro fica em uma fila local para
 * nova tentativa, mas isso NUNCA substitui o registro remoto.
 */

/* ========================================================================
   ESTADO E PERSISTÊNCIA
   ======================================================================== */

const CHAVE_CONFIG = "roletaCorp_config_v1";
const CHAVE_HISTORICO = "roletaCorp_historico_v1";
const CHAVE_FILA_PENDENTE = "roletaCorp_fila_pendente_v1";
const CHAVE_PERFIS = "roletaCorp_perfis_v1";
const CHAVE_PERFIL_ATIVO = "roletaCorp_perfil_ativo_v1";

const Estado = {
  config: null,
  girando: false,
  anguloAtual: 0,
  participanteAtual: ""
};

function carregarConfig() {
  const salvo = localStorage.getItem(CHAVE_CONFIG);
  if (salvo) {
    try { return JSON.parse(salvo); } catch (e) { console.warn("Config salva inválida, usando padrão."); }
  }
  return structuredClone(window.CONFIG_PADRAO);
}

function salvarConfig(config) {
  localStorage.setItem(CHAVE_CONFIG, JSON.stringify(config));
}

function resetarConfig() {
  localStorage.removeItem(CHAVE_CONFIG);
  Estado.config = structuredClone(window.CONFIG_PADRAO);
  salvarConfig(Estado.config);
}

/* ========================================================================
   MÓDULO PERFIS — múltiplos layouts salvos (ex: um por cliente/feira)
   ======================================================================== */

const Perfis = {
  carregarTodos() {
    try { return JSON.parse(localStorage.getItem(CHAVE_PERFIS)) || {}; }
    catch (e) { return {}; }
  },

  salvarTodos(mapa) {
    localStorage.setItem(CHAVE_PERFIS, JSON.stringify(mapa));
  },

  obterAtivo() {
    return localStorage.getItem(CHAVE_PERFIL_ATIVO) || "";
  },

  definirAtivo(nome) {
    localStorage.setItem(CHAVE_PERFIL_ATIVO, nome);
  },

  salvarComo(nome) {
    const mapa = this.carregarTodos();
    mapa[nome] = structuredClone(Estado.config);
    this.salvarTodos(mapa);
    this.definirAtivo(nome);
  },

  aplicar(nome) {
    const mapa = this.carregarTodos();
    if (!mapa[nome]) return false;
    Estado.config = structuredClone(mapa[nome]);
    salvarConfig(Estado.config);
    this.definirAtivo(nome);
    return true;
  },

  excluir(nome) {
    const mapa = this.carregarTodos();
    delete mapa[nome];
    this.salvarTodos(mapa);
    if (this.obterAtivo() === nome) this.definirAtivo("");
  }
};

function carregarHistorico() {
  try { return JSON.parse(localStorage.getItem(CHAVE_HISTORICO)) || []; }
  catch (e) { return []; }
}

function adicionarHistorico(registro) {
  const historico = carregarHistorico();
  historico.unshift(registro);
  localStorage.setItem(CHAVE_HISTORICO, JSON.stringify(historico.slice(0, 200)));
}

/* ========================================================================
   UTILITÁRIOS
   ======================================================================== */

function gerarId() {
  return "p" + Math.random().toString(36).slice(2, 9);
}

function formatarDataHora(data) {
  const pad = (n) => String(n).padStart(2, "0");
  return {
    data: `${pad(data.getDate())}/${pad(data.getMonth() + 1)}/${data.getFullYear()}`,
    hora: `${pad(data.getHours())}:${pad(data.getMinutes())}:${pad(data.getSeconds())}`
  };
}

function mostrarToast(mensagem) {
  const toast = document.getElementById("avisoToast");
  toast.textContent = mensagem;
  toast.classList.remove("oculto");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.add("oculto"), 3200);
}

function tocarSom(idAudio) {
  const audio = document.getElementById(idAudio);
  if (!audio || !audio.src) return;
  try { audio.currentTime = 0; audio.play().catch(() => {}); } catch (e) { /* silencioso */ }
}

function atualizarLogoCentral(logoUrl) {
  const img = document.getElementById("logoCentral");
  const texto = document.getElementById("textoCentral");
  if (logoUrl) {
    img.src = logoUrl;
    img.classList.remove("oculto");
    texto.classList.add("oculto");
  } else {
    img.classList.add("oculto");
    texto.classList.remove("oculto");
  }
}

function pararSom(idAudio) {
  const audio = document.getElementById(idAudio);
  if (!audio) return;
  audio.pause();
  audio.currentTime = 0;
}

/* ========================================================================
   MÓDULO ROLETA (CANVAS)
   ======================================================================== */

const Roleta = {
  canvas: null,
  ctx: null,

  iniciar() {
    this.canvas = document.getElementById("canvasRoleta");
    this.ctx = this.canvas.getContext("2d");
    this.desenhar();
  },

  desenhar(anguloExtra = 0) {
    const { ctx, canvas } = this;
    const premios = Estado.config.premios;
    const raio = canvas.width / 2;
    const total = premios.reduce((soma, p) => soma + Number(p.peso || 1), 0) || 1;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(raio, raio);
    ctx.rotate(anguloExtra);

    let anguloInicial = -Math.PI / 2;
    premios.forEach((premio) => {
      const fracao = Number(premio.peso || 1) / total;
      const anguloFatia = fracao * Math.PI * 2;

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, raio - 6, anguloInicial, anguloInicial + anguloFatia);
      ctx.closePath();
      ctx.fillStyle = premio.cor || "#888";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.stroke();

      // Texto do prêmio
      ctx.save();
      ctx.rotate(anguloInicial + anguloFatia / 2);
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#111";
      ctx.font = "bold 20px Sora, sans-serif";
      ctx.globalAlpha = 0.92;
      const texto = premio.nome.length > 16 ? premio.nome.slice(0, 15) + "…" : premio.nome;
      ctx.fillText(texto, raio - 26, 0);
      ctx.restore();

      anguloInicial += anguloFatia;
    });

    // Aro externo dourado
    ctx.beginPath();
    ctx.arc(0, 0, raio - 4, 0, Math.PI * 2);
    ctx.lineWidth = 8;
    ctx.strokeStyle = "#C9A227";
    ctx.stroke();

    ctx.restore();
  }
};

/* ========================================================================
   SELEÇÃO PONDERADA E GIRO
   ======================================================================== */

function sortearPremioPonderado(premios) {
  const total = premios.reduce((soma, p) => soma + Number(p.peso || 1), 0);
  let alvo = Math.random() * total;
  for (const premio of premios) {
    alvo -= Number(premio.peso || 1);
    if (alvo <= 0) return premio;
  }
  return premios[premios.length - 1];
}

function calcularAnguloFinal(premios, premioEscolhido) {
  const total = premios.reduce((soma, p) => soma + Number(p.peso || 1), 0);
  let anguloInicial = -Math.PI / 2;
  let anguloDaFatia = 0;
  let larguraFatia = 0;

  for (const premio of premios) {
    const fracao = Number(premio.peso || 1) / total;
    const larguraAtual = fracao * Math.PI * 2;
    if (premio.id === premioEscolhido.id) {
      anguloDaFatia = anguloInicial + larguraAtual / 2;
      larguraFatia = larguraAtual;
      break;
    }
    anguloInicial += larguraAtual;
  }

  // Pequena variação aleatória dentro da fatia para parecer natural,
  // mas nunca perto das bordas (evita "quase acertou o vizinho").
  const margem = larguraFatia * 0.18;
  const variacao = (Math.random() * 2 - 1) * (larguraFatia / 2 - margem);
  return anguloDaFatia + variacao;
}

function easeOutQuint(t) {
  return 1 - Math.pow(1 - t, 5);
}

function normalizarAngulo(angulo) {
  const voltaCompleta = Math.PI * 2;
  return ((angulo % voltaCompleta) + voltaCompleta) % voltaCompleta;
}

function girarRoleta(premioEscolhido, duracaoMs, aoTerminar) {
  const voltas = Estado.config.roleta.voltasMinimas || 6;

  // Ângulo do centro da fatia sorteada, no referencial do desenho "parado"
  // (rotação = 0). Nesse referencial, -90° (topo) é onde o ponteiro fica.
  const anguloAlvoAbsoluto = calcularAnguloFinal(Estado.config.premios, premioEscolhido);

  // Rotação (mod 360°) necessária para que essa fatia fique sob o
  // ponteiro fixo no topo: anguloAlvoAbsoluto + rotação ≡ -90° (mod 360°).
  const rotacaoNecessaria = normalizarAngulo(-Math.PI / 2 - anguloAlvoAbsoluto);

  // Quanto falta girar a partir da posição atual (sempre >= 0, dentro de
  // uma volta) para alcançar exatamente essa rotação necessária.
  const anguloAtualNormalizado = normalizarAngulo(Estado.anguloAtual);
  const deltaAteAlvo = normalizarAngulo(rotacaoNecessaria - anguloAtualNormalizado);

  // Ângulo final = posição atual + voltas completas de "efeito" + o
  // deslocamento mínimo necessário até a fatia sorteada.
  const anguloFinal = Estado.anguloAtual + voltas * Math.PI * 2 + deltaAteAlvo;

  const anguloInicioAnimacao = Estado.anguloAtual;
  const inicio = performance.now();

  function passo(agora) {
    const t = Math.min(1, (agora - inicio) / duracaoMs);
    const progresso = easeOutQuint(t);
    Estado.anguloAtual = anguloInicioAnimacao + (anguloFinal - anguloInicioAnimacao) * progresso;
    Roleta.desenhar(Estado.anguloAtual);

    if (t < 1) {
      requestAnimationFrame(passo);
    } else {
      Estado.anguloAtual = Estado.anguloAtual % (Math.PI * 2);
      aoTerminar();
    }
  }
  requestAnimationFrame(passo);
}

/* ========================================================================
   MÓDULO CONFETE / PARTÍCULAS
   ======================================================================== */

const Confete = {
  canvas: null,
  ctx: null,
  particulas: [],
  animando: false,

  iniciar() {
    this.canvas = document.getElementById("canvasConfete");
    this.ctx = this.canvas.getContext("2d");
    this.redimensionar();
    window.addEventListener("resize", () => this.redimensionar());
  },

  redimensionar() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  },

  explodir(cores = ["#C9A227", "#E8C766", "#1F9D6B", "#ffffff"], quantidade = 140, origemX = null, origemY = null) {
    const x = origemX !== null ? origemX : this.canvas.width / 2;
    const y = origemY !== null ? origemY : this.canvas.height / 2;
    for (let i = 0; i < quantidade; i++) {
      this.particulas.push({
        x, y,
        vx: (Math.random() - 0.5) * 16,
        vy: (Math.random() - 1.2) * 16,
        cor: cores[Math.floor(Math.random() * cores.length)],
        tamanho: 4 + Math.random() * 5,
        vida: 0,
        vidaMax: 90 + Math.random() * 40,
        rotacao: Math.random() * Math.PI
      });
    }
    if (!this.animando) { this.animando = true; this._loop(); }
  },

  /**
   * Efeito de "fogos de artifício": várias explosões de confete em
   * posições e instantes diferentes da tela, simulando um show de fogos
   * para celebrar prêmios positivos.
   */
  fogosDeArtificio(cores = ["#C9A227", "#E8C766", "#1F9D6B", "#ffffff", "#5DADE2"], rajadas = 6) {
    for (let i = 0; i < rajadas; i++) {
      const atraso = i * 260 + Math.random() * 150;
      setTimeout(() => {
        const x = this.canvas.width * (0.18 + Math.random() * 0.64);
        const y = this.canvas.height * (0.18 + Math.random() * 0.4);
        this.explodir(cores, 90 + Math.floor(Math.random() * 60), x, y);
      }, atraso);
    }
    // Explosão central maior, garantindo um clímax no final da sequência.
    setTimeout(() => this.explodir(cores, 220), rajadas * 260);
  },

  _loop() {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    this.particulas.forEach((p) => {
      p.vy += 0.28; // gravidade
      p.x += p.vx;
      p.y += p.vy;
      p.vida++;
      p.rotacao += 0.15;
      const opacidade = Math.max(0, 1 - p.vida / p.vidaMax);
      ctx.save();
      ctx.globalAlpha = opacidade;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotacao);
      ctx.fillStyle = p.cor;
      ctx.fillRect(-p.tamanho / 2, -p.tamanho / 2, p.tamanho, p.tamanho * 0.6);
      ctx.restore();
    });
    this.particulas = this.particulas.filter((p) => p.vida < p.vidaMax);

    if (this.particulas.length > 0) {
      requestAnimationFrame(() => this._loop());
    } else {
      this.animando = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }
};

/* ========================================================================
   REDE — INTEGRAÇÃO COM GOOGLE APPS SCRIPT / GOOGLE SHEETS
   ======================================================================== */

async function registrarGiroRemoto(registro) {
  const url = Estado.config.webhook.url;
  if (!url) {
    mostrarToast("Configure a URL do Web App no painel para gravar na planilha.");
    enfileirarPendente(registro);
    return { ok: false };
  }
  try {
    const resposta = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, // evita preflight CORS no Apps Script
      body: JSON.stringify(registro)
    });
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok || dados.status !== "sucesso") throw new Error("Resposta inesperada do servidor");
    return { ok: true };
  } catch (erro) {
    console.error("Falha ao registrar giro remotamente:", erro);
    enfileirarPendente(registro);
    return { ok: false, erro };
  }
}

function enfileirarPendente(registro) {
  const fila = JSON.parse(localStorage.getItem(CHAVE_FILA_PENDENTE) || "[]");
  fila.push(registro);
  localStorage.setItem(CHAVE_FILA_PENDENTE, JSON.stringify(fila));
}

async function tentarReenviarPendentes() {
  const url = Estado.config.webhook.url;
  if (!url) return;
  const fila = JSON.parse(localStorage.getItem(CHAVE_FILA_PENDENTE) || "[]");
  if (fila.length === 0) return;
  const restantes = [];
  for (const registro of fila) {
    const resultado = await registrarGiroRemoto(registro).catch(() => ({ ok: false }));
    if (!resultado || !resultado.ok) restantes.push(registro);
  }
  localStorage.setItem(CHAVE_FILA_PENDENTE, JSON.stringify(restantes));
}

/* ========================================================================
   MODAIS
   ======================================================================== */

const ModalNome = {
  el: null, input: null, erro: null,
  iniciar() {
    this.el = document.getElementById("modalNome");
    this.input = document.getElementById("inputNomeParticipante");
    this.erro = document.getElementById("erroNome");
    document.getElementById("btnCancelarGiro").addEventListener("click", () => this.fechar());
    document.getElementById("btnConfirmarGiro").addEventListener("click", () => this.confirmar());
    this.input.addEventListener("keydown", (e) => { if (e.key === "Enter") this.confirmar(); });
  },
  abrir() {
    this.input.value = "";
    this.erro.classList.add("oculto");
    this.el.classList.remove("oculto");
    setTimeout(() => this.input.focus(), 50);
  },
  fechar() { this.el.classList.add("oculto"); },
  confirmar() {
    const nome = this.input.value.trim();
    if (!nome) { this.erro.classList.remove("oculto"); return; }
    Estado.participanteAtual = nome;
    this.fechar();
    iniciarFluxoDeGiro(nome);
  }
};

const ModalResultado = {
  el: null,
  iniciar() {
    this.el = document.getElementById("modalResultado");
    document.getElementById("btnFecharResultado").addEventListener("click", () => this.fechar());
  },
  abrir(premio, nome) {
    const selo = document.getElementById("resultadoSelo");
    selo.className = "resultado-selo " + (premio.positivo ? "positivo" : "negativo");
    selo.textContent = premio.positivo ? "★" : "…";
    document.getElementById("resultadoNome").textContent = nome;
    document.getElementById("resultadoPremio").textContent = premio.nome;
    document.getElementById("resultadoStatus").textContent = premio.descricao || "";
    this.el.classList.remove("oculto");
  },
  fechar() { this.el.classList.add("oculto"); }
};

/* ========================================================================
   FLUXO PRINCIPAL DE GIRO
   ======================================================================== */

async function iniciarFluxoDeGiro(nomeParticipante) {
  if (Estado.girando) return;
  Estado.girando = true;

  const btnGirar = document.getElementById("btnGirar");
  btnGirar.disabled = true;

  tocarSom("audioGiro");

  const premioEscolhido = sortearPremioPonderado(Estado.config.premios);
  const duracaoMs = (Estado.config.roleta.duracaoGiroMs) || 4800;

  girarRoleta(premioEscolhido, duracaoMs, () => {
    finalizarGiro(premioEscolhido, nomeParticipante);
  });
}

async function finalizarGiro(premio, nomeParticipante) {
  pararSom("audioGiro");
  tocarSom("audioParada");

  const agora = new Date();
  const { data, hora } = formatarDataHora(agora);

  const registro = {
    nome: nomeParticipante,
    premio: premio.nome,
    tipo: premio.positivo ? "positivo" : "negativo",
    data, hora
  };

  // Registro obrigatório: sempre tenta enviar ao backend remoto.
  const resultadoEnvio = await registrarGiroRemoto(registro);
  if (!resultadoEnvio.ok) {
    mostrarToast("Giro registrado localmente. Reenviaremos à planilha automaticamente.");
  }

  adicionarHistorico({ nome: nomeParticipante, premio: premio.nome, data, hora });
  HistoricoEstatisticas.atualizar();

  if (premio.positivo) {
    tocarSom("audioVitoria");
    Confete.fogosDeArtificio();
  } else {
    tocarSom("audioDerrota");
    document.getElementById("canvasRoleta").parentElement.classList.add("tremer");
    setTimeout(() => document.getElementById("canvasRoleta").parentElement.classList.remove("tremer"), 400);
  }

  ModalResultado.abrir(premio, nomeParticipante);

  Estado.girando = false;
  document.getElementById("btnGirar").disabled = false;
}

/* ========================================================================
   HISTÓRICO E ESTATÍSTICAS
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
      tr.innerHTML = `<td>${registro.nome}</td><td>${registro.premio}</td><td>${registro.data}</td><td>${registro.hora}</td>`;
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
   PAINEL ADMINISTRATIVO
   ======================================================================== */

const PainelAdmin = {
  iniciar() {
    this._configurarAbas();
    this._configurarPremios();
    this._configurarVisual();
    this._configurarSons();
    this._configurarPerfis();
    this._configurarConfiguracoesGerais();
    this._preencherCampos();
  },

  _configurarAbas() {
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
        if (alvo === "perfis") this._renderizarListaPerfis();
      });
    });
  },

  _preencherCampos() {
    const c = Estado.config;
    document.getElementById("inputNomeEmpresa").value = c.empresa.nome;
    document.getElementById("inputTituloRoleta").value = c.empresa.tituloRoleta || "Roleta da Sorte";
    document.getElementById("inputCorPrimaria").value = c.empresa.corPrimaria;
    document.getElementById("inputCorSecundaria").value = c.empresa.corSecundaria;
    document.getElementById("selectFonte").value = c.empresa.fonte;
    document.getElementById("inputUrlWebhook").value = c.webhook.url;
    document.getElementById("inputDuracaoGiro").value = (c.roleta.duracaoGiroMs / 1000).toFixed(1);
    document.getElementById("inputVoltasMinimas").value = c.roleta.voltasMinimas;
    this._renderizarListaPremios();
    this._aplicarVisualNaTela();
  },

  /* ---------- PRÊMIOS ---------- */
  _configurarPremios() {
    document.getElementById("btnAdicionarPremio").addEventListener("click", () => {
      Estado.config.premios.push({
        id: gerarId(), nome: "Novo prêmio", cor: "#888888", peso: 5,
        categoria: "Brinde", descricao: "", positivo: true, som: ""
      });
      this._renderizarListaPremios();
      Roleta.desenhar(Estado.anguloAtual);
    });
  },

  _renderizarListaPremios() {
    const lista = document.getElementById("listaPremios");
    lista.innerHTML = "";
    Estado.config.premios.forEach((premio) => {
      const cartao = document.createElement("div");
      cartao.className = "cartao-premio";
      cartao.innerHTML = `
        <input type="color" class="cartao-premio__cor" value="${premio.cor}" data-campo="cor">
        <input type="text" value="${premio.nome}" data-campo="nome" placeholder="Nome do prêmio">
        <input type="number" min="1" value="${premio.peso}" data-campo="peso" placeholder="Peso">
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
          if (chave === "peso") valor = Math.max(1, Number(valor) || 1);
          if (chave === "positivo") valor = valor === "true";
          premio[chave] = valor;
          Roleta.desenhar(Estado.anguloAtual);
        });
      });

      cartao.querySelector(".botao-remover").addEventListener("click", () => {
        Estado.config.premios = Estado.config.premios.filter((p) => p.id !== premio.id);
        this._renderizarListaPremios();
        Roleta.desenhar(Estado.anguloAtual);
      });

      lista.appendChild(cartao);
    });
  },

  /* ---------- VISUAL ---------- */
  _configurarVisual() {
    document.getElementById("inputNomeEmpresa").addEventListener("input", (e) => {
      Estado.config.empresa.nome = e.target.value;
    });
    document.getElementById("inputTituloRoleta").addEventListener("input", (e) => {
      Estado.config.empresa.tituloRoleta = e.target.value;
      document.getElementById("topoTitulo").textContent = e.target.value || "Roleta da Sorte";
    });
    document.getElementById("inputCorPrimaria").addEventListener("input", (e) => {
      Estado.config.empresa.corPrimaria = e.target.value;
      this._aplicarVisualNaTela();
    });
    document.getElementById("inputCorSecundaria").addEventListener("input", (e) => {
      Estado.config.empresa.corSecundaria = e.target.value;
      this._aplicarVisualNaTela();
    });
    document.getElementById("selectFonte").addEventListener("change", (e) => {
      Estado.config.empresa.fonte = e.target.value;
      this._aplicarVisualNaTela();
    });
    this._configurarUploadImagem("inputLogoUpload", (dataUrl) => {
      Estado.config.empresa.logoUrl = dataUrl;
      document.getElementById("logoEmpresa").src = dataUrl;
      atualizarLogoCentral(dataUrl);
    });
    this._configurarUploadImagem("inputFundoUpload", (dataUrl) => {
      Estado.config.empresa.planoFundoUrl = dataUrl;
      document.getElementById("fundoPersonalizado").style.backgroundImage = `url(${dataUrl})`;
    });
  },

  _configurarUploadImagem(idInput, aoCarregar) {
    document.getElementById(idInput).addEventListener("change", (e) => {
      const arquivo = e.target.files[0];
      if (!arquivo) return;
      const leitor = new FileReader();
      leitor.onload = () => aoCarregar(leitor.result);
      leitor.readAsDataURL(arquivo);
    });
  },

  _aplicarVisualNaTela() {
    const c = Estado.config.empresa;
    document.documentElement.style.setProperty("--cor-primaria", c.corPrimaria);
    document.documentElement.style.setProperty("--cor-secundaria", c.corSecundaria);
    document.documentElement.style.setProperty("--fonte-display", `'${c.fonte}', sans-serif`);
    if (c.logoUrl) document.getElementById("logoEmpresa").src = c.logoUrl;
    if (c.planoFundoUrl) document.getElementById("fundoPersonalizado").style.backgroundImage = `url(${c.planoFundoUrl})`;
    document.getElementById("topoTitulo").textContent = c.tituloRoleta || "Roleta da Sorte";
    atualizarLogoCentral(c.logoUrl);
  },

  /* ---------- SONS ---------- */
  _configurarSons() {
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
  },

  /* ---------- PERFIS (múltiplos layouts salvos) ---------- */
  _configurarPerfis() {
    document.getElementById("btnSalvarNovoPerfil").addEventListener("click", () => {
      const campoNome = document.getElementById("inputNomeNovoPerfil");
      const nome = campoNome.value.trim();
      if (!nome) { mostrarToast("Digite um nome para o perfil."); return; }

      salvarConfig(Estado.config); // garante que o layout atual em tela esteja salvo
      const jaExiste = Object.prototype.hasOwnProperty.call(Perfis.carregarTodos(), nome);
      if (jaExiste && !confirm(`Já existe um perfil chamado "${nome}". Substituir?`)) return;

      Perfis.salvarComo(nome);
      campoNome.value = "";
      this._renderizarListaPerfis();
      mostrarToast(`Perfil "${nome}" salvo com sucesso.`);
    });
    this._renderizarListaPerfis();
  },

  _renderizarListaPerfis() {
    const lista = document.getElementById("listaPerfis");
    const mapa = Perfis.carregarTodos();
    const ativo = Perfis.obterAtivo();
    const nomes = Object.keys(mapa);

    lista.innerHTML = "";
    if (nomes.length === 0) {
      lista.innerHTML = `<p class="painel__dica">Nenhum perfil salvo ainda. Monte o layout nas outras abas e salve aqui com um nome.</p>`;
      return;
    }

    nomes.forEach((nome) => {
      const cartao = document.createElement("div");
      cartao.className = "cartao-perfil" + (nome === ativo ? " ativo" : "");
      cartao.innerHTML = `
        <span class="cartao-perfil__nome">${nome}${nome === ativo ? '<span class="cartao-perfil__selo">Em uso</span>' : ""}</span>
        <div class="cartao-perfil__acoes">
          <button class="botao-secundario" data-acao="carregar">Carregar</button>
          <button class="botao-remover" data-acao="excluir">Excluir</button>
        </div>
      `;
      cartao.querySelector('[data-acao="carregar"]').addEventListener("click", () => {
        Perfis.aplicar(nome);
        this._preencherCampos();
        carregarSonsNosElementos();
        Roleta.desenhar(Estado.anguloAtual);
        this._renderizarListaPerfis();
        mostrarToast(`Perfil "${nome}" carregado.`);
      });
      cartao.querySelector('[data-acao="excluir"]').addEventListener("click", () => {
        if (!confirm(`Excluir o perfil "${nome}"? Essa ação não pode ser desfeita.`)) return;
        Perfis.excluir(nome);
        this._renderizarListaPerfis();
        mostrarToast(`Perfil "${nome}" excluído.`);
      });
      lista.appendChild(cartao);
    });
  },

  /* ---------- CONFIGURAÇÕES GERAIS ---------- */
  _configurarConfiguracoesGerais() {
    document.getElementById("inputUrlWebhook").addEventListener("input", (e) => {
      Estado.config.webhook.url = e.target.value.trim();
    });
    document.getElementById("inputDuracaoGiro").addEventListener("input", (e) => {
      Estado.config.roleta.duracaoGiroMs = Math.round(Number(e.target.value) * 1000);
    });
    document.getElementById("inputVoltasMinimas").addEventListener("input", (e) => {
      Estado.config.roleta.voltasMinimas = Number(e.target.value);
    });

    document.getElementById("btnSalvarConfig").addEventListener("click", () => {
      salvarConfig(Estado.config);
      mostrarToast("Configurações salvas com sucesso.");
    });

    document.getElementById("btnResetarConfig").addEventListener("click", () => {
      if (!confirm("Isso vai restaurar todas as configurações padrão. Continuar?")) return;
      resetarConfig();
      this._preencherCampos();
      Roleta.desenhar(Estado.anguloAtual);
      mostrarToast("Configurações restauradas.");
    });

    document.getElementById("btnExportarJson").addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(Estado.config, null, 2)], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "config.json";
      link.click();
    });

    document.getElementById("inputImportarJson").addEventListener("change", (e) => {
      const arquivo = e.target.files[0];
      if (!arquivo) return;
      const leitor = new FileReader();
      leitor.onload = () => {
        try {
          const novaConfig = JSON.parse(leitor.result);
          Estado.config = novaConfig;
          salvarConfig(Estado.config);
          this._preencherCampos();
          Roleta.desenhar(Estado.anguloAtual);
          mostrarToast("Configuração importada com sucesso.");
        } catch (erro) {
          mostrarToast("Arquivo JSON inválido.");
        }
      };
      leitor.readAsText(arquivo);
    });
  }
};

/* ========================================================================
   TELA CHEIA E NAVEGAÇÃO
   ======================================================================== */

function configurarTelaCheia() {
  document.getElementById("btnTelaCheia").addEventListener("click", () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => mostrarToast("Não foi possível entrar em tela cheia."));
    } else {
      document.exitFullscreen();
    }
  });
}

function configurarScrollPainel() {
  document.getElementById("btnIrPainel").addEventListener("click", () => {
    document.getElementById("painelAdmin").scrollIntoView({ behavior: "smooth" });
  });
}

function carregarSonsNosElementos() {
  const s = Estado.config.sons;
  if (s.giro) document.getElementById("audioGiro").src = s.giro;
  if (s.vitoria) document.getElementById("audioVitoria").src = s.vitoria;
  if (s.derrota) document.getElementById("audioDerrota").src = s.derrota;
  if (s.clique) document.getElementById("audioClique").src = s.clique;
  if (s.parada) document.getElementById("audioParada").src = s.parada;
}

/* ========================================================================
   INICIALIZAÇÃO GERAL
   ======================================================================== */

function iniciarAplicacao() {
  Estado.config = carregarConfig();

  Roleta.iniciar();
  Confete.iniciar();
  ModalNome.iniciar();
  ModalResultado.iniciar();
  PainelAdmin.iniciar();
  HistoricoEstatisticas.atualizar();
  configurarTelaCheia();
  configurarScrollPainel();
  carregarSonsNosElementos();

  document.getElementById("btnGirar").addEventListener("click", () => {
    if (Estado.girando) return;
    tocarSom("audioClique");
    ModalNome.abrir();
  });

  // Tenta reenviar giros que falharam ao gravar na planilha.
  tentarReenviarPendentes();
  window.addEventListener("online", tentarReenviarPendentes);
}

document.addEventListener("DOMContentLoaded", iniciarAplicacao);
