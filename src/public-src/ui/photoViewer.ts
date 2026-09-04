import { el } from "./dom.js";

/**
 * Visualizador de foto em tela cheia com pinch-zoom, arrastar e duplo-toque para
 * resetar o zoom. Implementado sem nenhuma biblioteca (so Pointer Events), pensado
 * para uso no celular.
 */
export function openPhotoViewer(imageUrl: string, alt: string): void {
  let scale = 1;
  let originX = 0;
  let originY = 0;
  let lastTapTime = 0;

  const img = el("img", {
    src: imageUrl,
    alt,
    class: "photo-viewer__img",
  }) as HTMLImageElement;

  function applyTransform(): void {
    img.style.transform = `translate(${originX}px, ${originY}px) scale(${scale})`;
  }

  function resetTransform(): void {
    scale = 1;
    originX = 0;
    originY = 0;
    applyTransform();
  }

  const overlay = el(
    "div",
    { class: "photo-viewer", role: "dialog", "aria-modal": "true" },
    [
      el("button", {
        class: "photo-viewer__close",
        "aria-label": "Fechar",
        onclick: () => close(),
      }, ["✕"]),
      img,
    ],
  );

  function close(): void {
    overlay.remove();
    document.removeEventListener("keydown", onKeyDown);
  }

  function onKeyDown(ev: KeyboardEvent): void {
    if (ev.key === "Escape") close();
  }

  overlay.addEventListener("click", (ev) => {
    if (ev.target === overlay) close();
  });
  document.addEventListener("keydown", onKeyDown);

  // ---------- Pinch-zoom / arrastar / duplo-toque (Pointer Events) ----------
  const pointers = new Map<number, { x: number; y: number }>();
  let pinchStartDist = 0;
  let pinchStartScale = 1;
  let dragStart: { x: number; y: number; originX: number; originY: number } | null = null;

  function distance(): number {
    const pts = Array.from(pointers.values());
    if (pts.length < 2) return 0;
    const [a, b] = pts;
    if (!a || !b) return 0;
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  img.addEventListener("pointerdown", (ev) => {
    img.setPointerCapture(ev.pointerId);
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

    if (pointers.size === 2) {
      pinchStartDist = distance();
      pinchStartScale = scale;
      dragStart = null;
    } else if (pointers.size === 1) {
      const now = Date.now();
      if (now - lastTapTime < 300) {
        resetTransform(); // duplo-toque: reseta o zoom
      }
      lastTapTime = now;
      dragStart = { x: ev.clientX, y: ev.clientY, originX, originY };
    }
  });

  img.addEventListener("pointermove", (ev) => {
    if (!pointers.has(ev.pointerId)) return;
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

    if (pointers.size === 2 && pinchStartDist > 0) {
      const newDist = distance();
      scale = Math.min(6, Math.max(1, pinchStartScale * (newDist / pinchStartDist)));
      applyTransform();
    } else if (pointers.size === 1 && dragStart && scale > 1) {
      originX = dragStart.originX + (ev.clientX - dragStart.x);
      originY = dragStart.originY + (ev.clientY - dragStart.y);
      applyTransform();
    }
  });

  function endPointer(ev: PointerEvent): void {
    pointers.delete(ev.pointerId);
    if (pointers.size < 2) pinchStartDist = 0;
    if (pointers.size === 0) dragStart = null;
  }
  img.addEventListener("pointerup", endPointer);
  img.addEventListener("pointercancel", endPointer);
  img.addEventListener("pointerleave", endPointer);

  document.body.appendChild(overlay);
}
