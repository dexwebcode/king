import { SectionTitle } from "../../shared";
import { useLanguage } from "../../../../ui/i18n";
import "./css/HowItWorks.css";

export default function HowItWorks() {
    const { t } = useLanguage();
    return (
        <section className="container panel-section" id="how">
            <SectionTitle title={t("Как это работает")} subtitle={t("Всего 4 простых шага до результата")} />
            <div className="how-grid">
                {[
                    ['Выберите площадку', 'Выберите социальную сеть для продвижения'],
                    ['Укажите ссылку', 'Вставьте ссылку на ваш аккаунт или пост'],
                    ['Оплатите заказ', 'Выберите удобный для вас способ оплаты'],
                    ['Получите результат', 'Строго соблюдаем правила всех платформ'],
                ].map(([title, text], index) => (
                    <article className="how-step" key={title}>
                        <span>{index + 1}</span>
                        <div><h3>{t(title)}</h3><p>{t(text)}</p></div>
                    </article>
                ))}
            </div>
        </section>
    )
}
