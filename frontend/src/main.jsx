import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import { LanguageProvider } from "./ui/i18n";
import { NotificationsProvider } from "./ui/notifications";
import { PaymentOverlayProvider } from "./ui/PaymentOverlay";
import "./ui/design-system.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <LanguageProvider>
    <BrowserRouter>
      <NotificationsProvider>
        <PaymentOverlayProvider>
          <App />
        </PaymentOverlayProvider>
      </NotificationsProvider>
    </BrowserRouter>
  </LanguageProvider>
);

const bootMs = Math.round(performance.now() - (window.__BOOT_START || 0));
performance.mark("boot-end");
performance.measure("boot", "boot-start", "boot-end");
console.info(`[boot] React mounted in ${bootMs} ms`);
