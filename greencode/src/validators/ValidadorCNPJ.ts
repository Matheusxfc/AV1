import { Validador } from './Validador';

/**
 * ValidadorCNPJ (UML): valida CNPJ com calculo de digitos verificadores
 * conforme a Receita Federal (Modulo 11), alem do formato (14 digitos).
 */
export class ValidadorCNPJ extends Validador<string> {
  validar(cnpj: string): boolean {
    const limpo = (cnpj || '').replace(/[^\d]/g, '');

    if (limpo.length !== 14) {
      this.definirErro('CNPJ deve conter 14 digitos numericos.');
      return false;
    }

    if (/^(\d)\1{13}$/.test(limpo)) {
      this.definirErro('CNPJ invalido (todos os digitos identicos).');
      return false;
    }

    const calcularDigito = (base: string, pesos: number[]): number => {
      const soma = base
        .split('')
        .reduce((acc, digito, idx) => acc + parseInt(digito, 10) * pesos[idx], 0);
      const resto = soma % 11;
      return resto < 2 ? 0 : 11 - resto;
    };

    const pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const pesos2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

    const base12 = limpo.substring(0, 12);
    const digito1 = calcularDigito(base12, pesos1);
    const base13 = base12 + digito1;
    const digito2 = calcularDigito(base13, pesos2);

    const digitosCalculados = `${digito1}${digito2}`;
    const digitosInformados = limpo.substring(12, 14);

    if (digitosCalculados !== digitosInformados) {
      this.definirErro('CNPJ invalido: digitos verificadores nao conferem.');
      return false;
    }

    return true;
  }

  /** Formata um CNPJ ja validado no padrao XX.XXX.XXX/XXXX-XX. */
  static formatar(cnpj: string): string {
    const limpo = cnpj.replace(/[^\d]/g, '');
    return limpo.replace(
      /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
      '$1.$2.$3/$4-$5',
    );
  }
}
