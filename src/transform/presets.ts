/**
 * Predefined transformer presets based on semantik-transformer-test results.
 *
 * Test results (from ERGEBNIS.md):
 *   T1 Symbolic:  39% compression, 4.58/5 quality, 1.79 efficiency
 *   T3 Compact:   56% compression, 3.83/5 quality, 2.14 efficiency
 *   T4 Hybrid:    24% compression, 5.00/5 quality, 1.20 efficiency
 *   Baseline:      0% compression, 5.00/5 quality (reference)
 */

export interface TransformPreset {
  name: string;
  description: string;
  transform_to: string;
  transform_from: string;
  encode_instructions: string;
  decode_instructions: string;
  expected_compression: number;
  expected_quality: number;
}

export const PRESETS: Record<string, TransformPreset> = {
  't1-symbolic': {
    name: 'wisdom-t1-symbolic',
    description: 'S-Expression encoding. 39% compression, 4.58/5 quality. Best for definitions and procedures.',
    transform_to: 'application/x-sexp',
    transform_from: 'text/plain',
    expected_compression: 0.39,
    expected_quality: 4.58,
    encode_instructions: `Encode the content as S-Expressions using this syntax:

Types: :obs (observation), :con (conclusion), :hyp (hypothesis), :pro (procedure), :def (definition), :ctx (counterexample), :syn (synthesis), :que (question)
Relations: :sup (supports), :cnt (contradicts), :ext (extends), :dep (depends_on), :spe (specializes)

Rules:
1. IDENTIFY fragment type
2. EXTRACT key entities
3. MAP entities to short symbols
4. STRUCTURE as nested S-expression
5. ADD metadata (:conf, :src)

Example:
(def qtg01
  (is-a "Qt Graphs" :module)
  (purpose :visualization (:2d :3d))
  (part-of :qt6))

(pro surf01
  (goal "3D surface plot")
  (steps
    (create "Q3DSurface")
    (add "QSurface3DSeries")
    (set-data "QSurfaceDataProxy")))`,
    decode_instructions: `Decode S-Expressions back to English:

1. PARSE S-expression
2. IDENTIFY fragment type from first symbol (:def, :obs, :pro, etc.)
3. EXPAND symbols to full terms
4. Apply templates:
   (def <id> (is-a <X> <Y>)) → "<X> is a <Y>."
   (pro <id> (goal <G>) (steps <S1> <S2>...)) → "To <G>: 1) <S1>, 2) <S2>, ..."
   (hyp <id> (if <C>) (then <E1> <E2>)) → "If <C>, then <E1> and <E2>."
   (obs <id> (supports <A> <B> :domain <D>)) → "<A> supports <B> in <D>."
5. POST-PROCESS for fluency`,
  },

  't3-compact': {
    name: 'wisdom-t3-compact',
    description: 'Compact schema encoding. 56% compression, 3.83/5 quality. Highest compression, best for factual data.',
    transform_to: 'application/x-compact-schema',
    transform_from: 'text/plain',
    expected_compression: 0.56,
    expected_quality: 3.83,
    encode_instructions: `Encode as typed compact schema records:

Fragment header: F{type:TYPE dom:DOMAIN conf:LEVEL}
Entity list: E[1:"label" 2:"label"]
Relations: R[1 predicate 2]
Steps (procedures): STEPS[{act:ACTION obj:ENTITY}]

Types: DEF, OBS, HYP, PROC, CONC, CTX, SYN, QUE
Confidence: LOW, MED, HIGH, CERT

Example:
F{type:DEF dom:CHEM conf:HIGH
  E[1:"NADH" 2:"NAD+" 3:"electrons"]
  R[1 donates 3]
  R[2 accepts 3]}

F{type:PROC dom:QT conf:HIGH
  E[1:"surface plot" 2:"Q3DSurface" 3:"Series"]
  STEPS[{act:CREATE obj:2} {act:ADD obj:3 to:2}]
  GOAL:1}

Use domain abbreviations freely. Prioritize compression over readability.`,
    decode_instructions: `Decode compact schema records to English:

1. PARSE fragment header (type, domain, confidence)
2. RESOLVE entity references to labels
3. EXPAND relations to subject-predicate-object
4. SELECT template based on fragment type:
   DEFINITION: "<E1> <relation> <E2>."
   OBSERVATION: "<E1> <relation> <E2>." [+ confidence]
   HYPOTHESIS: "If <condition>, then <consequence>."
   PROCEDURE: "To <goal>: <step1>, <step2>, ..."
5. POST-PROCESS for fluency`,
  },

  't4-hybrid': {
    name: 'wisdom-t4-hybrid',
    description: 'Natural language + structured metadata. 24% compression, 5.0/5 quality. Best for nuanced content.',
    transform_to: 'application/x-hybrid',
    transform_from: 'text/plain',
    expected_compression: 0.24,
    expected_quality: 5.0,
    encode_instructions: `Encode as hybrid format: condensed natural language + structured metadata.

Format:
f:ID {T:TYPE D:domain C:confidence}
text: "Condensed natural language summary"
E: [entity1:type, entity2:type]
R: [entity1 relation entity2, ...]
src: "source"

Types: OBS, CON, HYP, PROC, DEF, CTX, SYN, QUE

Example:
f:CN-RU01 {T:OBS D:geo C:.85}
text: "China supports Russia economically (oil, gas, tech, CIPS)
       but withholds lethal weapons to avoid sanctions."
E: [China:state, Russia:state, econ-support:concept]
R: [China provides econ-support to Russia,
    China withholds lethal-wpn from Russia]
src: "CFR-2025"

Keep the text readable and fluent. Structure adds precision, not replaces content.`,
    decode_instructions: `Decode hybrid format to full English:

1. READ the text field as the core content
2. EXPAND any abbreviations (CN→China, etc.)
3. INTEGRATE structured relations if they add info not in text
4. APPLY confidence qualifier if < HIGH
5. POST-PROCESS for fluency and completeness`,
  },

  'baseline': {
    name: 'wisdom-baseline',
    description: 'Plain English natural language. No compression, perfect quality. Default when no encoding needed.',
    transform_to: 'text/plain',
    transform_from: 'text/plain',
    expected_compression: 0,
    expected_quality: 5.0,
    encode_instructions: `Write clear, self-contained English knowledge fragments.

Each fragment should be:
1. Atomic: one concept per fragment
2. Self-contained: understandable without context
3. Typed: classify as observation, definition, procedure, hypothesis, etc.
4. Factual: verifiable where possible`,
    decode_instructions: `Return the content as-is. No decoding needed for baseline fragments.`,
  },
};

/**
 * Fragment type to recommended transformer mapping.
 * Based on semantik-transformer-test quality/compression tradeoffs.
 */
export const TYPE_TO_PRESET: Record<string, string> = {
  DEFINITION: 't1-symbolic',
  PROCEDURE: 't1-symbolic',
  FACT: 't3-compact',
  OBSERVATION: 't3-compact',
  HYPOTHESIS: 't4-hybrid',
  SYNTHESIS: 't4-hybrid',
  INSIGHT: 't4-hybrid',
  OPINION: 't4-hybrid',
  QUESTION: 'baseline',
  ANSWER: 'baseline',
  EXAMPLE: 'baseline',
  ANTITHESIS: 't4-hybrid',
};

/**
 * Get a preset by name.
 */
export function getPresetTransform(name: string): TransformPreset | undefined {
  return PRESETS[name];
}

/**
 * Select the best preset based on fragment type and context pressure.
 * contextPressure: 0.0 (low) to 1.0 (high) — how close to token budget.
 */
export function selectPreset(fragmentType: string, contextPressure: number = 0): string {
  // High context pressure: prefer higher compression
  if (contextPressure > 0.7) {
    if (fragmentType === 'HYPOTHESIS' || fragmentType === 'SYNTHESIS' || fragmentType === 'INSIGHT') {
      return 't1-symbolic'; // Upgrade from t4 to t1 for compression
    }
    return 't3-compact'; // Max compression
  }

  // Low context pressure: prefer quality
  if (contextPressure < 0.3) {
    return TYPE_TO_PRESET[fragmentType] || 't4-hybrid';
  }

  // Normal: use type-based recommendation
  return TYPE_TO_PRESET[fragmentType] || 't1-symbolic';
}
