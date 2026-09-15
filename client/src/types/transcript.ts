export type TranscriptWord = {
  id: string;
  text: string;
  start: number;
  end: number;
};

export type TranscriptSegment = {
  id: string;
  start: number;
  end: number;
  text: string;
  words: TranscriptWord[];
};

export type Transcript = {
  id: string;
  segments: TranscriptSegment[];
};
