import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import { ServicoAutenticacao } from '../services/ServicoAutenticacao';
import { ServicoOrganizacao } from '../services/ServicoOrganizacao';
import { ServicoLote } from '../services/ServicoLote';
import { ServicoEquipamento } from '../services/ServicoEquipamento';
import { ServicoRelatorio } from '../services/ServicoRelatorio';
import { JournalService } from '../infra/JournalService';
import { Config } from '../infra/Config';
import { Sessao } from '../models/types';
import { PapelUsuario, EstadoFisico, StatusRastreamento, TipoEquipamento, Severidade } from '../types/enums';
import { obterMenuPorPapel, recursosPermitidos } from './menu';
import { parseComando } from './parseArgs';
import { LeitorLinhas } from './LeitorLinhas';

const CORES: Record<Severidade, string> = {
  [Severidade.SUCESSO]: '\x1b[32m', // verde
  [Severidade.INFO]: '\x1b[36m', // ciano
  [Severidade.AVISO]: '\x1b[33m', // amarelo
  [Severidade.ERRO]: '\x1b[31m', // vermelho
};
const RESET = '\x1b[0m';

const TODOS_OS_COMANDOS_BASE = [
  'usuario criar', 'usuario listar',
  'config atualizar',
  'org criar', 'org listar', 'org endereco',
  'contrato criar', 'contrato renovar',
  'lote criar', 'lote listar', 'lote triagem',
  'equip adicionar', 'equip estado', 'equip status', 'equip movimentar', 'equip rastrear',
  'relatorio org', 'relatorio status', 'relatorio financeiro',
  'journal listar',
  'senha alterar', 'ajuda', 'sair',
];

export class CLIInterface {
  private rl!: readline.Interface;
  private leitor!: LeitorLinhas;
  private sessaoAtual: Sessao | null = null;
  private diretorioDados: string;
  private arquivoHistorico: string;

  private autenticacao: ServicoAutenticacao;
  private organizacao: ServicoOrganizacao;
  private lote: ServicoLote;
  private equipamento: ServicoEquipamento;
  private relatorio: ServicoRelatorio;
  private journal: JournalService;
  private config: Config;

  constructor(diretorioDados: string, repositorio: {
    autenticacao: ServicoAutenticacao;
    organizacao: ServicoOrganizacao;
    lote: ServicoLote;
    equipamento: ServicoEquipamento;
    relatorio: ServicoRelatorio;
    journal: JournalService;
    config: Config;
  }) {
    this.diretorioDados = diretorioDados;
    this.arquivoHistorico = path.join(diretorioDados, '.greencode_history');
    this.autenticacao = repositorio.autenticacao;
    this.organizacao = repositorio.organizacao;
    this.lote = repositorio.lote;
    this.equipamento = repositorio.equipamento;
    this.relatorio = repositorio.relatorio;
    this.journal = repositorio.journal;
    this.config = repositorio.config;
  }

  async iniciarLoop(): Promise<void> {
    const historico = this.carregarHistorico();

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      history: historico.reverse(),
      historySize: 500,
      completer: (linha: string) => this.completar(linha),
      prompt: '',
    });
    this.leitor = new LeitorLinhas(this.rl);

    this.rl.on('close', () => {
      this.salvarHistorico();
      console.log('\nAte logo!');
      process.exit(0);
    });

    if (!(await this.autenticar())) {
      this.rl.close();
      return;
    }

    this.imprimir(Severidade.SUCESSO, `Bem-vindo(a), ${this.sessaoAtual!.usuario} [${this.sessaoAtual!.papel}]`);
    this.exibirMenuPorPapel(this.sessaoAtual!.papel);
    this.definirPrompt();
    this.rl.prompt();

    while (true) {
      const linha = await this.leitor.proximaLinha();
      await this.processarComando(linha);
    }
  }


  private async autenticar(): Promise<boolean> {
    for (let tentativas = 0; tentativas < 3; tentativas++) {
      const usuario = await this.perguntar('Usuario: ');
      const senha = await this.perguntarSenha('Senha: ');

      const sessao = this.autenticacao.login(usuario.trim(), senha);
      if (sessao) {
        this.sessaoAtual = sessao;
        return true;
      }
      this.imprimir(Severidade.ERRO, 'Usuario ou senha invalidos.');
    }
    this.imprimir(Severidade.ERRO, 'Numero maximo de tentativas excedido. Encerrando.');
    return false;
  }

  private perguntar(pergunta: string): Promise<string> {
    return this.leitor.proximaLinha(pergunta);
  }

  
  private perguntarSenha(pergunta: string): Promise<string> {
    const rlInterno = this.rl as unknown as { _writeToOutput?: (texto: string) => void; output: NodeJS.WritableStream };

    if (!process.stdin.isTTY || typeof rlInterno._writeToOutput !== 'function') {
      return this.leitor.proximaLinha(pergunta);
    }

    const escreverOriginal = rlInterno._writeToOutput.bind(rlInterno);
    rlInterno._writeToOutput = (textoEscrito: string) => {
      if (textoEscrito === '\r\n' || textoEscrito === '\n' || textoEscrito === pergunta) {
        escreverOriginal(textoEscrito);
      } else {
        rlInterno.output.write('*'.repeat(textoEscrito.length));
      }
    };

    return this.leitor.proximaLinha(pergunta).finally(() => {
      rlInterno._writeToOutput = escreverOriginal;
    });
  }

  

  exibirMenuPorPapel(papel: PapelUsuario): void {
    console.log('\n===== Comandos disponiveis =====');
    for (const item of obterMenuPorPapel(papel)) {
      console.log(`  ${item.comando.padEnd(70)} ${item.descricao}`);
    }
    console.log('=================================\n');
  }

  private completar(linha: string): [string[], string] {
    const permitidos = this.sessaoAtual
      ? TODOS_OS_COMANDOS_BASE.filter((c) => recursosPermitidos(this.sessaoAtual!.papel).includes(c.split(' ')[0]))
      : TODOS_OS_COMANDOS_BASE;
    const opcoes = permitidos.filter((c) => c.startsWith(linha));
    return [opcoes.length ? opcoes : permitidos, linha];
  }

  private definirPrompt(): void {
    this.rl.setPrompt(`greencode(${this.sessaoAtual?.papel ?? '...'})> `);
  }

  async processarComando(entrada: string): Promise<void> {
    const linha = entrada.trim();
    if (!linha) {
      this.rl.prompt();
      return;
    }

    if (!this.sessaoAtual || !this.autenticacao.validarToken(this.sessaoAtual.token)) {
      this.imprimir(Severidade.ERRO, 'Sessao expirada por inatividade. Encerrando.');
      this.rl.close();
      return;
    }
    this.sessaoAtual = this.autenticacao.renovar(this.sessaoAtual.token);

    const comando = parseComando(linha);
    if (!comando) {
      this.rl.prompt();
      return;
    }

    if (comando.recurso === 'sair') {
      this.autenticacao.logout(this.sessaoAtual.token);
      this.rl.close();
      return;
    }

    if (comando.recurso === 'ajuda') {
      this.exibirMenuPorPapel(this.sessaoAtual.papel);
      this.rl.prompt();
      return;
    }

    if (!recursosPermitidos(this.sessaoAtual.papel).includes(comando.recurso)) {
      this.imprimir(Severidade.ERRO, `Papel '${this.sessaoAtual.papel}' nao possui permissao para '${comando.recurso}'.`);
      this.rl.prompt();
      return;
    }

    try {
      this.despachar(comando.recurso, comando.acao, comando.flags);
    } catch (erro: any) {
      this.imprimir(Severidade.ERRO, erro?.message ?? String(erro));
    }

    this.rl.prompt();
  }

  private despachar(recurso: string, acao: string, flags: Record<string, string>): void {
    const usuario = this.sessaoAtual!.usuario;
    const papel = this.sessaoAtual!.papel;

    switch (`${recurso}.${acao}`) {

      case 'usuario.criar': {
        this.exigirPapel(papel, [PapelUsuario.ADMINISTRADOR]);
        const cred = this.autenticacao.criarCredencial(
          flags.user,
          flags.senha,
          flags.papel as PapelUsuario,
          usuario,
        );
        this.imprimir(Severidade.SUCESSO, `Usuario '${cred.usuario}' criado com papel ${cred.papel}.`);
        return;
      }
      case 'usuario.listar': {
        this.exigirPapel(papel, [PapelUsuario.ADMINISTRADOR]);
        const lista = this.autenticacao.listarCredenciais();
        lista.forEach((c) => console.log(`  ${c.usuario.padEnd(20)} ${c.papel.padEnd(22)} ultimo acesso: ${c.ultimoAcesso}`));
        this.imprimir(Severidade.INFO, `${lista.length} usuario(s) encontrado(s).`);
        return;
      }

      
      case 'config.atualizar': {
        this.exigirPapel(papel, [PapelUsuario.ADMINISTRADOR]);
        const atualizado = this.config.atualizarParametros({
          aliquotaImpostoPadrao: flags.aliquota ? Number(flags.aliquota) : undefined,
          coeficienteDepreciacaoAnual: flags.deprec ? Number(flags.deprec) : undefined,
        });
        this.imprimir(Severidade.SUCESSO, `Parametros atualizados: aliquota=${atualizado.aliquotaImpostoPadrao}, depreciacao=${atualizado.coeficienteDepreciacaoAnual}`);
        return;
      }

      
      case 'org.criar': {
        const org = this.organizacao.cadastrarOrganizacao(
          {
            razaoSocial: flags.razao,
            cnpj: flags.cnpj,
            telefone: flags.tel,
            email: flags.email,
            enderecoCompleto: flags.endereco,
          },
          usuario,
        );
        this.imprimir(Severidade.SUCESSO, `Organizacao criada: ${org.id} (${org.razaoSocial})`);
        return;
      }
      case 'org.listar': {
        const orgs = this.organizacao.listarOrganizacoesAtivas();
        orgs.forEach((o) => console.log(`  ${o.id.padEnd(14)} ${o.razaoSocial.padEnd(30)} CNPJ ${o.cnpj}`));
        this.imprimir(Severidade.INFO, `${orgs.length} organizacao(oes) ativa(s).`);
        return;
      }
      case 'org.endereco': {
        const org = this.organizacao.alterarEndereco(flags.org, flags.novo, usuario);
        this.imprimir(Severidade.SUCESSO, `Endereco de ${org.id} atualizado.`);
        return;
      }

     
      case 'contrato.criar': {
        const contrato = this.organizacao.criarContrato(
          flags.org,
          { dataVencimento: flags.venc, valorMensal: Number(flags.valor) },
          usuario,
        );
        this.imprimir(Severidade.SUCESSO, `Contrato criado: ${contrato.id}`);
        return;
      }
      case 'contrato.renovar': {
        const contrato = this.organizacao.renovarContrato(flags.org, flags.venc, usuario);
        this.imprimir(Severidade.SUCESSO, `Contrato ${contrato.id} renovado ate ${contrato.dataVencimento}.`);
        return;
      }

      
      case 'lote.criar': {
        const novo = this.lote.criarLote(
          {
            dataEntrada: flags.data,
            organizacaoId: flags.org,
            notaFiscal: flags.nf,
            transportadora: flags.transp,
          },
          usuario,
        );
        this.imprimir(Severidade.SUCESSO, `Lote criado: ${novo.id}`);
        return;
      }
      case 'lote.listar': {
        const lotes = this.lote.listarTodos();
        lotes.forEach((l: any) => console.log(`  ${l.id.padEnd(14)} org:${l.organizacaoId.padEnd(12)} status:${l.statusProcessamento.padEnd(18)} equip:${l.equipamentoIds.length}`));
        this.imprimir(Severidade.INFO, `${lotes.length} lote(s) encontrado(s).`);
        return;
      }
      case 'lote.triagem': {
        this.lote.processarTriagem(flags.lote, usuario);
        this.imprimir(Severidade.SUCESSO, `Triagem processada para o lote ${flags.lote}.`);
        return;
      }

      
      case 'equip.adicionar': {
        this.exigirPapel(papel, [PapelUsuario.GESTOR_ALMOXARIFADO, PapelUsuario.ADMINISTRADOR]);
        const equipamento = this.equipamento.criarEquipamento({
          tipo: flags.tipo as TipoEquipamento,
          marca: flags.marca,
          modelo: flags.modelo,
          anoFabricacao: Number(flags.ano),
          estadoFisico: flags.estado as EstadoFisico,
          pesoQuilogramas: Number(flags.peso),
        });
        this.lote.adicionarEquipamentoToLote(flags.lote, equipamento, usuario);
        this.imprimir(Severidade.SUCESSO, `Equipamento ${equipamento.codigoBarrasInterno} adicionado ao lote ${flags.lote}.`);
        return;
      }
      case 'equip.estado': {
        const atualizado = this.equipamento.atualizarEstadoFisico(flags.id, flags.novo as EstadoFisico, flags.justificativa, usuario);
        this.imprimir(Severidade.SUCESSO, `Estado fisico de ${atualizado.codigoBarrasInterno} atualizado para ${atualizado.estadoFisico}.`);
        return;
      }
      case 'equip.status': {
        const atualizado = this.equipamento.atualizarStatus(flags.id, flags.novo as StatusRastreamento, flags.justificativa, usuario);
        this.imprimir(Severidade.SUCESSO, `Status de ${atualizado.codigoBarrasInterno} atualizado para ${atualizado.statusRastreamento}.`);
        return;
      }
      case 'equip.movimentar': {
        const mov = this.equipamento.registrarMovimentacao(flags.id, flags.destino, usuario, flags.obs ?? '');
        this.imprimir(Severidade.SUCESSO, `Movimentacao ${mov.id} registrada (destino: ${mov.destino}).`);
        return;
      }
      case 'equip.rastrear': {
        const { equipamento, historicoMovimentacao } = this.equipamento.rastrearEquipamento(flags.id);
        console.log(`Equipamento: ${equipamento.codigoBarrasInterno} | ${equipamento.tipo} ${equipamento.marca} ${equipamento.modelo}`);
        console.log(`Estado fisico atual: ${equipamento.estadoFisico} | Status: ${equipamento.statusRastreamento}`);
        console.log('Historico de movimentacoes:');
        historicoMovimentacao.forEach((m) => console.log(`  ${m.dataHora} | ${m.origem} -> ${m.destino} | resp: ${m.responsavel} | ${m.observacao}`));
        this.imprimir(Severidade.INFO, `${historicoMovimentacao.length} movimentacao(oes) encontrada(s).`);
        return;
      }

      case 'relatorio.org': {
        const texto = this.relatorio.gerarRelatorioPorOrganizacao(flags.org, {
          inicio: new Date(flags.inicio),
          fim: new Date(flags.fim),
        });
        console.log(texto);
        return;
      }
      case 'relatorio.status': {
        console.log(this.relatorio.gerarRelatorioPorStatus(flags.status as StatusRastreamento));
        return;
      }
      case 'relatorio.financeiro': {
        this.exigirPapel(papel, [PapelUsuario.AUDITOR, PapelUsuario.ADMINISTRADOR]);
        console.log(this.relatorio.gerarRelatorioFinanceiro({ inicio: new Date(flags.inicio), fim: new Date(flags.fim) }));
        return;
      }

     
      case 'journal.listar': {
        this.exigirPapel(papel, [PapelUsuario.AUDITOR, PapelUsuario.ADMINISTRADOR]);
        const transacoes = this.journal.listarTodas();
        transacoes.slice(-50).forEach((t) => console.log(`  ${t.timestamp} | ${t.operacao.padEnd(8)} | ${t.entidade.padEnd(14)} | por: ${t.usuarioResponsavel}`));
        this.imprimir(Severidade.INFO, `Exibindo as ultimas ${Math.min(50, transacoes.length)} de ${transacoes.length} transacao(oes).`);
        return;
      }

     
      case 'senha.alterar': {
        const ok = this.autenticacao.alterarSenha(usuario, flags.antiga, flags.nova);
        if (ok) this.imprimir(Severidade.SUCESSO, 'Senha alterada com sucesso.');
        else this.imprimir(Severidade.ERRO, 'Senha antiga incorreta.');
        return;
      }

      default:
        this.imprimir(Severidade.ERRO, `Comando desconhecido: '${recurso} ${acao}'. Digite 'ajuda' para ver as opcoes.`);
    }
  }

  private exigirPapel(papelAtual: PapelUsuario, papeisPermitidos: PapelUsuario[]): void {
    if (!papeisPermitidos.includes(papelAtual)) {
      throw new Error(`Operacao restrita aos papeis: ${papeisPermitidos.join(', ')}.`);
    }
  }

  private imprimir(severidade: Severidade, mensagem: string): void {
    const cor = CORES[severidade] ?? '';
    console.log(`${cor}[${severidade}]${RESET} ${mensagem}`);
  }

 

  private carregarHistorico(): string[] {
    if (!fs.existsSync(this.arquivoHistorico)) return [];
    return fs
      .readFileSync(this.arquivoHistorico, 'utf8')
      .split('\n')
      .filter((l: string) => l.trim().length > 0);
  }

  private salvarHistorico(): void {
    const historico = ((this.rl as any).history as string[]) ?? [];
    fs.writeFileSync(this.arquivoHistorico, historico.slice(0, 500).reverse().join('\n'), 'utf8');
  }
}
