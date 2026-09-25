import { RepositorioArquivo } from '../infra/RepositorioArquivo';
import { JournalService } from '../infra/JournalService';
import { Equipamento, Movimentacao } from '../models/types';
import { EstadoFisico, StatusRastreamento, TipoEquipamento } from '../types/enums';
import { gerarId } from '../infra/Config';

const ARQUIVO_EQUIPAMENTOS = 'equipamentos';
const ARQUIVO_MOVIMENTACOES = 'movimentacoes';


const ORDEM_ESTADO: EstadoFisico[] = [
  EstadoFisico.NOVO,
  EstadoFisico.BOM_ESTADO,
  EstadoFisico.USADO_LEVE,
  EstadoFisico.USADO_MODERADO,
  EstadoFisico.DANIFICADO_LEVE,
  EstadoFisico.DANIFICADO_GRAVE,
  EstadoFisico.INSERVIVEL,
];

const PREFIXO_TIPO: Record<TipoEquipamento, string> = {
  [TipoEquipamento.COMPUTADOR_MESA]: 'CPU',
  [TipoEquipamento.NOTEBOOK]: 'NTB',
  [TipoEquipamento.MONITOR]: 'MON',
  [TipoEquipamento.IMPRESSORA]: 'IMP',
  [TipoEquipamento.SERVIDOR]: 'SRV',
  [TipoEquipamento.ROTEADOR]: 'RTD',
  [TipoEquipamento.CABO_ESTRUTURADO]: 'CAB',
  [TipoEquipamento.FONTE_ALIMENTACAO]: 'FNT',
};

export interface DadosNovoEquipamento {
  tipo: TipoEquipamento;
  marca: string;
  modelo: string;
  anoFabricacao: number;
  estadoFisico: EstadoFisico;
  pesoQuilogramas: number;
}


export class ServicoEquipamento {
  private contadorSequencia = 0;

  constructor(
    private repositorio: RepositorioArquivo,
    private journal: JournalService,
  ) {}

  criarEquipamento(dados: DadosNovoEquipamento): Equipamento {
    const sequencia = this.repositorio.listarEntidades<Equipamento>(ARQUIVO_EQUIPAMENTOS).length + 1;
    const equipamento: Equipamento = {
      id: gerarId('equip'),
      codigoBarrasInterno: this.gerarCodigoBarras(dados.tipo, sequencia),
      tipo: dados.tipo,
      marca: dados.marca,
      modelo: dados.modelo,
      anoFabricacao: dados.anoFabricacao,
      estadoFisico: dados.estadoFisico,
      pesoQuilogramas: dados.pesoQuilogramas,
      loteId: '',
      posicaoNoLote: 0,
      statusRastreamento: StatusRastreamento.AGUARDANDO_TRIAGEM,
      historicoMovimentacaoIds: [],
    };

    return equipamento;
  }

  gerarCodigoBarras(tipo: TipoEquipamento, sequencia: number): string {
    const prefixo = PREFIXO_TIPO[tipo] ?? 'EQP';
    const ano = new Date().getFullYear();
    return `${prefixo}-${ano}-${String(sequencia).padStart(6, '0')}`;
  }

  rastrearEquipamento(id: string): {
    equipamento: Equipamento;
    historicoMovimentacao: Movimentacao[];
  } {
    const equipamento = this.exigirEquipamento(id);
    const historico = equipamento.historicoMovimentacaoIds
      .map((mid) => this.repositorio.carregarEntidade<Movimentacao>(ARQUIVO_MOVIMENTACOES, mid))
      .filter((m): m is Movimentacao => m !== null)
      .sort((a, b) => a.dataHora.localeCompare(b.dataHora));

    return { equipamento, historicoMovimentacao: historico };
  }


  atualizarEstadoFisico(
    id: string,
    novoEstado: EstadoFisico,
    justificativa: string | undefined,
    responsavel: string,
  ): Equipamento {
    const equipamento = this.exigirEquipamento(id);
    const antes = { ...equipamento };

    const indiceAtual = ORDEM_ESTADO.indexOf(equipamento.estadoFisico);
    const indiceNovo = ORDEM_ESTADO.indexOf(novoEstado);
    const quedaCategoria = indiceNovo - indiceAtual;

    if (quedaCategoria >= 2 && (!justificativa || justificativa.trim().length === 0)) {
      throw new Error(
        `Justificativa obrigatoria: o estado caiu ${quedaCategoria} categorias ` +
          `(${equipamento.estadoFisico} -> ${novoEstado}).`,
      );
    }

    equipamento.estadoFisico = novoEstado;
    this.repositorio.salvarEntidade(ARQUIVO_EQUIPAMENTOS, equipamento);

    this.journal.registrar({
      operacao: 'UPDATE',
      entidade: 'Equipamento',
      dadosAntes: antes,
      dadosDepois: { ...equipamento, justificativa: justificativa ?? null },
      usuarioResponsavel: responsavel,
    });

    return equipamento;
  }

  atualizarStatus(id: string, novoStatus: StatusRastreamento, justificativa: string, responsavel: string): Equipamento {
    const equipamento = this.exigirEquipamento(id);
    const antes = { ...equipamento };

    if (novoStatus === StatusRastreamento.EM_DESMONTE) {
      const statusPermitidos: StatusRastreamento[] = [StatusRastreamento.AGUARDANDO_DESMONTE];
      if (!statusPermitidos.includes(equipamento.statusRastreamento)) {
        throw new Error(
          'Equipamento so pode ser movido para EM_DESMONTE apos triagem completa ' +
            `(status atual: ${equipamento.statusRastreamento}).`,
        );
      }
    }

    equipamento.statusRastreamento = novoStatus;
    this.repositorio.salvarEntidade(ARQUIVO_EQUIPAMENTOS, equipamento);

    this.journal.registrar({
      operacao: 'UPDATE',
      entidade: 'Equipamento',
      dadosAntes: antes,
      dadosDepois: { ...equipamento, justificativa },
      usuarioResponsavel: responsavel,
    });

    return equipamento;
  }

  registrarMovimentacao(
    equipamentoId: string,
    destino: string,
    responsavel: string,
    observacao = '',
  ): Movimentacao {
    const equipamento = this.exigirEquipamento(equipamentoId);

    const movimentacao: Movimentacao = {
      id: gerarId('mov'),
      equipamentoId,
      dataHora: new Date().toISOString(),
      origem: equipamento.statusRastreamento,
      destino,
      responsavel,
      observacao,
    };

    this.repositorio.salvarEntidade(ARQUIVO_MOVIMENTACOES, movimentacao);

    equipamento.historicoMovimentacaoIds.push(movimentacao.id);
    this.repositorio.salvarEntidade(ARQUIVO_EQUIPAMENTOS, equipamento);

    this.journal.registrar({
      operacao: 'CREATE',
      entidade: 'Movimentacao',
      dadosAntes: null,
      dadosDepois: movimentacao,
      usuarioResponsavel: responsavel,
    });

    return movimentacao;
  }

  calcularDepreciacao(id: string, coeficienteAnual: number, valorOriginal: number): number {
    const equipamento = this.exigirEquipamento(id);
    const idadeAnos = Math.max(0, new Date().getFullYear() - equipamento.anoFabricacao);
    const fatorRestante = Math.max(0, 1 - coeficienteAnual * idadeAnos);
    return Number((valorOriginal * fatorRestante).toFixed(2));
  }

  listarTodos(): Equipamento[] {
    return this.repositorio.listarEntidades<Equipamento>(ARQUIVO_EQUIPAMENTOS);
  }

  buscarEquipamento(id: string): Equipamento | null {
    return this.repositorio.carregarEntidade<Equipamento>(ARQUIVO_EQUIPAMENTOS, id);
  }

  private exigirEquipamento(id: string): Equipamento {
    const equipamento = this.buscarEquipamento(id);
    if (!equipamento) {
      throw new Error(`Equipamento '${id}' nao encontrado.`);
    }
    return equipamento;
  }
}
