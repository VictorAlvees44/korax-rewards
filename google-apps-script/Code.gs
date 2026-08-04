/**
 * Code.gs
 * Backend da Roleta da Sorte Corporativa.
 *
 * Responsabilidades:
 *  1. Guardar a biblioteca de PERFIS (layouts) e qual deles está ATIVO
 *     agora — isso é o que permite abrir a roleta ou o admin em QUALQUER
 *     navegador/dispositivo e ver os mesmos dados (arquivos em uma pasta
 *     do Google Drive, não LocalStorage).
 *  2. Registrar cada giro (POST), gravando na aba certa da planilha:
 *     uma aba por LAYOUT + MÊS/ANO (ex.: "Comercial - 08/2026"). Uma aba
 *     nova só é criada no primeiro giro daquele layout naquele mês.
 *  3. Enviar e-mail de notificação a cada giro (best effort — se falhar,
 *     o giro já está gravado na planilha mesmo assim).
 *
 * Ações suportadas:
 *  GET  ?acao=configAtivo    -> perfil publicado atualmente
 *  GET  ?acao=listarPerfis   -> biblioteca completa de perfis
 *  POST { acao: "salvarPerfil",  nome, config } -> grava/atualiza na biblioteca
 *  POST { acao: "ativarPerfil",  nome, config } -> publica como perfil ativo
 *  POST { acao: "excluirPerfil", nome }         -> remove da biblioteca
 *  POST { acao: "registrarGiro", nome, premio, tipo, perfil, data, hora } (padrão)
 */

// ======================= CONFIGURAÇÃO =======================

// E-mail(s) que devem receber a notificação de cada giro.
// Para múltiplos destinatários, separe por vírgula: "a@x.com,b@x.com"
var EMAIL_DESTINATARIO = "seuemail@suaempresa.com";

// Cabeçalho das colunas de cada aba de giros, na ordem em que são gravadas.
var CABECALHO = ["Nome", "Prêmio", "Tipo", "Data", "Hora", "Confirmação de E-mail"];

// Nome da pasta no Google Drive onde os perfis (layouts) são guardados.
var PASTA_PERFIS_NOME = "RoletaCorp_Perfis";

// Nome do arquivo que guarda qual perfil está publicado/ativo agora.
var ARQUIVO_ATIVO_NOME = "_perfil_ativo.json";

// ======================= PONTOS DE ENTRADA =======================

function doGet(e) {
  try {
    var acao = (e && e.parameter && e.parameter.acao) || "";
    if (acao === "configAtivo") {
      return respostaJson({ status: "sucesso", dados: obterConfigAtivo() });
    }
    if (acao === "listarPerfis") {
      return respostaJson({ status: "sucesso", perfis: listarPerfis() });
    }
    return ContentService.createTextOutput("Roleta da Sorte Corporativa — Web App ativo.");
  } catch (erro) {
    return respostaJson({ status: "erro", mensagem: erro.message });
  }
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("Nenhum dado recebido na requisição.");
    }
    var corpo = JSON.parse(e.postData.contents);
    var acao = corpo.acao || "registrarGiro";

    if (acao === "salvarPerfil") return respostaJson(salvarPerfil(corpo.nome, corpo.config));
    if (acao === "ativarPerfil") return respostaJson(ativarPerfil(corpo.nome, corpo.config));
    if (acao === "excluirPerfil") return respostaJson(excluirPerfil(corpo.nome));

    return respostaJson(registrarGiro(corpo));
  } catch (erro) {
    return respostaJson({ status: "erro", mensagem: erro.message });
  }
}

// ======================= BIBLIOTECA DE PERFIS (GOOGLE DRIVE) =======================

function obterPastaPerfis() {
  var pastas = DriveApp.getFoldersByName(PASTA_PERFIS_NOME);
  if (pastas.hasNext()) return pastas.next();
  return DriveApp.createFolder(PASTA_PERFIS_NOME);
}

function nomeArquivoDoPerfil(nome) {
  var seguro = String(nome).replace(/[^a-zA-Z0-9_\- ]/g, "_").trim();
  return "perfil__" + seguro + ".json";
}

function salvarPerfil(nome, config) {
  if (!nome || String(nome).trim() === "") throw new Error("Nome do perfil é obrigatório.");
  var pasta = obterPastaPerfis();
  var nomeArquivo = nomeArquivoDoPerfil(nome);
  var conteudo = JSON.stringify({ nome: nome, config: config, atualizadoEm: new Date().toISOString() });

  var existentes = pasta.getFilesByName(nomeArquivo);
  if (existentes.hasNext()) {
    existentes.next().setContent(conteudo);
  } else {
    pasta.createFile(nomeArquivo, conteudo, MimeType.PLAIN_TEXT);
  }
  return { status: "sucesso" };
}

function listarPerfis() {
  var pasta = obterPastaPerfis();
  var arquivos = pasta.getFiles();
  var mapa = {};
  while (arquivos.hasNext()) {
    var arquivo = arquivos.next();
    var nomeArquivo = arquivo.getName();
    if (nomeArquivo.indexOf("perfil__") === 0) {
      try {
        var dados = JSON.parse(arquivo.getBlob().getDataAsString());
        mapa[dados.nome] = dados.config;
      } catch (erroLeitura) {
        // ignora arquivos corrompidos, não interrompe a listagem
      }
    }
  }
  return mapa;
}

function excluirPerfil(nome) {
  if (!nome) throw new Error("Nome do perfil é obrigatório.");
  var pasta = obterPastaPerfis();
  var existentes = pasta.getFilesByName(nomeArquivoDoPerfil(nome));
  while (existentes.hasNext()) existentes.next().setTrashed(true);
  return { status: "sucesso" };
}

function ativarPerfil(nome, config) {
  if (!nome || String(nome).trim() === "") throw new Error("Nome do perfil é obrigatório.");
  var pasta = obterPastaPerfis();
  var conteudo = JSON.stringify({ nome: nome, config: config, ativadoEm: new Date().toISOString() });

  var existentes = pasta.getFilesByName(ARQUIVO_ATIVO_NOME);
  if (existentes.hasNext()) {
    existentes.next().setContent(conteudo);
  } else {
    pasta.createFile(ARQUIVO_ATIVO_NOME, conteudo, MimeType.PLAIN_TEXT);
  }
  return { status: "sucesso" };
}

function obterConfigAtivo() {
  var pasta = obterPastaPerfis();
  var existentes = pasta.getFilesByName(ARQUIVO_ATIVO_NOME);
  if (!existentes.hasNext()) return null;
  return JSON.parse(existentes.next().getBlob().getDataAsString()); // { nome, config, ativadoEm }
}

// ======================= REGISTRO DE GIROS =======================

function registrarGiro(corpo) {
  var dados = validarEExtrairDados(corpo);
  var aba = obterAbaDoLayoutNoMes(dados.perfil);

  var linha = [dados.nome, dados.premio, dados.tipo, dados.data, dados.hora, "Não enviado"];
  aba.appendRow(linha);
  var numeroLinha = aba.getLastRow();

  try {
    enviarEmailNotificacao(dados);
    aba.getRange(numeroLinha, CABECALHO.length).setValue("E-mail enviado");
  } catch (erroEmail) {
    // Mesmo com falha no e-mail, o giro já está gravado na planilha.
    aba.getRange(numeroLinha, CABECALHO.length).setValue("Falha no e-mail: " + erroEmail.message);
  }

  return { status: "sucesso", linha: numeroLinha, aba: aba.getName() };
}

function validarEExtrairDados(corpo) {
  if (!corpo.nome || String(corpo.nome).trim() === "") throw new Error("Campo obrigatório ausente: nome.");
  if (!corpo.premio || String(corpo.premio).trim() === "") throw new Error("Campo obrigatório ausente: premio.");
  return {
    nome: String(corpo.nome).trim(),
    premio: String(corpo.premio).trim(),
    tipo: corpo.tipo || "não informado",
    data: corpo.data || "",
    hora: corpo.hora || "",
    perfil: (corpo.perfil ? String(corpo.perfil).trim() : "") || "Padrão"
  };
}

/**
 * Retorna a aba correspondente ao layout + mês/ano atuais, criando-a
 * (com cabeçalho) apenas se for o primeiro giro daquele layout naquele
 * mês. Usa a data/hora do SERVIDOR (não a do navegador do participante)
 * para decidir o mês, evitando inconsistência de fuso/relógio local.
 */
function obterAbaDoLayoutNoMes(nomeLayout) {
  var arquivo = SpreadsheetApp.getActiveSpreadsheet();
  var agora = new Date();
  var mes = ("0" + (agora.getMonth() + 1)).slice(-2);
  var ano = agora.getFullYear();

  // Nomes de aba no Sheets têm limite de 100 caracteres — truncamos com
  // margem de segurança para o sufixo " - MM/AAAA".
  var nomeLayoutSeguro = String(nomeLayout).substring(0, 85);
  var nomeAba = nomeLayoutSeguro + " - " + mes + "/" + ano;

  var aba = arquivo.getSheetByName(nomeAba);
  if (!aba) {
    aba = arquivo.insertSheet(nomeAba);
    aba.appendRow(CABECALHO);
    aba.setFrozenRows(1);
    aba.getRange(1, 1, 1, CABECALHO.length).setFontWeight("bold");
  }
  return aba;
}

// ======================= E-MAIL =======================

function enviarEmailNotificacao(dados) {
  var assunto = "Novo resultado da Roleta — " + dados.perfil;
  var corpo =
    "Um novo giro foi registrado na Roleta da Sorte Corporativa:\n\n" +
    "Layout: " + dados.perfil + "\n" +
    "Nome: " + dados.nome + "\n" +
    "Prêmio: " + dados.premio + "\n" +
    "Tipo: " + dados.tipo + "\n" +
    "Data: " + dados.data + "\n" +
    "Hora: " + dados.hora + "\n";

  MailApp.sendEmail(EMAIL_DESTINATARIO, assunto, corpo);
}

// ======================= RESPOSTA =======================

function respostaJson(objeto) {
  return ContentService
    .createTextOutput(JSON.stringify(objeto))
    .setMimeType(ContentService.MimeType.JSON);
}
