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
export const CHAVE_HISTORICO = "roletaCorp_historico_v2";
export const CHAVE_FILA_PENDENTE = "roletaCorp_fila_pendente_v2";

export const Estado = {
  config: null,
  nomePerfilAtivo: "",
  girando: false,
  anguloAtual: 0,
  participanteAtual: ""
};

/* ========================================================================
   URL DO BACKEND
   ======================================================================== */

export function obterUrlBackend() {
  // A URL do Web App deve vir "de fábrica" do config.js (editada uma vez
  // por você ao publicar) para que TODOS os dispositivos/navegadores
  // apontem para o mesmo backend, sem depender de configuração local.
  return (window.CONFIG_PADRAO && window.CONFIG_PADRAO.webhook && window.CONFIG_PADRAO.webhook.url) || "";
}

/* ========================================================================
   CLIENTE DO BACKEND (Google Apps Script)
   ======================================================================== */

async function chamarBackendGet(acao, params = {}) {
  const url = obterUrlBackend();
  if (!url) throw new Error("URL do Web App não configurada em config.js.");
  const query = new URLSearchParams({ acao, ...params }).toString();
  const resposta = await fetch(`${url}?${query}`, { method: "GET" });
  const dados = await resposta.json();
  if (dados.status !== "sucesso") throw new Error(dados.mensagem || "Erro desconhecido no backend.");
  return dados;
}

async function chamarBackendPost(corpo) {
  const url = obterUrlBackend();
  if (!url) throw new Error("URL do Web App não configurada em config.js.");
  const resposta = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" }, // evita preflight CORS no Apps Script
    body: JSON.stringify(corpo)
  });
  const dados = await resposta.json();
  if (dados.status !== "sucesso") throw new Error(dados.mensagem || "Erro desconhecido no backend.");
  return dados;
}

/** Busca o perfil atualmente publicado para a roleta pública. */
export async function buscarConfigAtivoRemoto() {
  const dados = await chamarBackendGet("configAtivo");
  return dados.dados || null; // { nome, config, ativadoEm } ou null
}

/** Lista todos os perfis salvos na "biblioteca" central. */
export async function listarPerfisRemoto() {
  const dados = await chamarBackendGet("listarPerfis");
  return dados.perfis || {}; // { nomeDoPerfil: config, ... }
}

/** Salva (cria ou sobrescreve) um perfil na biblioteca central, sem publicá-lo. */
export async function salvarPerfilRemoto(nome, config) {
  return chamarBackendPost({ acao: "salvarPerfil", nome, config });
}

/** Publica um perfil como o que a roleta pública deve exibir agora. */
export async function ativarPerfilRemoto(nome, config) {
  return chamarBackendPost({ acao: "ativarPerfil", nome, config });
}

/** Remove um perfil da biblioteca central. */
export async function excluirPerfilRemoto(nome) {
  return chamarBackendPost({ acao: "excluirPerfil", nome });
}

/** Registra um giro (obrigatório) — grava na planilha do mês/layout correto. */
export async function registrarGiroRemoto(registro) {
  try {
    await chamarBackendPost({ acao: "registrarGiro", ...registro });
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

export async function tentarReenviarPendentes() {
  if (!obterUrlBackend()) return;
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
      cachearConfigAtivo(remoto.nome, remoto.config);
      return { nome: remoto.nome, config: remoto.config, origem: "remoto" };
    }
  } catch (erro) {
    console.warn("Não foi possível buscar o perfil ativo do backend:", erro);
  }
  const cache = lerCacheConfigAtivo();
  if (cache) return { nome: cache.nome, config: cache.config, origem: "cache" };
  return { nome: "", config: structuredClone(window.CONFIG_PADRAO), origem: "padrao" };
}

/* ========================================================================
   HISTÓRICO LOCAL (por navegador — apenas espelho de conveniência)
   ======================================================================== */

export function carregarHistorico() {
  try { return JSON.parse(localStorage.getItem(CHAVE_HISTORICO)) || []; }
  catch (e) { return []; }
}

export function adicionarHistorico(registro) {
  const historico = carregarHistorico();
  historico.unshift(registro);
  localStorage.setItem(CHAVE_HISTORICO, JSON.stringify(historico.slice(0, 200)));
}

/* ========================================================================
   UTILITÁRIOS
   ======================================================================== */

export function gerarId() {
  return "p" + Math.random().toString(36).slice(2, 9);
}

/** Gera uma cor hexadecimal aleatória, mas vibrante e legível
 *  (evita tons muito escuros ou muito claros que ficam ilegíveis no texto). */
export function gerarCorAleatoria() {
  const h = Math.floor(Math.random() * 360);
  const s = 62 + Math.floor(Math.random() * 22); // 62–84%
  const l = 42 + Math.floor(Math.random() * 14); // 42–56%
  return hslParaHex(h, s, l);
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
  if (logoUrl) {
    img.src = logoUrl;
    img.classList.remove("oculto");
    texto.classList.add("oculto");
  } else {
    img.classList.add("oculto");
    texto.classList.remove("oculto");
  }
}

export function carregarSonsNosElementos(config) {
  const s = config.sons;
  const mapa = { giro: "audioGiro", vitoria: "audioVitoria", derrota: "audioDerrota", clique: "audioClique", parada: "audioParada" };
  Object.entries(mapa).forEach(([chave, idAudio]) => {
    const el = document.getElementById(idAudio);
    if (el && s[chave]) el.src = s[chave];
  });
}

export function aplicarVisualNaTela(config) {
  const c = config.empresa;
  document.documentElement.style.setProperty("--cor-primaria", c.corPrimaria);
  document.documentElement.style.setProperty("--cor-secundaria", c.corSecundaria);
  document.documentElement.style.setProperty("--fonte-display", `'${c.fonte}', sans-serif`);
  const logo = document.getElementById("logoEmpresa");
  const fundo = document.getElementById("fundoPersonalizado");
  const titulo = document.getElementById("topoTitulo");
  if (logo && c.logoUrl) logo.src = c.logoUrl;
  if (fundo && c.planoFundoUrl) fundo.style.backgroundImage = `url(${c.planoFundoUrl})`;
  if (titulo) titulo.textContent = c.tituloRoleta || "Roleta da Sorte";
  atualizarLogoCentral(c.logoUrl);
}

/* ========================================================================
   MÓDULO ROLETA (CANVAS) — fatias sempre iguais, sorteio 100% aleatório
   ======================================================================== */

export const Roleta = {
  canvas: null,
  ctx: null,

  iniciar(idCanvas = "canvasRoleta") {
    this.canvas = document.getElementById(idCanvas);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext("2d");
    this.desenhar();
  },

  desenhar(anguloExtra = 0) {
    const { ctx, canvas } = this;
    if (!ctx) return;
    const premios = (Estado.config && Estado.config.premios) || [];
    const raio = canvas.width / 2;
    const n = premios.length || 1;
    const anguloFatia = (Math.PI * 2) / n;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(raio, raio);
    ctx.rotate(anguloExtra);

    let anguloInicial = -Math.PI / 2;
    premios.forEach((premio) => {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, raio - 6, anguloInicial, anguloInicial + anguloFatia);
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
  }
};

/* ========================================================================
   SORTEIO 100% ALEATÓRIO (sem pesos) E GIRO
   ======================================================================== */

export function sortearPremioAleatorio(premios) {
  return premios[Math.floor(Math.random() * premios.length)];
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

function easeOutQuint(t) {
  return 1 - Math.pow(1 - t, 5);
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
   MÓDULO CONFETE / FOGOS DE ARTIFÍCIO
   ======================================================================== */

export const Confete = {
  canvas: null,
  ctx: null,
  particulas: [],
  animando: false,

  iniciar() {
    this.canvas = document.getElementById("canvasConfete");
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext("2d");
    this.redimensionar();
    window.addEventListener("resize", () => this.redimensionar());
  },

  redimensionar() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  },

  explodir(cores = ["#C9A227", "#E8C766", "#1F9D6B", "#ffffff"], quantidade = 140, origemX = null, origemY = null) {
    if (!this.canvas) return;
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

  fogosDeArtificio(cores = ["#C9A227", "#E8C766", "#1F9D6B", "#ffffff", "#5DADE2"], rajadas = 6) {
    if (!this.canvas) return;
    for (let i = 0; i < rajadas; i++) {
      const atraso = i * 260 + Math.random() * 150;
      setTimeout(() => {
        const x = this.canvas.width * (0.18 + Math.random() * 0.64);
        const y = this.canvas.height * (0.18 + Math.random() * 0.4);
        this.explodir(cores, 90 + Math.floor(Math.random() * 60), x, y);
      }, atraso);
    }
    setTimeout(() => this.explodir(cores, 220), rajadas * 260);
  },

  _loop() {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    this.particulas.forEach((p) => {
      p.vy += 0.28;
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
