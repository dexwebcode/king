import { Link } from "react-router-dom";

import { useLanguage } from "../../../../ui/i18n";
import "./css/Footer.css";

export default function Footer() {
    const { t } = useLanguage();
    return (
        <footer className="footer container" id="support">
            <div className="footer-sections">
                <div><h4>{t("Услуги")}</h4><a href="#services">{t("Instagram")}</a><a href="#services">{t("TikTok")}</a><a href="#services">{t("YouTube")}</a></div>
                <div><h4>{t("Компания")}</h4><a href="#how">{t("О нас")}</a><Link to="/reviews">{t("Отзывы")}</Link><Link to="/faq">{t("FAQ")}</Link></div>
                <div><h4>{t("Поддержка")}</h4><a href="#support">{t("Контакты")}</a><a href="#support">{t("Правила сервиса")}</a><a href="#support">{t("Политика")}</a></div>
                <div><h4>{t("Контакты")}</h4><p>support@kingpromotion.ru</p><p>{t("Поддержка 24/7")}</p></div>
            </div>
        </footer>
    )
}
