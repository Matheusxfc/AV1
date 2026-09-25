import { ServicoOrganizacao } from './ServicoOrganizacao';
import { ServicoLote } from './ServicoLote';
import { ServicoEquipamento } from './ServicoEquipamento';
import { StatusRastreamento } from '../types/enums';

export class ServicoRelatorio {
  constructor(
    private servicoOrganizacao: ServicoOrganizacao,
    private servicoLote: ServicoLote,
    private servicoEquipamento: ServicoEquipamento,
  ) {}

  gerarRelatorioPorOrganizacao(organizacaoId: string, periodo: { inicio: Date; fim: Date }): string {
    const organizacao = this.servicoOrganizacao.buscarOrganizacao(organizacaoId);
    if (!organizacao) {
      throw new Error(`Organizacao '${organizacaoId}' nao encontrada.`);
    }

    const lotes = this.servicoLote
      .consultarLotePorPeriodo(periodo.inicio, periodo.fim)
      .filter((l) => l.organizacaoId === organizacaoId);

    const totalEquipamentos = lotes.reduce((soma, l) => soma + l.equipamentoIds.length, 0);
    const pesoTotal = lotes.reduce((soma, l) => soma + this.servicoLote.calcularPesoTotal(l.id), 0);

    const linhas = [
      `Relatorio da organizacao: ${organizacao.razaoSocial} (${organizacao.id})`,
      `Periodo: ${periodo.inicio.toISOString().slice(0, 10)} a ${periodo.fim.toISOString().slice(0, 10)}`,
      `Lotes recebidos: ${lotes.length}`,
      `Total de equipamentos: ${totalEquipamentos}`,
      `Peso total (kg): ${pesoTotal.toFixed(2)}`,
      '',
      'Detalhamento por lote:',
      ...lotes.map(
        (l) =>
          `  - ${l.id} | NF ${l.notaFiscal} | ${l.equipamentoIds.length} equip. | status: ${l.statusProcessamento}`,
      ),
    ];

    return linhas.join('\n');
  }

  gerarRelatorioPorStatus(status: StatusRastreamento): string {
    const equipamentos = this.servicoEquipamento.listarTodos().filter((e) => e.statusRastreamento === status);

    const linhas = [
      `Relatorio de equipamentos por status: ${status}`,
      `Total encontrado: ${equipamentos.length}`,
      '',
      ...equipamentos.map(
        (e) => `  - ${e.codigoBarrasInterno} | ${e.tipo} | ${e.marca} ${e.modelo} | estado: ${e.estadoFisico}`,
      ),
    ];

    return linhas.join('\n');
  }

  gerarRelatorioFinanceiro(periodo: { inicio: Date; fim: Date }): string {
    const lotes = this.servicoLote.consultarLotePorPeriodo(periodo.inicio, periodo.fim);
    const organizacoesEnvolvidas = new Set(lotes.map((l) => l.organizacaoId));

    let receitaContratualEstimada = 0;
    for (const orgId of organizacoesEnvolvidas) {
      const org = this.servicoOrganizacao.buscarOrganizacao(orgId);
      if (org?.contratoVigenteId) {
        const contrato = this.servicoOrganizacao.buscarContrato(org.contratoVigenteId);
        if (contrato) receitaContratualEstimada += contrato.valorMensal;
      }
    }

    const pesoTotal = lotes.reduce((soma, l) => soma + this.servicoLote.calcularPesoTotal(l.id), 0);

    const linhas = [
      `Relatorio financeiro`,
      `Periodo: ${periodo.inicio.toISOString().slice(0, 10)} a ${periodo.fim.toISOString().slice(0, 10)}`,
      `Organizacoes ativas no periodo: ${organizacoesEnvolvidas.size}`,
      `Lotes processados: ${lotes.length}`,
      `Peso total recebido (kg): ${pesoTotal.toFixed(2)}`,
      `Receita contratual mensal estimada (organizacoes envolvidas): R$ ${receitaContratualEstimada.toFixed(2)}`,
    ];

    return linhas.join('\n');
  }
}
