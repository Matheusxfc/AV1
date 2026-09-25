import * as crypto from 'crypto';
import { Autenticavel } from '../interfaces/Autenticavel';
import { RepositorioArquivo } from '../infra/RepositorioArquivo';
import { JournalService } from '../infra/JournalService';
import { Credencial, Sessao } from '../models/types';
import { PapelUsuario } from '../types/enums';

const ARQUIVO_CREDENCIAIS = 'credenciais';
const ARQUIVO_SESSOES = 'sessoes';
const MINUTOS_EXPIRACAO_SESSAO = 30;


export class ServicoAutenticacao implements Autenticavel {
  private sessaoEmMemoria: Sessao | null = null;

  constructor(
    private repositorio: RepositorioArquivo,
    private journal: JournalService,
  ) {}

  
  autenticar(usuario: string, senha: string): boolean {
    const sessao = this.login(usuario, senha);
    return sessao !== null;
  }

  renovarToken(): string {
    if (!this.sessaoEmMemoria) {
      throw new Error('Nenhuma sessao ativa para renovar.');
    }
    return this.renovar(this.sessaoEmMemoria.token).token;
  }



  criarCredencial(usuario: string, senha: string, papel: PapelUsuario, responsavel: string): Credencial {
    const existente = this.repositorio.carregarEntidade<Credencial>(ARQUIVO_CREDENCIAIS, usuario);
    if (existente) {
      throw new Error(`Usuario '${usuario}' ja possui credencial cadastrada.`);
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const credencial: Credencial = {
      usuario,
      hashSenha: this.calcularHash(senha, salt),
      salt,
      ultimoAcesso: new Date().toISOString(),
      papel,
    };

    this.repositorio.salvarEntidade(ARQUIVO_CREDENCIAIS, { ...credencial, id: usuario } as any);
    this.journal.registrar({
      operacao: 'CREATE',
      entidade: 'Credencial',
      dadosAntes: null,
      dadosDepois: { usuario, papel },
      usuarioResponsavel: responsavel,
    });
    return credencial;
  }

  listarCredenciais(): Credencial[] {
    return this.repositorio.listarEntidades<Credencial>(ARQUIVO_CREDENCIAIS);
  }

 

  login(usuario: string, senha: string): Sessao | null {
    const credencial = this.repositorio.carregarEntidade<Credencial>(ARQUIVO_CREDENCIAIS, usuario);
    if (!credencial) {
      return null;
    }

    const hashInformado = this.calcularHash(senha, credencial.salt);
    if (hashInformado !== credencial.hashSenha) {
      return null;
    }

    credencial.ultimoAcesso = new Date().toISOString();
    this.repositorio.salvarEntidade(ARQUIVO_CREDENCIAIS, { ...credencial, id: usuario } as any);

    const agora = new Date();
    const expiracao = new Date(agora.getTime() + MINUTOS_EXPIRACAO_SESSAO * 60 * 1000);

    const sessao: Sessao = {
      token: crypto.randomUUID(),
      usuario,
      papel: credencial.papel,
      criacao: agora.toISOString(),
      expiracao: expiracao.toISOString(),
    };

    this.repositorio.salvarEntidade(ARQUIVO_SESSOES, { ...sessao, id: sessao.token } as any);
    this.sessaoEmMemoria = sessao;

    this.journal.registrar({
      operacao: 'LOGIN',
      entidade: 'Sessao',
      dadosAntes: null,
      dadosDepois: { usuario, token: sessao.token },
      usuarioResponsavel: usuario,
    });

    return sessao;
  }

  logout(token: string): void {
    const sessao = this.repositorio.carregarEntidade<Sessao>(ARQUIVO_SESSOES, token);
    this.repositorio.excluirEntidade(ARQUIVO_SESSOES, token);
    if (this.sessaoEmMemoria?.token === token) {
      this.sessaoEmMemoria = null;
    }
    this.journal.registrar({
      operacao: 'LOGOUT',
      entidade: 'Sessao',
      dadosAntes: sessao,
      dadosDepois: null,
      usuarioResponsavel: sessao?.usuario ?? 'desconhecido',
    });
  }

  
  validarToken(token: string): boolean {
    const sessao = this.repositorio.carregarEntidade<Sessao>(ARQUIVO_SESSOES, token);
    if (!sessao) return false;
    return new Date(sessao.expiracao).getTime() > Date.now();
  }

  obterSessao(token: string): Sessao | null {
    if (!this.validarToken(token)) return null;
    return this.repositorio.carregarEntidade<Sessao>(ARQUIVO_SESSOES, token);
  }


  renovar(token: string): Sessao {
    const sessao = this.repositorio.carregarEntidade<Sessao>(ARQUIVO_SESSOES, token);
    if (!sessao || !this.validarToken(token)) {
      throw new Error('Sessao invalida ou expirada. Faca login novamente.');
    }
    sessao.expiracao = new Date(Date.now() + MINUTOS_EXPIRACAO_SESSAO * 60 * 1000).toISOString();
    this.repositorio.salvarEntidade(ARQUIVO_SESSOES, { ...sessao, id: sessao.token } as any);
    this.sessaoEmMemoria = sessao;
    return sessao;
  }

  alterarSenha(usuario: string, senhaAntiga: string, senhaNova: string): boolean {
    const credencial = this.repositorio.carregarEntidade<Credencial>(ARQUIVO_CREDENCIAIS, usuario);
    if (!credencial) return false;

    if (this.calcularHash(senhaAntiga, credencial.salt) !== credencial.hashSenha) {
      return false;
    }

    const novoSalt = crypto.randomBytes(16).toString('hex');
    credencial.salt = novoSalt;
    credencial.hashSenha = this.calcularHash(senhaNova, novoSalt);
    this.repositorio.salvarEntidade(ARQUIVO_CREDENCIAIS, { ...credencial, id: usuario } as any);

    this.journal.registrar({
      operacao: 'UPDATE',
      entidade: 'Credencial',
      dadosAntes: { usuario },
      dadosDepois: { usuario, senhaAlterada: true },
      usuarioResponsavel: usuario,
    });

    return true;
  }

  estaVigente(token: string): boolean {
    return this.validarToken(token);
  }

  private calcularHash(senha: string, salt: string): string {
    return crypto.createHash('sha256').update(`${salt}:${senha}`).digest('hex');
  }
}
