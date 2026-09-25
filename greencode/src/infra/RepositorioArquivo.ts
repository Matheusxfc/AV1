import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { CriptografiaArquivo } from './CriptografiaArquivo';

export class RepositorioArquivo {
  private criptografia = new CriptografiaArquivo();

  constructor(private diretorioBase: string, private chaveHex: string) {
    if (!fs.existsSync(this.diretorioBase)) {
      fs.mkdirSync(this.diretorioBase, { recursive: true });
    }
  }

  private caminhoArquivo(nomeArquivo: string): string {
    return path.join(this.diretorioBase, `${nomeArquivo}.gce`);
  }

  private carregarColecao<T>(nomeArquivo: string): Record<string, T> {
    const caminho = this.caminhoArquivo(nomeArquivo);
    if (!fs.existsSync(caminho)) {
      return {};
    }
    const conteudoCifrado = fs.readFileSync(caminho, 'utf8');
    if (!conteudoCifrado.trim()) {
      return {};
    }
    const conteudoClaro = this.criptografia.decifrar(conteudoCifrado, this.chaveHex);
    return JSON.parse(conteudoClaro) as Record<string, T>;
  }

  /** Escrita atomica: grava em arquivo temporario unico e renomeia por cima do destino. */
  private salvarColecao<T>(nomeArquivo: string, colecao: Record<string, T>): void {
    const caminho = this.caminhoArquivo(nomeArquivo);
    const conteudoClaro = JSON.stringify(colecao, null, 2);
    const conteudoCifrado = this.criptografia.cifrar(conteudoClaro, this.chaveHex);

    const sufixo = crypto.randomBytes(6).toString('hex');
    const caminhoTemp = `${caminho}.${sufixo}.tmp`;

    fs.writeFileSync(caminhoTemp, conteudoCifrado, 'utf8');
    fs.renameSync(caminhoTemp, caminho); // operacao atomica no SO
  }

  salvarEntidade<T>(nomeArquivo: string, entidade: T & { id: string }): void {
    const colecao = this.carregarColecao<T>(nomeArquivo);
    colecao[entidade.id] = entidade;
    this.salvarColecao(nomeArquivo, colecao);
  }

  carregarEntidade<T>(nomeArquivo: string, id: string): T | null {
    const colecao = this.carregarColecao<T>(nomeArquivo);
    return colecao[id] ?? null;
  }

  listarEntidades<T>(nomeArquivo: string): T[] {
    const colecao = this.carregarColecao<T>(nomeArquivo);
    return Object.values(colecao);
  }

  excluirEntidade(nomeArquivo: string, id: string): void {
    const colecao = this.carregarColecao(nomeArquivo);
    delete colecao[id];
    this.salvarColecao(nomeArquivo, colecao);
  }
}
