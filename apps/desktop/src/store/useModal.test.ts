import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useModal } from "./useModal";

const resetStore = () =>
  useModal.setState({
    isOpen: false,
    type: "info",
    title: "",
    message: "",
    buttons: [],
    customContent: undefined,
    dismissible: true,
    onClose: undefined,
    queuedModal: undefined,
  });

describe("useModal", () => {
  beforeEach(resetStore);
  afterEach(resetStore);

  it("showModalIfIdle is atomic — second concurrent call is queued", () => {
    const { showModalIfIdle, hideModal } = useModal.getState();

    // Simulate two synchronous calls before any re-render
    const r1 = showModalIfIdle({ title: "First", message: "a", type: "info", buttons: [] });
    const r2 = showModalIfIdle({ title: "Second", message: "b", type: "info", buttons: [] });

    expect(r1).toBe(true); // First caller wins
    expect(r2).toBe(false); // Second caller is queued
    expect(useModal.getState().title).toBe("First");
    expect(useModal.getState().queuedModal?.title).toBe("Second");

    hideModal();
    expect(useModal.getState().title).toBe("Second");
  });

  it("queues an idle-only modal until the active modal closes", () => {
    useModal.getState().showModal({
      title: "Existing",
      message: "Keep me",
      type: "info",
      dismissible: true,
      buttons: [],
    });

    const shown = useModal.getState().showModalIfIdle({
      title: "Startup warning",
      message: ["New message"],
      type: "warning",
      dismissible: true,
      buttons: [],
    });

    expect(shown).toBe(false);
    expect(useModal.getState().title).toBe("Existing");
    expect(useModal.getState().message).toBe("Keep me");

    useModal.getState().hideModal();

    expect(useModal.getState().isOpen).toBe(true);
    expect(useModal.getState().title).toBe("Startup warning");
    expect(useModal.getState().message).toEqual(["New message"]);
  });
});
