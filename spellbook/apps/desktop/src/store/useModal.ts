import { create } from "zustand";

export type ModalType = "info" | "success" | "warning" | "error";

interface ModalButton {
  label: string;
  onClick?: () => void | Promise<void>;
  variant?: "primary" | "secondary" | "danger";
}

interface ModalState {
  isOpen: boolean;
  type: ModalType;
  title: string;
  message: string | string[];
  buttons: ModalButton[];
  onClose?: () => void;
}

interface ModalStore extends ModalState {
  showModal: (options: Omit<ModalState, "isOpen">) => void;
  hideModal: () => void;
  // Convenience helpers
  alert: (message: string | string[], title?: string, type?: ModalType) => Promise<void>;
  confirm: (message: string | string[], title?: string) => Promise<boolean>;
}

const initialState: ModalState = {
  isOpen: false,
  type: "info",
  title: "",
  message: "",
  buttons: [],
};

export const useModal = create<ModalStore>((set, get) => ({
  ...initialState,

  showModal: (options) => {
    set({ ...options, isOpen: true });
  },

  hideModal: () => {
    const { onClose } = get();
    if (onClose) onClose();
    set({ isOpen: false });
  },

  alert: (message, title = "Notice", type = "info") => {
    return new Promise((resolve) => {
      get().showModal({
        title,
        message,
        type,
        buttons: [
          {
            label: "OK",
            variant: "primary",
            onClick: () => {
              get().hideModal();
              resolve();
            },
          },
        ],
      });
    });
  },

  confirm: (message, title = "Confirm") => {
    return new Promise((resolve) => {
      get().showModal({
        title,
        message,
        type: "warning",
        buttons: [
          {
            label: "Cancel",
            variant: "secondary",
            onClick: () => {
              get().hideModal();
              resolve(false);
            },
          },
          {
            label: "Confirm",
            variant: "danger",
            onClick: () => {
              get().hideModal();
              resolve(true);
            },
          },
        ],
      });
    });
  },
}));
