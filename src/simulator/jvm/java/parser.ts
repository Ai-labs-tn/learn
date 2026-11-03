/*
 * A Java-subset parser (Phase 2b) — tokenizer + recursive descent.
 *
 * The learning simulator does not need all of Java: it needs the subset that teaches how code
 * executes — classes with static methods, locals, arithmetic, comparisons, if/else, while,
 * method calls and System.out.println. The AST this produces feeds the bytecode compiler
 * (`compiler.ts`), which feeds the snapshot engine (`engine.ts`). Swapping this parser for a
 * full java-ast/ANTLR4 front-end later only replaces this file — the contracts hold.
 */

export class JavaParseError extends Error {
  constructor(
    readonly line: number,
    message: string,
  ) {
    super(message);
  }
}

type TokKind = 'num' | 'str' | 'id' | 'kw' | 'punc';

interface Token {
  kind: TokKind;
  text: string;
  line: number;
}

const KEYWORDS = new Set([
  'class',
  'public',
  'static',
  'int',
  'String',
  'boolean',
  'void',
  'if',
  'else',
  'while',
  'return',
  'true',
  'false',
]);

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;

  const push = (kind: TokKind, text: string) => tokens.push({ kind, text, line });

  while (i < source.length) {
    const ch = source[i];

    if (ch === '\n') {
      line += 1;
      i += 1;
      continue;
    }
    if (ch === ' ' || ch === '\t' || ch === '\r') {
      i += 1;
      continue;
    }
    // Comments — skipped entirely.
    if (ch === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && source[i + 1] === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        if (source[i] === '\n') line += 1;
        i += 1;
      }
      i += 2; // past */
      continue;
    }
    if (/[0-9]/.test(ch)) {
      const start = i;
      while (i < source.length && /[0-9]/.test(source[i])) i += 1;
      push('num', source.slice(start, i));
      continue;
    }
    if (ch === '"') {
      const start = i;
      i += 1;
      while (i < source.length && source[i] !== '"') {
        if (source[i] === '\\') i += 1; // skip the escaped char
        if (source[i] === '\n') throw new JavaParseError(line, 'Unterminated string literal');
        i += 1;
      }
      if (i >= source.length) throw new JavaParseError(line, 'Unterminated string literal');
      i += 1;
      push('str', source.slice(start + 1, i - 1));
      continue;
    }
    if (/[A-Za-z_$]/.test(ch)) {
      const start = i;
      while (i < source.length && /[A-Za-z0-9_$]/.test(source[i])) i += 1;
      const text = source.slice(start, i);
      push(KEYWORDS.has(text) ? 'kw' : 'id', text);
      continue;
    }

    // Multi-char punctuation first (longest match wins).
    let matched = false;
    for (const punc of ['==', '!=', '<=', '>=', '&&', '||', '+=', '-=', '*=', '/=', '++', '--']) {
      if (source.startsWith(punc, i)) {
        push('punc', punc);
        i += punc.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;
    if ('+-*/%<>=!(){};,.[]'.includes(ch)) {
      push('punc', ch);
      i += 1;
      continue;
    }
    throw new JavaParseError(line, `Unexpected character '${ch}'`);
  }

  tokens.push({ kind: 'punc', text: '<eof>', line });
  return tokens;
}

/* --- AST ------------------------------------------------------------------ */

export type Expr =
  | { kind: 'num'; value: number; line: number }
  | { kind: 'str'; value: string; line: number }
  | { kind: 'bool'; value: boolean; line: number }
  | { kind: 'name'; name: string; line: number }
  | { kind: 'bin'; op: string; left: Expr; right: Expr; line: number }
  | { kind: 'call'; name: string; args: Expr[]; line: number }
  | { kind: 'println'; arg: Expr; line: number };

export type Stmt =
  | { kind: 'var'; type: string; name: string; init?: Expr; line: number }
  | { kind: 'assign'; name: string; expr: Expr; line: number }
  | { kind: 'if'; cond: Expr; then: Stmt; else?: Stmt; line: number }
  | { kind: 'while'; cond: Expr; body: Stmt; line: number }
  | { kind: 'return'; expr?: Expr; line: number }
  | { kind: 'expr'; expr: Expr; line: number }
  | { kind: 'block'; body: Stmt[]; line: number };

export interface Param {
  type: string;
  name: string;
}

export interface MethodDecl {
  name: string;
  params: Param[];
  returnType: string;
  body: Stmt[];
  line: number;
}

export interface ClassDecl {
  name: string;
  methods: MethodDecl[];
}

/* --- Parser --------------------------------------------------------------- */

export function parseJava(source: string): ClassDecl {
  const tokens = tokenize(source);
  let pos = 0;

  const peek = (): Token => tokens[pos];
  const next = (): Token => tokens[pos++];
  const isPunc = (text: string): boolean => peek().kind === 'punc' && peek().text === text;
  const isKw = (text: string): boolean => peek().kind === 'kw' && peek().text === text;
  const expectPunc = (text: string): void => {
    if (!isPunc(text)) {
      throw new JavaParseError(peek().line, `Expected '${text}' but found '${peek().text}'`);
    }
    next();
  };

  const isTypeStart = (): boolean => isKw('int') || isKw('String') || isKw('boolean') || isKw('void');

  function readType(): string {
    if (isKw('int') || isKw('String') || isKw('boolean') || isKw('void')) {
      const base = next().text;
      if (isPunc('[')) {
        next();
        expectPunc(']');
        return `${base}[]`;
      }
      return base;
    }
    throw new JavaParseError(peek().line, `Expected a type but found '${peek().text}'`);
  }

  function parseProgram(): ClassDecl {
    parseModifiers();
    if (!isKw('class')) {
      throw new JavaParseError(peek().line, "A program must start with 'class <Name> {'");
    }
    next();
    const name = next();
    if (name.kind !== 'id' && name.kind !== 'kw') {
      throw new JavaParseError(name.line, 'Expected the class name');
    }
    expectPunc('{');
    const methods: MethodDecl[] = [];
    while (!isPunc('}')) {
      if (peek().kind === 'punc' && peek().text === '<eof>') {
        throw new JavaParseError(peek().line, "Missing '}' — the class is never closed");
      }
      methods.push(parseMethod());
    }
    next(); // }
    return { name: name.text, methods };
  }

  function parseModifiers(): void {
    while (isKw('public') || isKw('static')) next();
  }

  function parseMethod(): MethodDecl {
    parseModifiers();
    const line = peek().line;
    const returnType = readType();
    const name = next();
    if (name.kind !== 'id' && name.kind !== 'kw') {
      throw new JavaParseError(name.line, 'Expected a method name');
    }
    expectPunc('(');
    const params: Param[] = [];
    if (!isPunc(')')) {
      do {
        const type = readType();
        const param = next();
        params.push({ type, name: param.text });
      } while (isPunc(',') && (next(), true));
    }
    expectPunc(')');
    const body = parseBlock();
    return { name: name.text, params, returnType, body, line };
  }

  function parseBlock(): Stmt[] {
    expectPunc('{');
    const body: Stmt[] = [];
    while (!isPunc('}')) {
      if (peek().kind === 'punc' && peek().text === '<eof>') {
        throw new JavaParseError(peek().line, "Missing '}' — the block is never closed");
      }
      body.push(parseStatement());
    }
    next(); // }
    return body;
  }

  function parseStatement(): Stmt {
    const line = peek().line;

    if (isPunc('{')) {
      const body = parseBlock();
      return { kind: 'block', body, line };
    }
    if (isKw('if')) {
      next();
      expectPunc('(');
      const cond = parseExpr();
      expectPunc(')');
      const then = parseStatement();
      let elseBranch: Stmt | undefined;
      if (isKw('else')) {
        next();
        elseBranch = parseStatement();
      }
      return { kind: 'if', cond, then, else: elseBranch, line };
    }
    if (isKw('while')) {
      next();
      expectPunc('(');
      const cond = parseExpr();
      expectPunc(')');
      const bodyStmt = parseStatement();
      return { kind: 'while', cond, body: bodyStmt, line };
    }
    if (isKw('return')) {
      next();
      if (isPunc(';')) {
        next();
        return { kind: 'return', line };
      }
      const expr = parseExpr();
      expectPunc(';');
      return { kind: 'return', expr, line };
    }
    if (isTypeStart()) {
      const type = readType();
      const name = next();
      if (name.kind !== 'id' && name.kind !== 'kw') {
        throw new JavaParseError(name.line, 'Expected a variable name');
      }
      let init: Expr | undefined;
      if (isPunc('=')) {
        next();
        init = parseExpr();
      }
      expectPunc(';');
      return { kind: 'var', type, name: name.text, init, line };
    }
    if (isKw('true') || isKw('false')) {
      throw new JavaParseError(line, 'Expected a statement');
    }

    // Assignment (incl. compound) or an expression statement.
    if (peek().kind === 'id') {
      const following = tokens[pos + 1];
      if (following.kind === 'punc' && ['=', '++', '--', '+=', '-=', '*=', '/='].includes(following.text)) {
        const name = next().text;
        if (isPunc('=')) {
          next();
          const expr = parseExpr();
          expectPunc(';');
          return { kind: 'assign', name, expr, line };
        }
        if (isPunc('++') || isPunc('--')) {
          const op = next().text;
          expectPunc(';');
          return {
            kind: 'assign',
            name,
            expr: {
              kind: 'bin',
              op: op === '++' ? '+' : '-',
              left: { kind: 'name', name, line },
              right: { kind: 'num', value: 1, line },
              line,
            },
            line,
          };
        }
        const op = next().text;
        const rhs = parseExpr();
        expectPunc(';');
        return {
          kind: 'assign',
          name,
          expr: { kind: 'bin', op: op[0], left: { kind: 'name', name, line }, right: rhs, line },
          line,
        };
      }
      // Otherwise an expression statement: `add(2, 3);` or `System.out.println(...);`
      const expr = parseExpr();
      expectPunc(';');
      return { kind: 'expr', expr, line };
    }

    // Expression statements that do not start with an identifier.
    const expr = parseExpr();
    expectPunc(';');
    return { kind: 'expr', expr, line };
  }

  function finishCall(name: string, line: number): Expr {
    expectPunc('(');
    const args: Expr[] = [];
    if (!isPunc(')')) {
      do {
        args.push(parseExpr());
      } while (isPunc(',') && (next(), true));
    }
    expectPunc(')');
    return { kind: 'call', name, args, line };
  }

  function parsePrimary(): Expr {
    const line = peek().line;
    if (peek().kind === 'num') {
      return { kind: 'num', value: Number(next().text), line };
    }
    if (isPunc('-')) {
      // Unary minus: compile as `0 - x`.
      next();
      const operand = parsePrimary();
      return { kind: 'bin', op: '-', left: { kind: 'num', value: 0, line }, right: operand, line };
    }
    if (peek().kind === 'str') {
      return { kind: 'str', value: next().text, line };
    }
    if (isKw('true')) {
      next();
      return { kind: 'bool', value: true, line };
    }
    if (isKw('false')) {
      next();
      return { kind: 'bool', value: false, line };
    }
    if (isPunc('(')) {
      next();
      const expr = parseExpr();
      expectPunc(')');
      return expr;
    }
    if (peek().kind === 'id' || peek().kind === 'kw') {
      const name = next().text;
      // System.out.println(...)
      if (name === 'System' && isPunc('.')) {
        next();
        const member = next().text; // out
        if (member !== 'out') {
          throw new JavaParseError(line, `Only System.out.println is supported, found 'System.${member}'`);
        }
        expectPunc('.');
        const method = next().text;
        if (method !== 'println') {
          throw new JavaParseError(line, `Only System.out.println is supported, found 'System.out.${method}'`);
        }
        expectPunc('(');
        const arg = parseExpr();
        expectPunc(')');
        return { kind: 'println', arg, line };
      }
      if (isPunc('(')) {
        return finishCall(name, line);
      }
      return { kind: 'name', name, line };
    }
    throw new JavaParseError(line, `Unexpected '${peek().text}' in an expression`);
  }

  function parseMultiplicative(): Expr {
    let left = parsePrimary();
    while (isPunc('*') || isPunc('/') || isPunc('%')) {
      const op = next().text;
      const line = left.line;
      left = { kind: 'bin', op, left, right: parsePrimary(), line };
    }
    return left;
  }

  function parseAdditive(): Expr {
    let left = parseMultiplicative();
    while (isPunc('+') || isPunc('-')) {
      const op = next().text;
      const line = left.line;
      left = { kind: 'bin', op, left, right: parseMultiplicative(), line };
    }
    return left;
  }

  function parseExpr(): Expr {
    const left = parseAdditive();
    for (const op of ['==', '!=', '<', '<=', '>', '>=']) {
      if (isPunc(op)) {
        next();
        const line = left.line;
        return { kind: 'bin', op, left, right: parseAdditive(), line };
      }
    }
    return left;
  }

  const program = parseProgram();
  if (peek().text !== '<eof>') {
    throw new JavaParseError(peek().line, `Unexpected '${peek().text}' after the class`);
  }
  return program;
}
