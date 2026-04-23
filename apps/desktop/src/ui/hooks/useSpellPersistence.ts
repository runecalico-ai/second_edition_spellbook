import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SpellDetail } from "../../types/spell";
import { useNotifications } from "../../store/useNotifications";
import { useModal } from "../../store/useModal";
import { useNavigate } from "react-router-dom";
import { spellbookE2EHarness } from "../spellbookE2EHarness";

const SPELL_DETAIL_LOADING_DELAY_MS = 150;
const SPELL_SAVE_LABEL_DELAY_MS = 300;
const SPELL_LOAD_ERROR_MESSAGE =
  "Failed to load spell. Please return to the library and try again.";

export function useSpellPersistence({
  id,
  isNew,
  resetEditorUiState,
  resetStructuredLoadState,
  onLoadSuccess,
}: {
  id: string | undefined;
  isNew: boolean;
  resetEditorUiState: () => void;
  resetStructuredLoadState: () => void;
  onLoadSuccess: (data: SpellDetail, isActive: () => boolean) => void;
}) {
  const navigate = useNavigate();
  const { alert: modalAlert, confirm: modalConfirm } = useModal();
  const pushNotification = useNotifications((state) => state.pushNotification);
  const requestedSpellId = !isNew && id ? Number.parseInt(id, 10) : null;

  const [loading, setLoading] = useState(() => !isNew && Boolean(id));
  const [showLoading, setShowLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savePending, setSavePending] = useState(false);
  const [saveShowsDelayedLabel, setSaveShowsDelayedLabel] = useState(false);
  const saveInFlightRef = useRef(false);

  const saveDelayedLabelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const detailLoadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSaveDelayedLabelTimer = useCallback(() => {
    if (saveDelayedLabelTimerRef.current !== null) {
      clearTimeout(saveDelayedLabelTimerRef.current);
      saveDelayedLabelTimerRef.current = null;
    }
  }, []);

  const clearDetailLoadingTimer = useCallback(() => {
    if (detailLoadingTimerRef.current !== null) {
      clearTimeout(detailLoadingTimerRef.current);
      detailLoadingTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearSaveDelayedLabelTimer();
      clearDetailLoadingTimer();
    };
  }, [clearDetailLoadingTimer, clearSaveDelayedLabelTimer]);

  useEffect(() => {
    clearDetailLoadingTimer();

    if (isNew) {
      setLoadError(null);
      setShowLoading(false);
      setLoading(false);
      resetStructuredLoadState();
      return;
    }

    if (!id) {
      setLoadError(null);
      setShowLoading(false);
      setLoading(false);
      return;
    }

    if (requestedSpellId !== null && Number.isNaN(requestedSpellId)) {
      setLoadError(SPELL_LOAD_ERROR_MESSAGE);
      setShowLoading(false);
      setLoading(false);
      resetStructuredLoadState();
      return;
    }

    let isActive = true;
    const requestedId = requestedSpellId as number;
    setLoadError(null);
    setLoading(true);
    setShowLoading(false);
    resetEditorUiState();

    detailLoadingTimerRef.current = setTimeout(() => {
      if (!isActive) return;
      resetStructuredLoadState();
      setShowLoading(true);
    }, SPELL_DETAIL_LOADING_DELAY_MS);

    invoke<SpellDetail | null>("get_spell", { id: requestedId })
      .then((data) => {
        if (!isActive) return;
        clearDetailLoadingTimer();
        resetStructuredLoadState();

        if (!data) {
          console.error("Failed to load spell: no spell returned for id", requestedId);
          setLoadError(SPELL_LOAD_ERROR_MESSAGE);
          return;
        }

        if (data.id !== requestedId) {
          console.error("Failed to load spell: loaded spell id did not match request", {
            requestedId,
            loadedId: data.id,
          });
          setLoadError(SPELL_LOAD_ERROR_MESSAGE);
          return;
        }

        onLoadSuccess(data, () => isActive);
        setLoadError(null);
      })
      .catch((e) => {
        if (!isActive) return;
        console.error("Failed to load spell:", e);
        clearDetailLoadingTimer();
        resetStructuredLoadState();
        setLoadError(SPELL_LOAD_ERROR_MESSAGE);
      })
      .finally(() => {
        if (!isActive) return;
        clearDetailLoadingTimer();
        setShowLoading(false);
        setLoading(false);
      });

    return () => {
      isActive = false;
      clearDetailLoadingTimer();
    };
  }, [
    clearDetailLoadingTimer,
    id,
    isNew,
    onLoadSuccess,
    requestedSpellId,
    resetEditorUiState,
    resetStructuredLoadState,
  ]);

  const saveSpell = useCallback(async (
    normalizedSpellData: SpellDetail,
    onSaveSuccess?: () => void,
  ) => {
    if (loading || saveInFlightRef.current) return;
    try {
      saveInFlightRef.current = true;
      setSavePending(true);
      setSaveShowsDelayedLabel(false);
      clearSaveDelayedLabelTimer();
      saveDelayedLabelTimerRef.current = setTimeout(() => {
        saveDelayedLabelTimerRef.current = null;
        setSaveShowsDelayedLabel(true);
      }, SPELL_SAVE_LABEL_DELAY_MS);

      await spellbookE2EHarness.spellEditor.waitForSaveInvokeDelay();

      if (isNew) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id, ...createData } = normalizedSpellData;
        await invoke("create_spell", { spell: createData });
      } else {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { artifacts, ...updateData } = normalizedSpellData;
        await invoke("update_spell", { spell: updateData });
      }

      onSaveSuccess?.();
      pushNotification("success", "Spell saved.");
      navigate("/");
    } catch (e) {
      await modalAlert(`Failed to save: ${e}`, "Save Error", "error");
    } finally {
      clearSaveDelayedLabelTimer();
      setSaveShowsDelayedLabel(false);
      setSavePending(false);
      saveInFlightRef.current = false;
    }
  }, [clearSaveDelayedLabelTimer, isNew, loading, modalAlert, navigate, pushNotification]);

  const deleteSpell = useCallback(async (spellId: number | undefined) => {
    if (savePending || saveInFlightRef.current) return;
    const confirmed = await modalConfirm(
      "Are you sure you want to delete this spell?",
      "Delete Spell",
    );
    if (!confirmed) return;
    try {
      if (spellId) {
        await invoke("delete_spell", { id: spellId });
        navigate("/");
      }
    } catch (e) {
      await modalAlert(`Failed to delete: ${e}`, "Delete Error", "error");
    }
  }, [modalAlert, modalConfirm, navigate, savePending]);

  return {
    loading,
    showLoading,
    loadError,
    requestedSpellId,
    savePending,
    saveShowsDelayedLabel,
    saveSpell,
    deleteSpell,
  };
}
