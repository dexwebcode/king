# 01-ARCHITECTURE
## Общая архитектура Frontend
```
frontend/
  ├── src/
  │     ├── assets/ --> Папка для иконок и изобржажений
  │     │
  │     ├── pages/ --> Дерриктория страниц сайта
  │     │    │
  │     │    ├── Admin/
  │     │    │    ├── Admin.css
  │     │    │    └── Admin.jsx
  │     │    │
  │     │    ├── Catalog/
  │     │    │    ├── Catalog.css
  │     │    │    └── Catalog.jsx
  │     │    │
  │     │    ├── Landing/
  │     │    │    │
  │     │    │    ├── components/
  │     │    │    │    │
  │     │    │    │    ├── Benefits/
  │     │    │    │    │    │
  │     │    │    │    │    ├── css/
  │     │    │    │    │    │    └── Benefits.css
  │     │    │    │    │    │
  │     │    │    │    │    └── Benefits.jsx
  │     │    │    │    │
  │     │    │    │    ├── FinalCTA/
  │     │    │    │    │    │
  │     │    │    │    │    ├── css/
  │     │    │    │    │    │    └── FinalCTA.css
  │     │    │    │    │    │
  │     │    │    │    │    └── FinalCTA.jsx
  │     │    │    │    │
  │     │    │    │    ├── Footer/
  │     │    │    │    │    │
  │     │    │    │    │    ├── css/
  │     │    │    │    │    │    └── BenefFooterits.css
  │     │    │    │    │    │
  │     │    │    │    │    └── Footer.jsx
  │     │    │    │    │
  │     │    │    │    ├── Header/
  │     │    │    │    │    │
  │     │    │    │    │    ├── css/
  │     │    │    │    │    │    └── Header.css
  │     │    │    │    │    │
  │     │    │    │    │    └── Header.jsx
  │     │    │    │    │
  │     │    │    │    ├── Hero/
  │     │    │    │    │    │
  │     │    │    │    │    ├── css/
  │     │    │    │    │    │    └── Hero.css
  │     │    │    │    │    │
  │     │    │    │    │    └── Hero.jsx
  │     │    │    │    │
  │     │    │    │    ├── HowItWorks/
  │     │    │    │    │    │
  │     │    │    │    │    ├── css/
  │     │    │    │    │    │    └── HowItWorks.css
  │     │    │    │    │    │
  │     │    │    │    │    └── HowItWorks.jsx
  │     │    │    │    │
  │     │    │    │    ├── OrderCard/
  │     │    │    │    │    │
  │     │    │    │    │    ├── css/
  │     │    │    │    │    │    └── OrderCard.css
  │     │    │    │    │    │
  │     │    │    │    │    └── OrderCard.jsx
  │     │    │    │    │
  │     │    │    │    ├── PopularServices/
  │     │    │    │    │    │
  │     │    │    │    │    ├── css/
  │     │    │    │    │    │    └── PopularServices.css
  │     │    │    │    │    │
  │     │    │    │    │    └── PopularServices.jsx
  │     │    │    │    │
  │     │    │    │    ├── Reliability/
  │     │    │    │    │    │
  │     │    │    │    │    ├── css/
  │     │    │    │    │    │    └── Reliability.css
  │     │    │    │    │    │
  │     │    │    │    │    └── Reliability.jsx
  │     │    │    │    │
  │     │    │    │    ├── Stats/
  │     │    │    │    │    │
  │     │    │    │    │    ├── css/
  │     │    │    │    │    │    └── Stats.css
  │     │    │    │    │    │
  │     │    │    │    │    └── Stats.jsx
  │     │    │    │    │
  │     │    │    │    └── TestBanner/
  │     │    │    │         │
  │     │    │    │    │    ├── css/
  │     │    │    │    │    │    └── TestBanner.css
  │     │    │    │    │    │
  │     │    │    │    │    └── TestBanner.jsx
  │     │    │    │
  │     │    │    ├── Landing.css
  │     │    │    ├── Landing.jsx
  │     │    │    ├── landingData.js
  │     │    │    └── shared.jsx
  │     │    │
  │     │    ├── Main/
  │     │    │    ├── Main.jsx
  │     │    │    └── Main.css
  │     │    │
  │     │    ├── Payment/
  │     │    │    ├── Payment.css
  │     │    │    └── Payment.jsx
  │     │    │
  │     │    ├── TelegramAuth/
  │     │    │    ├── TelegramAuth.css
  │     │    │    └── TelegramAuth.jsx
  │     │    │
  │     │    └── VkAuth/
  │     │        └── test.html
  │     │
  │     ├── ui/
  │     │
  │     ├── App.jsx
  │     └── main.jsx
  │
  ├── index.html
  ├── package.json
  └── vite.config.js

```