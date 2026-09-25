import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { CriptografiaArquivo } from './CriptografiaArquivo';

/** EASTER EGG
* Um amor um dia floresceu, mais hoje é apenas uma lembrença bela
* Uma bela lembrança
 */
export interface ConfigMestre {
  chaveCriptografiaMestra: string;
  criadoEm: string;
  aliquotaImpostoPadrao: number;
  coeficienteDepreciacaoAnual: number;
}

export class Config {
  private static readonly NOME_ARQUIVO = 'config.mestre.json';

  constructor(private diretorioDados: string) {
    if (!fs.existsSync(diretorioDados)) {
      fs.mkdirSync(diretorioDados, { recursive: true });
    }
  }

  private caminho(): string {
    return path.join(this.diretorioDados, Config.NOME_ARQUIVO);
  }

  existeConfiguracao(): boolean {
    return fs.existsSync(this.caminho());
  }

  provisionar(parametros?: Partial<Pick<ConfigMestre, 'aliquotaImpostoPadrao' | 'coeficienteDepreciacaoAnual'>>): ConfigMestre {
    const cripto = new CriptografiaArquivo();
    const config: ConfigMestre = {
      chaveCriptografiaMestra: cripto.gerarChave(),
      criadoEm: new Date().toISOString(),
      aliquotaImpostoPadrao: parametros?.aliquotaImpostoPadrao ?? 0.0,
      coeficienteDepreciacaoAnual: parametros?.coeficienteDepreciacaoAnual ?? 0.2,
    };
    fs.writeFileSync(this.caminho(), JSON.stringify(config, null, 2), {
      encoding: 'utf8',
      mode: 0o600, 
    });
    return config;
  }

  carregar(): ConfigMestre {
    if (!this.existeConfiguracao()) {
      throw new Error('Configuracao mestre nao encontrada. Execute o provisionamento inicial.');
    }
    return JSON.parse(fs.readFileSync(this.caminho(), 'utf8'));
  }

  atualizarParametros(campos: Partial<Pick<ConfigMestre, 'aliquotaImpostoPadrao' | 'coeficienteDepreciacaoAnual'>>): ConfigMestre {
    const atual = this.carregar();
    const atualizado = { ...atual, ...campos };
    fs.writeFileSync(this.caminho(), JSON.stringify(atualizado, null, 2), 'utf8');
    return atualizado;
  }
}

export function gerarId(prefixo: string): string {
  return `${prefixo}_${crypto.randomBytes(6).toString('hex')}`;
}
