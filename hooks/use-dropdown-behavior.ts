"use client";

import { RefObject, useEffect } from "react";

const OPEN_EVENT = "omni-dropdown-open";

interface DropdownOpenEventDetail {
  id: string;
}

interface UseDropdownBehaviorOptions {
  id: string;
  open: boolean;
  setOpen: (open: boolean) => void;
  containerRef: RefObject<HTMLElement | null>;
  triggerRef?: RefObject<HTMLElement | null>;
  focusRef?: RefObject<HTMLElement | null>;
  insideRefs?: Array<RefObject<HTMLElement | null>>;
  closeOnScroll?: boolean;
}

export function useDropdownBehavior({
  id,
  open,
  setOpen,
  containerRef,
  triggerRef,
  focusRef,
  insideRefs = [],
  closeOnScroll = true,
}: UseDropdownBehaviorOptions) {
  useEffect(() => {
    if (!open) return;

    const event = new CustomEvent<DropdownOpenEventDetail>(OPEN_EVENT, {
      detail: { id },
    });
    window.dispatchEvent(event);

    const focusTimer = window.setTimeout(() => {
      focusRef?.current?.focus();
    }, 0);

    const onOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const insidePanel = containerRef.current?.contains(target);
      const insideTrigger = triggerRef?.current?.contains(target);
      const insideExtra = insideRefs.some((ref) => ref.current?.contains(target));
      if (!insidePanel && !insideTrigger && !insideExtra) {
        setOpen(false);
      }
    };

    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };

    const onAnotherOpened = (e: Event) => {
      const custom = e as CustomEvent<DropdownOpenEventDetail>;
      if (custom.detail?.id && custom.detail.id !== id) {
        setOpen(false);
      }
    };

    const onScroll = () => {
      if (!closeOnScroll) return;
      if (!triggerRef?.current) return;

      const rect = triggerRef.current.getBoundingClientRect();
      const offscreen =
        rect.bottom < 0 ||
        rect.top > window.innerHeight ||
        rect.right < 0 ||
        rect.left > window.innerWidth;

      if (offscreen) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onEsc);
    window.addEventListener(OPEN_EVENT, onAnotherOpened as EventListener);
    window.addEventListener("scroll", onScroll, true);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onEsc);
      window.removeEventListener(OPEN_EVENT, onAnotherOpened as EventListener);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, id, setOpen, containerRef, triggerRef, focusRef, insideRefs, closeOnScroll]);
}
