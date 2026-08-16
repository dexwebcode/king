import { Link, useLocation } from "react-router-dom";
import "./ExperimentBar.css";

const experimentPages = [
    { path: "/", label: "Вариант 1" },
    { path: "/variant-2", label: "Вариант 2" },
    { path: "/variant-3", label: "Вариант 3" },
    { path: "/login", label: "Вход" },
    { path: "/register", label: "Регистрация" },
    { path: "/main", label: "После входа" },
];

export default function ExperimentBar({ isOpen = false }) {
    const location = useLocation();

    function savePage(path) {
        localStorage.setItem("kingExperimentPage", path);
    }

    return (
        <nav
            className={isOpen ? "experiment-bar experiment-bar--open" : "experiment-bar"}
            aria-label="Экспериментальные страницы"
        >
            <div className="experiment-bar__links">
                {experimentPages.map((page) => (
                    <Link
                        key={page.path}
                        to={page.path}
                        className={
                            location.pathname === page.path
                                ? "experiment-bar__link experiment-bar__link--active"
                                : "experiment-bar__link"
                        }
                        onClick={() => savePage(page.path)}
                    >
                        {page.label}
                    </Link>
                ))}
            </div>
        </nav>
    );
}
