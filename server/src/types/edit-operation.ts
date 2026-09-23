export type EditOperation =
  | {
      id: string;
      type: "cut";
      start: number;
      end: number;
      reason?: string;
      createdAt: number;
    }
  | {
      id: string;
      type: "trim";
      start: number;
      end: number;
      createdAt: number;
    }
  | {
      id: string;
      type: "split";
      timestamp: number;
      createdAt: number;
    }
  | {
      id: string;
      type: "caption";
      text: string;
      start: number;
      end: number;
      createdAt: number;
    };

export type CutOperation = Extract<EditOperation, { type: "cut" }>;
