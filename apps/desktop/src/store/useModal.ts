import type { ReactNode } from "react";
import { create } from "zustand";

export type ModalType = "info" | "success" | "warning" | "error";

export interface ModalButton {
  label: string;
  onClick?: () => void | Promise<void>;
  variant?: "primary" | "secondary" | "danger";
}

export interface ModalState {
  isOpen: boolean;
  type: ModalType;
  title: string;
  message: string | string[];
  buttons: ModalButton[];
  customContent?: ReactNode;
  dismissible?: boolean;
  onClose?: () => void;
}

interface ModalStore extends ModalState {
  queuedModal?: ShowModalOptions;
  showModal: (options: Omit<ModalState, "isOpen">) => void;
  showModalIfIdle: (options: Omit<ModalState, "isOpen">) => boolean;
  hideModal: () => void;
  // Convenience helpers
  alert: (message: string | string[], title?: string, type?: ModalType) => Promise<void>;
  confirm: (message: string | string[], title?: string) => Promise<boolean>;
}

export type ShowModalOptions = Omit<ModalState, "isOpen">;

const initialState: ModalState = {
  isOpen: false,
  type: "info",
  title: "",
  message: "",
  buttons: [],
};

export const useModal = create<ModalStore>((set, get) => ({
  ...initialState,
  queuedModal: undefined,

  showModal: (options) => {
    set({ ...options, isOpen: true, queuedModal: undefined });
  },

  showModalIfIdle: (options) => {
    if (get().isOpen) {
      set({ queuedModal: options });
      return false;
    }
    set({ ...options, isOpen: true, queuedModal: undefined });
    return true;
  },

  hideModal: () => {
    const { onClose, queuedModal } = get();
    if (onClose) onClose();
    if (queuedModal) {
      set({ ...queuedModal, isOpen: true, queuedModal: undefined });
      return;
    }
    set({ isOpen: false, queuedModal: undefined });
  },

  alert: (message, title = "Notice", type = "info") => {
    return new Promise((resolve) => {
      get().showModal({
        title,
        message,
        type,
        dismissible: false,
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
        dismissible: false,
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
