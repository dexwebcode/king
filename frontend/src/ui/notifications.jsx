import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";

import "./notifications.css";

const DEFAULT_DURATION = 6000;
const EXIT_DURATION = 220;
const MAX_VISIBLE = 5;

const NotificationsContext = createContext({
    push: () => null,
    dismiss: () => { },
    setSlot: () => { },
});

/* Доступ к буферу уведомлений из любого компонента:
   const { push } = useNotifications();
   push(t("Текст уведомления"), { tone: "success" }); */
export function useNotifications() {
    return useContext(NotificationsContext);
}

/* Буфер уведомлений: каскад в правом нижнем углу (50px от краёв экрана).
   Новые сообщения появляются снизу, старые поднимаются вверх; при исчезновении
   верхние опускаются вниз. Сообщения уходят сами (duration, мс) или по клику.
   tone: "success" (по умолчанию) | "error" | "info". */
export function NotificationsProvider({ children }) {
    const [items, setItems] = useState([]);
    /* Постоянное уведомление (уведомление об активном платеже) — отдельный
       элемент каскада: живёт в том же буфере, но не является всплывающим. */
    const [slot, setSlot] = useState(null);

    const timers = useRef(new Map());
    const exitTimers = useRef(new Map());
    const nextId = useRef(1);
    const itemRefs = useRef(new Map());
    const slotRef = useRef(null);
    /* Прошлые позиции элементов — для плавного сдвига каскада (FLIP). */
    const prevTops = useRef(new Map());

    const remove = useCallback((id) => {
        setItems((current) => current.filter((item) => item.id !== id));
    }, []);

    const dismiss = useCallback(
        (id) => {
            const timer = timers.current.get(id);
            if (timer) {
                window.clearTimeout(timer);
                timers.current.delete(id);
            }
            /* Сначала проигрываем исчезновение, потом убираем из стопки. */
            setItems((current) =>
                current.map((item) => (item.id === id ? { ...item, leaving: true } : item))
            );
            if (exitTimers.current.has(id)) return;
            exitTimers.current.set(
                id,
                window.setTimeout(() => {
                    exitTimers.current.delete(id);
                    remove(id);
                }, EXIT_DURATION)
            );
        },
        [remove]
    );

    const push = useCallback(
        (message, { tone = "success", duration = DEFAULT_DURATION } = {}) => {
            if (!message) return null;
            const id = nextId.current++;
            setItems((current) => [...current, { id, message: String(message), tone }].slice(-MAX_VISIBLE));
            if (duration > 0) {
                timers.current.set(id, window.setTimeout(() => dismiss(id), duration));
            }
            return id;
        },
        [dismiss]
    );

    /* Каскад: элементы едут из старых позиций в новые, а не прыгают. */
    useLayoutEffect(() => {
        const targets = new Map(itemRefs.current);
        if (slotRef.current) targets.set("slot", slotRef.current);

        targets.forEach((element, id) => {
            element.style.transition = "none";
            element.style.transform = "none";
            const top = element.getBoundingClientRect().top;
            const previousTop = prevTops.current.get(id);
            if (previousTop != null && previousTop !== top) {
                const delta = previousTop - top;
                element.style.transform = `translateY(${delta}px)`;
                window.requestAnimationFrame(() => {
                    element.style.transition = "transform .26s cubic-bezier(.22, 1, .36, 1)";
                    element.style.transform = "translateY(0)";
                });
            }
            prevTops.current.set(id, top);
        });

        Array.from(prevTops.current.keys()).forEach((id) => {
            if (!targets.has(id)) prevTops.current.delete(id);
        });
    });

    /* Уход со страницы: гасим таймеры, чтобы не было обновления состояния после размонтирования. */
    useEffect(() => {
        const pending = timers.current;
        const pendingExits = exitTimers.current;
        return () => {
            pending.forEach((timer) => window.clearTimeout(timer));
            pending.clear();
            pendingExits.forEach((timer) => window.clearTimeout(timer));
            pendingExits.clear();
        };
    }, []);

    const value = useMemo(() => ({ push, dismiss, setSlot }), [push, dismiss]);

    return (
        <NotificationsContext.Provider value={value}>
            {children}
            <div className="kp-notices" role="status" aria-live="polite">
                {slot && (
                    <div className="kp-notices__slot" ref={slotRef}>
                        {slot}
                    </div>
                )}
                {items.map((item) => (
                    <button
                        key={item.id}
                        ref={(node) => {
                            if (node) itemRefs.current.set(item.id, node);
                            else itemRefs.current.delete(item.id);
                        }}
                        className={`kp-notice kp-notice--${item.tone}${item.leaving ? " is-leaving" : ""}`}
                        type="button"
                        title="Закрыть"
                        onClick={() => dismiss(item.id)}
                    >
                        {item.message}
                    </button>
                ))}
            </div>
        </NotificationsContext.Provider>
    );
}
