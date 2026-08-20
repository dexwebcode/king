import "./css/Footer.css";

export default function Footer() {
    return (
        <footer className="footer container" id="support">
            <div className="footer-brand">
                <div className="brand"><span className="brand-mark">♛</span><span><strong>KING</strong><small>PROMOTION</small></span></div>
                <p>Лучший сервис для продвижения в социальных сетях.</p>
            </div>
            <div><h4>Услуги</h4><a href="#services">Instagram</a><a href="#services">TikTok</a><a href="#services">YouTube</a></div>
            <div><h4>Компания</h4><a href="#how">О нас</a><a href="#reviews">Отзывы</a><a href="#faq">FAQ</a></div>
            <div><h4>Поддержка</h4><a href="#support">Контакты</a><a href="#support">Правила сервиса</a><a href="#support">Политика</a></div>
            <div><h4>Контакты</h4><p>support@kingpromotion.ru</p><p>Поддержка 24/7</p></div>
        </footer>
    )
}
