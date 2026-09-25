import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { JournalTransacao as IJournalTransacao } from '../models/types';

export class JournalService {
  private static readonly RETENCAO_DIAS = 180;
  private static readonly TAMANHO_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

  private caminhoAtual: string;

  constructor(private diretorioJournal: string) {
    if (!fs.existsSync(diretorioJournal)) {
      fs.mkdirSync(diretorioJournal, { recursive: true });
    }
    this.caminhoAtual = path.join(diretorioJournal, 'journal.current.log');
  }

  /** registrar(): grava a transacao de forma imutavel (append-only). */
  registrar(dados: {
    operacao: string;
    entidade: string;
    dadosAntes: any;
    dadosDepois: any;
    usuarioResponsavel: string;
  }): IJournalTransacao {
    this.rotacionarSeNecessario();

    const transacao: IJournalTransacao = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      operacao: dados.operacao,
      entidade: dados.entidade,
      dadosAntes: dados.dadosAntes ?? null,
      dadosDepois: dados.dadosDepois ?? null,
      usuarioResponsavel: dados.usuarioResponsavel,
    };

    fs.appendFileSync(this.caminhoAtual, JSON.stringify(transacao) + '\n', 'utf8');
    return transacao;
  }

  /**
   * reverter(): funcionalidade de auditoria/replay. Como o journal e
   * imutavel (nao editamos entradas passadas), "reverter" aqui retorna
   * os dadosAntes da ultima transacao correspondente para que o
   * servico de negocio possa reaplicar o estado anterior. Retorna
   * booleano indicando se uma transacao reversivel foi encontrada.
   */
  buscarUltimaTransacao(entidade: string, idAlvo: string): IJournalTransacao | null {
    const todas = this.listarTodas();
    for (let i = todas.length - 1; i >= 0; i--) {
      const t = todas[i];
      if (t.entidade === entidade) {
        const idDepois = t.dadosDepois?.id;
        const idAntes = t.dadosAntes?.id;
        if (idDepois === idAlvo || idAntes === idAlvo) {
          return t;
        }
      }
    }
    return null;
  }

  listarTodas(): IJournalTransacao[] {
    const arquivos = this.listarArquivosJournal();
    const resultado: IJournalTransacao[] = [];
    for (const arquivo of arquivos) {
      const conteudo = fs.readFileSync(arquivo, 'utf8');
      for (const linha of conteudo.split('\n')) {
        if (!linha.trim()) continue;
        try {
          resultado.push(JSON.parse(linha));
        } catch {
          // linha corrompida: ignorada silenciosamente para nao interromper leitura
        }
      }
    }
    return resultado.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  listarPorUsuario(usuario: string): IJournalTransacao[] {
    return this.listarTodas().filter((t) => t.usuarioResponsavel === usuario);
  }

  /** Remove arquivos de journal ja rotacionados cujo periodo excede a retencao minima. */
  aplicarPoliticaRetencao(): number {
    const limite = new Date();
    limite.setDate(limite.getDate() - JournalService.RETENCAO_DIAS);

    let removidos = 0;
    const arquivos = fs
      .readdirSync(this.diretorioJournal)
      .filter((f: string) => f.startsWith('journal.') && f.endsWith('.log') && f !== 'journal.current.log');

    for (const arquivo of arquivos) {
      const caminhoCompleto = path.join(this.diretorioJournal, arquivo);
      const stat = fs.statSync(caminhoCompleto);
      if (stat.mtime < limite) {
        fs.unlinkSync(caminhoCompleto);
        removidos++;
      }
    }
    return removidos;
  }

  private listarArquivosJournal(): string[] {
    const arquivos = fs
      .readdirSync(this.diretorioJournal)
      .filter((f: string) => f.startsWith('journal.') && f.endsWith('.log'))
      .sort();
    return arquivos.map((f: string) => path.join(this.diretorioJournal, f));
  }

  private rotacionarSeNecessario(): void {
    if (!fs.existsSync(this.caminhoAtual)) return;
    const stat = fs.statSync(this.caminhoAtual);
    if (stat.size >= JournalService.TAMANHO_MAX_BYTES) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const novoNome = path.join(this.diretorioJournal, `journal.${timestamp}.log`);
      fs.renameSync(this.caminhoAtual, novoNome);
    }
  }
}
