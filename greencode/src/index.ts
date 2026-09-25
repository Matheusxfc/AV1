#!/usr/bin/env node
import * as path from 'path';
import * as readline from 'readline';
import { Config } from './infra/Config';
import { RepositorioArquivo } from './infra/RepositorioArquivo';
import { JournalService } from './infra/JournalService';
import { ServicoAutenticacao } from './services/ServicoAutenticacao';
import { ServicoOrganizacao } from './services/ServicoOrganizacao';
import { ServicoLote } from './services/ServicoLote';
import { ServicoEquipamento } from './services/ServicoEquipamento';
import { ServicoRelatorio } from './services/ServicoRelatorio';
import { CLIInterface } from './cli/CLIInterface';
import { LeitorLinhas } from './cli/LeitorLinhas';
import { PapelUsuario } from './types/enums';


const DIRETORIO_DADOS = process.env.GREENCODE_DATA_DIR ?? path.join(process.cwd(), 'data');


async function provisionarSistema(config: Config): Promise<void> {
  console.log('\n=== Provisionamento inicial do greencode ===');
  console.log('Nenhuma configuracao mestre encontrada. Vamos criar o primeiro administrador.\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const leitor = new LeitorLinhas(rl);

  const usuario = (await leitor.proximaLinha('Defina o usuario do administrador: ')).trim() || 'admin';
  const senha = (await leitor.proximaLinha('Defina a senha do administrador: ')).trim();
  rl.close();

  if (!senha || senha.length < 6) {
    console.error('A senha deve ter pelo menos 6 caracteres. Provisionamento abortado.');
    process.exit(1);
  }

  config.provisionar();
  const { chaveCriptografiaMestra } = config.carregar();

  const repositorio = new RepositorioArquivo(DIRETORIO_DADOS, chaveCriptografiaMestra);
  const journal = new JournalService(path.join(DIRETORIO_DADOS, 'journal'));
  const autenticacao = new ServicoAutenticacao(repositorio, journal);

  autenticacao.criarCredencial(usuario, senha, PapelUsuario.ADMINISTRADOR, 'SISTEMA');

  console.log(`\nAdministrador '${usuario}' criado com sucesso.`);
  console.log('Chave de criptografia mestra gerada e armazenada em config.mestre.json.');
  console.log('Provisionamento concluido. Reinicie o comando para efetuar login.\n');
}

async function main(): Promise<void> {
  const config = new Config(DIRETORIO_DADOS);

  if (!config.existeConfiguracao()) {
    await provisionarSistema(config);
    process.exit(0);
  }

  const { chaveCriptografiaMestra } = config.carregar();
  const repositorio = new RepositorioArquivo(DIRETORIO_DADOS, chaveCriptografiaMestra);
  const journal = new JournalService(path.join(DIRETORIO_DADOS, 'journal'));


  journal.aplicarPoliticaRetencao();

  const autenticacao = new ServicoAutenticacao(repositorio, journal);
  const organizacao = new ServicoOrganizacao(repositorio, journal);
  const lote = new ServicoLote(repositorio, journal);
  const equipamento = new ServicoEquipamento(repositorio, journal);
  const relatorio = new ServicoRelatorio(organizacao, lote, equipamento);

  const cli = new CLIInterface(DIRETORIO_DADOS, {
    autenticacao,
    organizacao,
    lote,
    equipamento,
    relatorio,
    journal,
    config,
  });


  await cli.iniciarLoop();
}

main().catch((erro) => {
  console.error('Erro fatal:', erro);
  process.exit(1);
});
