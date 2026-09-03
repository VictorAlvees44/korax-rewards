/**
 * Backend da Roleta da Sorte Corporativa.
 *
 * Propriedades do script obrigatorias:
 *   ADMIN_SECRET        segredo forte usado apenas pelo painel
 *   EMAIL_DESTINATARIO um ou mais e-mails separados por virgula
 */

var CABECALHO = ["ID do Giro", "Nome", "Prêmio", "Tipo", "Data", "Hora", "Confirmação de E-mail"];
var CABECALHO_CONTROLE = ["ID do Giro", "Nome", "Prêmio (JSON)", "Perfil", "Registrado em", "Aba", "Linha"];
var PASTA_PERFIS_NOME = "RoletaCorp_Perfis";
var ARQUIVO_ATIVO_NOME = "_perfil_ativo.json";
var ABA_CONTROLE_NOME = "_Controle_Giros";
var TAMANHO_MAX_REQUISICAO = 8 * 1024 * 1024;
var LIMITE_GIROS_JANELA = 20;
var SEGUNDOS_JANELA_GIROS = 300;

function doGet(e) {
  try {
    var acao = (e && e.parameter && e.parameter.acao) || "saude";
    if (acao === "configAtivo") return respostaJson({ status: "sucesso", dados: obterConfigAtivo() });
    if (acao === "saude") {
      var props = PropertiesService.getScriptProperties();
      return respostaJson({
        status: "sucesso",
        servico: "Roleta da Sorte Corporativa",
        configurado: Boolean(props.getProperty("ADMIN_SECRET") && props.getProperty("EMAIL_DESTINATARIO"))
      });
    }
    throw new Error("Ação GET inválida.");
  } catch (erro) {
    return respostaJson({ status: "erro", mensagem: mensagemPublica(erro) });
  }
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) throw new Error("Nenhum dado recebido na requisição.");
    if (e.postData.contents.length > TAMANHO_MAX_REQUISICAO) throw new Error("Requisição excede o limite de 8 MB.");
    var corpo = JSON.parse(e.postData.contents);
    var acao = String(corpo.acao || "");

    if (acao === "sortearGiro") return respostaJson(sortearERegistrarGiro(corpo));
    if (acao === "autenticarAdmin") {
      exigirAdmin(corpo.adminSecret);
      return respostaJson({ status: "sucesso" });
    }

    exigirAdmin(corpo.adminSecret);
    if (acao === "listarPerfis") return respostaJson({ status: "sucesso", perfis: listarPerfis() });
    if (acao === "salvarPerfil") return respostaJson(salvarPerfil(corpo.nome, corpo.config));
    if (acao === "ativarPerfil") return respostaJson(ativarPerfil(corpo.nome, corpo.config));
    if (acao === "excluirPerfil") return respostaJson(excluirPerfil(corpo.nome));
    throw new Error("Ação POST inválida.");
  } catch (erro) {
    return respostaJson({ status: "erro", mensagem: mensagemPublica(erro) });
  }
}

function exigirAdmin(segredoRecebido) {
  var segredoConfigurado = PropertiesService.getScriptProperties().getProperty("ADMIN_SECRET");
  if (!segredoConfigurado) throw new Error("ADMIN_SECRET não configurado nas propriedades do script.");
  if (!compararConstante(String(segredoRecebido || ""), segredoConfigurado)) throw new Error("Credencial administrativa inválida.");
}

function compararConstante(a, b) {
  var diferenca = a.length ^ b.length;
  var tamanho = Math.max(a.length, b.length);
  for (var i = 0; i < tamanho; i++) {
    diferenca |= (a.charCodeAt(i % Math.max(1, a.length)) || 0) ^ (b.charCodeAt(i % Math.max(1, b.length)) || 0);
  }
  return diferenca === 0;
}

// ======================= PERFIS =======================

function obterPastaPerfis() {
  var pastas = DriveApp.getFoldersByName(PASTA_PERFIS_NOME);
  if (pastas.hasNext()) return pastas.next();
  return DriveApp.createFolder(PASTA_PERFIS_NOME);
}

function nomeArquivoDoPerfil(nome) {
  var seguro = String(nome).replace(/[^a-zA-Z0-9_\- ]/g, "_").trim().substring(0, 50) || "perfil";
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(nome), Utilities.Charset.UTF_8);
  var sufixo = digest.slice(0, 6).map(function (byte) { return (byte + 256).toString(16).slice(-2); }).join("");
  return "perfil__" + seguro + "__" + sufixo + ".json";
}

function encontrarArquivosDoPerfil(pasta, nome) {
  var arquivos = pasta.getFiles();
  var encontrados = [];
  while (arquivos.hasNext()) {
    var arquivo = arquivos.next();
    if (arquivo.getName().indexOf("perfil__") !== 0) continue;
    try {
      var dados = JSON.parse(arquivo.getBlob().getDataAsString());
      if (dados.nome === nome) encontrados.push(arquivo);
    } catch (ignorado) {}
  }
  return encontrados;
}

function salvarPerfil(nome, config) {
  nome = validarNomePerfil(nome);
  config = validarENormalizarConfig(config);
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var pasta = obterPastaPerfis();
    var conteudo = JSON.stringify({ nome: nome, config: config, atualizadoEm: new Date().toISOString() });
    var arquivos = encontrarArquivosDoPerfil(pasta, nome);
    if (arquivos.length) {
      arquivos[0].setContent(conteudo);
      for (var i = 1; i < arquivos.length; i++) arquivos[i].setTrashed(true);
    } else {
      pasta.createFile(nomeArquivoDoPerfil(nome), conteudo, MimeType.PLAIN_TEXT);
    }
  } finally {
    lock.releaseLock();
  }
  return { status: "sucesso" };
}

function listarPerfis() {
  var arquivos = obterPastaPerfis().getFiles();
  var mapa = {};
  while (arquivos.hasNext()) {
    var arquivo = arquivos.next();
    if (arquivo.getName().indexOf("perfil__") !== 0) continue;
    try {
      var dados = JSON.parse(arquivo.getBlob().getDataAsString());
      mapa[validarNomePerfil(dados.nome)] = validarENormalizarConfig(dados.config, true);
    } catch (ignorado) {}
  }
  return mapa;
}

function excluirPerfil(nome) {
  nome = validarNomePerfil(nome);
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var ativo = obterConfigAtivo();
    if (ativo && ativo.nome === nome) throw new Error("Não é possível excluir o perfil publicado. Publique outro perfil primeiro.");
    var arquivos = encontrarArquivosDoPerfil(obterPastaPerfis(), nome);
    for (var i = 0; i < arquivos.length; i++) arquivos[i].setTrashed(true);
  } finally {
    lock.releaseLock();
  }
  return { status: "sucesso" };
}

function ativarPerfil(nome, config) {
  nome = validarNomePerfil(nome);
  config = validarENormalizarConfig(config);
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var pasta = obterPastaPerfis();
    var conteudo = JSON.stringify({ nome: nome, config: config, ativadoEm: new Date().toISOString() });
    var existentes = pasta.getFilesByName(ARQUIVO_ATIVO_NOME);
    if (existentes.hasNext()) existentes.next().setContent(conteudo);
    else pasta.createFile(ARQUIVO_ATIVO_NOME, conteudo, MimeType.PLAIN_TEXT);
  } finally {
    lock.releaseLock();
  }
  return { status: "sucesso" };
}

function obterConfigAtivo() {
  var pasta = obterPastaPerfis();
  var existentes = pasta.getFilesByName(ARQUIVO_ATIVO_NOME);
  if (!existentes.hasNext()) return null;
  var dados = JSON.parse(existentes.next().getBlob().getDataAsString());
  return { nome: validarNomePerfil(dados.nome), config: validarENormalizarConfig(dados.config, true), ativadoEm: dados.ativadoEm || "" };
}

// ======================= SORTEIO E REGISTRO =======================

function sortearERegistrarGiro(corpo) {
  var idGiro = validarIdGiro(corpo.idGiro);
  var nome = normalizarTexto(corpo.nome, "nome", 60, true);
  var clienteId = normalizarTexto(corpo.clienteId, "clienteId", 80, true);
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  var resultado;

  try {
    var existente = buscarGiroNoControle(idGiro);
    if (existente) return respostaGiroExistente(existente);

    aplicarLimiteDeGiros(clienteId);
    var ativo = obterConfigAtivo();
    if (!ativo || !ativo.config || ativo.config.premios.length < 2) throw new Error("Nenhum perfil válido está publicado.");

    var premios = ativo.config.premios;
    var premio = premios[indiceAleatorioSeguro(premios.length)];
    var agora = new Date();
    var fuso = Session.getScriptTimeZone() || "America/Sao_Paulo";
    var data = Utilities.formatDate(agora, fuso, "dd/MM/yyyy");
    var hora = Utilities.formatDate(agora, fuso, "HH:mm:ss");
    var aba = obterAbaDoLayoutNoMes(ativo.nome, agora);
    garantirCabecalhoAtual(aba);
    aba.appendRow([
      idGiro, textoSeguroPlanilha(nome), textoSeguroPlanilha(premio.nome),
      premio.positivo ? "positivo" : "negativo", data, hora, "Pendente"
    ]);
    var numeroLinha = aba.getLastRow();
    var controle = obterAbaControle();
    controle.appendRow([idGiro, textoSeguroPlanilha(nome), JSON.stringify(premio), textoSeguroPlanilha(ativo.nome), agora, aba.getName(), numeroLinha]);
    resultado = { idGiro: idGiro, nome: nome, premio: premio, premios: premios, perfil: ativo.nome, data: data, hora: hora, aba: aba.getName() };
  } finally {
    lock.releaseLock();
  }

  try {
    enviarEmailNotificacao(resultado);
    atualizarStatusEmail(resultado.aba, resultado.idGiro, "E-mail enviado");
  } catch (erroEmail) {
    atualizarStatusEmail(resultado.aba, resultado.idGiro, "Falha no e-mail: " + String(erroEmail.message || erroEmail).substring(0, 160));
  }
  return { status: "sucesso", dados: resultado };
}

function aplicarLimiteDeGiros(clienteId) {
  var cache = CacheService.getScriptCache();
  var chave = "giros_" + clienteId;
  var quantidade = Number(cache.get(chave) || 0);
  if (quantidade >= LIMITE_GIROS_JANELA) throw new Error("Muitos giros neste dispositivo. Aguarde alguns minutos.");
  cache.put(chave, String(quantidade + 1), SEGUNDOS_JANELA_GIROS);
}

function indiceAleatorioSeguro(tamanho) {
  if (!Number.isInteger(tamanho) || tamanho < 1 || tamanho > 50) throw new Error("Quantidade de prêmios inválida.");
  var universo = 4294967296;
  var limite = Math.floor(universo / tamanho) * tamanho;
  var valor;
  do {
    // getUuid usa UUID.randomUUID. Os primeiros 32 bits não contêm os bits
    // fixos de versão/variante. Rejeitar a sobra evita o viés de módulo.
    var uuid = String(Utilities.getUuid());
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid)) {
      throw new Error("A fonte aleatória retornou um identificador inválido.");
    }
    valor = parseInt(uuid.substring(0, 8), 16);
  } while (valor >= limite);
  return valor % tamanho;
}

function obterAbaControle() {
  var arquivo = SpreadsheetApp.getActiveSpreadsheet();
  var aba = arquivo.getSheetByName(ABA_CONTROLE_NOME);
  if (!aba) {
    aba = arquivo.insertSheet(ABA_CONTROLE_NOME);
    aba.appendRow(CABECALHO_CONTROLE);
    aba.setFrozenRows(1);
    aba.getRange(1, 1, 1, CABECALHO_CONTROLE.length).setFontWeight("bold");
    aba.hideSheet();
  }
  return aba;
}

function buscarGiroNoControle(idGiro) {
  var aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ABA_CONTROLE_NOME);
  if (!aba || aba.getLastRow() < 2) return null;
  var celula = aba.getRange(2, 1, aba.getLastRow() - 1, 1).createTextFinder(idGiro).matchEntireCell(true).findNext();
  if (!celula) return null;
  var valores = aba.getRange(celula.getRow(), 1, 1, CABECALHO_CONTROLE.length).getValues()[0];
  return {
    idGiro: valores[0], nome: removerPrefixoPlanilha(valores[1]), premio: JSON.parse(valores[2]),
    perfil: removerPrefixoPlanilha(valores[3]), registradoEm: valores[4], aba: valores[5], linha: valores[6]
  };
}

function respostaGiroExistente(existente) {
  var dataRegistro = existente.registradoEm instanceof Date ? existente.registradoEm : new Date(existente.registradoEm);
  var fuso = Session.getScriptTimeZone() || "America/Sao_Paulo";
  var ativo = obterConfigAtivo();
  return {
    status: "sucesso", duplicado: true,
    dados: {
      idGiro: existente.idGiro, nome: existente.nome, premio: existente.premio,
      premios: ativo && ativo.nome === existente.perfil ? ativo.config.premios : [existente.premio],
      perfil: existente.perfil,
      data: Utilities.formatDate(dataRegistro, fuso, "dd/MM/yyyy"),
      hora: Utilities.formatDate(dataRegistro, fuso, "HH:mm:ss"), aba: existente.aba
    }
  };
}

function atualizarStatusEmail(nomeAba, idGiro, status) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nomeAba);
    if (!aba || aba.getLastRow() < 2) return;
    var celula = aba.getRange(2, 1, aba.getLastRow() - 1, 1).createTextFinder(idGiro).matchEntireCell(true).findNext();
    if (celula) aba.getRange(celula.getRow(), CABECALHO.length).setValue(status);
  } finally {
    lock.releaseLock();
  }
}

function obterAbaDoLayoutNoMes(nomeLayout, agora) {
  var arquivo = SpreadsheetApp.getActiveSpreadsheet();
  var fuso = Session.getScriptTimeZone() || "America/Sao_Paulo";
  var mesAno = Utilities.formatDate(agora, fuso, "MM-yyyy");
  var seguro = String(nomeLayout).replace(/[:\\/?*\[\]]/g, "_").trim().substring(0, 85) || "Padrão";
  var nomeAba = seguro + " - " + mesAno;
  var aba = arquivo.getSheetByName(nomeAba);
  if (!aba) {
    aba = arquivo.insertSheet(nomeAba);
    aba.appendRow(CABECALHO);
    aba.setFrozenRows(1);
    aba.getRange(1, 1, 1, CABECALHO.length).setFontWeight("bold");
  }
  return aba;
}

function garantirCabecalhoAtual(aba) {
  if (aba.getLastRow() === 0) {
    aba.appendRow(CABECALHO);
  } else if (aba.getRange(1, 1).getValue() !== CABECALHO[0]) {
    aba.insertColumnBefore(1);
    aba.getRange(1, 1).setValue(CABECALHO[0]);
    aba.getRange(1, 1, 1, CABECALHO.length).setFontWeight("bold");
  }
}

function enviarEmailNotificacao(dados) {
  var destinatario = PropertiesService.getScriptProperties().getProperty("EMAIL_DESTINATARIO");
  if (!destinatario) throw new Error("EMAIL_DESTINATARIO não configurado.");
  var assunto = "Novo resultado da Roleta — " + dados.perfil;
  var corpo =
    "Um novo giro foi registrado:\n\n" +
    "ID: " + dados.idGiro + "\nLayout: " + dados.perfil + "\nNome: " + dados.nome +
    "\nPrêmio: " + dados.premio.nome + "\nTipo: " + (dados.premio.positivo ? "positivo" : "negativo") +
    "\nData: " + dados.data + "\nHora: " + dados.hora + "\n";
  MailApp.sendEmail(destinatario, assunto, corpo);
}

// ======================= VALIDACAO =======================

function validarENormalizarConfig(config, permitirCoresLegadas) {
  if (!config || Object.prototype.toString.call(config) !== "[object Object]") throw new Error("Configuração inválida.");
  if (JSON.stringify(config).length > TAMANHO_MAX_REQUISICAO) throw new Error("Perfil excede o limite de 8 MB.");
  var empresa = config.empresa || {};
  var sons = config.sons || {};
  var roleta = config.roleta || {};
  var premios = config.premios;
  if (!Array.isArray(premios) || premios.length < 2 || premios.length > 50) throw new Error("O perfil deve conter entre 2 e 50 prêmios.");

  var ids = {};
  var cores = {};
  var premiosNormalizados = premios.map(function (premio, indice) {
    if (!premio || typeof premio !== "object") throw new Error("Prêmio inválido na posição " + (indice + 1) + ".");
    var id = normalizarTexto(premio.id, "id do prêmio", 64, true);
    if (!/^[A-Za-z0-9_-]+$/.test(id) || ids[id]) throw new Error("IDs de prêmio devem ser únicos e alfanuméricos.");
    ids[id] = true;
    var cor = validarCor(premio.cor);
    if (!permitirCoresLegadas && cores[cor]) throw new Error("As cores dos prêmios não podem se repetir. Sorteie outra cor no painel.");
    cores[cor] = true;
    return {
      id: id,
      nome: normalizarTexto(premio.nome, "nome do prêmio", 80, true),
      cor: cor,
      categoria: normalizarTexto(premio.categoria || "", "categoria", 60, false),
      descricao: normalizarTexto(premio.descricao || "", "descrição", 240, false),
      positivo: premio.positivo === true,
      som: validarUrlMidia(premio.som || "", "audio")
    };
  });

  var fontes = { Sora: true, Inter: true, Poppins: true, Montserrat: true };
  var fonte = normalizarTexto(empresa.fonte || "Sora", "fonte", 20, true);
  if (!fontes[fonte]) fonte = "Sora";
  var duracao = Number(roleta.duracaoGiroMs);
  var voltas = Number(roleta.voltasMinimas);
  if (!isFinite(duracao) || duracao < 2000 || duracao > 15000) throw new Error("Duração do giro deve estar entre 2 e 15 segundos.");
  if (!isFinite(voltas) || voltas < 2 || voltas > 20 || Math.floor(voltas) !== voltas) throw new Error("Voltas mínimas deve ser um inteiro entre 2 e 20.");

  return {
    empresa: {
      nome: normalizarTexto(empresa.nome || "", "empresa", 80, false),
      tituloRoleta: normalizarTexto(empresa.tituloRoleta || "Roleta da Sorte", "título", 100, true),
      logoUrl: validarUrlMidia(empresa.logoUrl || "", "imagem"),
      planoFundoUrl: validarUrlMidia(empresa.planoFundoUrl || "", "imagem"),
      corPrimaria: validarCor(empresa.corPrimaria),
      corSecundaria: validarCor(empresa.corSecundaria),
      fonte: fonte
    },
    sons: {
      giro: validarUrlMidia(sons.giro || "", "audio"), vitoria: validarUrlMidia(sons.vitoria || "", "audio"),
      derrota: validarUrlMidia(sons.derrota || "", "audio"), clique: validarUrlMidia(sons.clique || "", "audio"),
      parada: validarUrlMidia(sons.parada || "", "audio")
    },
    roleta: { duracaoGiroMs: Math.round(duracao), voltasMinimas: voltas },
    webhook: { url: "" },
    premios: premiosNormalizados
  };
}

function validarUrlMidia(valor, tipo) {
  var texto = normalizarTexto(valor, "mídia", TAMANHO_MAX_REQUISICAO, false);
  if (!texto) return "";
  var dataPermitido = tipo === "imagem"
    ? /^data:image\/(png|jpeg|webp|gif);base64,/i
    : /^data:audio\/(mpeg|mp3|wav|ogg|webm|mp4|x-m4a);base64,/i;
  if (dataPermitido.test(texto)) return texto;
  if (/^https:\/\/[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]+$/i.test(texto)) return texto;
  if (/^(?!\/\/)(?![A-Za-z][A-Za-z0-9+.-]*:)[A-Za-z0-9._~!$&'()*+,;=:@%\/-]+$/.test(texto)) return texto;
  throw new Error("URL de " + tipo + " inválida.");
}

function validarCor(valor) {
  var cor = String(valor || "");
  if (!/^#[0-9A-Fa-f]{6}$/.test(cor)) throw new Error("Cor inválida.");
  return cor.toUpperCase();
}

function validarNomePerfil(valor) { return normalizarTexto(valor, "nome do perfil", 80, true); }

function validarIdGiro(valor) {
  var id = normalizarTexto(valor, "idGiro", 80, true);
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(id)) throw new Error("ID do giro inválido.");
  return id;
}

function normalizarTexto(valor, campo, maximo, obrigatorio) {
  var texto = String(valor === undefined || valor === null ? "" : valor).trim();
  if (obrigatorio && !texto) throw new Error("Campo obrigatório ausente: " + campo + ".");
  if (texto.length > maximo) throw new Error("Campo excede o limite: " + campo + ".");
  if (/[\u0000-\u001F\u007F]/.test(texto)) throw new Error("Campo contém caracteres inválidos: " + campo + ".");
  return texto;
}

function textoSeguroPlanilha(valor) {
  var texto = String(valor || "");
  return /^[=+\-@]/.test(texto) ? "'" + texto : texto;
}

function removerPrefixoPlanilha(valor) {
  var texto = String(valor || "");
  return /^'[=+\-@]/.test(texto) ? texto.substring(1) : texto;
}

function mensagemPublica(erro) {
  return String((erro && erro.message) || "Erro interno.").substring(0, 300);
}

function respostaJson(objeto) {
  return ContentService.createTextOutput(JSON.stringify(objeto)).setMimeType(ContentService.MimeType.JSON);
}
