// Ambiente descartável para QA visual. Não chama Google nem grava dados reais.
// Execute: node scripts/serve-ui-fixture.mjs (login Workspace simulado localmente).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const raiz = new URL("../", import.meta.url);
const codigo = await readFile(new URL("google-apps-script/Code.gs", raiz), "utf8");
const contexto = vm.createContext({});
vm.runInContext(codigo, contexto);
const inicial = JSON.parse(await readFile(new URL("config.json", raiz), "utf8"));
// Exercita a migração de cores de um perfil legado.
inicial.premios[1].cor = inicial.premios[0].cor.toLowerCase();
const alternativo = structuredClone(inicial);
alternativo.empresa.tituloRoleta = "Roleta da Convenção";
alternativo.premios = alternativo.premios.slice(0, 4);
const perfis = new Map([["Comercial", inicial], ["Feira", alternativo]]);
let ativo = { nome: "Comercial", config: structuredClone(inicial) };
let numeroGiroFicticio = 0;
const ultimoEventoPorPerfil = new Map();
let ultimoEventoGlobal = null;
const arquivos = new Map([
  ["/", ["index.html", "text/html"]],
  ["/index.html", ["index.html", "text/html"]],
  ["/admin/", ["admin/index.html", "text/html"]],
  ["/admin/index.html", ["admin/index.html", "text/html"]],
  ["/privacidade.html", ["privacidade.html", "text/html"]],
  ["/style.css", ["style.css", "text/css"]],
  ["/legacy-tv.css", ["legacy-tv.css", "text/css"]],
  ["/config.js", ["config.js", "text/javascript"]],
  ["/core.js", ["core.js", "text/javascript"]],
  ["/roleta-app.js", ["roleta-app.js", "text/javascript"]],
  ["/legacy-tv.js", ["legacy-tv.js", "text/javascript"]],
  ["/admin/admin-app.js", ["admin/admin-app.js", "text/javascript"]],
  ["/assets/audio/naruto-sad.mp3", ["assets/audio/naruto-sad.mp3", "audio/mpeg", true]],
  ["/assets/audio/palmas.mp3", ["assets/audio/palmas.mp3", "audio/mpeg", true]],
  ["/assets/audio/roleta-girando.mp3", ["assets/audio/roleta-girando.mp3", "audio/mpeg", true]]
]);

const servidor = createServer(async (req, res) => {
  const servidorRecebeuEm = Date.now();
  res.setHeader("Cache-Control", "no-store");
  const responder = (dados) => {
    res.setHeader("Content-Type", "application/json;charset=utf-8");
    res.end(JSON.stringify(dados));
  };
  try {
    const url = new URL(req.url, "http://127.0.0.1:43119");
    if (url.pathname === "/__test/login") {
      res.writeHead(302, { Location: "/admin/#adminToken=local-test-token" });
      res.end();
      return;
    }
    if (url.pathname === "/__test/backend") {
      if (req.method === "GET" && url.searchParams.get("acao") === "configAtivo") {
        responder({ status: "sucesso", dados: ativo });
        return;
      }
      if (req.method === "GET" && url.searchParams.get("acao") === "perfisPublicos") {
        responder({ status: "sucesso", perfis: [...perfis.keys()].sort(), ativo: ativo.nome });
        return;
      }
      if (req.method === "GET" && url.searchParams.get("acao") === "perfilPublico") {
        const nome = url.searchParams.get("nome");
        const config = perfis.get(nome);
        if (!config) throw new Error("Perfil não encontrado.");
        responder({ status: "sucesso", dados: { nome, config } });
        return;
      }
      if (req.method === "GET" && url.searchParams.get("acao") === "ultimoGiro") {
        const perfil = url.searchParams.get("perfil") || "";
        responder({ status: "sucesso", dados: perfil ? ultimoEventoPorPerfil.get(perfil) || null : ultimoEventoGlobal, servidorRecebeuEm, servidorAgora: Date.now() });
        return;
      }
      let corpo = "";
      for await (const parte of req) {
        corpo += parte;
        if (corpo.length > 8 * 1024 * 1024) throw new Error("Perfil muito grande.");
      }
      const dados = JSON.parse(corpo);
      if (dados.acao === "sortearGiro") {
        const nomePerfil = dados.perfil && perfis.has(dados.perfil) ? dados.perfil : ativo.nome;
        const configPerfil = perfis.get(nomePerfil) || ativo.config;
        const premio = configPerfil.premios[numeroGiroFicticio++ % configPerfil.premios.length];
        const criadoEmMs = Date.now();
        const iniciarEm = criadoEmMs + 4000;
        const evento = {
          idGiro: dados.idGiro,
          idEvento: `${dados.idGiro}_${iniciarEm}`,
          perfil: nomePerfil,
          premio,
          premios: configPerfil.premios,
          criadoEm: new Date(criadoEmMs).toISOString(),
          iniciarEm
        };
        ultimoEventoPorPerfil.set(nomePerfil, evento);
        ultimoEventoGlobal = evento;
        responder({
          status: "sucesso",
          dados: {
            idGiro: dados.idGiro,
            nome: String(dados.nome || "Participante fictício"),
            perfil: nomePerfil,
            premio,
            premios: configPerfil.premios,
            data: "15/09/2026",
            idEvento: evento.idEvento,
            criadoEm: evento.criadoEm,
            iniciarEm
          },
          servidorRecebeuEm,
          servidorAgora: Date.now()
        });
        return;
      }
      if (dados.adminToken !== "local-test-token") throw new Error("Sessão administrativa local inválida.");
      switch (dados.acao) {
        case "autenticarAdmin": responder({ status: "sucesso" }); break;
        case "listarPerfis": responder({ status: "sucesso", perfis: Object.fromEntries(perfis) }); break;
        case "salvarPerfil":
        case "ativarPerfil": {
          const config = contexto.validarENormalizarConfig(dados.config);
          perfis.set(dados.nome, config);
          if (dados.acao === "ativarPerfil") ativo = { nome: dados.nome, config };
          responder({ status: "sucesso" });
          break;
        }
        case "excluirPerfil": perfis.delete(dados.nome); responder({ status: "sucesso" }); break;
        default: throw new Error("Ação indisponível neste teste.");
      }
      return;
    }
    const arquivo = arquivos.get(url.pathname);
    if (!arquivo) { res.writeHead(404); res.end("Não encontrado"); return; }
    let conteudo = await readFile(new URL(arquivo[0], raiz), arquivo[2] ? undefined : "utf8");
    if (arquivo[0] === "core.js") {
      const original = "await fetch(url, { ...opcoes, signal: controlador.signal })";
      if (!conteudo.includes(original)) throw new Error("O adaptador de QA precisa acompanhar a implementação do cliente.");
      // Substituição somente na resposta local. O arquivo de produção fica intacto.
      conteudo = conteudo.replace(original, 'await fetch("/__test/backend" + new URL(url).search, { ...opcoes, signal: controlador.signal })');
    }
    if (arquivo[0] === "config.js") {
      conteudo = conteudo.replace(
        /url: "https:\/\/script\.google\.com\/macros\/s\/[^"]+"/,
        'url: "http://127.0.0.1:43119/__test/backend"'
      );
      conteudo = conteudo.replace(
        /authUrl: "https:\/\/script\.google\.com[^\"]+"/,
        'authUrl: "http://127.0.0.1:43119/__test/login"'
      );
    }
    if (arquivo[1] === "text/html") {
      // Em produção os recursos são absolutos para sobreviver ao proxy da TV.
      // No QA, convertemos somente a resposta para testar os arquivos locais.
      conteudo = conteudo.replaceAll("https://victoralvees44.github.io/korax-rewards/", "/");
      conteudo = conteudo.replace("<body>", '<body><p role="note" style="background:#fff;color:#111;padding:12px;text-align:center">TESTE LOCAL — dados fictícios, sem Google ou registros reais</p>');
      conteudo = conteudo.replace("connect-src 'self' https://script.google.com https://script.googleusercontent.com", "connect-src 'self'");
    }
    res.setHeader("Content-Type", arquivo[1] + ";charset=utf-8");
    res.end(conteudo);
  } catch (erro) {
    responder({ status: "erro", mensagem: erro.message });
  }
});

servidor.listen(43119, "127.0.0.1", () => {
  console.log("QA local: http://127.0.0.1:43119/admin/ — use o botão Google Workspace simulado");
  console.log("Perfis existem apenas em memória. Ctrl+C encerra e descarta o teste.");
});
