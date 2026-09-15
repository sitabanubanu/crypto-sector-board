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
      if (event.isComposing) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onDismissRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const layer = layerRef.current;
      if (!layer) return;
      const focusable = Array.from(
        layer.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => {
        const style = window.getComputedStyle(element);
        return style.display !== "none" && style.visibility !== "hidden";
      });
      if (focusable.length === 0) return;

      const currentIndex = focusable.indexOf(
        document.activeElement as HTMLElement,
      );
      const leavingBefore = event.shiftKey && currentIndex <= 0;
      const leavingAfter = !event.shiftKey && currentIndex === focusable.length - 1;
      const outsideLayer = !layer.contains(document.activeElement);
      if (!leavingBefore && !leavingAfter && !outsideLayer) return;

      event.preventDefault();
      (event.shiftKey ? focusable[focusable.length - 1] : focusable[0]).focus({
        preventScroll: true,
      });
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
