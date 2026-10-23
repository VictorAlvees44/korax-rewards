import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";

const raiz = resolve(import.meta.dirname, "..");
const arquivosJs = ["config.js", "core.js", "roleta-app.js", "admin/admin-app.js", "scripts/serve-ui-fixture.mjs"];

for (const arquivo of arquivosJs) {
  const resultado = spawnSync(process.execPath, ["--check", resolve(raiz, arquivo)], { encoding: "utf8" });
  if (resultado.status !== 0) throw new Error(`Sintaxe inválida em ${arquivo}:\n${resultado.stderr}`);
}

const gas = readFileSync(resolve(raiz, "google-apps-script/Code.gs"), "utf8");
new Function(gas);

for (const arquivo of ["config.json", "google-apps-script/appsscript.json", "package.json"]) {
  JSON.parse(readFileSync(resolve(raiz, arquivo), "utf8"));
}

const configuracao = JSON.parse(readFileSync(resolve(raiz, "config.json"), "utf8"));
for (const [evento, caminho] of Object.entries(configuracao.sons)) {
  if (caminho && !/^(https?:|data:)/.test(caminho) && !existsSync(resolve(raiz, caminho))) {
    throw new Error(`Áudio inexistente para ${evento}: ${caminho}`);
  }
}

for (const html of ["index.html", "admin/index.html", "privacidade.html"]) {
  const caminho = resolve(raiz, html);
  const conteudo = readFileSync(caminho, "utf8");
  if (!conteudo.includes("Content-Security-Policy")) throw new Error(`${html} não possui CSP.`);
  const referencias = [...conteudo.matchAll(/(?:src|href)="([^"#]+)"/g)].map((item) => item[1]);
  for (const referencia of referencias) {
    if (/^(https?:|data:|mailto:)/.test(referencia)) continue;
    const local = resolve(dirname(caminho), referencia.split("?")[0]);
    if (!existsSync(local)) throw new Error(`Referência inexistente em ${html}: ${referencia}`);
  }
}

const paginaPublica = readFileSync(resolve(raiz, "index.html"), "utf8");
const botoesGirar = [...paginaPublica.matchAll(/id="btnGirar"/g)];
if (botoesGirar.length !== 1 || !/<button[^>]+id="btnGirar"[^>]*>[\s\S]*?GIRAR[\s\S]*?<\/button>/.test(paginaPublica)) {
  throw new Error("A página pública deve possuir um único botão central de giro.");
}
if (!paginaPublica.includes('id="listaPerfisPublicos"') || !paginaPublica.includes('id="nomePerfilSelecionado"')) {
  throw new Error("A página pública deve manter o menu lateral de perfis.");
}
if (!paginaPublica.includes('id="modalPerfil"') || !paginaPublica.includes('id="listaPerfisEntrada"')) {
  throw new Error("A página pública deve pedir a escolha do perfil na entrada.");
}
for (const recurso of ["style.css", "legacy-tv.css", "config.js", "legacy-tv.js", "roleta-app.js"]) {
  const padraoAbsoluto = new RegExp(`(?:href|src)="https://victoralvees44\\.github\\.io/korax-rewards/${recurso.replace(".", "\\.")}`);
  if (!padraoAbsoluto.test(paginaPublica)) {
    throw new Error(`O recurso público ${recurso} deve usar URL absoluta para funcionar no proxy da TV.`);
  }
}
if (!/acao === "perfisPublicos"/.test(gas) || !/acao === "perfilPublico"/.test(gas) || !/acao === "ultimoGiro"/.test(gas)) {
  throw new Error("O backend deve expor os perfis usados pelo menu público.");
}
if (!/var CABECALHO = \["Nome", "Data", "Prêmio"\]/.test(gas)) {
  throw new Error("A planilha operacional deve registrar Nome, Data e Prêmio.");
}

const codigoCliente = arquivosJs.map((arquivo) => readFileSync(resolve(raiz, arquivo), "utf8")).join("\n");
if (/\.innerHTML\s*=|insertAdjacentHTML|document\.write\s*\(|\beval\s*\(/.test(codigoCliente)) {
  throw new Error("Foi encontrado um sink de HTML dinâmico inseguro.");
}
if (/registrarGiro|FILA_PENDENTE|tentarReenviarPendentes/.test(codigoCliente)) {
  throw new Error("Foi encontrado código do fluxo legado não idempotente.");
}

const fluxoPublico = readFileSync(resolve(raiz, "roleta-app.js"), "utf8");
const nucleo = readFileSync(resolve(raiz, "core.js"), "utf8");
const painelAdmin = readFileSync(resolve(raiz, "admin/index.html"), "utf8");
if ((painelAdmin.match(/class="aba/g) || []).length !== 2 || /data-aba="(?:visual|sons|config|historico|estatisticas)"/.test(painelAdmin)) {
  throw new Error("O painel deve manter somente as abas Prêmios e Perfis.");
}
if (/uploadSom|inputLogoUpload|inputFundoUpload/.test(painelAdmin)) {
  throw new Error("Sons e identidade visual não devem ser editáveis no painel simplificado.");
}
if (/type="password"|ADMIN_SECRET|inputSegredoAdmin/.test(painelAdmin) || /adminSecret|ADMIN_SECRET/.test(codigoCliente + gas)) {
  throw new Error("O painel não deve manter o antigo segredo compartilhado.");
}
if (!/Entrar com Google Workspace/.test(painelAdmin) || !/configurarAcessoAdmin/.test(gas) || !/ADMIN_TOKEN_SECRET/.test(gas)) {
  throw new Error("O painel deve exigir a conta Google Workspace autorizada e uma sessão assinada.");
}
if (!/MODO_TELA[\s\S]*buscarUltimoGiroRemoto/.test(fluxoPublico)) {
  throw new Error("A página pública deve oferecer sincronização para a tela corporativa.");
}
if (!/var SONS_FIXOS = \{[\s\S]*roleta-girando\.mp3[\s\S]*palmas\.mp3[\s\S]*naruto-sad\.mp3/.test(gas)) {
  throw new Error("O backend deve fixar os três áudios oficiais.");
}
for (const [teste, mensagem] of [
  [/tocarSom\("audioGiro"\)/, "O giro não inicia seu áudio."],
  [/pararSom\("audioGiro"\)/, "O giro não interrompe seu áudio ao terminar."],
  [/premio\.positivo[\s\S]*tocarSom\("audioVitoria"\)[\s\S]*else[\s\S]*tocarSom\("audioDerrota"\)/, "Os sons positivo e negativo não estão separados corretamente."]
]) {
  if (!teste.test(fluxoPublico)) throw new Error(mensagem);
}

if (!/canvas\.animate\([\s\S]*?cubic-bezier/.test(nucleo)) {
  throw new Error("A roleta deve usar animação de composição acelerada pelo navegador.");
}
const corpoGiro = nucleo.match(/export function girarRoleta\([\s\S]*?\n}\n\n\/\* ={10,}/)?.[0] || "";
if (/Roleta\.desenhar\(/.test(corpoGiro)) {
  throw new Error("O giro não deve redesenhar todas as fatias a cada quadro.");
}

console.log("Verificação estática concluída com sucesso.");
