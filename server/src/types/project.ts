export type Project = {
  id: string;
  name: string;
  duration: number | null;
  filterId: string;
  createdAt: string;
  updatedAt: string;
  hasVideo: boolean;
  hasTranscript: boolean;
  cutCount: number;
};
