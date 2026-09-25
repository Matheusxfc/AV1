/**
 * Script de teste de jornada completa (RF da atividade):
 * provisionamento inicial -> login -> cadastro de organizacao/contrato ->
 * criacao de lote -> adicao de equipamentos -> triagem -> movimentacoes ->
 * consulta de rastreabilidade -> relatorios -> validacao de regras de negocio.
 *
 * Executa em um diretorio de dados TEMPORARIO e isolado, sem afetar
 * ./data usado pela CLI interativa.
 *
 * Uso: npm run test:journey
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Config } from '../src/infra/Config';
import { RepositorioArquivo } from '../src/infra/RepositorioArquivo';
import { JournalService } from '../src/infra/JournalService';
import { ServicoAutenticacao } from '../src/services/ServicoAutenticacao';
import { ServicoOrganizacao } from '../src/services/ServicoOrganizacao';
import { ServicoLote } from '../src/services/ServicoLote';
import { ServicoEquipamento } from '../src/services/ServicoEquipamento';
import { ServicoRelatorio } from '../src/services/ServicoRelatorio';
import { PapelUsuario, EstadoFisico, StatusRastreamento, TipoEquipamento } from '../src/types/enums';

let passos = 0;
let falhas = 0;

function checar(descricao: string, condicao: boolean): void {
  passos++;
  if (condicao) {
    console.log(`  [OK] ${descricao}`);
  } else {
    falhas++;
    console.error(`  [FALHOU] ${descricao}`);
  }
}

function checarLanca(descricao: string, fn: () => void): void {
  passos++;
  try {
    fn();
    falhas++;
    console.error(`  [FALHOU] ${descricao} (esperava excecao, nenhuma foi lancada)`);
  } catch {
    console.log(`  [OK] ${descricao}`);
  }
}

async function main() {
  const dirTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'greencode-journey-'));
  console.log(`Diretorio de dados temporario: ${dirTemp}\n`);

  // ---- 1. Provisionamento inicial -----------------------------------
  console.log('== 1. Provisionamento inicial ==');
  const config = new Config(dirTemp);
  checar('config mestre nao existe antes do provisionamento', !config.existeConfiguracao());
  config.provisionar();
  checar('config mestre existe apos provisionamento', config.existeConfiguracao());
  const { chaveCriptografiaMestra } = config.carregar();
  checar('chave mestra possui 64 chars hex (256 bits)', /^[0-9a-f]{64}$/.test(chaveCriptografiaMestra));

  const repositorio = new RepositorioArquivo(dirTemp, chaveCriptografiaMestra);
  const journal = new JournalService(path.join(dirTemp, 'journal'));
  const autenticacao = new ServicoAutenticacao(repositorio, journal);
  const organizacao = new ServicoOrganizacao(repositorio, journal);
  const lote = new ServicoLote(repositorio, journal);
  const equipamento = new ServicoEquipamento(repositorio, journal);
  const relatorio = new ServicoRelatorio(organizacao, lote, equipamento);

  autenticacao.criarCredencial('admin', 'SenhaForte123', PapelUsuario.ADMINISTRADOR, 'SISTEMA');
  autenticacao.criarCredencial('almox1', 'OutraSenha456', PapelUsuario.GESTOR_ALMOXARIFADO, 'admin');

  // ---- 2. Login / sessao ------------------------------------------------
  console.log('\n== 2. Login e sessao ==');
  const loginFalho = autenticacao.login('admin', 'senhaErrada');
  checar('login com senha errada retorna null', loginFalho === null);

  const sessao = autenticacao.login('admin', 'SenhaForte123');
  checar('login com senha correta retorna sessao', sessao !== null);
  checar('token de sessao valido imediatamente apos login', autenticacao.validarToken(sessao!.token));

  // ---- 3. Cadastro de organizacao e contrato ------------------------
  console.log('\n== 3. Organizacao e contrato ==');
  checarLanca('CNPJ invalido (digitos verificadores) e rejeitado', () => {
    organizacao.cadastrarOrganizacao({ razaoSocial: 'Empresa X', cnpj: '11111111111111' }, 'admin');
  });

  const org = organizacao.cadastrarOrganizacao(
    {
      razaoSocial: 'Hospital Municipal Central',
      cnpj: '11222333000181', // CNPJ valido (digitos calculados)
      email: 'contato@hospital.example',
      contrato: { dataVencimento: proximoAno(), valorMensal: 4500 },
    },
    'admin',
  );
  checar('organizacao criada com contrato vigente vinculado', org.contratoVigenteId !== null);

  const duplicada = () =>
    organizacao.cadastrarOrganizacao({ razaoSocial: 'Duplicada', cnpj: '11222333000181' }, 'admin');
  checarLanca('CNPJ duplicado e rejeitado', duplicada);

  // ---- 4. Criacao de lote com validacao de data ----------------------
  console.log('\n== 4. Lote ==');
  const dataFutura = new Date();
  dataFutura.setDate(dataFutura.getDate() + 5);
  checarLanca('lote com data futura e rejeitado', () => {
    lote.criarLote(
      { dataEntrada: dataFutura.toISOString(), organizacaoId: org.id, notaFiscal: 'NF1', transportadora: 'T1' },
      'almox1',
    );
  });

  const novoLote = lote.criarLote(
    { dataEntrada: new Date().toISOString(), organizacaoId: org.id, notaFiscal: 'NF-0001', transportadora: 'TransRapida' },
    'almox1',
  );
  checar('lote criado com status RECEBIDO', novoLote.statusProcessamento === 'RECEBIDO');

  // ---- 5. Equipamentos, triagem e regra de queda de estado -----------
  console.log('\n== 5. Equipamentos e triagem ==');
  const equip1 = equipamento.criarEquipamento({
    tipo: TipoEquipamento.NOTEBOOK,
    marca: 'DellCorp',
    modelo: 'Latitude',
    anoFabricacao: 2019,
    estadoFisico: EstadoFisico.BOM_ESTADO,
    pesoQuilogramas: 2.1,
  });
  lote.adicionarEquipamentoToLote(novoLote.id, equip1, 'almox1');
  checar('codigo de barras interno gerado com prefixo NTB', equip1.codigoBarrasInterno.startsWith('NTB-'));

  checarLanca('queda de 2+ categorias sem justificativa e rejeitada', () => {
    equipamento.atualizarEstadoFisico(equip1.id, EstadoFisico.DANIFICADO_GRAVE, undefined, 'almox1');
  });

  equipamento.atualizarEstadoFisico(equip1.id, EstadoFisico.DANIFICADO_GRAVE, 'Queda durante transporte', 'almox1');
  checar('queda de 2+ categorias com justificativa e aceita', equipamento.buscarEquipamento(equip1.id)?.estadoFisico === EstadoFisico.DANIFICADO_GRAVE);

  checarLanca('mover para EM_DESMONTE antes da triagem completa e rejeitado', () => {
    equipamento.atualizarStatus(equip1.id, StatusRastreamento.EM_DESMONTE, 'tentativa indevida', 'almox1');
  });

  equipamento.atualizarStatus(equip1.id, StatusRastreamento.EM_TRIAGEM, 'inicio da triagem', 'almox1');
  equipamento.atualizarStatus(equip1.id, StatusRastreamento.AGUARDANDO_DESMONTE, 'triagem concluida', 'almox1');
  equipamento.atualizarStatus(equip1.id, StatusRastreamento.EM_DESMONTE, 'desmonte autorizado', 'almox1');
  checar('equipamento em EM_DESMONTE apos fluxo correto de triagem', equipamento.buscarEquipamento(equip1.id)?.statusRastreamento === StatusRastreamento.EM_DESMONTE);

  lote.processarTriagem(novoLote.id, 'almox1');

  // ---- 6. Movimentacoes e rastreabilidade -----------------------------
  console.log('\n== 6. Movimentacoes e rastreabilidade ==');
  equipamento.registrarMovimentacao(equip1.id, 'Bancada de desmonte 3', 'almox1', 'Encaminhado para desmonte de placas');
  equipamento.registrarMovimentacao(equip1.id, 'Estoque de pecas reaproveitaveis', 'almox1', 'Placa-mae reaproveitada');

  const rastreio = equipamento.rastrearEquipamento(equip1.id);
  checar('historico de rastreabilidade contem 2 movimentacoes', rastreio.historicoMovimentacao.length === 2);

  // ---- 7. Relatorios -----------------------------------------------------
  console.log('\n== 7. Relatorios ==');
  const inicio = new Date();
  inicio.setDate(inicio.getDate() - 30);
  const relOrg = relatorio.gerarRelatorioPorOrganizacao(org.id, { inicio, fim: new Date() });
  checar('relatorio por organizacao gerado com sucesso', relOrg.includes(org.razaoSocial));

  const relStatus = relatorio.gerarRelatorioPorStatus(StatusRastreamento.EM_DESMONTE);
  checar('relatorio por status inclui equipamento em desmonte', relStatus.includes(equip1.codigoBarrasInterno));

  const relFin = relatorio.gerarRelatorioFinanceiro({ inicio, fim: new Date() });
  checar('relatorio financeiro gerado com sucesso', relFin.includes('Receita contratual'));

  // ---- 8. Journal de auditoria --------------------------------------
  console.log('\n== 8. Journal de auditoria ==');
  const transacoes = journal.listarTodas();
  checar('journal registrou multiplas transacoes da jornada', transacoes.length >= 8);
  checar('journal contem transacao de LOGIN', transacoes.some((t) => t.operacao === 'LOGIN'));

  // ---- 9. Logout / expiracao de sessao --------------------------------
  console.log('\n== 9. Logout ==');
  autenticacao.logout(sessao!.token);
  checar('token invalido apos logout', !autenticacao.validarToken(sessao!.token));

  // ---- Resultado final ----------------------------------------------
  console.log(`\n===============================`);
  console.log(`Passos executados: ${passos} | Falhas: ${falhas}`);
  console.log(falhas === 0 ? 'JORNADA COMPLETA: TODOS OS TESTES PASSARAM.' : 'JORNADA COM FALHAS.');
  console.log(`===============================`);

  fs.rmSync(dirTemp, { recursive: true, force: true });
  process.exit(falhas === 0 ? 0 : 1);
}

function proximoAno(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString();
}

main().catch((e) => {
  console.error('Erro inesperado na jornada de teste:', e);
  process.exit(1);
});
