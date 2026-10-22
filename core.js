/**
 * core.js
 * Módulo compartilhado entre a página pública (roleta) e o painel
 * administrativo (/admin). Contém estado, comunicação com o backend
 * (Google Apps Script), desenho da roleta no canvas, confete/fogos e
 * utilitários gerais.
 *
 * IMPORTANTE — arquitetura de compartilhamento entre navegadores:
 * Os "perfis" (layouts) e o "perfil ativo" (o que a roleta pública exibe)
 * NÃO vivem mais só no LocalStorage. Eles são centralizados no backend
 * (Google Apps Script + Google Drive), então qualquer navegador ou
 * dispositivo que abrir a roleta pública busca o MESMO perfil ativo.
 * O LocalStorage passa a ser apenas um cache de leitura, usado como
 * fallback se a rede cair no meio de um evento.
 */

export const CHAVE_CACHE_CONFIG_ATIVO = "roletaCorp_cache_config_ativo_v2";
export const CHAVE_HISTORICO = "roletaCorp_historico_minimo_v3";
export const CHAVE_CLIENTE = "roletaCorp_cliente_v3";
export const SONS_FIXOS = Object.freeze({
  giro: "assets/audio/roleta-girando.mp3",
  vitoria: "assets/audio/palmas.mp3",
  derrota: "assets/audio/naruto-sad.mp3",
  clique: "",
  parada: ""
});

let tokenAdmin = "";

export const Estado = {
  config: null,
  nomePerfilAtivo: "",
  girando: false,
  anguloAtual: 0,
  participanteAtual: ""
};

/**
 * Compara nomes de perfil de forma tolerante para URLs antigas da TV.
 * "Comercial" e "ROLETA COMERCIAL", por exemplo, apontam para o mesmo perfil.
 */
export function normalizarChavePerfil(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/^roleta\s+/, "")
    .replace(/\s+/g, " ");
}

export function resolverNomePerfilDisponivel(solicitado, perfis = [], ativo = "") {
  const nomes = [...new Set([...(Array.isArray(perfis) ? perfis : []), ativo].map((nome) => String(nome || "").trim()).filter(Boolean))];
  const chave = normalizarChavePerfil(solicitado);
  const encontrado = chave ? nomes.find((nome) => normalizarChavePerfil(nome) === chave) : "";
  return encontrado || (nomes.includes(ativo) ? ativo : nomes[0] || "");
}

/** A Corporate Screen incorpora a página; nesse contexto a mesma URL vira uma tela receptora. */
export function deveUsarModoTela({ modo = "", incorporado = false, referenciador = "" } = {}) {
  if (String(modo).toLowerCase() === "tela" || incorporado) return true;
  try {
    const host = new URL(String(referenciador || "")).hostname.toLowerCase();
    return host === "telacorporativa.com.br" || host.endsWith(".telacorporativa.com.br");
  } catch (ignorado) {
    return false;
  }
}

/* ========================================================================
   URL DO BACKEND
   ======================================================================== */

export function obterUrlBackend() {
  // A URL do Web App deve vir "de fábrica" do config.js (editada uma vez
  // por você ao publicar) para que TODOS os dispositivos/navegadores
  // apontem para o mesmo backend, sem depender de configuração local.
  const valor = (window.CONFIG_PADRAO && window.CONFIG_PADRAO.webhook && window.CONFIG_PADRAO.webhook.url) || "";
  try {
    const url = new URL(valor);
    const caminhoValido = /^\/(?:macros|a\/macros\/[^/]+)\/s\/[^/]+\/exec$/.test(url.pathname);
    if (url.protocol !== "https:" || url.hostname !== "script.google.com" || !caminhoValido) return "";
    return url.toString();
  } catch (erro) {
    return "";
  }
}

/* ========================================================================
   CLIENTE DO BACKEND (Google Apps Script)
   ======================================================================== */

async function chamarBackendGet(acao, params = {}) {
  const url = obterUrlBackend();
  if (!url) throw new Error("URL do Web App não configurada em config.js.");
  const query = new URLSearchParams({ acao, ...params }).toString();
  const resposta = await fetchComTimeout(`${url}?${query}`, { method: "GET" });
  const dados = await resposta.json();
  if (dados.status !== "sucesso") throw new Error(dados.mensagem || "Erro desconhecido no backend.");
  return dados;
}

async function chamarBackendPost(corpo, timeoutMs = 15000) {
  const url = obterUrlBackend();
  if (!url) throw new Error("URL do Web App não configurada em config.js.");
  const resposta = await fetchComTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" }, // evita preflight CORS no Apps Script
    body: JSON.stringify(corpo)
  }, timeoutMs);
  const dados = await resposta.json();
  if (dados.status !== "sucesso") throw new Error(dados.mensagem || "Erro desconhecido no backend.");
  return dados;
}

async function fetchComTimeout(url, opcoes, timeoutMs = 15000) {
  const controlador = new AbortController();
  const timer = setTimeout(() => controlador.abort(), timeoutMs);
  try {
    const resposta = await fetch(url, { ...opcoes, signal: controlador.signal });
    if (!resposta.ok) throw new Error(`Backend respondeu HTTP ${resposta.status}.`);
    return resposta;
  } catch (erro) {
    if (erro && erro.name === "AbortError") throw new Error("O backend demorou demais para responder.");
    throw erro;
  } finally {
    clearTimeout(timer);
  }
}

export function configurarTokenAdmin(valor) {
  tokenAdmin = String(valor || "");
}

export async function autenticarAdminRemoto(valor) {
  await chamarBackendPost({ acao: "autenticarAdmin", adminToken: String(valor || "") }, 30000);
  configurarTokenAdmin(valor);
  return true;
}

export function obterUrlLoginAdmin() {
  const valor = (window.CONFIG_PADRAO && window.CONFIG_PADRAO.admin && window.CONFIG_PADRAO.admin.authUrl) || "";
  try {
    const url = new URL(valor, window.location.href);
    const caminhoAppsScript = /^\/(?:macros|a\/macros\/[^/]+)\/s\/[^/]+\/exec$/.test(url.pathname);
    const localSeguro = url.protocol === "http:" && url.hostname === "127.0.0.1" && window.location.hostname === "127.0.0.1";
    if (!localSeguro && (url.protocol !== "https:" || url.hostname !== "script.google.com" || !caminhoAppsScript)) return "";
    url.search = "";
    url.hash = "";
    url.searchParams.set("acao", "loginAdmin");
    return url.toString();
  } catch (erro) {
    return "";
  }
}

/** Busca o perfil atualmente publicado para a roleta pública. */
export async function buscarConfigAtivoRemoto() {
  const dados = await chamarBackendGet("configAtivo");
  return dados.dados || null; // { nome, config, ativadoEm } ou null
}

/** Lista somente os nomes dos perfis disponibilizados no menu público. */
export async function listarPerfisPublicosRemoto() {
  const dados = await chamarBackendGet("perfisPublicos");
  return { perfis: Array.isArray(dados.perfis) ? dados.perfis : [], ativo: dados.ativo || "" };
}

/** Busca um perfil escolhido no menu. O servidor continua sendo a fonte da verdade. */
export async function buscarPerfilPublicoRemoto(nome) {
  const dados = await chamarBackendGet("perfilPublico", { nome: String(nome || "") });
  return dados.dados || null;
}

/** Último evento público do perfil, usado apenas pelo modo tela. */
export async function buscarUltimoGiroRemoto(nome) {
  const dados = await chamarBackendGet("ultimoGiro", { perfil: String(nome || "") });
  return dados.dados || null;
}

/** Lista todos os perfis salvos na "biblioteca" central. */
export async function listarPerfisRemoto() {
  const dados = await chamarBackendPost({ acao: "listarPerfis", adminToken: tokenAdmin }, 30000);
  return dados.perfis || {}; // { nomeDoPerfil: config, ... }
}

/** Salva (cria ou sobrescreve) um perfil na biblioteca central, sem publicá-lo. */
export async function salvarPerfilRemoto(nome, config) {
  validarConfiguracao(config);
  return chamarBackendPost({ acao: "salvarPerfil", nome, config, adminToken: tokenAdmin });
}

/** Publica um perfil como o que a roleta pública deve exibir agora. */
export async function ativarPerfilRemoto(nome, config) {
  validarConfiguracao(config);
  return chamarBackendPost({ acao: "ativarPerfil", nome, config, adminToken: tokenAdmin });
}

/** Remove um perfil da biblioteca central. */
export async function excluirPerfilRemoto(nome) {
  return chamarBackendPost({ acao: "excluirPerfil", nome, adminToken: tokenAdmin });
}

/** O backend sorteia e registra atomicamente; o cliente apenas anima o resultado. */
export async function sortearGiroRemoto(nome, idGiro = gerarIdSeguro(), perfil = Estado.nomePerfilAtivo) {
  const dados = await chamarBackendPost({
    acao: "sortearGiro",
    idGiro,
    clienteId: obterClienteId(),
    nome: String(nome || "").trim(),
    perfil: String(perfil || "").trim()
  });
  return dados.dados;
}

export function gerarIdSeguro() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID().replace(/-/g, "");
  }
  if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  throw new Error("Este navegador não oferece geração segura de identificadores.");
}

export function obterClienteId() {
  let id = localStorage.getItem(CHAVE_CLIENTE);
  if (!id || !/^[A-Za-z0-9_-]{16,80}$/.test(id)) {
    id = gerarIdSeguro();
    localStorage.setItem(CHAVE_CLIENTE, id);
  }
  return id;
}

/* ========================================================================
   CACHE LOCAL (fallback offline)
   ======================================================================== */

export function cachearConfigAtivo(nome, config) {
  localStorage.setItem(CHAVE_CACHE_CONFIG_ATIVO, JSON.stringify({ nome, config }));
}

export function lerCacheConfigAtivo() {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_CACHE_CONFIG_ATIVO)) || null;
  } catch (e) {
    return null;
  }
}

/**
 * Ponto único usado pela página pública para obter o layout a exibir:
 * tenta o backend primeiro (fonte da verdade, funciona em qualquer
 * navegador); se falhar, cai para o cache local; se não houver nada,
 * usa a configuração padrão de fábrica.
 */
export async function obterConfigParaExibir() {
  try {
    const remoto = await buscarConfigAtivoRemoto();
    if (remoto && remoto.config) {
      validarConfiguracao(remoto.config, { permitirCoresRepetidas: true });
      cachearConfigAtivo(remoto.nome, remoto.config);
      return { nome: remoto.nome, config: remoto.config, origem: "remoto" };
    }
  } catch (erro) {
    console.warn("Não foi possível buscar o perfil ativo do backend:", erro);
  }
  const cache = lerCacheConfigAtivo();
  if (cache) {
    try {
      validarConfiguracao(cache.config, { permitirCoresRepetidas: true });
      return { nome: cache.nome, config: cache.config, origem: "cache" };
    } catch (erro) {
      localStorage.removeItem(CHAVE_CACHE_CONFIG_ATIVO);
    }
  }
  return { nome: "", config: structuredClone(window.CONFIG_PADRAO), origem: "padrao" };
}

/* ========================================================================
   HISTÓRICO LOCAL (por navegador — apenas espelho de conveniência)
   ======================================================================== */

export function carregarHistorico() {
  try {
    const chaveAntiga = "roletaCorp_historico_v2";
    const antigo = localStorage.getItem(chaveAntiga);
    if (antigo !== null) {
      let anteriores = [];
      try { anteriores = JSON.parse(antigo); } catch (e) { /* histórico antigo inválido */ }
      const novos = JSON.parse(localStorage.getItem(CHAVE_HISTORICO)) || [];
      const reduzidos = [...(Array.isArray(novos) ? novos : []), ...(Array.isArray(anteriores) ? anteriores : [])]
        .map((registro) => ({ nome: String(registro?.nome || ""), data: String(registro?.data || "") }))
        .filter((registro) => registro.nome && registro.data)
        .slice(0, 200);
      localStorage.setItem(CHAVE_HISTORICO, JSON.stringify(reduzidos));
      localStorage.removeItem(chaveAntiga);
    }
    const registros = JSON.parse(localStorage.getItem(CHAVE_HISTORICO)) || [];
    if (!Array.isArray(registros)) return [];
    return registros
      .map((registro) => ({ nome: String(registro?.nome || ""), data: String(registro?.data || "") }))
      .filter((registro) => registro.nome && registro.data);
  }
  catch (e) { return []; }
}

export function adicionarHistorico(registro) {
  const historico = carregarHistorico();
  historico.unshift({ nome: String(registro?.nome || ""), data: String(registro?.data || "") });
  localStorage.setItem(CHAVE_HISTORICO, JSON.stringify(historico.slice(0, 200)));
}

/* ========================================================================
   UTILITÁRIOS
   ======================================================================== */

export function gerarId() {
  return "p" + gerarIdSeguro().slice(0, 12);
}

/** Sorteio uniforme: rejeita a sobra da divisão para não favorecer índices. */
export function sortearIndiceUniforme(tamanho, proximoUint32 = gerarUint32) {
  if (!Number.isInteger(tamanho) || tamanho < 1 || tamanho > 0x100000000) {
    throw new Error("Tamanho inválido para o sorteio.");
  }
  const limite = Math.floor(0x100000000 / tamanho) * tamanho;
  let valor;
  do {
    valor = proximoUint32();
    if (!Number.isInteger(valor) || valor < 0 || valor > 0xffffffff) {
      throw new Error("A fonte aleatória retornou um valor inválido.");
    }
  } while (valor >= limite);
  return valor % tamanho;
}

function gerarUint32() {
  if (!globalThis.crypto || typeof globalThis.crypto.getRandomValues !== "function") {
    throw new Error("Este navegador não oferece aleatoriedade segura.");
  }
  return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
}

/** Gera uma cor vibrante, excluindo todas as cores já usadas no perfil. */
export function gerarCorAleatoria(coresEmUso = [], sortearIndice = sortearIndiceUniforme) {
  const usadas = new Set(coresEmUso.map((cor) => String(cor).trim().toUpperCase()));
  for (let tentativa = 0; tentativa < 64; tentativa++) {
    const cor = hslParaHex(sortearIndice(360), 62 + sortearIndice(22), 42 + sortearIndice(14)).toUpperCase();
    if (!usadas.has(cor)) return cor;
  }
  // Mesmo se a fonte repetir candidatos, não há loop infinito nem cor duplicada.
  // A paleta reserva tem 360 cores; um perfil aceita no máximo 50 prêmios.
  const disponiveis = Array.from({ length: 360 }, (_, h) => hslParaHex(h, 72, 56).toUpperCase())
    .filter((cor) => !usadas.has(cor));
  if (!disponiveis.length) throw new Error("Não há cores disponíveis para este perfil.");
  return disponiveis[sortearIndice(disponiveis.length)];
}

/** Corrige perfis antigos/importados sem mudar nomes, IDs ou probabilidades. */
export function corrigirCoresRepetidas(premios) {
  const ocupadas = new Set(premios.map((premio) => String(premio.cor).trim().toUpperCase()));
  const vistas = new Set();
  let alteradas = 0;
  for (const premio of premios) {
    let cor = String(premio.cor).trim().toUpperCase();
    if (vistas.has(cor)) {
      cor = gerarCorAleatoria([...ocupadas]);
      ocupadas.add(cor);
      alteradas++;
    }
    premio.cor = cor;
    vistas.add(cor);
  }
  return alteradas;
}

function hslParaHex(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x) => Math.round(255 * x).toString(16).padStart(2, "0");
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

export function formatarDataHora(data) {
  const pad = (n) => String(n).padStart(2, "0");
  return {
    data: `${pad(data.getDate())}/${pad(data.getMonth() + 1)}/${data.getFullYear()}`,
    hora: `${pad(data.getHours())}:${pad(data.getMinutes())}:${pad(data.getSeconds())}`
  };
}

/** Validação defensiva usada antes de aceitar JSON importado no admin. */
export function validarConfiguracao(config, { permitirCoresRepetidas = false } = {}) {
  if (!config || typeof config !== "object" || Array.isArray(config)) throw new Error("estrutura raiz inválida");
  const serializada = JSON.stringify(config);
  if (serializada.length > 8 * 1024 * 1024) throw new Error("o perfil excede 8 MB");
  if (!config.empresa || !config.sons || !config.roleta) throw new Error("seções obrigatórias ausentes");
  if (!Array.isArray(config.premios) || config.premios.length < 2 || config.premios.length > 50) {
    throw new Error("use entre 2 e 50 prêmios");
  }
  const ids = new Set();
  const cores = new Set();
  config.premios.forEach((premio, indice) => {
    if (!premio || typeof premio !== "object") throw new Error(`prêmio ${indice + 1} inválido`);
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(String(premio.id || "")) || ids.has(premio.id)) {
      throw new Error("os IDs dos prêmios devem ser únicos e alfanuméricos");
    }
    ids.add(premio.id);
    if (!String(premio.nome || "").trim() || String(premio.nome).length > 80) throw new Error(`nome do prêmio ${indice + 1} inválido`);
    if (!/^#[0-9A-Fa-f]{6}$/.test(String(premio.cor || ""))) throw new Error(`cor do prêmio ${indice + 1} inválida`);
    const cor = premio.cor.toUpperCase();
    if (!permitirCoresRepetidas && cores.has(cor)) throw new Error("as cores dos prêmios não podem se repetir");
    cores.add(cor);
  });
  const duracao = Number(config.roleta.duracaoGiroMs);
  const voltas = Number(config.roleta.voltasMinimas);
  if (!Number.isFinite(duracao) || duracao < 2000 || duracao > 15000) throw new Error("duração deve ficar entre 2 e 15 segundos");
  if (!Number.isInteger(voltas) || voltas < 2 || voltas > 20) throw new Error("voltas mínimas deve ficar entre 2 e 20");
  [config.empresa.logoUrl, config.empresa.planoFundoUrl, ...Object.values(config.sons)].forEach((valor) => {
    const url = String(valor || "");
    if (/^(javascript|vbscript|file):/i.test(url) || /^data:(?!image\/(png|jpeg|webp|gif)|audio\/(mpeg|mp3|wav|ogg|webm|mp4|x-m4a))/i.test(url)) {
      throw new Error("o perfil contém uma URL de mídia não permitida");
    }
  });
  return true;
}

export function mostrarToast(mensagem) {
  const toast = document.getElementById("avisoToast");
  if (!toast) return;
  toast.textContent = mensagem;
  toast.classList.remove("oculto");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.add("oculto"), 3200);
}

export function tocarSom(idAudio) {
  const audio = document.getElementById(idAudio);
  if (!audio || !audio.src) return;
  try { audio.currentTime = 0; audio.play().catch(() => {}); } catch (e) { /* silencioso */ }
}

export function pararSom(idAudio) {
  const audio = document.getElementById(idAudio);
  if (!audio) return;
  audio.pause();
  audio.currentTime = 0;
}

export function atualizarLogoCentral(logoUrl) {
  const img = document.getElementById("logoCentral");
  const texto = document.getElementById("textoCentral");
  if (!img || !texto) return;
  // O centro da roleta é o único controle de giro e precisa manter seu
  // propósito visível mesmo quando o perfil possui um logotipo.
  img.removeAttribute("src");
  img.classList.add("oculto");
  texto.classList.remove("oculto");
}

export function carregarSonsNosElementos(config) {
  // Os áudios são parte fixa do produto. Perfis antigos não podem substituí-los.
  const s = SONS_FIXOS;
  if (config && typeof config === "object") config.sons = { ...SONS_FIXOS };
  const mapa = { giro: "audioGiro", vitoria: "audioVitoria", derrota: "audioDerrota", clique: "audioClique", parada: "audioParada" };
  Object.entries(mapa).forEach(([chave, idAudio]) => {
    const el = document.getElementById(idAudio);
    if (!el) return;
    // Caminhos relativos partem da raiz do projeto (onde core.js fica),
    // inclusive quando este módulo é usado pela página /admin/.
    if (s[chave]) {
      const proximaUrl = new URL(s[chave], import.meta.url).href;
      if (el.src !== proximaUrl) {
        el.src = proximaUrl;
        el.load();
      }
    } else {
      el.removeAttribute("src");
      el.load();
    }
  });
}

export function aplicarVisualNaTela(config) {
  const c = config.empresa;
  document.documentElement.style.setProperty("--cor-primaria", c.corPrimaria);
  document.documentElement.style.setProperty("--cor-secundaria", c.corSecundaria);
  document.documentElement.style.setProperty("--fonte-display", `'${c.fonte}', sans-serif`);
  const logo = document.getElementById("logoEmpresa");
  const nomeEmpresaTopo = document.getElementById("nomeEmpresaTopo");
  const fundo = document.getElementById("fundoPersonalizado");
  const titulo = document.getElementById("topoTitulo");
  if (logo) {
    if (c.logoUrl) {
      logo.onerror = () => {
        logo.removeAttribute("src");
        logo.classList.add("oculto");
        if (nomeEmpresaTopo) {
          nomeEmpresaTopo.textContent = c.nome || "Korax";
          nomeEmpresaTopo.classList.remove("oculto");
        }
      };
      logo.src = c.logoUrl;
      logo.classList.remove("oculto");
      if (nomeEmpresaTopo) nomeEmpresaTopo.classList.add("oculto");
    }
    else {
      logo.removeAttribute("src");
      logo.classList.add("oculto");
      if (nomeEmpresaTopo) {
        nomeEmpresaTopo.textContent = c.nome || "Korax";
        nomeEmpresaTopo.classList.remove("oculto");
      }
    }
  }
  if (fundo) fundo.style.backgroundImage = c.planoFundoUrl ? `url("${String(c.planoFundoUrl).replace(/["\\\n\r]/g, "")}")` : "none";
  if (titulo) titulo.textContent = c.tituloRoleta || "Roleta da Sorte";
  atualizarLogoCentral(c.logoUrl);
}

/* ========================================================================
   MÓDULO ROLETA (CANVAS) — fatias sempre iguais, sorteio 100% aleatório
   ======================================================================== */

export const Roleta = {
  canvas: null,
  ctx: null,
  animacao: null,

  iniciar(idCanvas = "canvasRoleta") {
    this.canvas = document.getElementById(idCanvas);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext("2d", { alpha: true, desynchronized: true });
    this.desenhar();
  },

  aplicarRotacao(angulo = 0) {
    if (!this.canvas) return;
    this.canvas.style.transform = `rotate(${angulo}rad)`;
  },

  desenhar(anguloExtra = 0) {
    const { ctx, canvas } = this;
    if (!ctx) return;
    const premios = (Estado.config && Estado.config.premios) || [];
    const raio = canvas.width / 2;
    const raioInterno = raio * 0.24;
    const n = premios.length || 1;
    const anguloFatia = (Math.PI * 2) / n;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(raio, raio);

    let anguloInicial = -Math.PI / 2;
    premios.forEach((premio) => {
      ctx.beginPath();
      ctx.arc(0, 0, raio - 6, anguloInicial, anguloInicial + anguloFatia);
      ctx.arc(0, 0, raioInterno, anguloInicial + anguloFatia, anguloInicial, true);
      ctx.closePath();
      ctx.fillStyle = premio.cor || "#888";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.stroke();

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

    ctx.beginPath();
    ctx.arc(0, 0, raio - 4, 0, Math.PI * 2);
    ctx.lineWidth = 8;
    ctx.strokeStyle = "#C9A227";
    ctx.stroke();

    ctx.restore();
    this.aplicarRotacao(anguloExtra);
  }
};

/* ========================================================================
   SORTEIO 100% ALEATÓRIO (sem pesos) E GIRO
   ======================================================================== */

export function sortearPremioAleatorio(premios) {
  if (!Array.isArray(premios) || premios.length === 0) throw new Error("Não há prêmios para sortear.");
  return premios[sortearIndiceUniforme(premios.length)];
}

export function calcularAnguloFinal(premios, premioEscolhido) {
  const n = premios.length;
  const anguloFatia = (Math.PI * 2) / n;
  const indice = premios.findIndex((p) => p.id === premioEscolhido.id);
  const anguloInicial = -Math.PI / 2 + indice * anguloFatia;
  const anguloDaFatia = anguloInicial + anguloFatia / 2;

  // Pequena variação aleatória dentro da fatia para parecer natural,
  // mas nunca perto das bordas (evita "quase acertou o vizinho").
  const margem = anguloFatia * 0.18;
  const variacao = (Math.random() * 2 - 1) * (anguloFatia / 2 - margem);
  return anguloDaFatia + variacao;
}

function normalizarAngulo(angulo) {
  const voltaCompleta = Math.PI * 2;
  return ((angulo % voltaCompleta) + voltaCompleta) % voltaCompleta;
}

export function girarRoleta(premioEscolhido, duracaoMs, aoTerminar) {
  const voltas = (Estado.config.roleta && Estado.config.roleta.voltasMinimas) || 6;

  const anguloAlvoAbsoluto = calcularAnguloFinal(Estado.config.premios, premioEscolhido);
  const rotacaoNecessaria = normalizarAngulo(-Math.PI / 2 - anguloAlvoAbsoluto);
  const anguloAtualNormalizado = normalizarAngulo(Estado.anguloAtual);
  const deltaAteAlvo = normalizarAngulo(rotacaoNecessaria - anguloAtualNormalizado);
  const anguloFinal = Estado.anguloAtual + voltas * Math.PI * 2 + deltaAteAlvo;

  const anguloInicioAnimacao = Estado.anguloAtual;
  const reduzirMovimento = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const duracaoEfetiva = reduzirMovimento ? Math.min(600, duracaoMs) : duracaoMs;
  const canvas = Roleta.canvas;
  let terminou = false;

  function concluir() {
    if (terminou) return;
    terminou = true;
    Estado.anguloAtual = normalizarAngulo(anguloFinal);
    Roleta.aplicarRotacao(Estado.anguloAtual);
    canvas?.classList.remove("esta-girando");
    if (Roleta.animacao) {
      Roleta.animacao.cancel();
      Roleta.animacao = null;
    }
    aoTerminar();
  }

  if (canvas && typeof canvas.animate === "function") {
    canvas.classList.add("esta-girando");
    Roleta.animacao = canvas.animate(
      [
        { transform: `rotate(${anguloInicioAnimacao}rad)` },
        { transform: `rotate(${anguloFinal}rad)` }
      ],
      {
        duration: duracaoEfetiva,
        easing: "cubic-bezier(0.12, 0.76, 0.18, 1)",
        fill: "forwards"
      }
    );
    Roleta.animacao.addEventListener("finish", concluir, { once: true });
    return;
  }

  // Compatibilidade com navegadores antigos: ainda movimenta só a camada
  // do canvas, sem redesenhar fatias e textos a cada quadro.
  const inicio = performance.now();
  function passo(agora) {
    const t = Math.min(1, (agora - inicio) / duracaoEfetiva);
    const progresso = 1 - Math.pow(1 - t, 5);
    Estado.anguloAtual = anguloInicioAnimacao + (anguloFinal - anguloInicioAnimacao) * progresso;
    Roleta.aplicarRotacao(Estado.anguloAtual);
    if (t < 1) requestAnimationFrame(passo);
    else concluir();
  }
  canvas?.classList.add("esta-girando");
  requestAnimationFrame(passo);
}

/* ========================================================================
   MÓDULO CONFETE / FOGOS DE ARTIFÍCIO
   ======================================================================== */

export const Confete = {
  canvas: null,
  ctx: null,
  particulas: [],
  animando: false,
  ultimoQuadro: 0,
  qualidade: 1,
  resizePendente: false,

  iniciar() {
    this.canvas = document.getElementById("canvasConfete");
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext("2d", { alpha: true, desynchronized: true });
    const poucosNucleos = Number(navigator.hardwareConcurrency || 4) <= 4;
    this.qualidade = window.innerWidth <= 720 || poucosNucleos ? 0.55 : 0.8;
    this.redimensionar();
    window.addEventListener("resize", () => {
      if (this.resizePendente) return;
      this.resizePendente = true;
      requestAnimationFrame(() => {
        this.resizePendente = false;
        this.redimensionar();
      });
    }, { passive: true });
  },

  redimensionar() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  },

  explodir(cores = ["#C9A227", "#E8C766", "#1F9D6B", "#ffffff"], quantidade = 140, origemX = null, origemY = null) {
    if (!this.canvas) return;
    const reduzirMovimento = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const quantidadeEfetiva = Math.min(
      reduzirMovimento ? 36 : Math.round(quantidade * this.qualidade),
      Math.max(0, 600 - this.particulas.length)
    );
    const x = origemX !== null ? origemX : this.canvas.width / 2;
    const y = origemY !== null ? origemY : this.canvas.height / 2;
    for (let i = 0; i < quantidadeEfetiva; i++) {
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
    if (!this.animando && quantidadeEfetiva > 0) {
      this.animando = true;
      this.ultimoQuadro = performance.now();
      requestAnimationFrame((agora) => this._loop(agora));
    }
  },

  fogosDeArtificio(cores = ["#C9A227", "#E8C766", "#1F9D6B", "#ffffff", "#5DADE2"], rajadas = 6) {
    if (!this.canvas) return;
    const reduzirMovimento = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const totalRajadas = reduzirMovimento ? 1 : Math.min(rajadas, this.qualidade < 0.7 ? 4 : 5);
    for (let i = 0; i < totalRajadas; i++) {
      const atraso = i * 260 + Math.random() * 150;
      setTimeout(() => {
        const x = this.canvas.width * (0.18 + Math.random() * 0.64);
        const y = this.canvas.height * (0.18 + Math.random() * 0.4);
        this.explodir(cores, 80 + Math.floor(Math.random() * 45), x, y);
      }, atraso);
    }
    if (!reduzirMovimento) setTimeout(() => this.explodir(cores, 150), totalRajadas * 260);
  },

  _loop(agora) {
    const { ctx, canvas } = this;
    const passo = Math.min(2, Math.max(0.5, (agora - this.ultimoQuadro) / 16.67));
    this.ultimoQuadro = agora;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let quantidadeAtiva = 0;
    for (const p of this.particulas) {
      p.vy += 0.28 * passo;
      p.x += p.vx * passo;
      p.y += p.vy * passo;
      p.vida += passo;
      p.rotacao += 0.15 * passo;
      if (p.vida >= p.vidaMax) continue;
      const opacidade = Math.max(0, 1 - p.vida / p.vidaMax);
      ctx.globalAlpha = opacidade;
      const cosseno = Math.cos(p.rotacao);
      const seno = Math.sin(p.rotacao);
      ctx.setTransform(cosseno, seno, -seno, cosseno, p.x, p.y);
      ctx.fillStyle = p.cor;
      ctx.fillRect(-p.tamanho / 2, -p.tamanho / 2, p.tamanho, p.tamanho * 0.6);
      this.particulas[quantidadeAtiva++] = p;
    }
    this.particulas.length = quantidadeAtiva;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;

    if (this.particulas.length > 0) {
      requestAnimationFrame((proximoAgora) => this._loop(proximoAgora));
    } else {
      this.animando = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }
};
