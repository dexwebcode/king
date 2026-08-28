import { popular } from "../../landingData";
import { getSocialIconByName, ImagePlaceholder, SectionTitle } from "../../shared";
import "./css/PopularServices.css";

export default function PopularServices({ onSelectService }) {
    return (
        <section className="container panel-section" id="prices">
            <SectionTitle title="Популярные услуги" subtitle="Самые востребованные услуги для продвижения сетей" />
            <div className="product-grid">
                {popular.map(([title, text, price, preset]) => (
                    <article className="product-card" key={title}>
                        <ImagePlaceholder
                            className="product-image"
                            icon={getSocialIconByName(title)}
                            alt={title}
                        />
                        <h3>{title}</h3>
                        <p>{text}</p>
                        <strong>{price}</strong>
                        <div className="product-meta">◷ Мин. заказ: 100 шт.<br />◷ Скорость: до 24ч</div>
                        <button
                            className="button button-outline"
                            type="button"
                            onClick={() => onSelectService(preset)}
                        >
                            Выбрать
                        </button>
                    </article>
                ))}
            </div>
        </section>
    )
}
