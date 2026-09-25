import * as crypto from 'crypto';

export class CriptografiaArquivo {
  private static readonly ALGORITMO = 'aes-256-gcm';
  private static readonly TAMANHO_IV = 12;
  private static readonly TAMANHO_TAG = 16;

  gerarChave(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  cifrar(dados: string, chaveHex: string): string {
    const chave = this.normalizarChave(chaveHex);
    const iv = crypto.randomBytes(CriptografiaArquivo.TAMANHO_IV);
    const cipher = crypto.createCipheriv(CriptografiaArquivo.ALGORITMO, chave, iv);

    const cifrado = Buffer.concat([cipher.update(dados, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return Buffer.concat([iv, tag, cifrado]).toString('base64');
  }

  decifrar(dadosCifrados: string, chaveHex: string): string {
    const chave = this.normalizarChave(chaveHex);
    const buffer = Buffer.from(dadosCifrados, 'base64');

    const iv = buffer.subarray(0, CriptografiaArquivo.TAMANHO_IV);
    const tag = buffer.subarray(
      CriptografiaArquivo.TAMANHO_IV,
      CriptografiaArquivo.TAMANHO_IV + CriptografiaArquivo.TAMANHO_TAG,
    );
    const cifrado = buffer.subarray(CriptografiaArquivo.TAMANHO_IV + CriptografiaArquivo.TAMANHO_TAG);

    const decipher = crypto.createDecipheriv(CriptografiaArquivo.ALGORITMO, chave, iv);
    decipher.setAuthTag(tag);

    const decifrado = Buffer.concat([decipher.update(cifrado), decipher.final()]);
    return decifrado.toString('utf8');
  }

  private normalizarChave(chaveHex: string): Buffer {
    const chave = Buffer.from(chaveHex, 'hex');
    if (chave.length !== 32) {
      throw new Error('Chave de criptografia invalida: esperado 256 bits (32 bytes).');
    }
    return chave;
  }
}
