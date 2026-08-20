import { SectionTitle } from "../../shared";
import "./css/QuickOrder.css";

export default function QuickOrder() {
    return (
        <section className="quick-order container panel-section">
            <SectionTitle title="Быстрый заказ" subtitle="Оформите заказ всего за несколько шагов" />
            <div className="quick-grid">
                {['Площадка', 'Услуга', 'Ссылка', 'Количество', 'Контакты', 'Промокод', 'Итог'].map((label, index) => (
                    <label className="quick-field" key={label}>
                        <span><b>{index + 1}</b>{label}</span>
                        <div className="fake-input">{index === 6 ? '0 ₽' : index === 3 ? '1000' : 'Выберите значение'}</div>
                    </label>
                ))}
            </div>
            <button className="button button-gold quick-submit">Перейти к оплате →</button>
        </section>
    )
}
