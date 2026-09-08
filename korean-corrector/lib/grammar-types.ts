export type LevelId = 'sc1' | 'sc2' | 'tc1' | 'tc2';

export interface GrammarPattern {
  form: string;
  meaning: string;
}

export interface GrammarLesson {
  number: number;
  title: string;
  patterns: GrammarPattern[];
}

export interface GrammarLevelData {
  level: LevelId;
  label: string;
  lessons: GrammarLesson[];
}

export interface VocabWord {
  word: string;
  meaning: string;
}

export interface VocabLesson {
  number: number;
  words: VocabWord[];
}

export interface VocabLevelData {
  level: LevelId;
  label: string;
  lessons: VocabLesson[];
}
