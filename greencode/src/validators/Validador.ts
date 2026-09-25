/**
 * Validador (UML, classe abstrata): define o contrato de validacao usado
 * pelos validadores concretos (ValidadorCNPJ, ValidadorDataEntrada).
 * Demonstra o pilar de POLIMORFISMO exigido na atividade.
 */
export abstract class Validador<T = any> {
  private ultimaMensagemErro: string = '';

  abstract validar(objeto: T): boolean;

  obterMensagemErro(): string {
    return this.ultimaMensagemErro;
  }

  protected definirErro(mensagem: string): void {
    this.ultimaMensagemErro = mensagem;
  }
}
