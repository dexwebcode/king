import { Link } from "react-router-dom";

import { ImagePlaceholder } from "../../shared";
import "./css/FinalCTA.css";

export default function FinalCTA({ onQuickOrderClick }) {
    function handleQuickOrderClick(event) {
        if (!onQuickOrderClick) {
            return;
        }

        event.preventDefault();
        onQuickOrderClick();
    }

    return (
        <section className="container final-cta">
            <div className="final-copy">
                <h2>Готовы начать продвижение?</h2>
                <p>Присоединяйтесь к тысячам довольных клиентов и получайте результат уже сегодня</p>

                <div className="final-actions">
                    <a
                        className="final-action final-action--primary"
                        href="#quick-order"
                        onClick={handleQuickOrderClick}
                    >
                        <span className="final-action-label">Оформить заказ прямо сейчас</span>
                    </a>

                    <Link className="final-action final-action--ghost" to="/catalog">
                        <span className="final-action-label">Посмотреть все услуги</span>
                    </Link>
                </div>
            </div>
            <ImagePlaceholder className="final-image" />
        </section>
    )
}
