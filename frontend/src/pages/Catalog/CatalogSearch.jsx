import { useEffect, useRef, useState } from "react";

import searchIcon from "../../assets/icons/search.png";


export default function CatalogSearch({ value, onChange, staticSearch = false }) {
    if (staticSearch) {
        return <StaticCatalogSearch value={value} onChange={onChange} />;
    }

    return <ExpandableCatalogSearch value={value} onChange={onChange} />;
}

function StaticCatalogSearch({ value, onChange }) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className={`catalog-search-control is-static ${isOpen ? "is-open" : ""}`} role="search">
            <label className="catalog-search-field">
                <span>Поиск по каталогу</span>
                <input
                    type="search"
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    placeholder="Поиск по каталогу"
                    tabIndex={isOpen ? 0 : -1}
                />
            </label>
            <button
                className="catalog-search-static-toggle"
                type="button"
                aria-label={isOpen ? "Свернуть поиск" : "Открыть поиск"}
                aria-expanded={isOpen}
                onClick={() => setIsOpen((current) => !current)}
            >
                <img className="catalog-search-static-icon" src={searchIcon} alt="" />
            </button>
        </div>
    );
}

function ExpandableCatalogSearch({ value, onChange }) {
    const [isOpen, setIsOpen] = useState(false);
    const inputRef = useRef(null);
    const triggerRef = useRef(null);

    useEffect(() => {
        if (isOpen) inputRef.current?.focus();
    }, [isOpen]);

    function closeSearch() {
        onChange("");
        setIsOpen(false);
        triggerRef.current?.focus();
    }

    function handleKeyDown(event) {
        if (event.key === "Escape") closeSearch();
    }

    return (
        <div className={`catalog-search-control ${isOpen ? "is-open" : ""}`} role="search">
            <button
                ref={triggerRef}
                className="catalog-search-trigger"
                type="button"
                aria-label="Открыть поиск по каталогу"
                aria-expanded={isOpen}
                onClick={() => setIsOpen(true)}
            >
                <img src={searchIcon} alt="" />
            </button>
            <div className="catalog-search-panel" aria-hidden={!isOpen}>
                <img className="catalog-search-icon" src={searchIcon} alt="" />
                <label className="catalog-search-field">
                    <span>Поиск по каталогу</span>
                    <input
                        ref={inputRef}
                        type="search"
                        value={value}
                        onChange={(event) => onChange(event.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Введите запрос"
                        tabIndex={isOpen ? 0 : -1}
                    />
                </label>
                <button
                    className="catalog-search-close"
                    type="button"
                    aria-label="Закрыть поиск"
                    tabIndex={isOpen ? 0 : -1}
                    onClick={closeSearch}
                >
                    ×
                </button>
            </div>
        </div>
    );
}
