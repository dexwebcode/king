import { ImagePlaceholder } from "../../shared";
import "./FinalCTA.css";

export default function FinalCTA() {
    return (
        <section className="container final-cta">
            <div className="final-copy">
                <h2>Готовы начать продвижение?</h2>
                <p>Присоединяйтесь к тысячам довольных клиентов и получайте результат уже сегодня</p>
                <div className="hero-actions">
                    <button className="button button-gold">Оформить заказ прямо сейчас</button>
                    <button className="button button-outline">Посмотреть все услуги</button>
                </div>
            </div>
            <ImagePlaceholder className="final-image" />
        </section>
    )
}
