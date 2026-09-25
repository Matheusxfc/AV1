# greencode

CLI (linha de comando) para gestão de logística reversa de equipamentos eletrônicos — desenvolvida em **Node.js + TypeScript**, com persistência em arquivo cifrado (**AES‑256‑GCM**), autenticação com senha em hash (**SHA‑256 + salt**), journaling imutável de transações e controle de acesso por papel (RBAC).

Este projeto implementa a **Atividade de Avaliação Individual 1** (primeira etapa do sistema): o núcleo operacional do sistema, antes da interface web e da migração para banco de dados relacional (etapas futuras mencionadas no enunciado).

> Funciona em **Windows 10 ou superior**, **Ubuntu 24.04 LTS ou superior** e distribuições derivadas do Ubuntu, sem alterações de código — é um projeto Node.js puro, sem dependências nativas.

> O easter egg está na pasta de config, é um pequeno texto

---

## Índice

1. [Visão geral](#visão-geral)
2. [Pré-requisitos](#pré-requisitos)
3. [Instalação](#instalação)
4. [Primeira execução (provisionamento)](#primeira-execução-provisionamento)
5. [Uso da CLI](#uso-da-cli)
6. [Papéis de usuário e permissões](#papéis-de-usuário-e-permissões)
7. [Arquitetura](#arquitetura)
8. [Documentação de segurança](#documentação-de-segurança)
9. [Testes](#testes)
10. [Estrutura de pastas](#estrutura-de-pastas)
11. [Limitações conhecidas e próximos passos](#limitações-conhecidas-e-próximos-passos)

---

## Visão geral

O `greencode` é o núcleo operacional de uma plataforma de logística reversa que conecta **organizações geradoras** de resíduos eletrônicos (empresas, hospitais, universidades etc.) a um fluxo de **recebimento em lote → triagem → desmonte → destinação final** de cada equipamento, com rastreabilidade completa de ponta a ponta.

Principais capacidades:

- Cadastro de organizações clientes e contratos de coleta, com validação de CNPJ (dígitos verificadores).
- Criação de lotes recebidos, com validação de data de entrada (não pode ser futura nem ter mais de 90 dias).
- Cadastro individual de equipamentos dentro de um lote, com geração automática de código de barras interno.
- Fluxo de triagem → desmonte, com regra de negócio impedindo pular etapas.
- Alteração de estado físico do equipamento, exigindo justificativa textual quando a queda for de 2 ou mais categorias.
- Registro de movimentações e consulta de rastreabilidade completa (histórico) por equipamento.
- Relatórios por organização, por status de rastreamento e financeiro.
- Autenticação com 4 papéis (administrador, operador de cadastro, gestor de almoxarifado, auditor), sessão expirando após 30 minutos de inatividade.
- Toda a persistência é cifrada em disco (AES‑256‑GCM) e gravada de forma atômica (arquivo temporário + rename).
- Journal de transações imutável (write‑ahead log), com rotação automática (10 MB) e política de retenção (≥ 180 dias).

---

## Pré-requisitos

- **Node.js 18 LTS ou superior** (testado com Node 18/20/22) — [nodejs.org](https://nodejs.org)
- **npm** (instalado junto com o Node.js)
- Um terminal:
  - Windows: PowerShell, Windows Terminal ou Prompt de Comando (cmd)
  - Linux: qualquer terminal (bash, zsh, etc.)

Verifique a instalação:

```bash
node --version
npm --version
```

---

## Instalação

### Linux (Ubuntu 24.04+ ou derivados)

```bash
# 1) Instale o Node.js 18+ (se ainda não tiver), por exemplo via NodeSource:
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2) Clone ou copie o projeto e instale as dependências
cd greencode
npm install

# 3) Compile o TypeScript
npm run build
```

### Windows 10/11

```powershell
# 1) Instale o Node.js 18+ pelo instalador oficial (nodejs.org) ou via winget:
winget install OpenJS.NodeJS.LTS

# 2) Abra o PowerShell na pasta do projeto e instale as dependências
cd greencode
npm install

# 3) Compile o TypeScript
npm run build
```

Após o build, o comando pode ser executado com:

```bash
npm start
```

Alternativamente, durante o desenvolvimento, é possível rodar direto do TypeScript sem compilar antes:

```bash
npm run dev
```

### Onde os dados ficam armazenados

Por padrão, o `greencode` cria uma pasta `data/` dentro do diretório atual (`process.cwd()`), contendo os arquivos cifrados e o journal. Você pode apontar para outro local (por exemplo, para rodar múltiplas instâncias de teste) definindo a variável de ambiente `GREENCODE_DATA_DIR`:

```bash
# Linux/macOS
export GREENCODE_DATA_DIR=/caminho/para/meus-dados
npm start

# Windows (PowerShell)
$env:GREENCODE_DATA_DIR = "C:\caminho\para\meus-dados"
npm start
```

---

## Primeira execução (provisionamento)

Na primeira vez que o sistema é executado, ele detecta que **não existe** o arquivo de configuração mestre (`data/config.mestre.json`) e entra automaticamente em **modo de provisionamento inicial**:

```
$ npm start

=== Provisionamento inicial do greencode ===
Nenhuma configuracao mestre encontrada. Vamos criar o primeiro administrador.

Defina o usuario do administrador: admin
Defina a senha do administrador: ********

Administrador 'admin' criado com sucesso.
Chave de criptografia mestra gerada e armazenada em config.mestre.json.
Provisionamento concluido. Reinicie o comando para efetuar login.
```

Nesse momento, o sistema:

1. Gera uma **chave de criptografia mestra AES‑256** aleatória (`config.mestre.json`, com permissão `0600` em sistemas Unix — leitura/escrita apenas pelo dono do arquivo).
2. Cria a credencial do primeiro **administrador**, com senha em hash SHA‑256 + salt (nunca em texto puro).

Depois disso, basta rodar `npm start` novamente para fazer login normalmente.

> ⚠️ **Não** apague nem versione o arquivo `data/config.mestre.json` — ele contém a chave que decifra todos os demais dados. Recomenda-se fazer backup dele separadamente dos demais arquivos.

---

## Uso da CLI

Após o login, o menu exibido se adapta ao papel do usuário autenticado. O padrão de comando é:

```
<recurso> <ação> --flag1 valor1 --flag2 "valor com espaço"
```

Exemplos:

```
greencode(GESTOR_ALMOXARIFADO)> lote criar --org org_a1b2c3d4e5f6 --nf 123456 --transp TransRapida --data 2026-09-20

greencode(GESTOR_ALMOXARIFADO)> equip adicionar --lote lote_9988aabbccdd --tipo NOTEBOOK --marca Dell --modelo Latitude --ano 2019 --peso 2.1 --estado BOM_ESTADO

greencode(GESTOR_ALMOXARIFADO)> equip estado --id equip_112233 --novo DANIFICADO_GRAVE --justificativa "Queda durante o transporte"

greencode(AUDITOR)> relatorio org --org org_a1b2c3d4e5f6 --inicio 2026-01-01 --fim 2026-12-31
```

Comandos úteis em qualquer sessão:

- `ajuda` — reexibe o menu de comandos disponíveis para o seu papel.
- `senha alterar --antiga <atual> --nova <nova>` — troca a própria senha.
- `sair` — encerra a sessão e sai do programa.

A CLI usa a biblioteca nativa `readline`, com:

- **Auto completação** (pressione `Tab`) para os comandos disponíveis ao seu papel.
- **Histórico persistente entre sessões**, salvo em `data/.greencode_history`.
- **Setas ↑ / ↓** para navegar no histórico de comandos.

---

## Papéis de usuário e permissões

| Papel                    | Pode fazer                                                                                     |
|---------------------------|-------------------------------------------------------------------------------------------------|
| `ADMINISTRADOR`            | Tudo (gestão de contas, parâmetros globais, e todas as operações dos demais papéis)             |
| `OPERADOR_CADASTRO`        | Cadastrar/consultar organizações e contratos                                                    |
| `GESTOR_ALMOXARIFADO`      | Criar lotes, cadastrar equipamentos, conduzir triagem, atualizar estado/status, movimentações   |
| `AUDITOR`                  | Apenas consulta: rastreabilidade, relatórios, journal de auditoria (nenhuma capacidade de alteração) |

O menu exibido após o login já mostra **somente** os comandos permitidos para o papel autenticado; tentativas de usar um comando fora do escopo do papel retornam um erro (`[ERRO] Papel '...' nao possui permissao para '...'`).

O `ADMINISTRADOR` cria novos usuários com:

```
usuario criar --user almox1 --senha "SenhaForte123" --papel GESTOR_ALMOXARIFADO
```

---

## Arquitetura

O código segue a modelagem UML fornecida na atividade, organizada em camadas:

```
src/
├── types/enums.ts            Enumerações do domínio (PapelUsuario, StatusLote, TipoEquipamento,
│                              EstadoFisico, StatusRastreamento, Severidade)
├── interfaces/
│   └── Autenticavel.ts       Interface implementada por ServicoAutenticacao (polimorfismo)
├── models/types.ts           Formatos de dados: Organizacao, Contrato, Lote, Equipamento,
│                              Movimentacao, Credencial, Sessao, JournalTransacao
├── validators/
│   ├── Validador.ts          Classe abstrata (herança/polimorfismo)
│   ├── ValidadorCNPJ.ts      Validação de CNPJ (módulo 11)
│   └── ValidadorDataEntrada.ts  Regra de data de entrada de lote
├── infra/
│   ├── CriptografiaArquivo.ts   AES-256-GCM (cifra/decifra)
│   ├── RepositorioArquivo.ts    Persistência atômica (temp file + rename)
│   ├── JournalService.ts        Journal imutável, rotação e retenção
│   └── Config.ts                Configuração mestre / provisionamento
├── services/
│   ├── ServicoAutenticacao.ts   Login, sessões, hashing de senha
│   ├── ServicoOrganizacao.ts    Organizações e contratos
│   ├── ServicoLote.ts           Lotes e triagem
│   ├── ServicoEquipamento.ts    Equipamentos, estado, status, movimentações
│   └── ServicoRelatorio.ts      Relatórios agregados
└── cli/
    ├── CLIInterface.ts       Orquestra o loop de interação (readline)
    ├── LeitorLinhas.ts       Utilitário de leitura de linha (ver nota técnica abaixo)
    ├── menu.ts               Menu dinâmico por papel
    └── parseArgs.ts          Parser de comandos "recurso ação --flags"
```

**Pilares de POO aplicados:**

- **Herança/Polimorfismo**: `Validador` (classe abstrata) → `ValidadorCNPJ`, `ValidadorDataEntrada`.
- **Interfaces**: `Autenticavel`, implementada por `ServicoAutenticacao`.
- **Encapsulamento**: cada serviço expõe apenas métodos de negócio; o acesso a arquivos passa exclusivamente por `RepositorioArquivo`.
- **Composição**: `CLIInterface` compõe todos os serviços de domínio; `ServicoRelatorio` compõe `ServicoOrganizacao`, `ServicoLote` e `ServicoEquipamento`.

### Nota técnica: por que `LeitorLinhas.ts` existe

Durante o desenvolvimento identificamos uma armadilha real do módulo nativo `readline` do Node.js: chamadas sequenciais de `rl.question()` (uma aguardando a outra) podem **perder uma linha já digitada** quando a entrada chega em um único bloco (comum em pipes/redirecionamentos, por exemplo `comando < arquivo.txt` ou scripts de teste automatizados), pois o `readline` processa e emite todos os eventos `'line'` de forma síncrona antes que o código tenha a chance de registrar o próximo "ouvinte". Isso poderia travar o login em determinados cenários de automação/CI.

Para eliminar essa classe de bug, `LeitorLinhas` enfileira toda linha recebida e entrega para quem estiver esperando, na ordem correta, independentemente do timing — testado tanto em modo interativo (TTY) quanto com entrada via pipe.

---

## Documentação de segurança

### 1. Criptografia dos dados em repouso — AES‑256‑GCM

Todos os arquivos de persistência (`credenciais.gce`, `organizacoes.gce`, `contratos.gce`, `lotes.gce`, `equipamentos.gce`, `movimentacoes.gce`) são cifrados com **AES‑256 no modo GCM** (Galois/Counter Mode), escolhido por ser um modo **autenticado**: além de sigilo, o GCM garante integridade — qualquer adulteração do arquivo cifrado (bit‑flip, truncamento, etc.) é detectada na decifragem (falha na verificação da *auth tag*), o que não ocorreria com um modo não autenticado como CBC puro. Cada operação de cifragem usa um IV (vetor de inicialização) aleatório de 96 bits, conforme recomendado para GCM, evitando reuso de IV com a mesma chave.

A **chave mestra** (256 bits, gerada com `crypto.randomBytes`) é criada uma única vez no provisionamento inicial e armazenada em `config.mestre.json`, com permissão de arquivo restrita (`0600`) em sistemas Unix. Essa é a peça crítica de todo o esquema: quem tiver essa chave decifra todos os dados. Em uma evolução futura (integração web/BD), o recomendado é mover essa chave para um cofre de segredos (ex.: variável de ambiente injetada por um secrets manager) em vez de arquivo em disco.

### 2. Senhas — hash SHA‑256 com salt

Conforme especificado na atividade, as senhas são armazenadas como **hash SHA‑256 de `salt:senha`**, nunca em texto puro. Cada usuário recebe um **salt aleatório de 128 bits** (`crypto.randomBytes(16)`), único por conta, o que impede ataques de *rainbow table* compartilhadas entre usuários e força um atacante a quebrar cada hash individualmente.

> **Nota de evolução**: SHA‑256 puro (mesmo com salt) é rápido de computar, o que o torna mais vulnerável a força bruta offline do que algoritmos deliberadamente lentos como *bcrypt*, *scrypt* ou *Argon2*. Ele foi adotado aqui por ser exigência explícita do enunciado da atividade (dependência zero, sem pacotes externos de hashing). Para produção, recomenda-se migrar para Argon2id.

### 3. Sessões — expiração por inatividade (30 minutos)

Cada login gera um token de sessão (UUID v4) com expiração inicial de 30 minutos. **Toda vez que um comando é processado com sucesso**, a sessão é renovada (a expiração é estendida por mais 30 minutos a partir daquele momento) — ou seja, a expiração é por **inatividade**, não por tempo total de uso. Comandos digitados após a expiração são rejeitados e a sessão é encerrada, exigindo novo login. O logout explícito (`sair`) também invalida o token imediatamente.

### 4. Journal de transações — auditoria e recuperação

Toda operação de escrita (criação/atualização de organizações, contratos, lotes, equipamentos, movimentações, login/logout) é registrada em um **journal imutável** (`data/journal/journal.current.log`, formato JSON Lines, *append‑only*) **antes** de ser considerada concluída, contendo: operação, entidade, estado anterior, estado novo, timestamp e usuário responsável. Isso permite:

- **Auditoria completa**: o papel `AUDITOR` pode consultar `journal listar` para ver todas as transações do sistema.
- **Recuperação**: em caso de necessidade de investigar um estado inconsistente, o `dadosAntes` de qualquer transação permite reconstruir o estado anterior manualmente.
- **Rotação automática**: quando o arquivo de journal ativo ultrapassa 10 MB, ele é renomeado (`journal.<timestamp>.log`) e um novo arquivo corrente é iniciado, evitando arquivos monolíticos gigantes.
- **Retenção mínima de 180 dias**: a cada inicialização do sistema, arquivos de journal já rotacionados com mais de 180 dias são removidos (`aplicarPoliticaRetencao()`), atendendo ao requisito de retenção sem crescimento ilimitado de disco.

### 5. Escrita atômica de arquivos

Todas as gravações em disco (`RepositorioArquivo.salvarColecao`) seguem o padrão **escrever em arquivo temporário + `rename`**: o conteúdo cifrado é gravado por completo em um arquivo `.tmp` com sufixo aleatório e só então renomeado por cima do arquivo definitivo. Como a operação de `rename` é atômica no nível do sistema operacional (tanto em Linux/ext4 quanto em Windows/NTFS, quando origem e destino estão no mesmo volume), uma interrupção abrupta do processo (queda de energia, `kill -9`, etc.) durante a escrita nunca deixa o arquivo de dados em um estado parcialmente escrito/corrompido — na pior hipótese, a escrita mais recente é perdida, mas o arquivo anterior (íntegro) permanece.

### 6. Validações de negócio como camada de segurança

Embora não sejam "criptografia", as seguintes validações protegem a integridade dos dados de negócio e foram tratadas com o mesmo rigor:

- **CNPJ**: formato (14 dígitos) + cálculo dos dois dígitos verificadores pelo algoritmo Módulo 11 da Receita Federal, além de checagem de unicidade entre organizações cadastradas.
- **Data de entrada do lote**: rejeitada se for no futuro ou anterior a mais de 90 dias, prevenindo lançamentos retroativos fraudulentos ou erros de digitação.
- **Queda de estado físico ≥ 2 categorias**: exige justificativa textual obrigatória, criando uma trilha de responsabilização para decisões de grande impacto no valor do ativo.
- **Transição para `EM_DESMONTE`**: só é permitida a partir de `AGUARDANDO_DESMONTE` (ou seja, após a triagem completa), impedindo que um equipamento seja desmontado sem antes passar pela classificação adequada.

### Cenários de falha testados

O script `tests/journey.ts` (ver seção [Testes](#testes)) cobre explicitamente os seguintes cenários de falha e a resposta esperada do sistema:

| Cenário                                                              | Resposta esperada                                             |
|-----------------------------------------------------------------------|-----------------------------------------------------------------|
| Login com senha incorreta                                             | `null` (sem sessão criada), sem revelar se o usuário existe    |
| CNPJ com dígitos verificadores inválidos                              | Exceção com mensagem explicativa; organização não é criada      |
| CNPJ duplicado entre organizações                                     | Exceção; organização não é criada                                |
| Lote com data de entrada futura                                       | Exceção; lote não é criado                                       |
| Queda de 2+ categorias no estado físico **sem** justificativa         | Exceção; estado não é alterado                                   |
| Queda de 2+ categorias no estado físico **com** justificativa         | Alteração aceita e registrada no journal com a justificativa     |
| Mover equipamento para `EM_DESMONTE` antes da triagem completa        | Exceção; status não é alterado                                   |
| Token de sessão após `logout`                                         | `validarToken()` retorna `false`                                 |

---

## Testes

### Jornada completa automatizada (recomendado)

Simula, em um diretório de dados **temporário e isolado**, toda a jornada descrita na atividade: provisionamento → login → cadastro de organização/contrato → criação de lote → cadastro de equipamentos → triagem → movimentações → consulta de rastreabilidade → relatórios → auditoria via journal — incluindo os cenários de falha da tabela acima.

```bash
npm run test:journey
```

Saída esperada (resumo):

```
Passos executados: 23 | Falhas: 0
JORNADA COMPLETA: TODOS OS TESTES PASSARAM.
```

O script não toca a pasta `data/` do projeto — ele cria e depois remove um diretório temporário do sistema operacional a cada execução.

### Teste manual da CLI interativa

```bash
npm run build
npm start
# siga o provisionamento, depois faça login e explore os comandos do menu
```

---

## Estrutura de pastas

```
greencode/
├── src/                  Código-fonte TypeScript (ver Arquitetura acima)
├── tests/
│   └── journey.ts        Teste de jornada completa automatizado
├── data/                 Criado em tempo de execução (cifrado; NÃO versionar)
├── dist/                 Saída do build (gerado por `npm run build`; NÃO versionar)
├── package.json
├── tsconfig.json
├── .gitignore
└── README.md
```

---

## Limitações conhecidas e próximos passos

Este é o entregável da **primeira etapa** da atividade. Ficam registradas, de forma transparente, as limitações atuais e o que está previsto para as próximas etapas (conforme o próprio enunciado):

- **Persistência em arquivo, não em banco de dados relacional** — planejada a migração para um banco relacional (ex. PostgreSQL) na próxima etapa, mantendo a mesma camada de serviços (`ServicoOrganizacao`, `ServicoLote` etc.) e trocando apenas `RepositorioArquivo` por uma implementação equivalente sobre SQL.
- **Interface apenas via linha de comando** — a integração com uma interface web está planejada como evolução futura; a arquitetura em camadas (serviços independentes da CLI) foi desenhada propositalmente para permitir reaproveitar toda a lógica de negócio por trás de uma API HTTP sem reescrever regras.
- **Hash de senha em SHA‑256+salt** — adequado ao escopo da atividade (sem dependências externas), mas recomenda-se migração para Argon2id em produção (ver seção de segurança).
- **Sem suporte a múltiplos processos concorrentes** — a persistência em arquivo com *last‑write‑wins* não foi desenhada para múltiplas instâncias do `greencode` escrevendo simultaneamente no mesmo diretório de dados; isso é resolvido naturalmente pela migração para banco de dados relacional.
- **Sem recuperação automática a partir do journal** — o journal registra tudo o que é necessário para uma reconstrução manual/auditoria (`dadosAntes`/`dadosDepois`), mas um comando de "replay" automático não foi implementado nesta etapa.
