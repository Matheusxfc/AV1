
export interface ComandoParseado {
  recurso: string;
  acao: string;
  flags: Record<string, string>;
  bruto: string;
}

export function parseComando(linha: string): ComandoParseado | null {
  const tokens = tokenizar(linha.trim());
  if (tokens.length === 0) return null;

  const recurso = tokens[0];
  const acao = tokens[1] && !tokens[1].startsWith('--') ? tokens[1] : '';
  const flags: Record<string, string> = {};

  let inicioFlags = acao ? 2 : 1;
  for (let i = inicioFlags; i < tokens.length; i++) {
    if (tokens[i].startsWith('--')) {
      const chave = tokens[i].substring(2);
      const proximo = tokens[i + 1];
      if (proximo !== undefined && !proximo.startsWith('--')) {
        flags[chave] = proximo;
        i++;
      } else {
        flags[chave] = 'true';
      }
    }
  }

  return { recurso, acao, flags, bruto: linha };
}

function tokenizar(entrada: string): string[] {
  const regex = /"([^"]*)"|'([^']*)'|(\S+)/g;
  const tokens: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(entrada)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3]);
  }
  return tokens;
}
