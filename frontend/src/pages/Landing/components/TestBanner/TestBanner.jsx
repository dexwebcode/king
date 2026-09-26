import { ImagePlaceholder } from "../../shared";
import { useLanguage } from "../../../../ui/i18n";
import "./css/TestBanner.css";

export default function TestBanner() {
    const { t } = useLanguage();
    return (
        <section className="container test-banner">
            <ImagePlaceholder className="test-image" />
            <div>
                <h2>{t("Протестируйте сервис бесплатно")}</h2>
                <p>{t("Получите 50 подписчиков в подарок для тестирования качества наших услуг")}</p>
            </div>
            <button className="button button-outline">{t("Получить тест")} →</button>
        </section>
    )
}
