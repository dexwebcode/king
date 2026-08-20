import { SectionTitle } from "../../shared";
import "./css/HowItWorks.css";

export default function HowItWorks() {
    return (
        <section className="container panel-section" id="how">
            <SectionTitle title="Как это работает" subtitle="Всего 4 простых шага до результата" />
            <div className="how-grid">
                {[
                    ['Выберите площадку', 'Выберите социальную сеть для продвижения'],
                    ['Укажите ссылку', 'Вставьте ссылку на ваш аккаунт или пост'],
                    ['Оплатите заказ', 'Выберите удобный способ оплаты'],
                    ['Получите результат', 'Строго соблюдаем правила всех платформ'],
                ].map(([title, text], index) => (
                    <article className="how-step" key={title}>
                        <span>{index + 1}</span>
                        <div><h3>{title}</h3><p>{text}</p></div>
                    </article>
                ))}
            </div>
        </section>
    )
}
