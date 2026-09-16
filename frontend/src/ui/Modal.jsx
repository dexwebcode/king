import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

// Shared shell extracted from Header's auth modal, with focus and keyboard handling.
export default function Modal({ title, children, onClose, busy = false, className = "" }) {
    const panel = useRef(null);
    const close = useRef(onClose);
    const locked = useRef(busy);
    close.current = onClose;
    locked.current = busy;

    useEffect(() => {
        const previousFocus = document.activeElement;
        const overflow = document.body.style.overflow;
        const root = document.getElementById("root");
        const wasInert = root?.inert;
        if (root) root.inert = true;
        document.body.style.overflow = "hidden";
        panel.current.focus();
        function handleKey(event) {
            if (event.key === "Escape") {
                event.preventDefault();
                if (!locked.current) close.current();
            }
            if (event.key !== "Tab") return;
            const items = [...panel.current.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]')]
                .filter((element) => element.getClientRects().length);
            const first = items[0];
            const last = items.at(-1);
            if (!first) { event.preventDefault(); return; }
            if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
                event.preventDefault(); last.focus();
            } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) {
                event.preventDefault(); first.focus();
            }
        }
        document.addEventListener("keydown", handleKey);
        return () => {
            document.removeEventListener("keydown", handleKey);
            document.body.style.overflow = overflow;
            if (root) root.inert = wasInert;
            if (previousFocus?.isConnected) previousFocus.focus();
        };
    }, []);

    return createPortal(
        <div className={`auth-modal ${className}`}>
            <div className="auth-modal-backdrop" onClick={() => !busy && onClose()} />
            <section ref={panel} tabIndex={-1} className="auth-modal-panel" role="dialog" aria-modal="true" aria-label={title} aria-busy={busy}>
                <button className="auth-modal-close" type="button" aria-label="Закрыть окно" disabled={busy} onClick={onClose}>×</button>
                {children}
            </section>
        </div>, document.body,
    );
}
