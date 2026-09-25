import { Validador } from './Validador';

/**
 * ValidadorDataEntrada (UML): impede cadastro de lotes com data de entrada
 * futura, ou anterior a mais de 90 dias (regra de negocio da atividade).
 */
export class ValidadorDataEntrada extends Validador<Date> {
  private static readonly LIMITE_DIAS_PASSADO = 90;

  validar(data: Date): boolean {
    if (isNaN(data.getTime())) {
      this.definirErro('Data de entrada invalida.');
      return false;
    }

    const agora = new Date();
    const hojeSemHora = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
    const dataSemHora = new Date(data.getFullYear(), data.getMonth(), data.getDate());

    if (dataSemHora.getTime() > hojeSemHora.getTime()) {
      this.definirErro('Data de entrada nao pode ser futura.');
      return false;
    }

    const diffMs = hojeSemHora.getTime() - dataSemHora.getTime();
    const diffDias = diffMs / (1000 * 60 * 60 * 24);

    if (diffDias > ValidadorDataEntrada.LIMITE_DIAS_PASSADO) {
      this.definirErro(
        `Data de entrada nao pode ser anterior a mais de ${ValidadorDataEntrada.LIMITE_DIAS_PASSADO} dias.`,
      );
      return false;
    }

    return true;
  }
}
