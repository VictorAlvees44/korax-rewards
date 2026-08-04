# Roleta da Sorte Corporativa

Aplicação web para campanhas do setor comercial e eventos com clientes
(feiras): uma roleta de prêmios moderna, com painel administrativo
separado, layouts (perfis) que sincronizam entre qualquer navegador ou
dispositivo, registro obrigatório de cada giro no Google Sheets
(organizado por layout e por mês) e notificação automática por e-mail.
Feita em HTML5, CSS3 e JavaScript puro (ES6), sem frameworks — funciona
100% no GitHub Pages.

---

## Sumário

1. [Descrição](#descrição)
2. [Estrutura do projeto](#estrutura-do-projeto)
3. [Como funciona a sincronização entre dispositivos](#como-funciona-a-sincronização-entre-dispositivos)
4. [Passo a passo do zero até a publicação](#passo-a-passo-do-zero-até-a-publicação)
5. [Usando o painel administrativo (/admin)](#usando-o-painel-administrativo-admin)
6. [Perfis: um layout por cliente/evento](#perfis-um-layout-por-clienteevento)
7. [Planilha organizada por layout e por mês](#planilha-organizada-por-layout-e-por-mês)
8. [Sorteio 100% aleatório, sem pesos](#sorteio-100-aleatório-sem-pesos)
9. [Backup e restauração](#backup-e-restauração)
10. [Solução de problemas](#solução-de-problemas)

---

## Descrição

- Roleta em tela cheia, com animação de aceleração/desaceleração natural.
- Modal obrigatório de nome do participante antes de girar.
- Tela de resultado com efeitos diferentes para prêmio positivo e negativo
  (confetes, glow e som de vitória / animação e som de derrota).
- Todo giro é enviado obrigatoriamente ao Google Sheets via Google Apps
  Script, com layout, nome, prêmio, tipo, data e hora.
- E-mail automático a cada novo giro registrado.
- **Painel administrativo separado** (`/admin`), fora da tela pública da
  roleta.
- **Perfis (layouts) centralizados**: salvos no backend, não no
  navegador — funcionam em qualquer computador, tablet ou celular.
- Sorteio 100% aleatório e uniforme entre os prêmios cadastrados (sem
  pesos/probabilidades para configurar).
- Exportação e importação de configurações em JSON (para backup manual).

## Estrutura do projeto

```
roleta/
├── index.html                 → tela pública da roleta (SEM painel)
├── admin/
│   └── index.html             → painel administrativo (rota /admin)
├── style.css                  → visual, animações e responsividade
├── core.js                    → módulo compartilhado (estado, backend, canvas, confete)
├── roleta-app.js               → lógica da tela pública
├── admin/admin-app.js          → lógica do painel administrativo
├── config.js                   → configuração padrão embutida (fallback + URL do backend)
├── config.json                 → configuração de referência/exportação
├── README.md                   → esta documentação
├── assets/
│   ├── logo/                   → logotipo padrão
│   ├── musicas/                 → sons padrão
│   └── imagens/                 → imagens padrão
└── google-apps-script/
    ├── Code.gs                  → backend (perfis, perfil ativo, planilha, e-mail)
    └── appsscript.json           → manifesto do projeto Apps Script
```

---

## Como funciona a sincronização entre dispositivos

Antes, os layouts ficavam salvos só no `LocalStorage` do navegador — por
isso não apareciam em outro computador ou tablet. Agora o **Google Apps
Script guarda tudo centralmente**, em uma pasta do Google Drive vinculada
ao script:

- **Biblioteca de perfis** — todos os layouts salvos (um arquivo JSON por
  perfil).
- **Perfil ativo** — qual layout está publicado *agora* na roleta
  pública (um único arquivo JSON).

Fluxo real de uso em uma feira:

1. No `/admin`, você monta ou carrega o layout do próximo cliente.
2. Testa com o botão **"Testar giro"** (não registra nada).
3. Quando o cliente chegar, clica em **"Publicar este layout na roleta
   pública"**.
4. Em qualquer tablet/notebook que esteja com `index.html` aberto (ou que
   abrir agora), a roleta pública busca o perfil ativo no backend e
   exibe exatamente esse layout — sem precisar reconfigurar nada
   naquele aparelho.

Isso só funciona porque **todos os dispositivos apontam para o mesmo
backend** — o que nos leva ao próximo ponto: a URL do Web App precisa
estar fixada em `config.js` (veja o passo a passo abaixo), não apenas
digitada no painel de um navegador específico.

Se a internet cair no meio de um evento, a roleta pública usa o último
perfil que conseguiu buscar (guardado em cache local) até a conexão
voltar.

---

## Passo a passo do zero até a publicação

### 1. Criar a planilha do Google Sheets

1. Acesse [sheets.google.com](https://sheets.google.com) e crie uma
   planilha nova.
2. Dê um nome, por exemplo **"Roleta Corporativa — Registros"**.
3. Não é necessário criar abas manualmente: o script cria automaticamente
   uma aba por layout + mês (veja [mais abaixo](#planilha-organizada-por-layout-e-por-mês)).

### 2. Criar o Google Apps Script

1. Na planilha, vá em **Extensões → Apps Script**.
2. Apague o conteúdo padrão do arquivo `Code.gs` que abrir.
3. Copie todo o conteúdo de `google-apps-script/Code.gs` deste projeto e
   cole no editor.
4. No arquivo `appsscript.json` do editor (ative em **Configurações do
   projeto → Mostrar arquivo "appsscript.json" no editor**), substitua o
   conteúdo pelo arquivo `google-apps-script/appsscript.json` deste
   projeto.
5. No topo de `Code.gs`, edite a constante `EMAIL_DESTINATARIO` com o
   e-mail que deve receber as notificações.

### 3. Publicar o Web App

1. No editor do Apps Script, clique em **Implantar → Nova implantação**.
2. Em "Selecionar tipo", escolha **App da Web**.
3. Em "Executar como", selecione **Eu (seu e-mail)**.
4. Em "Quem pode acessar", selecione **Qualquer pessoa**.
5. Clique em **Implantar** e autorize as permissões solicitadas. Como o
   backend agora também guarda perfis no Google Drive, a tela de
   permissões vai pedir acesso à sua conta do Drive além da planilha e
   do e-mail — isso é esperado, autorize normalmente.
6. Copie a **URL do Web App** gerada — algo como:
   `https://script.google.com/macros/s/AKfycb.../exec`

> Sempre que editar o `Code.gs`, é necessário criar uma **nova
> implantação** (ou gerenciar implantações → editar → nova versão) para
> que as alterações entrem em vigor na URL publicada.

### 4. Fixar a URL do backend em `config.js` (passo essencial)

Diferente da versão anterior, a URL **não deve** ser configurada apenas
pelo painel — isso só vale para testes rápidos naquele navegador. Para
que **todo dispositivo** funcione corretamente:

1. Abra o arquivo `config.js` deste projeto.
2. Encontre o campo `webhook: { url: "" }`.
3. Cole a URL do Web App copiada no passo anterior.
4. Salve e publique esse arquivo junto com o resto do projeto no GitHub
   Pages (próximo passo).

### 5. Publicar no GitHub Pages

1. Crie uma conta em [github.com](https://github.com), se ainda não
   tiver.
2. Crie um novo repositório (pode ser público ou privado, desde que o
   plano permita Pages em repositórios privados).
3. Envie todos os arquivos deste projeto para o repositório:
   ```bash
   git init
   git add .
   git commit -m "Roleta da Sorte Corporativa"
   git branch -M main
   git remote add origin https://github.com/SEU-USUARIO/SEU-REPOSITORIO.git
   git push -u origin main
   ```
4. No repositório, vá em **Settings → Pages**.
5. Em "Source", selecione a branch `main` e a pasta `/ (root)`.
6. Clique em **Save**. Após alguns instantes, o GitHub mostrará a URL
   pública, algo como:
   `https://SEU-USUARIO.github.io/SEU-REPOSITORIO/`
7. A roleta pública fica em `https://SEU-USUARIO.github.io/SEU-REPOSITORIO/`
   e o painel administrativo em
   `https://SEU-USUARIO.github.io/SEU-REPOSITORIO/admin/`.

---

## Usando o painel administrativo (/admin)

O painel agora é uma página própria, separada da roleta pública, com uma
prévia da roleta sempre visível enquanto você edita. Abas:

- **Prêmios** — adicionar, editar ou remover prêmios. A cor de um prêmio
  novo é **sorteada automaticamente**; você só precisa mudar se quiser.
- **Visual** — nome da empresa, título da roleta, logo, plano de fundo,
  cores e fonte.
- **Sons** — upload dos sons de giro, vitória, derrota, clique e parada.
- **Perfis** — salvar o layout atual na biblioteca, carregar outro para
  editar, ou excluir.
- **Configurações** — duração/voltas do giro, exportar/importar JSON, e
  um campo de URL do backend (só para teste local — a URL "de fábrica"
  fica em `config.js`).
- **Histórico** e **Estatísticas** — espelho local (deste navegador) dos
  últimos giros, útil para conferência rápida durante o evento. O
  registro completo e oficial fica na planilha.

Dois botões ficam sempre visíveis, acima das abas:

- **🎲 Testar giro** — gira a prévia sem registrar nada, só para conferir
  o layout.
- **🚀 Publicar este layout na roleta pública** — salva e ativa esse
  layout como o que a roleta pública deve exibir agora, em qualquer
  dispositivo.

> ⚠️ **Sobre segurança:** o link `/admin` não tem senha — qualquer pessoa
> com o endereço pode acessá-lo e editar tudo. Evite divulgar esse link
> publicamente. Se isso for uma preocupação (por exemplo, em um evento
> com o link circulando), me avise e adicionamos uma proteção simples.

## Perfis: um layout por cliente/evento

1. No `/admin`, monte o layout normalmente: prêmios, cores, sons.
2. Vá até a aba **Perfis**, digite um nome (ex: "Feira Cliente A") e
   clique em **Salvar layout atual como perfil** — isso grava na
   biblioteca central, mas ainda não afeta a roleta pública.
3. Quando quiser que a roleta pública passe a exibir esse layout, use o
   botão **Publicar este layout na roleta pública** (fica sempre visível
   acima das abas).
4. Para editar um perfil já salvo, vá em **Perfis → Carregar para
   editar**. Editar e salvar não muda automaticamente o que está
   publicado — só o botão "Publicar" faz isso, o que permite preparar o
   próximo layout com calma sem interromper o que está ativo agora.
5. Um perfil que não é mais necessário pode ser removido com **Excluir**.

## Planilha organizada por layout e por mês

Cada giro grava numa aba nomeada `"<Nome do Layout> - MM/AAAA"` — por
exemplo, um giro do perfil "Comercial" em agosto de 2026 vai para a aba
**"Comercial - 08/2026"**. Uma aba nova só é criada no primeiro giro
daquele layout naquele mês; giros seguintes do mesmo layout e mês só
acrescentam linhas na aba já existente. Isso significa:

- Layouts diferentes (ex: "Comercial" e "Feira Cliente A") nunca se
  misturam na mesma aba.
- Ao virar o mês, o próximo giro de cada layout abre automaticamente uma
  aba nova para aquele mês — o histórico de meses anteriores continua
  intacto e separado.
- O mês considerado é o do servidor do Google (fuso de São Paulo, já
  configurado no `appsscript.json`), não o relógio do celular/tablet do
  participante.

## Sorteio 100% aleatório, sem pesos

Todos os prêmios cadastrados têm a mesma probabilidade de sair — não há
mais campo de "peso" para configurar. Isso também significa que não há
trava de "1 giro por pessoa": a mesma pessoa pode girar várias vezes
seguidas (por exemplo, se uma venda dá direito a 5 giros), sem qualquer
bloqueio no sistema.

## Backup e restauração

Use **Exportar JSON** (aba Configurações do admin) para baixar o layout
que está em edição, e **Importar JSON** para recarregá-lo depois — útil
como backup manual além da biblioteca central, ou para levar um layout
específico para outro projeto/backend.

## Solução de problemas

- **A roleta pública mostra o layout padrão, não o que eu publiquei** —
  confira se `config.js` tem a URL correta do Web App e se ela foi
  publicada no GitHub Pages (não só salva localmente pelo painel).
- **"URL do Web App não configurada em config.js"** — falta preencher o
  campo `webhook.url` em `config.js` (veja o passo 4 do deploy).
- **Erro de permissão do Google Drive ao salvar perfil** — normalmente
  resolve reautorizando o Web App (Implantar → Gerenciar implantações →
  editar → nova versão, autorizando o acesso ao Drive quando solicitado).
- **Giros não aparecem na planilha em tempo real** — pode ser apenas a
  fila local tentando reenviar; verifique a conexão do dispositivo e
  aguarde, o reenvio é automático quando a internet voltar.
