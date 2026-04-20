import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SpellDetail } from "../../types/spell";
import { useNotifications } from "../../store/useNotifications";
import { useModal } from "../../store/useModal";
import { useNavigate } from "react-router-dom";

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
  onLoadSuccess: (data: SpellDetail) => void;
}) {
  const navigate = useNavigate();
  const { alert: modalAlert, confirm: modalConfirm } = useModal();
  const pushNotification = useNotifications((state) => state.pushNotification);

  const [loading, setLoading] = useState(() => !isNew && Boolean(id));
  const [showLoading, setShowLoading] = useState(false);
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

    // Synchronous state resets when ID changes
    if (isNew) {
      setShowLoading(false);
      setLoading(false);
      resetStructuredLoadState();
      return;
    }

    if (!id) {
      setShowLoading(false);
      setLoading(false);
      return;
    }

    let isActive = true;
    setLoading(true);
    setShowLoading(false);
    resetEditorUiState();

    detailLoadingTimerRef.current = setTimeout(() => {
      if (!isActive) return;
      resetStructuredLoadState();
      setShowLoading(true);
    }, 150);

    invoke<SpellDetail>("get_spell", { id: Number.parseInt(id) })
      .then((data) => {
        if (!isActive) return;
        clearDetailLoadingTimer();
        resetStructuredLoadState(); // Reset before applying new data
        if (data) {
          onLoadSuccess(data);
        }
      })
      .catch((e) => {
        if (!isActive) return;
        console.error("Failed to load spell:", e);
        // Ensure UI is cleared on error
        resetStructuredLoadState();
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
  }, [id, isNew, resetEditorUiState, resetStructuredLoadState, onLoadSuccess, clearDetailLoadingTimer]);

  const saveSpell = async (normalizedSpellData: SpellDetail, preSaveLogic: () => Promise<void>, postSaveLogic: () => void) => {
    if (loading || saveInFlightRef.current) return;
    try {
      saveInFlightRef.current = true;
      setSavePending(true);
      setSaveShowsDelayedLabel(false);
      clearSaveDelayedLabelTimer();
      saveDelayedLabelTimerRef.current = setTimeout(() => {
        saveDelayedLabelTimerRef.current = null;
        setSaveShowsDelayedLabel(true);
      }, 300);

      await preSaveLogic();

      if (isNew) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id, ...createData } = normalizedSpellData;
        await invoke("create_spell", { spell: createData });
      } else {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { artifacts, ...updateData } = normalizedSpellData;
        await invoke("update_spell", { spell: updateData });
      }

      postSaveLogic();
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
  };

  const deleteSpell = async (spellId: number | undefined) => {
    if (savePending) return;
    const confirmed = await modalConfirm("Are you sure you want to delete this spell?", "Delete Spell");
    if (!confirmed) return;
    try {
      if (spellId) {
        await invoke("delete_spell", { id: spellId });
        navigate("/");
      }
    } catch (e) {
      await modalAlert(`Failed to delete: ${e}`, "Delete Error", "error");
    }
  };

  return {
    loading,
    showLoading,
    savePending,
    saveShowsDelayedLabel,
    saveSpell,
    deleteSpell,
  };
}
