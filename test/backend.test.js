import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const codigo = readFileSync(new URL("../google-apps-script/Code.gs", import.meta.url), "utf8");
const config = JSON.parse(readFileSync(new URL("../config.json", import.meta.url), "utf8"));
const uuid = (valor) => `${valor.toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`;

function backend(gerarUuid = () => uuid(0)) {
  const contexto = vm.createContext({
    Utilities: {
      getUuid: gerarUuid,
      DigestAlgorithm: { SHA_256: "SHA_256" },
      Charset: { UTF_8: "UTF_8" },
      computeDigest: (_, valor) => Array.from({ length: 32 }, (__, indice) => (String(valor).charCodeAt(indice % String(valor).length) || indice) - 128),
      computeHmacSha256Signature: (valor, chave) => [...createHmac("sha256", chave).update(valor).digest()].map((byte) => byte > 127 ? byte - 256 : byte),
      base64EncodeWebSafe: (valor) => Buffer.from(typeof valor === "string" ? valor : valor.map((byte) => byte & 255)).toString("base64url"),
      base64DecodeWebSafe: (valor) => [...Buffer.from(valor, "base64url")],
      newBlob: (bytes) => ({ getDataAsString: () => Buffer.from(bytes).toString("utf8") })
    }
  });
  vm.runInContext(codigo, contexto);
  return contexto;
}

test("somente a sessão assinada da conta Workspace autorizada libera o painel", () => {
  const ctx = backend();
  const propriedades = new Map([
    ["ADMIN_EMAIL", "admin@koraxbrasil.com.br"],
    ["ADMIN_TOKEN_SECRET", "segredo-interno-de-teste-com-mais-de-32-caracteres"]
  ]);
  ctx.PropertiesService = { getScriptProperties: () => ({
    getProperty: (chave) => propriedades.get(chave) || "",
    setProperty: (chave, valor) => propriedades.set(chave, valor)
  }) };

  const token = ctx.emitirTokenAdmin("admin@koraxbrasil.com.br");
  assert.equal(ctx.exigirAdmin(token), "admin@koraxbrasil.com.br");
  assert.throws(() => ctx.exigirAdmin(token.replace(/.$/, token.endsWith("A") ? "B" : "A")), /inválida/);

  const tokenOutraConta = ctx.emitirTokenAdmin("outra@koraxbrasil.com.br");
  assert.throws(() => ctx.exigirAdmin(tokenOutraConta), /não possui acesso/);
  assert.throws(() => ctx.exigirAdmin("antigo-segredo-compartilhado"), /inválida/);
});

test("o servidor rejeita a sobra de 32 bits e mantém chances iguais", () => {
  const valores = [0xffffffff, 0xfffffffe, 7];
  const ctx = backend(() => uuid(valores.shift()));
  assert.equal(ctx.indiceAleatorioSeguro(6), 1);
  assert.equal(valores.length, 0);
});

test("todos os índices podem ser selecionados no servidor, de 2 a 50 prêmios", () => {
  let valor = 0;
  const ctx = backend(() => uuid(valor));
  for (let tamanho = 2; tamanho <= 50; tamanho++) {
    for (valor = 0; valor < tamanho; valor++) assert.equal(ctx.indiceAleatorioSeguro(tamanho), valor);
  }
});

test("o servidor rejeita tamanho inválido ou falha na fonte aleatória", () => {
  const ctx = backend(() => "uuid inválido");
  for (const tamanho of [0, -1, 1.5, 51, NaN]) {
    assert.throws(() => ctx.indiceAleatorioSeguro(tamanho), /Quantidade/);
  }
  assert.throws(() => ctx.indiceAleatorioSeguro(6), /fonte aleatória/);
});

test("o servidor recusa publicar cores iguais, sem ocultar perfis legados", () => {
  const ctx = backend();
  const repetida = structuredClone(config);
  repetida.premios[1].cor = repetida.premios[0].cor.toLowerCase();
  assert.throws(() => ctx.validarENormalizarConfig(repetida), /cores/);
  assert.equal(ctx.validarENormalizarConfig(repetida, true).premios.length, config.premios.length);
});

test("a configuração do servidor descarta pesos legados", () => {
  const ctx = backend();
  const entrada = structuredClone(config);
  entrada.premios[0].peso = 999;
  const normalizada = ctx.validarENormalizarConfig(entrada);
  assert.equal("peso" in normalizada.premios[0], false);
});

test("o servidor mantém os três áudios oficiais em todos os perfis", () => {
  const ctx = backend();
  const entrada = structuredClone(config);
  entrada.sons = { giro: "data:audio/mpeg;base64,alterado", vitoria: "https://example.com/outro.mp3", derrota: "", clique: "x", parada: "y" };
  const normalizada = JSON.parse(JSON.stringify(ctx.validarENormalizarConfig(entrada)));
  assert.deepEqual(normalizada.sons, {
    giro: "assets/audio/roleta-girando.mp3",
    vitoria: "assets/audio/palmas.mp3",
    derrota: "assets/audio/naruto-sad.mp3",
    clique: "",
    parada: ""
  });
});

test("o evento da tela transmite o prêmio, mas nunca o nome da pessoa", () => {
  const ctx = backend();
  const cache = new Map();
  const propriedades = new Map();
  ctx.CacheService = { getScriptCache: () => ({
    put: (chave, valor) => cache.set(chave, valor),
    get: (chave) => cache.get(chave) || null
  }) };
  ctx.PropertiesService = { getScriptProperties: () => ({
    getProperty: (chave) => propriedades.get(chave) || "",
    setProperty: (chave, valor) => propriedades.set(chave, valor)
  }) };
  ctx.tentarPublicarEventoGiro({
    idGiro: "1234567890abcdef",
    nome: "Nome que não pode vazar",
    perfil: "Comercial",
    premio: config.premios[0],
    premios: config.premios
  });
  const evento = JSON.parse(JSON.stringify(ctx.obterUltimoGiro("Comercial")));
  assert.equal(evento.idGiro, "1234567890abcdef");
  assert.equal(evento.premio.id, config.premios[0].id);
  assert.equal(evento.premios.length, config.premios.length);
  assert.equal("nome" in evento, false);
  assert.doesNotMatch(JSON.stringify(evento), /Nome que não pode vazar/);

  const eventoGlobal = JSON.parse(JSON.stringify(ctx.obterUltimoGiro("")));
  assert.equal(eventoGlobal.idGiro, "1234567890abcdef");
  assert.equal(eventoGlobal.perfil, "Comercial");

  cache.clear();
  const eventoRecuperado = JSON.parse(JSON.stringify(ctx.obterUltimoGiro("Comercial")));
  assert.equal(eventoRecuperado.idGiro, "1234567890abcdef");
  assert.equal(eventoRecuperado.premio.id, config.premios[0].id);
  assert.equal("premios" in eventoRecuperado, false);
  assert.doesNotMatch(JSON.stringify(eventoRecuperado), /Nome que não pode vazar/);
  assert.equal(ctx.obterUltimoGiro("").idGiro, "1234567890abcdef");
});

test("o prêmio enviado pelo visitante não controla o sorteio oficial", () => {
  const ctx = backend();
  const linhas = [];
  const controle = [];
  let sorteios = 0;
  ctx.LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
  ctx.buscarGiroNoControle = () => null;
  ctx.aplicarLimiteDeGiros = () => {};
  ctx.obterConfigAtivo = () => ({ nome: "Comercial", config });
  ctx.indiceAleatorioSeguro = (quantidade) => { assert.equal(quantidade, config.premios.length); sorteios++; return 2; };
  ctx.Session = { getScriptTimeZone: () => "America/Sao_Paulo" };
  ctx.Utilities.formatDate = (_, __, formato) => formato === "dd/MM/yyyy" ? "03/09/2026" : "12:00:00";
  ctx.obterAbaRegistrosDoMes = () => ({ appendRow: (linha) => linhas.push(linha) });
  ctx.garantirCabecalhoAtual = () => {};
  ctx.obterAbaControle = () => ({ appendRow: (linha) => controle.push(linha) });
  ctx.enviarEmailNotificacao = () => {};

  const resultado = ctx.sortearERegistrarGiro({
    idGiro: "1234567890abcdef", clienteId: "cliente-local", nome: "Teste local",
    premio: "Prêmio inventado", tipo: "negativo"
  });
  assert.equal(resultado.dados.premio.id, config.premios[2].id);
  assert.equal(resultado.dados.perfil, "Comercial");
  assert.equal(linhas.length, 1);
  assert.deepEqual(Array.from(linhas[0]), ["Teste local", "03/09/2026", config.premios[2].nome]);
  assert.equal(controle.length, 1);
  assert.equal(controle[0].length, 4);
  assert.ok(!controle[0].includes("Teste local"));
  assert.equal(sorteios, 1);

  ctx.buscarGiroNoControle = () => resultado.dados;
  ctx.respostaGiroExistente = () => resultado;
  const repetido = ctx.sortearERegistrarGiro({ idGiro: "1234567890abcdef", clienteId: "cliente-local", nome: "Teste local" });
  assert.equal(repetido, resultado);
  assert.equal(linhas.length, 1);
  assert.equal(sorteios, 1);
});

test("o servidor sorteia somente dentro do perfil salvo que foi selecionado", () => {
  const ctx = backend();
  const perfilEscolhido = structuredClone(config);
  perfilEscolhido.premios[0].nome = "Item exclusivo da feira";
  ctx.LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
  ctx.buscarGiroNoControle = () => null;
  ctx.aplicarLimiteDeGiros = () => {};
  ctx.obterPerfilPublico = (nome) => {
    assert.equal(nome, "Feira Korax");
    return { nome, config: perfilEscolhido };
  };
  ctx.indiceAleatorioSeguro = () => 0;
  ctx.Session = { getScriptTimeZone: () => "America/Sao_Paulo" };
  ctx.Utilities.formatDate = (_, __, formato) => formato === "dd/MM/yyyy" ? "03/09/2026" : "12:00:00";
  ctx.obterAbaRegistrosDoMes = () => ({ appendRow() {} });
  ctx.garantirCabecalhoAtual = () => {};
  ctx.obterAbaControle = () => ({ appendRow() {} });
  ctx.enviarEmailNotificacao = () => {};

  const resultado = ctx.sortearERegistrarGiro({
    idGiro: "abcdef1234567890", clienteId: "cliente-local", nome: "Teste local", perfil: "Feira Korax",
    premio: "Resultado forjado"
  });
  assert.equal(resultado.dados.perfil, "Feira Korax");
  assert.equal(resultado.dados.premio.nome, "Item exclusivo da feira");
});

test("notificação administrativa contém nome, data e prêmio", () => {
  const ctx = backend();
  let enviado;
  ctx.PropertiesService = { getScriptProperties: () => ({ getProperty: () => "equipe@example.com" }) };
  ctx.MailApp = { sendEmail: (...argumentos) => { enviado = argumentos; } };
  ctx.enviarEmailNotificacao({
    idGiro: "1234567890abcdef", nome: "Maria", data: "16/09/2026",
    premio: { nome: "Chocolate", positivo: true }, perfil: "Comercial"
  });
  assert.equal(enviado[0], "equipe@example.com");
  assert.match(enviado[2], /Nome: Maria\nData: 16\/09\/2026\nPrêmio: Chocolate/);
  assert.doesNotMatch(enviado[2], /Comercial|1234567890abcdef|Tipo:|Hora:/);
});

test("a planilha existente recebe a coluna Prêmio sem perder o cabeçalho atual", () => {
  const ctx = backend();
  const valores = [["Nome", "Data", ""]];
  let peso = "";
  const intervaloCabecalho = {
    getValues: () => valores,
    setValue: (valor) => { valores[0][2] = valor; return intervaloCabecalho; },
    setFontWeight: (valor) => { peso = valor; return intervaloCabecalho; }
  };
  const aba = {
    getLastRow: () => 3,
    getRange: (...args) => args.length === 2 ? intervaloCabecalho : intervaloCabecalho
  };

  ctx.garantirCabecalhoAtual(aba);
  assert.equal(valores[0][2], "Prêmio");
  assert.equal(peso, "bold");
});

test("requisição repetida preserva resultado sem criar novo registro", () => {
  const ctx = backend();
  const instante = new Date("2026-09-16T12:00:00Z");
  ctx.LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
  ctx.buscarGiroNoControle = () => ({
    idGiro: "1234567890abcdef", premio: config.premios[0],
    perfil: "Comercial", registradoEm: instante
  });
  ctx.Session = { getScriptTimeZone: () => "America/Sao_Paulo" };
  ctx.Utilities.formatDate = () => "16/09/2026";
  ctx.obterConfigAtivo = () => ({ nome: "Comercial", config });
  const resposta = ctx.sortearERegistrarGiro({
    idGiro: "1234567890abcdef", clienteId: "cliente-local", nome: "Maria"
  });
  assert.equal(resposta.duplicado, true);
  assert.equal(resposta.dados.nome, "Maria");
  assert.equal(resposta.dados.premio.id, config.premios[0].id);
  assert.equal(resposta.dados.data, "16/09/2026");
});
