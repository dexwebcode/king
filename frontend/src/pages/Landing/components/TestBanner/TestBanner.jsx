import { ImagePlaceholder } from "../../shared";
import "./css/TestBanner.css";

export default function TestBanner() {
    return (
        <section className="container test-banner">
            <ImagePlaceholder className="test-image" />
            <div>
                <h2>Протестируйте сервис бесплатно</h2>
                <p>Получите 50 подписчиков в подарок для тестирования качества наших услуг</p>
            </div>
            <button className="button button-gold">Получить тест →</button>
        </section>
    )
}
