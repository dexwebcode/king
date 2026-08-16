import { Link } from "react-router-dom";
import logo from "../../assets/logo.png";
import "./Main.css";

export default function Main() {
    return (
        <main className="main-page">
            <header className="main-header">
                <Link to="/" className="main-brand" aria-label="KING PROMOTION">
                    <img src={logo} alt="" />
                    <span>
                        <strong>KING</strong>
                        <small>PROMOTION</small>
                    </span>
                </Link>
            </header>

            <section className="main-content">
                <div>
                    <p className="main-eyebrow">Аккаунт подключен</p>
                    <h1>Главная страница</h1>
                    <p>
                        Вход выполнен успешно. Здесь будет основная страница
                        личного кабинета.
                    </p>
                </div>
            </section>
        </main>
    );
}
