import { platforms } from "../../landingData";
import { ImagePlaceholder, SectionTitle } from "../../shared";
import "./css/Platforms.css";

export default function Platforms() {
    return (
        <section className="container" id="services">
            <SectionTitle title="Поддерживаемые площадки" subtitle="Продвигайте аккаунты во всех популярных социальных сетях" />
            <div className="platform-cards">
                {platforms.map((name) => (
                    <article className="platform-card" key={name}>
                        <ImagePlaceholder className="platform-image" />
                        <h3>{name}</h3>
                        <p>Подписчики, лайки, просмотры, охваты</p>
                        <strong>от 0.25 ₽</strong>
                    </article>
                ))}
            </div>
        </section>
    )
}
