/*
 * Окно оплаты (отдельная вкладка провайдера).
 *
 * Ссылку на него запоминаем в момент открытия: повторно получить окно по имени
 * из другого места нельзя — к моменту отмены оплаты окно уже ушло на домен
 * провайдера (чужой origin), а window.open("", name) вне пользовательского
 * клика блокируется popup-блокировщиком.
 */

let current = null;

export function rememberCheckoutWindow(win) {
    current = win || null;
}

export function closeCheckoutWindow() {
    if (!current) return;
    try {
        current.close();
    } catch {
        // окно могли закрыть вручную или браузер запретил закрытие
    }
    current = null;
}
