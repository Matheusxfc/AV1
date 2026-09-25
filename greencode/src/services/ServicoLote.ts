import { RepositorioArquivo } from '../infra/RepositorioArquivo';
import { JournalService } from '../infra/JournalService';
import { ValidadorDataEntrada } from '../validators/ValidadorDataEntrada';
import { Lote, Equipamento } from '../models/types';
import { StatusLote, StatusRastreamento } from '../types/enums';
import { gerarId } from '../infra/Config';

const ARQUIVO_LOTES = 'lotes';
const ARQUIVO_EQUIPAMENTOS = 'equipamentos';

export interface DadosNovoLote {
  dataEntrada: string; // ISO
  organizacaoId: string;
  notaFiscal: string;
  transportadora: string;
  observacoes?: string;
}


export class ServicoLote {
  private validadorData = new ValidadorDataEntrada();

  constructor(
    private repositorio: RepositorioArquivo,
    private journal: JournalService,
  ) {}

  criarLote(dados: DadosNovoLote, responsavel: string): Lote {
    const data = new Date(dados.dataEntrada);
    if (!this.validadorData.validar(data)) {
      throw new Error(this.validadorData.obterMensagemErro());
    }

    const lote: Lote = {
      id: gerarId('lote'),
      dataEntrada: data.toISOString(),
      organizacaoId: dados.organizacaoId,
      notaFiscal: dados.notaFiscal,
      transportadora: dados.transportadora,
      equipamentoIds: [],
      statusProcessamento: StatusLote.RECEBIDO,
      observacoes: dados.observacoes ?? '',
    };

    this.repositorio.salvarEntidade(ARQUIVO_LOTES, lote);
    this.journal.registrar({
      operacao: 'CREATE',
      entidade: 'Lote',
      dadosAntes: null,
      dadosDepois: lote,
      usuarioResponsavel: responsavel,
    });

    return lote;
  }

  adicionarEquipamentoToLote(loteId: string, equipamento: Equipamento, responsavel: string): void {
    const lote = this.exigirLote(loteId);
    const antes = { ...lote };

    equipamento.loteId = loteId;
    equipamento.posicaoNoLote = lote.equipamentoIds.length + 1;
    this.repositorio.salvarEntidade(ARQUIVO_EQUIPAMENTOS, equipamento);

    lote.equipamentoIds.push(equipamento.id);
    this.repositorio.salvarEntidade(ARQUIVO_LOTES, lote);

    this.journal.registrar({
      operacao: 'UPDATE',
      entidade: 'Lote',
      dadosAntes: antes,
      dadosDepois: lote,
      usuarioResponsavel: responsavel,
    });
  }

  processarTriagem(loteId: string, responsavel: string): void {
    const lote = this.exigirLote(loteId);
    const antes = { ...lote };

    if (lote.equipamentoIds.length === 0) {
      throw new Error('Nao e possivel iniciar triagem de um lote sem equipamentos.');
    }

    lote.statusProcessamento = StatusLote.EM_TRIAGEM;
    this.repositorio.salvarEntidade(ARQUIVO_LOTES, lote);

    const equipamentos = lote.equipamentoIds
      .map((id) => this.repositorio.carregarEntidade<Equipamento>(ARQUIVO_EQUIPAMENTOS, id))
      .filter((e): e is Equipamento => e !== null);

    const todosTriados = equipamentos.every(
      (e) => e.statusRastreamento !== StatusRastreamento.AGUARDANDO_TRIAGEM,
    );

    if (todosTriados) {
      lote.statusProcessamento = StatusLote.TRIAGEM_CONCLUIDA;
      this.repositorio.salvarEntidade(ARQUIVO_LOTES, lote);
    }

    this.journal.registrar({
      operacao: 'UPDATE',
      entidade: 'Lote',
      dadosAntes: antes,
      dadosDepois: lote,
      usuarioResponsavel: responsavel,
    });
  }

  consultarLotePorPeriodo(dataInicio: Date, dataFim: Date): Lote[] {
    return this.repositorio
      .listarEntidades<Lote>(ARQUIVO_LOTES)
      .filter((l) => {
        const dataLote = new Date(l.dataEntrada).getTime();
        return dataLote >= dataInicio.getTime() && dataLote <= dataFim.getTime();
      });
  }

  listarTodos(): Lote[] {
    return this.repositorio.listarEntidades<Lote>(ARQUIVO_LOTES);
  }

  buscarLote(id: string): Lote | null {
    return this.repositorio.carregarEntidade<Lote>(ARQUIVO_LOTES, id);
  }

  calcularPesoTotal(loteId: string): number {
    const lote = this.exigirLote(loteId);
    return lote.equipamentoIds
      .map((id) => this.repositorio.carregarEntidade<Equipamento>(ARQUIVO_EQUIPAMENTOS, id))
      .filter((e): e is Equipamento => e !== null)
      .reduce((soma, e) => soma + e.pesoQuilogramas, 0);
  }

  private exigirLote(id: string): Lote {
    const lote = this.buscarLote(id);
    if (!lote) {
      throw new Error(`Lote '${id}' nao encontrado.`);
    }
    return lote;
  }
}
