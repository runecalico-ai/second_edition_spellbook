import { create } from "zustand";

interface ImportActivityStore {
  activeImportCount: number;
  isImportInProgress: boolean;
  beginImportActivity: () => void;
  endImportActivity: () => void;
  reset: () => void;
}

export const useImportActivity = create<ImportActivityStore>((set) => ({
  activeImportCount: 0,
  isImportInProgress: false,
  beginImportActivity: () => {
    set((state) => {
      const activeImportCount = state.activeImportCount + 1;
      return {
        activeImportCount,
        isImportInProgress: activeImportCount > 0,
      };
    });
  },
  endImportActivity: () => {
    set((state) => {
      const activeImportCount = Math.max(0, state.activeImportCount - 1);
      return {
        activeImportCount,
        isImportInProgress: activeImportCount > 0,
      };
    });
  },
  reset: () => {
    set({ activeImportCount: 0, isImportInProgress: false });
  },
}));
