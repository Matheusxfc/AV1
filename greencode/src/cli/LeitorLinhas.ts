import * as readline from 'readline';

export class LeitorLinhas {
  private filaLinhas: string[] = [];
  private resolversPendentes: Array<(linha: string) => void> = [];

  constructor(private rl: readline.Interface) {
    this.rl.on('line', (linha: string) => {
      const resolver = this.resolversPendentes.shift();
      if (resolver) {
        resolver(linha);
      } else {
        this.filaLinhas.push(linha);
      }
    });
  }

  async proximaLinha(pergunta = ''): Promise<string> {
    if (pergunta) {
      process.stdout.write(pergunta);
    }
    const buffered = this.filaLinhas.shift();
    if (buffered !== undefined) {
      return buffered;
    }
    return new Promise<string>((resolve) => this.resolversPendentes.push(resolve));
  }

  interface(): readline.Interface {
    return this.rl;
  }
}
