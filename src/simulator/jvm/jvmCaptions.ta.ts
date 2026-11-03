/**
 * Tamil captions for the JVM runtime track — Tamil script with the core jargons kept in English
 * (Metaspace, Eden, Survivor, Old Gen, <clinit>, delegation… are never translated).
 */

export const JVM_CAPTIONS_TA: Record<string, string> = {
  spawn: 'Phase 1-ல் நீங்கள் பார்த்த அதே தருணம் இதோ: OS, program image-ஐ (இங்கே java launcher) disk-லிருந்து படித்து, புதிய user-space address space-ல் map செய்து, ஒர் process-ஐ உருவாக்குகிறது. JVM மாயமல்ல — அது அந்த process தான்.',
  memory: 'எந்த ஒரு Java வரிக்கும் முன், JVM process memory-க்குள் தனது runtime data areas-ஐ உருவாக்குகிறது: objects-க்கு heap (Eden → Survivor → Old Gen), class metadata-க்கு Metaspace (native memory — heap அல்ல), ஒவ்வொரு thread-க்கும் தனித்தனி stack.',
  bootstrap: 'ஒரு வரி Main-ஐ ஓட்டுவதற்கு முன்பே java.lang.Object, String, System தேவை. இவற்றை Metaspace-க்குள் ஏற்றுவது bootstrap loader — native code-ல் எழுதப்பட்டது.',
  delegation: 'Application loader-ிடம் Main கேட்கப்படுகிறது — ஆனால் அது உடனே தன் classpath-ஐப் பார்க்காது. முதலில் platform loader-ிடமும், அவர் bootstrap loader-ிடமும் கேட்கிறது. "எங்களிடம் இல்லை" என்ற பின்னரே அது Main-ஐ load செய்கிறது. இந்த delegation தான் core classes-ஐப் பாதுகாக்கிறது.',
  verify: "Main-ின் bytecode ஓடும் முன், verifier அது பாதுகாப்பானது என நிரூபிக்கிறது: ஒவ்வொரு branch-ும் நேர்த்தியானது, தவறான casts இல்லை, stack overflow/underflow இல்லை. தவறான cast-ல் முழு process-ம் சாகாமல் இருப்பதற்கு இதுவே காரணம்.",
  prepare: 'Static fields-களுக்கு memory ஒதுக்கப்பட்டு default values — 0, false, null — தரப்படுகின்றன. உங்கள் initialisers இன்னும் ஓடவில்லை: "static int count = 42" இப்போதும் 0 தான். Initialiser ஓடுவது initialise stage-ல் தான்.',
  resolve: 'Constant pool நிறைய symbolic references-ஐக் கொண்டுள்ளது — "java/lang/System.out" போன்ற பெயர்கள். Resolution அவற்றை Metaspace-ல் உண்மையான addresses-ஆக மாற்றுகிறது — தேவைப்படும் போது, ஒவ்வொன்றாக.',
  initialise: 'இப்போது தான் — static initialisers ஓடுகின்றன: compiler எல்லா static assignments-ஐயும் static { } blocks-ஐயும் சேர்த்து ஒரு synthetic method-ஆக்கியது — <clinit>. JVM அது சரியாக ஒரே முறை, lock-உடன், சரியான order-ல் ஓடுவதை உறுதி செய்கிறது.',
  'main-thread': 'JVM main thread-ஐ உருவாக்கி, main(String[])-க்கு ஒரு frame-ஐ stack-ல் வைக்கிறது: local variable slot 0-ல் args. Java method calls எல்லாம் thread stack-ல் frames தான் — Phase 1 படம், இப்போது உள்ளடக்கத்துடன்.',
  'first-objects': 'ஒவ்வொரு "new"-ம் நடப்பது Eden-ல் தான் — இளைய generation. Allocation ஒரு pointer bump மட்டுமே: பெரும்பாலான objects இளமையாகவே இறக்கும் என்று Eden வடிவமைக்கப்பட்டது.',
  'minor-gc': 'Eden நிரம்பியது — minor GC ஓடுகிறது: உயிருள்ள objects Survivor space-க்கு நகர்த்தப்படுகின்றன, இறந்தவை மொத்தமாக மீட்டெடுக்கப்படுகின்றன. பல GC-களைத் தாண்டியவை Old Gen-க்குச் செல்கின்றன. மூன்றில் இரண்டு இளமையாகவே இறக்கின்றன — அதுவே இந்த வடிவமைப்பின் பந்தயம்.',
  'lazy-load': 'ஒரு class (ArrayList போல) முதன்முறையாகத் தொடப்படும் போது, loaders மீண்டும் அதே delegation பயணத்தைச் செய்கின்றன — program ஓடிக்கொண்டிருக்கும்போதே. Loading lazy தான்: பயன்படுத்தும் வரை ஒரு class-க்கு எந்தச் செலவும் இல்லை.',
  'main-prints': 'Methods ஒன்றை ஒன்று call செய்யும்போது frames push ஆகின்றன, pop ஆகின்றன; ஒவ்வொரு frame-ின் operand stack-ல் intermediate values எடுபடுகின்றன. Print என்பது System.out வழியாக OS-ை அடைகிறது — Phase 1 process-ன் அதே stdout.',
  exit: 'கடைசி non-daemon thread முடிந்ததும் JVM தன்னையே கூட்டிக்கொள்கிறது: heap, Metaspace, stacks — எல்லாமே OS-ிடம் திரும்புகிறது. Phase 1-ல் கற்ற lifecycle-ஐ இப்போது உள்ளிருந்து பார்த்தோம்.',
};