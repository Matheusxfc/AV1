import { PapelUsuario } from '../types/enums';

export interface ItemMenu {
  comando: string;
  descricao: string;
}

const MENU_ADMINISTRADOR: ItemMenu[] = [
  { comando: 'usuario criar --user <u> --senha <s> --papel <PAPEL>', descricao: 'Cria uma nova credencial de acesso' },
  { comando: 'usuario listar', descricao: 'Lista credenciais cadastradas' },
  { comando: 'config atualizar --aliquota <n> --deprec <n>', descricao: 'Atualiza parametros globais' },
];

const MENU_OPERADOR_CADASTRO: ItemMenu[] = [
  { comando: 'org criar --razao <nome> --cnpj <cnpj> [--tel][--email][--endereco]', descricao: 'Cadastra organizacao' },
  { comando: 'org listar', descricao: 'Lista organizacoes ativas' },
  { comando: 'org endereco --org <id> --novo <endereco>', descricao: 'Atualiza endereco' },
  { comando: 'contrato criar --org <id> --venc <AAAA-MM-DD> --valor <n>', descricao: 'Cria contrato' },
  { comando: 'contrato renovar --org <id> --venc <AAAA-MM-DD>', descricao: 'Renova contrato vigente' },
];

const MENU_GESTOR_ALMOXARIFADO: ItemMenu[] = [
  { comando: 'lote criar --org <id> --nf <numero> --transp <nome> --data <AAAA-MM-DD>', descricao: 'Cria lote' },
  { comando: 'lote listar', descricao: 'Lista todos os lotes' },
  {
    comando: 'equip adicionar --lote <id> --tipo <TIPO> --marca <m> --modelo <m> --ano <n> --peso <kg> --estado <ESTADO>',
    descricao: 'Adiciona equipamento a um lote',
  },
  { comando: 'lote triagem --lote <id>', descricao: 'Processa triagem do lote' },
  { comando: 'equip estado --id <id> --novo <ESTADO> [--justificativa "..."]', descricao: 'Atualiza estado fisico' },
  { comando: 'equip status --id <id> --novo <STATUS> --justificativa "..."', descricao: 'Atualiza status de rastreamento' },
  { comando: 'equip movimentar --id <id> --destino <local> [--obs "..."]', descricao: 'Registra movimentacao' },
];

const MENU_AUDITOR: ItemMenu[] = [
  { comando: 'equip rastrear --id <id>', descricao: 'Consulta historico completo de um equipamento' },
  { comando: 'relatorio org --org <id> --inicio <AAAA-MM-DD> --fim <AAAA-MM-DD>', descricao: 'Relatorio por organizacao' },
  { comando: 'relatorio status --status <STATUS>', descricao: 'Relatorio por status de rastreamento' },
  { comando: 'relatorio financeiro --inicio <AAAA-MM-DD> --fim <AAAA-MM-DD>', descricao: 'Relatorio financeiro' },
  { comando: 'journal listar', descricao: 'Lista transacoes do journal de auditoria' },
];

const MENU_COMUM: ItemMenu[] = [
  { comando: 'senha alterar --antiga <s> --nova <s>', descricao: 'Altera a propria senha' },
  { comando: 'ajuda', descricao: 'Exibe este menu' },
  { comando: 'sair', descricao: 'Encerra a sessao e sai do sistema' },
];

export function obterMenuPorPapel(papel: PapelUsuario): ItemMenu[] {
  switch (papel) {
    case PapelUsuario.ADMINISTRADOR:
      return [...MENU_ADMINISTRADOR, ...MENU_OPERADOR_CADASTRO, ...MENU_GESTOR_ALMOXARIFADO, ...MENU_AUDITOR, ...MENU_COMUM];
    case PapelUsuario.OPERADOR_CADASTRO:
      return [...MENU_OPERADOR_CADASTRO, ...MENU_COMUM];
    case PapelUsuario.GESTOR_ALMOXARIFADO:
      return [...MENU_GESTOR_ALMOXARIFADO, ...MENU_COMUM];
    case PapelUsuario.AUDITOR:
      return [...MENU_AUDITOR, ...MENU_COMUM];
    default:
      return MENU_COMUM;
  }
}

export function recursosPermitidos(papel: PapelUsuario): string[] {
  switch (papel) {
    case PapelUsuario.ADMINISTRADOR:
      return ['usuario', 'config', 'org', 'contrato', 'lote', 'equip', 'relatorio', 'journal', 'senha', 'ajuda', 'sair'];
    case PapelUsuario.OPERADOR_CADASTRO:
      return ['org', 'contrato', 'senha', 'ajuda', 'sair'];
    case PapelUsuario.GESTOR_ALMOXARIFADO:
      return ['lote', 'equip', 'senha', 'ajuda', 'sair'];
    case PapelUsuario.AUDITOR:
      return ['equip', 'relatorio', 'journal', 'senha', 'ajuda', 'sair'];
    default:
      return ['ajuda', 'sair'];
  }
}
