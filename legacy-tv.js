(function () {
  "use strict";

  var query = parseQuery(window.location.search || "");
  if (query.legacy !== "1") return;

  var EVENT_WINDOW_MS = 2 * 60 * 1000;
  var POLL_INTERVAL_MS = 900;
  var state = {
    config: null,
    profile: "",
    angle: 0,
    spinning: false,
    lastEventId: "",
    pollTimer: 0,
    resultTimer: 0
  };

  function parseQuery(value) {
    var result = {};
    var source = String(value || "").replace(/^\?/, "");
    if (!source) return result;
    var entries = source.split("&");
    for (var index = 0; index < entries.length; index += 1) {
      var pair = entries[index].split("=");
      try {
        result[decodeURIComponent(pair[0] || "")] = decodeURIComponent(String(pair.slice(1).join("=") || "").replace(/\+/g, " "));
      } catch (error) {}
    }
    return result;
  }

  function addClass(node, name) {
    if (!node || (" " + node.className + " ").indexOf(" " + name + " ") >= 0) return;
    node.className += (node.className ? " " : "") + name;
  }

  function removeClass(node, name) {
    if (!node) return;
    node.className = (" " + node.className + " ").replace(" " + name + " ", " ").replace(/^\s+|\s+$/g, "");
  }

  function backendUrl() {
    var config = window.CONFIG_PADRAO || {};
    return config.webhook && config.webhook.url ? String(config.webhook.url) : "";
  }

  function request(action, params, callback) {
    var url = backendUrl();
    if (!url) return callback(new Error("Backend nao configurado."));
    var parts = ["acao=" + encodeURIComponent(action)];
    var key;
    params = params || {};
    for (key in params) {
      if (Object.prototype.hasOwnProperty.call(params, key)) parts.push(encodeURIComponent(key) + "=" + encodeURIComponent(params[key]));
    }
    var xhr = new XMLHttpRequest();
    var finished = false;
    var timeout = window.setTimeout(function () {
      if (finished) return;
      finished = true;
      try { xhr.abort(); } catch (error) {}
      callback(new Error("Tempo de resposta excedido."));
    }, 15000);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4 || finished) return;
      finished = true;
      window.clearTimeout(timeout);
      if (xhr.status < 200 || xhr.status >= 300) return callback(new Error("HTTP " + xhr.status));
      try {
        var payload = JSON.parse(xhr.responseText);
        if (!payload || payload.status !== "sucesso") return callback(new Error((payload && payload.mensagem) || "Resposta invalida."));
        callback(null, payload);
      } catch (error) { callback(error); }
    };
    xhr.onerror = function () {
      if (finished) return;
      finished = true;
      window.clearTimeout(timeout);
      callback(new Error("Falha de rede."));
    };
    xhr.open("GET", url + (url.indexOf("?") >= 0 ? "&" : "?") + parts.join("&"), true);
    xhr.send(null);
  }

  function byId(id) { return document.getElementById(id); }

  function prepareLayout() {
    addClass(document.body, "modo-tela");
    addClass(document.body, "modo-tela-legado");
    var modalProfile = byId("modalPerfil");
    if (modalProfile) addClass(modalProfile, "oculto");
    var button = byId("btnGirar");
    if (button) {
      button.disabled = true;
      byId("textoCentral").innerHTML = "AGUARDANDO";
    }
    resizeWheel();
    if (window.addEventListener) window.addEventListener("resize", resizeWheel, false);
    else if (window.attachEvent) window.attachEvent("onresize", resizeWheel);
  }

  function resizeWheel() {
    var wrap = document.querySelector ? document.querySelector(".arena__roleta-wrap") : null;
    if (!wrap) return;
    var width = Math.min((window.innerHeight || 720) * 0.72, (window.innerWidth || 1280) * 0.72, 720);
    width = Math.max(260, Math.floor(width));
    wrap.style.width = width + "px";
    wrap.style.height = width + "px";
  }

  function setStatus(text, connected) {
    var node = byId("statusTela");
    if (!node) return;
    node.innerHTML = text;
    removeClass(node, "oculto");
    if (connected) addClass(node, "status-tela--conectado");
    else removeClass(node, "status-tela--conectado");
  }

  function safeColor(value, fallback) {
    return /^#[0-9a-f]{3,8}$/i.test(String(value || "")) ? String(value) : fallback;
  }

  function applyConfig(profile, config) {
    state.profile = String(profile || state.profile || "Roleta Comercial");
    state.config = config || state.config || window.CONFIG_PADRAO || {};
    var company = state.config.empresa || {};
    var stage = byId("palco");
    if (stage) stage.style.backgroundColor = safeColor(company.corSecundaria, "#070B14");
    var background = byId("fundoPersonalizado");
    if (background) background.style.backgroundImage = company.planoFundoUrl ? "url('" + String(company.planoFundoUrl).replace(/[\"'\\\r\n]/g, "") + "')" : "none";
    var title = byId("topoTitulo");
    if (title) {
      title.innerHTML = escapeHtml(company.tituloRoleta || "Roleta da Sorte");
      title.style.color = safeColor(company.corPrimaria, "#C9A227");
    }
    var topName = byId("nomeEmpresaTopo");
    var topLogo = byId("logoEmpresa");
    var centerLogo = byId("logoCentral");
    if (company.logoUrl) {
      if (topLogo) { topLogo.src = company.logoUrl; removeClass(topLogo, "oculto"); }
      if (centerLogo) { centerLogo.src = company.logoUrl; removeClass(centerLogo, "oculto"); }
      if (topName) addClass(topName, "oculto");
    } else {
      if (topLogo) addClass(topLogo, "oculto");
      if (centerLogo) addClass(centerLogo, "oculto");
      if (topName) { topName.innerHTML = escapeHtml(company.nome || "Korax"); removeClass(topName, "oculto"); }
    }
    var selected = byId("nomePerfilSelecionado");
    if (selected) selected.innerHTML = escapeHtml(state.profile);
    drawWheel(state.angle);
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function wheelPrizes() {
    return state.config && state.config.premios && state.config.premios.length ? state.config.premios : [];
  }

  function drawWheel(angle) {
    var canvas = byId("canvasRoleta");
    if (!canvas || !canvas.getContext) return;
    var context = canvas.getContext("2d");
    if (!context) return;
    var prizes = wheelPrizes();
    var count = prizes.length || 1;
    var radius = canvas.width / 2;
    var innerRadius = radius * 0.24;
    var slice = Math.PI * 2 / count;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.save();
    context.translate(radius, radius);
    for (var index = 0; index < count; index += 1) {
      var prize = prizes[index] || { nome: "Aguardando", cor: "#334155" };
      var start = -Math.PI / 2 + index * slice;
      context.beginPath();
      context.arc(0, 0, radius - 6, start, start + slice, false);
      context.arc(0, 0, innerRadius, start + slice, start, true);
      context.closePath();
      context.fillStyle = safeColor(prize.cor, "#64748b");
      context.fill();
      context.lineWidth = 2;
      context.strokeStyle = "rgba(255,255,255,0.28)";
      context.stroke();
      context.save();
      context.rotate(start + slice / 2);
      context.textAlign = "right";
      context.textBaseline = "middle";
      context.fillStyle = "#111111";
      context.font = "bold 20px Arial, sans-serif";
      var label = String(prize.nome || "Premio");
      if (label.length > 16) label = label.substring(0, 15) + "...";
      context.fillText(label, radius - 26, 0);
      context.restore();
    }
    context.beginPath();
    context.arc(0, 0, radius - 4, 0, Math.PI * 2, false);
    context.lineWidth = 8;
    context.strokeStyle = safeColor(state.config && state.config.empresa && state.config.empresa.corPrimaria, "#C9A227");
    context.stroke();
    context.restore();
    setRotation(canvas, angle || 0);
  }

  function setRotation(canvas, angle) {
    var value = "rotate(" + angle + "rad)";
    canvas.style.transform = value;
    canvas.style.webkitTransform = value;
  }

  function normalizeAngle(angle) {
    var turn = Math.PI * 2;
    return ((angle % turn) + turn) % turn;
  }

  function calculateFinalAngle(prize) {
    var prizes = wheelPrizes();
    var index = 0;
    for (var position = 0; position < prizes.length; position += 1) {
      if (String(prizes[position].id) === String(prize.id)) { index = position; break; }
    }
    var slice = Math.PI * 2 / Math.max(1, prizes.length);
    var targetSlice = -Math.PI / 2 + index * slice + slice / 2;
    var required = normalizeAngle(-Math.PI / 2 - targetSlice);
    var delta = normalizeAngle(required - normalizeAngle(state.angle));
    var turns = state.config && state.config.roleta && Number(state.config.roleta.voltasMinimas) || 6;
    return state.angle + turns * Math.PI * 2 + delta;
  }

  function animateSpin(prize, done) {
    var canvas = byId("canvasRoleta");
    var startAngle = state.angle;
    var finalAngle = calculateFinalAngle(prize);
    var duration = state.config && state.config.roleta && Number(state.config.roleta.duracaoGiroMs) || 4800;
    var started = new Date().getTime();
    var raf = window.requestAnimationFrame || window.webkitRequestAnimationFrame || function (callback) { return window.setTimeout(function () { callback(new Date().getTime()); }, 16); };
    function frame(timestamp) {
      var now = typeof timestamp === "number" ? timestamp : new Date().getTime();
      var elapsed = now > 100000000000 ? now - started : new Date().getTime() - started;
      var progress = Math.min(1, elapsed / duration);
      var eased = 1 - Math.pow(1 - progress, 5);
      state.angle = startAngle + (finalAngle - startAngle) * eased;
      setRotation(canvas, state.angle);
      if (progress < 1) raf(frame);
      else {
        state.angle = normalizeAngle(finalAngle);
        setRotation(canvas, state.angle);
        done();
      }
    }
    raf(frame);
  }

  function showResult(prize) {
    var overlay = byId("resultadoLegado");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "resultadoLegado";
      overlay.className = "resultado-legado";
      overlay.innerHTML = '<div class="resultado-legado__caixa"><div id="resultadoLegadoSelo" class="resultado-legado__selo">&#9733;</div><div id="resultadoLegadoPremio" class="resultado-legado__premio"></div><div id="resultadoLegadoDescricao" class="resultado-legado__descricao"></div></div>';
      document.body.appendChild(overlay);
    }
    byId("resultadoLegadoSelo").innerHTML = prize.positivo === false ? "..." : "&#9733;";
    byId("resultadoLegadoPremio").innerHTML = escapeHtml(prize.nome || "Resultado");
    byId("resultadoLegadoDescricao").innerHTML = escapeHtml(prize.descricao || "");
    overlay.style.display = "block";
    window.clearTimeout(state.resultTimer);
    state.resultTimer = window.setTimeout(function () { overlay.style.display = "none"; }, 12000);
  }

  function findPrize(prize, prizes) {
    var list = prizes || [];
    for (var index = 0; index < list.length; index += 1) {
      if (String(list[index].id) === String(prize.id)) return list[index];
    }
    return prize;
  }

  function runEvent(event) {
    if (!event || !event.premio || !event.perfil || state.spinning) return;
    function start() {
      var configPrizes = wheelPrizes();
      if (event.premios && event.premios.length >= 2) state.config.premios = event.premios;
      var selected = findPrize(event.premio, state.config.premios || configPrizes);
      drawWheel(state.angle);
      state.spinning = true;
      animateSpin(selected, function () {
        showResult(selected);
        state.spinning = false;
      });
    }
    if (String(event.perfil) === String(state.profile)) return start();
    request("perfilPublico", { nome: event.perfil }, function (error, payload) {
      if (error || !payload.dados || !payload.dados.config) return;
      applyConfig(payload.dados.nome || event.perfil, payload.dados.config);
      start();
    });
  }

  function rememberEvent(id) {
    state.lastEventId = String(id || "");
    try { window.localStorage.setItem("korax_rewards_evento_tela_legacy_v1", state.lastEventId); } catch (error) {}
  }

  function restoreEvent() {
    try { state.lastEventId = window.localStorage.getItem("korax_rewards_evento_tela_legacy_v1") || ""; } catch (error) {}
  }

  function poll() {
    window.clearTimeout(state.pollTimer);
    request("ultimoGiro", { perfil: query.perfil || "" }, function (error, payload) {
      if (error) {
        setStatus("Reconectando a roleta...", false);
      } else {
        setStatus("Tela conectada - " + escapeHtml(state.profile), true);
        var event = payload.dados;
        if (event && event.idGiro && String(event.idGiro) !== state.lastEventId) {
          var createdAt = Date.parse(event.criadoEm || "");
          var age = new Date().getTime() - createdAt;
          rememberEvent(event.idGiro);
          if (!isNaN(createdAt) && age >= -30000 && age <= EVENT_WINDOW_MS) runEvent(event);
        }
      }
      state.pollTimer = window.setTimeout(poll, POLL_INTERVAL_MS);
    });
  }

  function loadInitialConfig() {
    setStatus("Conectando a roleta...", false);
    request("configAtivo", {}, function (error, payload) {
      if (error || !payload.dados || !payload.dados.config) {
        applyConfig("Roleta Comercial", window.CONFIG_PADRAO || {});
        setStatus("Reconectando a roleta...", false);
        poll();
        return;
      }
      applyConfig(payload.dados.nome || "Roleta Comercial", payload.dados.config);
      restoreEvent();
      poll();
    });
  }

  function start() {
    prepareLayout();
    loadInitialConfig();
  }

  if (document.readyState === "loading") {
    if (document.addEventListener) document.addEventListener("DOMContentLoaded", start, false);
    else window.attachEvent("onload", start);
  } else start();
}());
