/**
 * config.js
 * Configuração padrão da aplicação, embutida em JavaScript para funcionar
 * tanto em GitHub Pages quanto ao abrir o arquivo localmente (evita
 * problemas de CORS que ocorreriam ao usar fetch() para ler config.json
 * diretamente do sistema de arquivos).
 *
 * Este objeto é o valor de fábrica, usado apenas como ponto de partida
 * (primeiro perfil sugerido) e como fallback se o backend estiver
 * inacessível. A fonte da verdade em produção é o "perfil ativo" salvo
 * no backend (Google Apps Script), editado pelo painel em /admin.
 *
 * IMPORTANTE: o campo webhook.url abaixo deve ser preenchido UMA VEZ,
 * na implantação, com a URL do seu Web App do Google Apps Script.
 * Como este arquivo é servido a todos os visitantes do site, essa é a
 * forma de garantir que qualquer navegador/dispositivo aponte para o
 * mesmo backend central — sem isso, os perfis não sincronizam entre
 * dispositivos diferentes.
 *
 * Sorteio: os prêmios não usam mais "peso" — a seleção é 100% aleatória
 * e uniforme entre todos os itens cadastrados.
 */
window.CONFIG_PADRAO = {
  empresa: {
    nome: "Korax",
    tituloRoleta: "Roleta da Sorte",
    logoUrl: "",
    planoFundoUrl: "",
    corPrimaria: "#C9A227",
    corSecundaria: "#0B1220",
    fonte: "Sora"
  },
  sons: {
    giro: "assets/audio/roleta-girando.mp3",
    vitoria: "assets/audio/palmas.mp3",
    derrota: "assets/audio/naruto-sad.mp3",
    clique: "",
    parada: ""
  },
  roleta: {
    duracaoGiroMs: 4800,
    voltasMinimas: 6
  },
  webhook: {
    url: "https://script.google.com/macros/s/AKfycbztoFQ0_IT3JV5HJC8ixhmGbEyNi8Kt5oRZoNdkpuPkwOxTxvfytoW1wFkkQFDvVzWZ/exec"
  },
  premios: [
    { id: "p1", nome: "Chocolate", cor: "#C9A227", categoria: "Brinde", descricao: "Um chocolate para adoçar o dia", positivo: true, som: "" },
    { id: "p2", nome: "Vale Café", cor: "#2E7D32", categoria: "Brinde", descricao: "Um café por conta da casa", positivo: true, som: "" },
    { id: "p3", nome: "Vale Folga", cor: "#8E44AD", categoria: "Premio Maior", descricao: "Uma folga merecida", positivo: true, som: "" },
    { id: "p4", nome: "Quase Lá", cor: "#7F8C8D", categoria: "Neutro", descricao: "Não foi essa vez", positivo: false, som: "" },
    { id: "p5", nome: "Vale Lanche", cor: "#2980B9", categoria: "Brinde", descricao: "Um lanche por nossa conta", positivo: true, som: "" },
    { id: "p6", nome: "Tente Outra Vez", cor: "#C0392B", categoria: "Neutro", descricao: "Na próxima você acerta", positivo: false, som: "" }
  ]
};
