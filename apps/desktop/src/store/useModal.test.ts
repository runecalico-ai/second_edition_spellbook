import { afterEach, describe, expect, it } from "vitest";
import { useModal } from "./useModal";

describe("useModal", () => {
  afterEach(() => {
    useModal.setState({
      isOpen: false,
      type: "info",
      title: "",
      message: "",
      buttons: [],
      customContent: undefined,
      dismissible: true,
      onClose: undefined,
    });
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
