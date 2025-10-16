export type LevelSpec = {
  grammar: string[];
  structures: string[];
  vocabulary: string[];
  esl_targets: string[]; // for Q6–Q8
};

export const LEVEL_RULES: Record<"A1"|"A2"|"B1"|"B2"|"C1"|"C2", LevelSpec> = {
  A1: {
    grammar: [
      "be/have", "there is/are", "present simple", "present continuous (basic)",
      "imperatives", "can (ability/permission)", "articles a/an/the (limited)",
      "this/that/these/those", "basic prepositions (in/on/at)",
      "possessives", "comparatives/superlatives (short adj.)"
    ],
    structures: [
      "simple clauses", "coordination: and/but",
      "yes/no and wh-questions", "one idea per sentence"
    ],
    vocabulary: [
      "600–800 high-frequency headwords", "family/home/food/routines/places/time/numbers"
    ],
    esl_targets: ["basic synonym/antonym", "comparatives", "prepositions in/on/at"]
  },
  A2: {
    grammar: [
      "past simple", "present continuous for future", "going to",
      "some/any/much/many/a lot of", "count/uncount",
      "should/must/have to (basic)", "can/could (requests)",
      "infinitive vs -ing (common verbs)", "because/so/when/if (zero/1st light)"
    ],
    structures: [
      "simple complex sentences (1 subclause)", "time sequencers first/then/finally"
    ],
    vocabulary: [
      "1000–1600 families", "travel/shopping/health/study",
      "basic phrasal verbs", "simple collocations"
    ],
    esl_targets: ["tense choice past/present", "quantifiers", "verb+prep (listen to)", "open cloze (function words)"]
  },
  B1: {
    grammar: [
      "present perfect simple (for/since/ever/never/just/already/yet)",
      "past continuous", "used to", "future (will/going to/present continuous)",
      "1st & 2nd conditional (basic)", "modals: must/have to/should/might",
      "passive (present/past simple)", "defining relatives", "verb patterns (to/-ing)"
    ],
    structures: [
      "cause/contrast/addition (because/although/however/in addition)",
      "narrative past with sequencing", "paragraphing"
    ],
    vocabulary: ["2000–3500 families", "media/environment/work", "phrasal verbs", "stronger collocations"],
    esl_targets: ["lend/borrow", "make/do", "present perfect vs past simple", "relative pronouns", "reference chains"]
  },
  B2: {
    grammar: [
      "present perfect continuous", "past perfect", "broader passive",
      "non-defining relatives", "reported speech (backshift/reporting verbs)",
      "modals of deduction (must/might/can't have + PP)",
      "comparatives with emphasis", "word formation (prefix/suffix)"
    ],
    structures: [
      "despite/in spite of/whereas", "complex noun phrases",
      "limited participle clauses", "hedging"
    ],
    vocabulary: ["4000–5000 families", "abstract topics", "idiomatic collocations/register shift"],
    esl_targets: ["nuanced synonyms", "aspect contrasts", "modal deduction", "collocation precision", "word formation"]
  },
  C1: {
    grammar: [
      "all conditionals incl. mixed", "cleft sentences", "reduced relatives",
      "inversion for emphasis", "ellipsis/substitution", "nominalisation"
    ],
    structures: [
      "sophisticated cohesion", "clear argumentation", "varied information structure"
    ],
    vocabulary: ["6000–8000 families", "academic lexis", "idiomatic phrasal verbs", "register nuance/hedging"],
    esl_targets: ["near-synonym discrimination", "stance/hedge verbs", "complex reference", "key-word transformation"]
  },
  C2: {
    grammar: [
      "native-like flexibility", "rhetorical devices", "fronting/inversion", "idiomatic clause-combining"
    ],
    structures: [
      "information-dense sentences with controlled rhythm", "pragmatic markers"
    ],
    vocabulary: ["very wide range", "low-frequency idioms", "precise connotation/tone"],
    esl_targets: ["register shifts", "idiomatic collocation", "elegant paraphrase"]
  }
};
