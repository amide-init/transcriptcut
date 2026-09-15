import { create } from "zustand";

export type ProjectStatus = "empty" | "uploading" | "transcribing" | "ready" | "error";

type ProjectStore = {
  name: string;
  videoUrl: string | null;
  status: ProjectStatus;
  error: string | null;

  setName: (name: string) => void;
  setVideoUrl: (url: string | null) => void;
  setStatus: (status: ProjectStatus) => void;
  setError: (error: string | null) => void;
  reset: () => void;
};

export const useProjectStore = create<ProjectStore>((set) => ({
  name: "Untitled Project",
  videoUrl: null,
  status: "empty",
  error: null,

  setName: (name) => set({ name }),
  setVideoUrl: (videoUrl) => set({ videoUrl }),
  setStatus: (status) => set((s) => ({ status, error: status === "error" ? s.error : null })),
  setError: (error) => set({ error, status: "error" }),
  reset: () => set({ name: "Untitled Project", videoUrl: null, status: "empty", error: null }),
}));
