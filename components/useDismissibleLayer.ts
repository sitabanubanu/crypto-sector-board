"use client";

import { useEffect, useRef, type RefObject } from "react";

interface DismissibleLayerOptions {
  open: boolean;
  layerRef: RefObject<HTMLElement | null>;
  initialFocusRef?: RefObject<HTMLElement | null>;
  onDismiss: () => void;
  dismissOnPointerDownOutside?: boolean;
}

/**
 * Provides the shared keyboard and focus behaviour for dialogs and drawers.
 *
 * Outside-pointer dismissal is optional because modal layers use a backdrop,
 * while the desktop sector drawer deliberately leaves the board interactive.
 */
export function useDismissibleLayer({
  open,
  layerRef,
  initialFocusRef,
  onDismiss,
  dismissOnPointerDownOutside = false,
}: DismissibleLayerOptions) {
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ||
      document.activeElement instanceof SVGElement
        ? document.activeElement
        : null;
    let restorePreviousFocus = true;

    const focusFrame = window.requestAnimationFrame(() => {
      initialFocusRef?.current?.focus({ preventScroll: true });
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return;
      event.preventDefault();
      onDismissRef.current();
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (!dismissOnPointerDownOutside) return;
      const target = event.target;
      if (!(target instanceof Node) || layerRef.current?.contains(target)) {
        return;
      }

      // The pointer is already moving to another control. Restoring focus to
      // the old trigger here would steal focus from that control.
      restorePreviousFocus = false;
      onDismissRef.current();
    };

    document.addEventListener("keydown", handleKeyDown);
    if (dismissOnPointerDownOutside) {
      document.addEventListener("pointerdown", handlePointerDown);
    }

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      if (dismissOnPointerDownOutside) {
        document.removeEventListener("pointerdown", handlePointerDown);
      }

      if (restorePreviousFocus && previouslyFocused?.isConnected) {
        window.requestAnimationFrame(() => {
          previouslyFocused.focus({ preventScroll: true });
        });
      }
    };
  }, [
    dismissOnPointerDownOutside,
    initialFocusRef,
    layerRef,
    open,
  ]);
}
