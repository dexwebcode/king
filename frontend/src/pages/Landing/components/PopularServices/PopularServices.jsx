import { popular } from "../../landingData";
import { ImagePlaceholder, SectionTitle } from "../../shared";
import "./css/PopularServices.css";

export default function PopularServices() {
    return (
        <section className="container panel-section" id="prices">
            <SectionTitle title="Популярные услуги" subtitle="Самые востребованные услуги для продвижения сетей" />
            <div className="product-grid">
                {popular.map(([title, text, price]) => (
                    <article className="product-card" key={title}>
                        <ImagePlaceholder className="product-image" />
                        <h3>{title}</h3>
                        <p>{text}</p>
                        <strong>{price}</strong>
                        <div className="product-meta">◷ Мин. заказ: 100 шт.<br />◷ Скорость: до 24ч</div>
                        <button className="button button-outline">Выбрать</button>
                    </article>
                ))}
            </div>
        </section>
    )
}
