import { RepositorioArquivo } from '../infra/RepositorioArquivo';
import { JournalService } from '../infra/JournalService';
import { ValidadorCNPJ } from '../validators/ValidadorCNPJ';
import { Organizacao, Contrato } from '../models/types';
import { gerarId } from '../infra/Config';

const ARQUIVO_ORGANIZACOES = 'organizacoes';
const ARQUIVO_CONTRATOS = 'contratos';

export interface DadosNovaOrganizacao {
  razaoSocial: string;
  cnpj: string;
  inscricaoEstadual?: string;
  enderecoCompleto?: string;
  telefone?: string;
  email?: string;
  contrato?: {
    dataVencimento: string;
    valorMensal: number;
    clausulas?: string[];
    renovacaoAutomatica?: boolean;
  };
}

export class ServicoOrganizacao {
  private validadorCNPJ = new ValidadorCNPJ();

  constructor(
    private repositorio: RepositorioArquivo,
    private journal: JournalService,
  ) {}

  cadastrarOrganizacao(dados: DadosNovaOrganizacao, responsavel: string): Organizacao {
    if (!this.validadorCNPJ.validar(dados.cnpj)) {
      throw new Error(this.validadorCNPJ.obterMensagemErro());
    }

    const cnpjLimpo = dados.cnpj.replace(/[^\d]/g, '');
    const duplicada = this.repositorio
      .listarEntidades<Organizacao>(ARQUIVO_ORGANIZACOES)
      .find((o) => o.cnpj === cnpjLimpo);
    if (duplicada) {
      throw new Error(`Ja existe organizacao cadastrada com o CNPJ ${ValidadorCNPJ.formatar(cnpjLimpo)}.`);
    }

    const organizacao: Organizacao = {
      id: gerarId('org'),
      razaoSocial: dados.razaoSocial,
      cnpj: cnpjLimpo,
      inscricaoEstadual: dados.inscricaoEstadual ?? '',
      enderecoCompleto: dados.enderecoCompleto ?? '',
      telefone: dados.telefone ?? '',
      email: dados.email ?? '',
      dataCadastro: new Date().toISOString(),
      ativo: true,
      contratoVigenteId: null,
    };

    this.repositorio.salvarEntidade(ARQUIVO_ORGANIZACOES, organizacao);
    this.journal.registrar({
      operacao: 'CREATE',
      entidade: 'Organizacao',
      dadosAntes: null,
      dadosDepois: organizacao,
      usuarioResponsavel: responsavel,
    });

    if (dados.contrato) {
      const contrato = this.criarContrato(organizacao.id, dados.contrato, responsavel);
      organizacao.contratoVigenteId = contrato.id;
      this.repositorio.salvarEntidade(ARQUIVO_ORGANIZACOES, organizacao);
    }

    return organizacao;
  }

  buscarOrganizacao(id: string): Organizacao | null {
    return this.repositorio.carregarEntidade<Organizacao>(ARQUIVO_ORGANIZACOES, id);
  }

  listarOrganizacoesAtivas(): Organizacao[] {
    return this.repositorio
      .listarEntidades<Organizacao>(ARQUIVO_ORGANIZACOES)
      .filter((o) => o.ativo);
  }

  listarTodasOrganizacoes(): Organizacao[] {
    return this.repositorio.listarEntidades<Organizacao>(ARQUIVO_ORGANIZACOES);
  }

  alterarEndereco(id: string, novoEndereco: string, responsavel: string): Organizacao {
    const org = this.exigirOrganizacao(id);
    const antes = { ...org };
    org.enderecoCompleto = novoEndereco;
    this.repositorio.salvarEntidade(ARQUIVO_ORGANIZACOES, org);
    this.journal.registrar({
      operacao: 'UPDATE',
      entidade: 'Organizacao',
      dadosAntes: antes,
      dadosDepois: org,
      usuarioResponsavel: responsavel,
    });
    return org;
  }

  desativar(id: string, responsavel: string): void {
    const org = this.exigirOrganizacao(id);
    const antes = { ...org };
    org.ativo = false;
    this.repositorio.salvarEntidade(ARQUIVO_ORGANIZACOES, org);
    this.journal.registrar({
      operacao: 'UPDATE',
      entidade: 'Organizacao',
      dadosAntes: antes,
      dadosDepois: org,
      usuarioResponsavel: responsavel,
    });
  }


  criarContrato(
    organizacaoId: string,
    dados: { dataVencimento: string; valorMensal: number; clausulas?: string[]; renovacaoAutomatica?: boolean },
    responsavel: string,
  ): Contrato {
    this.exigirOrganizacao(organizacaoId);

    const contrato: Contrato = {
      id: gerarId('ctr'),
      organizacaoId,
      dataAssinatura: new Date().toISOString(),
      dataVencimento: dados.dataVencimento,
      clausulas: dados.clausulas ?? [],
      valorMensal: dados.valorMensal,
      renovacaoAutomatica: dados.renovacaoAutomatica ?? false,
    };

    this.repositorio.salvarEntidade(ARQUIVO_CONTRATOS, contrato);
    this.journal.registrar({
      operacao: 'CREATE',
      entidade: 'Contrato',
      dadosAntes: null,
      dadosDepois: contrato,
      usuarioResponsavel: responsavel,
    });

    return contrato;
  }

  renovarContrato(organizacaoId: string, novoVencimento: string, responsavel: string): Contrato {
    const org = this.exigirOrganizacao(organizacaoId);
    if (!org.contratoVigenteId) {
      throw new Error('Organizacao nao possui contrato vigente para renovar.');
    }
    const contrato = this.repositorio.carregarEntidade<Contrato>(ARQUIVO_CONTRATOS, org.contratoVigenteId);
    if (!contrato) {
      throw new Error('Contrato vigente nao encontrado.');
    }
    const antes = { ...contrato };
    contrato.dataVencimento = novoVencimento;
    this.repositorio.salvarEntidade(ARQUIVO_CONTRATOS, contrato);

    this.journal.registrar({
      operacao: 'UPDATE',
      entidade: 'Contrato',
      dadosAntes: antes,
      dadosDepois: contrato,
      usuarioResponsavel: responsavel,
    });

    return contrato;
  }

  buscarContrato(id: string): Contrato | null {
    return this.repositorio.carregarEntidade<Contrato>(ARQUIVO_CONTRATOS, id);
  }

  estaVigente(contrato: Contrato): boolean {
    return new Date(contrato.dataVencimento).getTime() >= Date.now();
  }

  private exigirOrganizacao(id: string): Organizacao {
    const org = this.buscarOrganizacao(id);
    if (!org) {
      throw new Error(`Organizacao '${id}' nao encontrada.`);
    }
    return org;
  }
}
