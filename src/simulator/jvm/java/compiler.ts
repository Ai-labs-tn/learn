/*
 * The bytecode compiler (Phase 2b) — AST → pseudo-bytecode, per method.
 *
 * The instruction set mirrors what `javap -c` really emits for this subset: iconst/bipush/sipush/
 * ldc, iload/istore (aload/astore for references), iinc, iadd…irem, the if_icmp family and ifeq
 * as *conditional jumps* (comparisons are not values on the stack — `if (a < b)` compiles to an
 * inverted if_icmpge, exactly like javap), goto, invokestatic, getstatic + invokevirtual println,
 * invokedynamic string concat, ireturn/areturn/return. Each instruction keeps its source line so
 * every micro-step can highlight where it came from.
 */

import { JavaParseError, type ClassDecl, type Expr, type MethodDecl, type Stmt } from './parser';

export interface Instruction {
  op: string;
  /** Display operand, e.g. "2", "#7    // Method add:(II)I". */
  operand?: string;
  /** Resolved jump target (pc). */
  target?: number;
  /** Source line (0 for compiler-generated scaffolding). */
  line: number;
}

export interface CompiledMethod {
  name: string;
  /** javap-style signature for display, e.g. "public static void main(java.lang.String[])". */
  signature: string;
  /** Short runtime label, e.g. "Main.add(int,int)". */
  label: string;
  params: string[];
  returnType: string;
  slotTypes: string[];
  slotNames: string[];
  instructions: Instruction[];
}

/** How each Java type appears inside a method descriptor. */
const TYPE_SIG: Record<string, string> = {
  void: 'V',
  int: 'I',
  boolean: 'Z',
  String: 'Ljava/lang/String;',
  'String[]': '[Ljava/lang/String;',
};

/** How each Java type is printed in a javap method signature. */
const TYPE_DISPLAY: Record<string, string> = {
  void: 'void',
  int: 'int',
  boolean: 'boolean',
  String: 'java.lang.String',
  'String[]': 'java.lang.String[]',
};

const CMP_INSTRUCTION: Record<string, string> = {
  '==': 'if_icmpeq',
  '!=': 'if_icmpne',
  '<': 'if_icmplt',
  '<=': 'if_icmple',
  '>': 'if_icmpgt',
  '>=': 'if_icmpge',
};

/** javap emits the *inverted* comparison when a condition is false-jumped. */
const CMP_INVERTED: Record<string, string> = {
  '==': 'if_icmpne',
  '!=': 'if_icmpeq',
  '<': 'if_icmpge',
  '<=': 'if_icmpgt',
  '>': 'if_icmple',
  '>=': 'if_icmplt',
};

class MethodAssembler {
  instructions: Instruction[] = [];
  slotTypes: string[] = [];
  slotNames: string[] = [];
  private labelRefs: Array<{ index: number; label: number }> = [];
  private labelPositions = new Map<number, number>();
  private nextLabel = 0;

  emit(op: string, line: number, operand?: string): void {
    this.instructions.push({ op, operand, line });
  }

  emitJump(op: string, line: number, label: number): void {
    this.labelRefs.push({ index: this.instructions.length, label });
    this.instructions.push({ op, line });
  }

  newLabel(): number {
    return this.nextLabel++;
  }

  bindLabel(label: number): void {
    this.labelPositions.set(label, this.instructions.length);
  }

  declare(type: string, name: string): number {
    const slot = this.slotTypes.length;
    this.slotTypes.push(type);
    this.slotNames.push(name);
    return slot;
  }

  resolve(): void {
    for (const ref of this.labelRefs) {
      const target = this.labelPositions.get(ref.label);
      if (target === undefined) {
        throw new JavaParseError(0, `Internal: jump label ${ref.label} was never bound`);
      }
      this.instructions[ref.index].target = target;
    }
  }
}

export function compileProgram(classDecl: ClassDecl): CompiledMethod[] {
  const main = classDecl.methods.find((method) => method.name === 'main');
  if (!main) {
    throw new JavaParseError(1, "No 'main' method found — add `public static void main(String[] args)`");
  }
  return classDecl.methods.map((method) => compileMethod(method, classDecl));
}

function signatureOf(method: MethodDecl, className: string): string {
  const params = method.params.map((param) => TYPE_DISPLAY[param.type] ?? param.type).join(', ');
  const modifiers = method.name === 'main' ? 'public static' : 'static';
  const returnType = TYPE_DISPLAY[method.returnType] ?? method.returnType;
  return `${modifiers} ${returnType} ${method.name}(${params})`;
}

function descriptorOf(name: string, classDecl: ClassDecl): string {
  const method = classDecl.methods.find((candidate) => candidate.name === name);
  if (!method) {
    throw new JavaParseError(0, `Unknown method '${name}'`);
  }
  const params = method.params.map((param) => TYPE_SIG[param.type] ?? 'I').join('');
  return `#7    // Method ${name}:(${params})${TYPE_SIG[method.returnType] ?? 'V'}`;
}

function compileMethod(method: MethodDecl, classDecl: ClassDecl): CompiledMethod {
  const asm = new MethodAssembler();
  for (const param of method.params) {
    asm.declare(param.type, param.name);
  }
  compileBlock(method.body, asm, classDecl);
  // Implicit return for void fall-through (javap always emits an explicit `return`).
  const last = asm.instructions[asm.instructions.length - 1];
  if (!last || !last.op.startsWith('return') && !['ireturn', 'areturn'].includes(last.op)) {
    if (method.returnType === 'void') {
      asm.emit('return', method.line);
    }
  }
  asm.resolve();
  const shortParams = method.params.map((param) => TYPE_DISPLAY[param.type] ?? param.type).join(',');
  return {
    name: method.name,
    signature: signatureOf(method, classDecl.name),
    label: `${classDecl.name}.${method.name}(${shortParams})`,
    params: method.params.map((param) => param.name),
    returnType: method.returnType,
    slotTypes: asm.slotTypes,
    slotNames: asm.slotNames,
    instructions: asm.instructions,
  };
}

/** Does this expression produce a String? (Used to pick `+` concat vs int add.) */
function isStringy(expr: Expr, asm: MethodAssembler): boolean {
  if (expr.kind === 'str') return true;
  if (expr.kind === 'name') {
    const slot = asm.slotNames.indexOf(expr.name);
    return slot >= 0 && asm.slotTypes[slot] === 'String';
  }
  if (expr.kind === 'bin' && expr.op === '+') {
    return isStringy(expr.left, asm) || isStringy(expr.right, asm);
  }
  if (expr.kind === 'call') {
    return false; // unknown until run; treat as int for `+`
  }
  return false;
}

function compileBlock(body: Stmt[], asm: MethodAssembler, classDecl: ClassDecl): void {
  for (const statement of body) {
    compileStatement(statement, asm, classDecl);
  }
}

function compileStatement(statement: Stmt, asm: MethodAssembler, classDecl: ClassDecl): void {
  switch (statement.kind) {
    case 'block':
      compileBlock(statement.body, asm, classDecl);
      return;

    case 'var': {
      if (statement.init) {
        compileValue(statement.init, asm, classDecl);
      } else if (statement.type === 'String') {
        asm.emit('ldc', statement.line, '// String ""');
      } else {
        asm.emit('iconst_0', statement.line); // int 0 / boolean false
      }
      const slot = asm.declare(statement.type, statement.name);
      asm.emit(statement.type === 'String' ? 'astore' : 'istore', statement.line, String(slot));
      return;
    }

    case 'assign': {
      const slot = asm.slotNames.indexOf(statement.name);
      if (slot < 0) {
        throw new JavaParseError(statement.line, `Unknown variable '${statement.name}'`);
      }
      // `i++`, `i += 5` and `i = i + 5` all compile to iinc in a real javac — match that.
      const expr = statement.expr;
      if (
        asm.slotTypes[slot] === 'int' &&
        expr.kind === 'bin' &&
        (expr.op === '+' || expr.op === '-') &&
        expr.left.kind === 'name' &&
        expr.left.name === statement.name &&
        expr.right.kind === 'num'
      ) {
        const delta = expr.op === '+' ? expr.right.value : -expr.right.value;
        asm.emit('iinc', statement.line, `${slot} ${delta}`);
        return;
      }
      compileValue(statement.expr, asm, classDecl);
      asm.emit(asm.slotTypes[slot] === 'String' ? 'astore' : 'istore', statement.line, String(slot));
      return;
    }

    case 'if': {
      const elseLabel = asm.newLabel();
      compileCondition(statement.cond, elseLabel, asm, classDecl);
      compileStatement(statement.then, asm, classDecl);
      if (statement.else) {
        const endLabel = asm.newLabel();
        asm.emitJump('goto', statement.line, endLabel);
        asm.bindLabel(elseLabel);
        compileStatement(statement.else, asm, classDecl);
        asm.bindLabel(endLabel);
      } else {
        asm.bindLabel(elseLabel);
      }
      return;
    }

    case 'while': {
      const startLabel = asm.newLabel();
      const endLabel = asm.newLabel();
      asm.bindLabel(startLabel);
      compileCondition(statement.cond, endLabel, asm, classDecl);
      compileStatement(statement.body, asm, classDecl);
      asm.emitJump('goto', statement.line, startLabel);
      asm.bindLabel(endLabel);
      return;
    }

    case 'return': {
      if (statement.expr) {
        compileValue(statement.expr, asm, classDecl);
        asm.emit('ireturn', statement.line);
      } else {
        asm.emit('return', statement.line);
      }
      return;
    }

    case 'expr': {
      const expr = statement.expr;
      if (expr.kind === 'println') {
        compilePrintln(expr.arg, asm, classDecl, statement.line);
        return;
      }
      if (expr.kind === 'call') {
        compileCall(expr, asm, classDecl, statement.line);
        return;
      }
      throw new JavaParseError(statement.line, 'This expression has no effect as a statement');
    }
  }
}

function compilePrintln(arg: Expr, asm: MethodAssembler, classDecl: ClassDecl, line: number): void {
  asm.emit('getstatic', line, '#13     // Field java/lang/System.out:Ljava/io/PrintStream;');
  compileValue(arg, asm, classDecl);
  asm.emit('invokevirtual', line, '#19     // Method java/io/PrintStream.println:(...)V');
}

function compileCall(
  expr: { name: string; args: Expr[] },
  asm: MethodAssembler,
  classDecl: ClassDecl,
  line: number,
): void {
  for (const arg of expr.args) {
    compileValue(arg, asm, classDecl);
  }
  asm.emit('invokestatic', line, descriptorOf(expr.name, classDecl));
}

/** Compile a value-producing expression (pushes exactly one value). */
function compileValue(expr: Expr, asm: MethodAssembler, classDecl: ClassDecl): void {
  switch (expr.kind) {
    case 'num': {
      const value = expr.value;
      if (value >= -1 && value <= 5) {
        asm.emit(value === -1 ? 'iconst_m1' : `iconst_${value}`, expr.line);
      } else if (value <= 127) {
        asm.emit('bipush', expr.line, String(value));
      } else if (value <= 32767) {
        asm.emit('sipush', expr.line, String(value));
      } else {
        asm.emit('ldc', expr.line, String(value));
      }
      return;
    }

    case 'str':
      asm.emit('ldc', expr.line, `// String ${expr.value}`);
      return;

    case 'bool':
      asm.emit(expr.value ? 'iconst_1' : 'iconst_0', expr.line);
      return;

    case 'name': {
      const slot = asm.slotNames.indexOf(expr.name);
      if (slot < 0) {
        throw new JavaParseError(expr.line, `Unknown variable '${expr.name}'`);
      }
      asm.emit(asm.slotTypes[slot] === 'String' ? 'aload' : 'iload', expr.line, String(slot));
      return;
    }

    case 'bin': {
      if (expr.op in CMP_INSTRUCTION) {
        compileBoolValue(expr, asm, classDecl);
        return;
      }
      compileValue(expr.left, asm, classDecl);
      compileValue(expr.right, asm, classDecl);
      if (expr.op === '+') {
        if (isStringy(expr.left, asm) || isStringy(expr.right, asm)) {
          asm.emit('invokedynamic', expr.line, '#23     // makeConcatWithConstants');
        } else {
          asm.emit('iadd', expr.line);
        }
        return;
      }
      if (expr.op === '-') asm.emit('isub', expr.line);
      else if (expr.op === '*') asm.emit('imul', expr.line);
      else if (expr.op === '/') asm.emit('idiv', expr.line);
      else if (expr.op === '%') asm.emit('irem', expr.line);
      else throw new JavaParseError(expr.line, `Unsupported operator '${expr.op}'`);
      return;
    }

    case 'call':
      compileCall(expr, asm, classDecl, expr.line);
      return;

    case 'println':
      compilePrintln(expr.arg, asm, classDecl, expr.line);
      return;
  }
}

/**
 * The comparison-as-value pattern javap emits (`boolean b = a < c;`):
 * inverted conditional jump → iconst_1 / goto → iconst_0.
 */
function compileBoolValue(
  expr: Extract<Expr, { kind: 'bin' }>,
  asm: MethodAssembler,
  classDecl: ClassDecl,
): void {
  const falseLabel = asm.newLabel();
  const endLabel = asm.newLabel();
  compileValue(expr.left, asm, classDecl);
  compileValue(expr.right, asm, classDecl);
  asm.emitJump(CMP_INVERTED[expr.op], expr.line, falseLabel);
  asm.emit('iconst_1', expr.line);
  asm.emitJump('goto', expr.line, endLabel);
  asm.bindLabel(falseLabel);
  asm.emit('iconst_0', expr.line);
  asm.bindLabel(endLabel);
}

/**
 * Conditions never become values — javap consumes them directly with an inverted jump:
 * `if (a < b)` → `iload_1; iload_2; if_icmpge Lelse`.
 */
function compileCondition(cond: Expr, falseLabel: number, asm: MethodAssembler, classDecl: ClassDecl): void {
  if (cond.kind === 'bin' && cond.op in CMP_INSTRUCTION) {
    compileValue(cond.left, asm, classDecl);
    compileValue(cond.right, asm, classDecl);
    asm.emitJump(CMP_INVERTED[cond.op], cond.line, falseLabel);
    return;
  }
  compileValue(cond, asm, classDecl);
  asm.emitJump('ifeq', cond.line, falseLabel);
}
