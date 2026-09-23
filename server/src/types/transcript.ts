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
  /** Manually assigned speaker name (claude.md section 10). Unset until the user labels it. */
  speaker?: string;
};

export type Transcript = {
  id: string;
  segments: TranscriptSegment[];
};
