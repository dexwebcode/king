import { Link } from "react-router-dom";

import "./css/Footer.css";

export default function Footer() {
    return (
        <footer className="footer container" id="support">
            <div className="footer-sections">
                <div><h4>Услуги</h4><a href="#services">Instagram</a><a href="#services">TikTok</a><a href="#services">YouTube</a></div>
                <div><h4>Компания</h4><a href="#how">О нас</a><Link to="/reviews">Отзывы</Link><Link to="/faq">FAQ</Link></div>
                <div><h4>Поддержка</h4><a href="#support">Контакты</a><a href="#support">Правила сервиса</a><a href="#support">Политика</a></div>
                <div><h4>Контакты</h4><p>support@kingpromotion.ru</p><p>Поддержка 24/7</p></div>
            </div>
        </footer>
    )
}
