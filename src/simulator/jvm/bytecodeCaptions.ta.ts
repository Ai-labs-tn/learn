/* Tamil script + English JVM/bytecode jargon; source identifiers/opcodes stay literal. */
export const BYTECODE_CAPTIONS_TA: Record<string, string> = {
  'const-2': 'main() frame-ல் local slot 0-ல் args இருக்கிறது. முதல் instruction, int constant 2-ஐ operand stack-ல் push செய்கிறது — ஒவ்வொரு instruction-மும் கணக்கிடும் scratch space இதுதான்.',
  'const-3': 'Arguments bottom-to-top அடுக்கப்படுகின்றன: முதலில் 2, அடுத்து 3. கடைசி argument மேலே இருக்கும் — invokestatic எதிர்பார்க்கும் வரிசை இதுதான்.',
  invoke: 'invokestatic இரண்டு arguments-ஐ pop செய்து, add()-க்காக ஒரு புதிய frame உருவாக்கி, slots 0 மற்றும் 1-ல் அவற்றை வைக்கிறது. அந்த frame மேலே push ஆனதும் main() அங்கேயே pause ஆகிறது — add() திரும்பியதும் அதே pc 2-ல் தொடரும்.',
  'load-a': 'இப்போது add()-க்குள். iload_0, local slot 0-ல் இருக்கும் a-ஐ operand stack-க்கு copy செய்கிறது. Local-லிருந்து load செய்தால் அது அழியாது — stack-ல் ஒரு copy மட்டுமே வருகிறது.',
  'load-b': 'slot 1-ல் இருக்கும் b-யும் stack-க்கு வருகிறது: 2 கீழே, 3 மேலே. இப்போது இரண்டையும் சேர்க்கத் தயார்.',
  iadd: 'iadd இரண்டு ints-ஐ pop செய்து, அவற்றின் கூட்டுத்தொகையை push செய்கிறது. Line 9-ன் முழுக் கணக்கு இதுதான் — இரண்டு pop, ஒரு push.',
  'istore-sum': 'istore_2, 5-ஐ pop செய்து local slot 2-ல் வைக்கிறது — source code-ல் sum என்று பெயரிட்ட variable அதுதான். Operand stack மீண்டும் காலி.',
  'load-sum': 'return sum இரண்டு bytecode instructions ஆகும்: முதலில் value-ஐ load செய், அடுத்து return செய். இப்போது அந்த load-ஐப் பார்க்கிறோம்.',
  ireturn: 'ireturn, add()-ன் frame-ஐ pop செய்து, மேலிருக்கும் value-ஐ main()-ன் operand stack-க்கு கொடுக்கிறது. main() call-க்கு அடுத்த pc 2-ல் மீண்டும் தொடர்கிறது — எதுவும் நடக்காதது போல.',
  'istore-result': 'மீண்டும் main()-க்கு வந்துவிட்டோம். istore_1, திரும்பிய 5-ஐ local slot 1-ல் வைக்கிறது. இரண்டு frames கடந்து, ஒரு முழு call cycle முடிந்தது.',
  getstatic: 'Linking-இல் resolve ஆன field reference இப்போது உண்மையான object-ஆக மாறுகிறது: stdout-க்கான PrintStream stack-ல் push ஆகிறது.',
  'load-result': 'println()-ன் argument இப்போது மேலே வருகிறது: முதலில் receiver, கடைசியில் argument — invokevirtual பயன்படுத்தும் வரிசை இதுதான்.',
  println: 'invokevirtual argument-ஐயும் receiver-ஐயும் pop செய்து, runtime-ல் object-ன் உண்மையான type அடிப்படையில் method-ஐத் தேர்வு செய்கிறது (virtual dispatch). Value OS-ன் stdout-க்கு செல்கிறது — Phase 1-ல் பார்த்த அதே console.',
  'return-void': 'void return கடைசி frame-ஐ pop செய்கிறது. Threads ஏதும் மீதமில்லை — JVM வெளியேறுகிறது; இந்தப் பயணம் தொடங்கிய OS process lifecycle-க்கே திரும்புகிறோம்.',
};