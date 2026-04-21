import { useState, useCallback } from "react";
import { Bindings, loadBindings, saveBindings } from "../lib/keybindings";

export function useKeybindings() {
  const [bindings, setBindings] = useState<Bindings>(() => loadBindings());

  const updateBinding = useCallback((action: string, key: string) => {
    setBindings((prev) => {
      const next = { ...prev, [action]: key };
      saveBindings(next);
      return next;
    });
  }, []);

  const resetBindings = useCallback(() => {
    localStorage.removeItem("todoish:keybindings");
    setBindings(loadBindings());
  }, []);

  return { bindings, updateBinding, resetBindings };
}
