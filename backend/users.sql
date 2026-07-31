-- phpMyAdmin SQL Dump
-- version 4.4.15.10
-- https://www.phpmyadmin.net
--
-- Хост: localhost
-- Время создания: Июл 22 2026 г., 19:08
-- Версия сервера: 5.5.68-MariaDB
-- Версия PHP: 5.4.16

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- База данных: `kingpromotion`
--

-- --------------------------------------------------------

--
-- Структура таблицы `users`
--

CREATE TABLE IF NOT EXISTS `users` (
  `id` int(11) NOT NULL,
  `login` varchar(40) NOT NULL,
  `user_group` varchar(20) NOT NULL DEFAULT 'standart',
  `password` varchar(35) NOT NULL,
  `balance` decimal(10,2) NOT NULL DEFAULT '0.00',
  `mail` varchar(99) NOT NULL,
  `token` varchar(32) DEFAULT NULL,
  `banned` int(1) NOT NULL DEFAULT '0',
  `lang` enum('ru','en') NOT NULL DEFAULT 'en',
  `chat_id` varchar(99) DEFAULT NULL,
  `telegram` varchar(99) DEFAULT NULL,
  `discount` int(9) NOT NULL DEFAULT '0'
) ENGINE=InnoDB AUTO_INCREMENT=148 DEFAULT CHARSET=utf8;

--
-- Дамп данных таблицы `users`
--

INSERT INTO `users` (`id`, `login`, `user_group`, `password`, `balance`, `mail`, `token`, `banned`, `lang`, `chat_id`, `telegram`, `discount`) VALUES
(1, 'admin', 'vip', 'dfdeb4133ea03089b4c6c93c7179046b', 10000.00, 'admin@admin.ad', 'AChpRxGsYEb2hOJAPjpTiEHRoSofJl18', 0, 'ru', '7137149145', NULL, 0),
(2, 'argozzz', 'vip', 'b6acd8c839ecca74160аa4b06f4731fd5', 1100.00, 'soc-rocket@yandex.ru', '', 0, 'ru', NULL, '', 0),
(3, 'Calmertest', 'standart', '5e37c88e5fd181036ecde7a9981fd44f', 0.00, 'nikita.zyablovxxxcom@gmail.com', '5PZZPcPjl9mlPxJIChHjhus8FsTNj42e', 0, 'ru', NULL, '', 0),
(4, 'baxa', 'premium', 'ec89103c226c112ac2da1ebae53511c1', 0.00, 'baxay575@gmail.com', 'Pbd2DSZUNb7BSkEKFeUNtjOfLS9OkC1O', 0, 'ru', NULL, '@XXXMY1', 0),
(5, 'Whisper', 'standart', 'ae2949abffc79cda1a2933e0aeb3b672', 24.00, 'andrew.g.lykov@gmail.com', 'k2kEiGfU2OrsJVKUKRmoivTXvouxJ61d', 0, 'ru', NULL, '@andreeeevvv', 0),
(6, 'eshkere', 'standart', '17134843cf52da522b43656ac14973b2', 0.00, 'zefton214@gmail.com', '4fT289yd6jiktKRPRjupijy9KptTMhgv', 0, 'ru', NULL, '', 0),
(7, 'Tester', 'standart', '394f855e8ee9927862b4827540a0ba76', 0.00, 'anonimnost.nahe.vce@gmail.com', 'F29oroCy7aFC9u7AFDLXkjYyUmSHdC2m', 0, 'ru', '7137149145', '', 0),
(8, 'depideh', 'standart', 'af70ea0da34c652e9b3bdc791a202ccc', 0.00, 'depideh365@ixunbo.com', '2nChhe3EXHyn1Oy8PbPSfb86izaRUBFJ', 0, 'ru', NULL, '', 0),
(9, 'Zalypik228', 'standart', 'b33b1be8e5a761b14ad02a1a0c243f86', 0.21, 'fahrislamovartem72@gmail.com', 'DNuL9AxobYXcg26oTIcuTCfGg6J9dhKa', 0, 'ru', NULL, '', 0),
(10, 'No_Name08', 'vip', 'a85544fcba0128e2020d23e4301624a9', 97.41, 'akstepanov08@gmail.com', 'oXIk1xdlm5XGx8d2N6cYNS8diotNMju2', 0, 'ru', NULL, '@N0_NameO890', 5),
(11, 'Motya', 'standart', 'c940ceb56e10fad5c032bad4ad44e869', 0.00, 'putingey229@gmail.com', 'x2xFK2Kim0uyFdFdg7dyxAjdg00x1GDI', 0, 'ru', NULL, '', 0),
(12, 'Ichigo', 'standart', '89c6f458c3507d68cecbef73527e9378', 0.00, 'dbatyalov@gmail.com', 'DagTNlSukdpYl2tNl0xlOV4NAs9t9CpN', 0, 'ru', NULL, '', 0),
(13, '89061234844', 'standart', 'e8e89dfbb7436a8f18bdec509efff9c5', 0.00, 'zekazincenko26@gmail.com', 'bjLbKkL1SNiUMRoTm7aY0yGapju76OJ5', 0, 'ru', NULL, '@rollsse', 0),
(14, 'Aleks56714', 'standart', '8e489c5a9d6a85ad3410ebebd28e21e9', 0.00, 'shura.demidov2023@mail.ru', 'A0PSUlAYrxVN9LgC2AbcmY4zzjcRfXZx', 0, 'ru', NULL, '', 0),
(15, 'Andruzha', 'standart', 'ae2949abffc79cda1a2933e0aeb3b672', 7.20, 'rajangosling443@gmail.com', 'gS27EU02MgHKRkBjAeEhyZGPmNNxTbgv', 0, 'ru', NULL, '@andreeeevvv', 0),
(16, 'Azarov1996', 'standart', '51e9e8b3992352bddffaccc96e2c9a63', 129.60, 'aazarov1996@gmail.com', '5TF7A1t7xFzAJuxfT657tUxmUA5CmRnc', 0, 'ru', NULL, '', 15),
(17, 'lil0nly', 'standart', 'df1bbfe07ca8df9b04a34f4247e1f47b', 93.44, 'karasikmax2009@gmail.com', 'lzlBJfLdNKaHsRoV1cuTOvBCNUESlNZ8', 0, 'ru', NULL, '', 0),
(18, 'T_seit04', 'standart', 'ca9a0e90cd513d51f0fd89238b48680d', 0.00, 'tokenseit23@gmail.com', '4vKNHaAhYaBnb4SGtx76DkzkjV1Olyy7', 0, 'ru', NULL, '', 0),
(19, 'Zxcvbnm', 'standart', '28f4721334db906c793501bb54671669', 0.00, 'Irinalitvakova50@gmail.com', 'ShKdAnY3czefZOU8muEgONlgcS3nsLZU', 0, 'ru', NULL, '', 0),
(20, 'Jdhdddd', 'standart', '90375bd5ddccc4d6ac9d57395956f2bd', 0.00, 'leksusrt4566@gmail.com', 'T1iEknfhuK51hFRZ6N6tBBDBO99GMSFH', 0, 'ru', NULL, '', 0),
(21, '+79409353511', 'standart', '7e3fdebe90347dc08018dbf88b2ed3fb', 0.00, 'dianazarkua345@gmail.com', 'MLFVlM1mV4MvI12BAkFDSPgTMHyvhGnt', 0, 'ru', NULL, '', 0),
(22, 'Mira', 'standart', 'c4244eb9318b3d387f4526dc733debdc', 0.00, 'ana_anushka@mail.ru', 'hEsJ8xh48SZhLA9mjE5sVpxv9nTZx2hm', 0, 'ru', NULL, '', 0),
(23, 'zenwwy', 'standart', 'cd0ef5965da8fbb3561c6f176b6fe28d', 0.00, 'gipipot1@gmail.com', 'F85y0gLxiv9GbbcKGgbTD5lvl2x6yNh3', 0, 'ru', NULL, '', 0),
(24, 'Saveq', 'standart', 'b5f10d24df92b68a6d663e7af9c19e18', 0.13, 'savok272011@gmail.com', 'jBMrsaTA8CEKKxutPuxff3JyLZpK1Gzh', 0, 'ru', NULL, '@Eqeqel', 0),
(25, 'Tapa', 'standart', '04e8d569f0118ffd2c3247985a80d36c', 0.00, 'tapunov10@gmail.com', 'bNjcLCcDv1itXfkJZyFdNOngYELY78r1', 0, 'ru', NULL, '', 0),
(26, '@paighom', 'standart', '2866ca1cd61a964073b40c507c7002ac', 0.00, 'paighom11@gmail.com', 'M8o34hTLd3O6MZe60sKtzDvuRsJZabXE', 0, 'ru', NULL, '', 0),
(27, '123', 'standart', 'e08be35e80579b424a466d31ab7dd9d6', 0.00, 'n28130091@gmail.com', 'MORlvMfgTU4Ep1XT1Prej6aneDMKngsx', 0, 'ru', NULL, '', 0),
(28, 'Fofof', 'standart', 'a33f7d54def604549001100c9122a482', 2.84, 'yanochkabeiba3@gmail.com', 'oacVMt5l9fj8uaZ4jvFnkufCVBHCb50S', 0, 'ru', NULL, '', 0),
(29, 'Moewzie', 'standart', 'd2e230677e506750ae054b275f7e25e0', 15.04, 'BeeGirl97078@gmail.com', 'jVNRD8BXaBK1jkes9iDmzE5M3m7hR5iy', 0, 'ru', NULL, '', 0),
(30, 'mark', 'standart', '834ec800d837a8756e86337e4174838c', 0.00, 'm906232385@gmail.com', 'JFj6UdlU5NX3s1m6NJtsL6CfGM05vHDK', 0, 'ru', NULL, '', 0),
(31, 'asyaalyaulyu', 'standart', '3674698b6116e0e99eab350b8fcf6321', 0.00, 'asyaalyaulyu@yandex.ru', 'iBVdoJabRLjaUfs1MIflvAn6KR79L6XJ', 0, 'ru', NULL, '', 0),
(32, 'Vladimir', 'standart', '60ea40d94221be3bd588c74c33aae190', 0.00, 'vladimirmihajlov743@gmail.com', 'fOIYnvGHZEAsSXLZF3PEt0pflv7dSrVv', 0, 'ru', NULL, '', 0),
(33, 'Kirito999', 'standart', '55ae798b2ee9878a0625ae11df130b51', 0.00, 'kiritozay919@gmail.com', 'SOhY4UChjuyUY3jf3EaaSACiFAa15b28', 0, 'ru', NULL, '', 0),
(34, 'Dinara', 'standart', '3a43796766f2e631b9dc84754ff1d63a', 0.00, 'DINANUR@LIST.RU', '5Fvny32FUaHBMtGhv7Tj6ur1dhUU8eyN', 0, 'ru', NULL, '', 0),
(35, 'annabeli1999', 'standart', '20e59c8b9237ab3a69a25f612a6bc3a5', 0.00, 'anna.bondarenko199918q@gmail.com', 'vMIVemhl9OTLxOyV5Bd1h8az6xuc4RLt', 0, 'ru', NULL, '@annabeli1999', 0),
(36, 'Zoldik', 'standart', '94aaee906b82a84cfc2aabf2a26789a9', 0.00, 'uson2111@mail.ru', 'xEmrCyU1uxJBNMsvLsiOreIobTkNJ2sk', 0, 'ru', NULL, '', 0),
(37, 'khalish', 'standart', '9d8e6062736d1f82171d2f7251226746', 0.00, 'xalil.aliieev@mail.ru', '7TjFOsA3tkbN4YJCMvzypXI0zjSoY81B', 0, 'ru', NULL, '', 0),
(38, 'Panda01', 'standart', 'ba10ef1212f2e0bd48de9a818b4dbb91', 0.00, 'gorshkova.kristina@inbox.ru', '1B41FbSzuk9xeynb7RUMjkeCSd3BdTGu', 0, 'ru', NULL, '', 0),
(39, 'gubkabob', 'standart', '4dd46c19d7dc4860b03ba5fa941617d4', 0.00, 'ksasher@yandex.ru', 'LIVnEpyniCaLERU2JCPzJbPm2K95Op2p', 0, 'ru', NULL, 'ksasher', 0),
(40, 'Malininma-13', 'standart', '0b1893a941dc727cde974b74c40b9cc3', 0.00, 'devastator2507@gmail.com', 'km58X6E4JVl711xgOj5ylyCBSrG4nX9t', 0, 'ru', NULL, '', 0),
(41, 'radmirrrr', 'standart', 'c1843c7baa092c1ed2ac51f83c3da1f1', 0.00, 'radmirzhazanov@gmail.com', '1se10YNejUSGI3YoncP3sRXjYM5hibAt', 0, 'ru', NULL, '', 0),
(42, '258532q', 'standart', '12579ac324f19020aea9c999195f45fd', 0.00, 'yukihirodomi@gmail.com', 'HoUXEMzujJ0049lHxNuBLiy7XTLJn6ci', 0, 'ru', NULL, '', 0),
(43, 'dadee26', 'standart', 'a7bea641017c7b8ad71b822ec7265717', 9.68, 'apexnew2403@gmail.com', 'nlCcDS0Elrr1bY19REAC1vrk12OLNy2j', 0, 'ru', NULL, '', 0),
(44, 'Ksysha', 'standart', 'a4172916aa8bf3a729f248dd58fc4159', 0.00, 'ksenaiglova43@gmail.com', 'MgKkzcdBm2sFhHB1LzUraa4s0IdcIjAX', 0, 'ru', NULL, '', 0),
(45, 'Maga222', 'standart', '6ebe76c9fb411be97b3b0d48b791a7c9', 0.00, 'maha.2111sementsova@yandex.ru', 'UKULscecVaTFgsAuakgzUYg7HE2GFFOG', 0, 'ru', NULL, '', 0),
(46, 'Ikia', 'standart', '903ee455cc86de2d3ae11e3f8fa79f0e', 0.00, 'ikaksilyyy@gmail.com', 'Z4VCX62Gnzty0LA00BKtsTeE9t8Ml8xY', 0, 'ru', NULL, '', 0),
(47, 'Roomsn', 'standart', '078c8fdaeaea8b180c4817e1120a0fd4', 13.59, 'inalhonikol@gmail.com', 'dAJfAI5oleNf2uecTtf2K2sCVcbK9phn', 0, 'ru', NULL, '', 0),
(48, 'Nikpol', 'standart', 'd1ba2f68559e055ea4150b486de06d21', 6.28, 'polnikita37@gmail.com', 'lb64vbiukGbh8pk7NhcaaMDZJmSpdUvY', 0, 'ru', NULL, '', 0),
(49, 'danpavzah', 'standart', '3f9aa37a06d16be0fde6347f24b8bbe0', 0.00, 'danpavzah0305@gmail.com', 'H3CymDZGtkMsFYo5dOz5uxGpdcimzOEG', 0, 'ru', NULL, '', 0),
(50, '557005029', 'standart', '5efc5b278a6a4e4f501af29ce1b7a89f', 0.00, 'dilsodbmv@gmail.com', 'EV5RgSnmIViP7Udzxo7Lmko4IiMGVCLH', 0, 'ru', NULL, '', 0),
(51, '89012785002', 'standart', '250a70ac1f8e0c7cbbc513119eb5e037', 0.00, 'karasevandrej709@gmail.com', 'xIjvzx7ar8bsuhOFD4E18HBVTFUmMzlp', 0, 'ru', NULL, '', 0),
(52, 'phurfbuhh', 'standart', 'e8fe0559762620376a80f35517066e3b', 0.00, 'ddipressant@gmail.com', 'yINgiiS8RcX0JudhiDH5sOu3dbovl7BZ', 0, 'ru', NULL, '', 0),
(53, '+79915747547', 'standart', '0ec6f803ce57427eb1b818c180abc36a', 0.00, 'slavpa68@gmail.com', 'iOThn6rOAizHS8Td565s49U1Fdb40urP', 0, 'ru', NULL, '', 0),
(54, 'Sergo3402', 'standart', '066211324ee0c9d2c81a9e43ee3841de', 0.94, 'faza.a@mail.ru', 'bL6Y3pCZOYlcojRCnSnL3CnmU3gACJ4V', 0, 'ru', NULL, '', 0),
(55, 'Samir42', 'standart', '42bd4330cf23684de97bf2beab092d0b', 0.00, 'bakimaestro142@gmail.com', 'vJKtYdjitCsXvfL6eOPandBUlV5L7R5e', 0, 'ru', NULL, '', 0),
(56, 'walook', 'standart', '6f1201539f1c0db68ddc5dbb6ed66891', 0.00, 'solpo.koplo@gmail.com', 'SGiImXkXbUb9FE3PpBZTpCC9YpKYOMJg', 0, 'ru', NULL, '', 0),
(57, 'Ogurechik', 'standart', '05a5019722bd6ea40487de8e317983ac', 0.00, 'miron.lyubin@mail.ru', 'B0ppNBK3lNE4oCtJ7cxHUOvoVHJnthDM', 0, 'ru', NULL, '', 0),
(58, 'gaga_gaga2000', 'standart', '6f3b34c863e694272bf692c149fc3786', 0.00, 'skrypchenko.alya@mail.ru', '09XzJFDhSR50e9S78u7dzBOa3AEfNYVJ', 0, 'ru', NULL, '', 0),
(59, 'grenlie', 'standart', 'cdb5fe04f8e757bcef151474dab9c2f5', 0.00, 'zoldinrecords@gmail.com', 'rH4oP4OxeiLeGhmpgIybMVUUEZDB6FOB', 0, 'ru', NULL, '', 0),
(60, 'Kama228', 'standart', '01643584e419eba6f2beace3a2abb927', 0.00, 'garifyllin.sasha@gmail.com', 'GYOJyb402gZPG3IMP3MZxDggYjUpr315', 0, 'ru', NULL, '', 0),
(61, 'Ivan', 'standart', '31bc1a198f25eb9e395db9bc8cb7df71', 0.00, 'ivankal2104@mail.ru', '95xM0KL0EfiDevF0cGVZOoVX1R6u9J1n', 0, 'ru', NULL, 'rr1', 0),
(62, 'nurdin4on', 'standart', '8f113b439a2441f4d52071f157c6cda2', 0.00, 'nurdinzievdinov00@gmail.com', 'UCyyb1KeZjajRc2mAJgxJDC3G9i470pP', 0, 'ru', NULL, '', 0),
(63, 'Dustuv', 'standart', 'd174eeff0f888e73ece2b1c802efdba0', 0.00, 'davlatsodustov@gmail.com', 'IPs9xn3HAokiF0gyhxbSmxxxE9daomFk', 0, 'ru', NULL, '', 0),
(64, 'oproolpr', 'standart', 'abe686098dd2dbca7be53461414969e0', 89.50, 'oproolpr@gmail.com', 'VUZbioYtJu1Nj786a2O2M6B9aMuaRm8i', 0, 'ru', NULL, '', 0),
(65, 'Kim', 'standart', '026444e50982408fe3eb28753a00ee43', 0.00, 'mmmmooopppllnn@gmail.com', 'S6RDgy61I27adfAA274yTyoUGFonnV0T', 0, 'ru', NULL, '', 0),
(66, 'ignatovacom', 'standart', 'e27869cef0ec095d4d484f03578fb992', 0.00, 'ignatova.nastyshka.11@gmail.com', 'Ihbof8ZxdMvXdFgm58utmCU3C92foaBM', 0, 'ru', NULL, '@k1ttykl', 0),
(67, 'otttt@kingpromoo', 'standart', 'f77cd474905353b1c84eef4ea2b7c5b8', 0.00, 'omarovatomi@gmail.com', 'FNs7vyszOoyxspsBSp3cZCxrt64vVJNY', 0, 'ru', NULL, '', 0),
(68, '79023897434', 'standart', 'dc1a0493e216ee22fe9d6861ed7829eb', 0.00, 'soplamamonta970@gmail.com', 'mpMN2PT7c4e9pzurnPiFHRPKolJOlC3V', 0, 'ru', NULL, '', 0),
(69, 'Ml228', 'standart', '7a087333badfc5590ecba848ec6351a9', 0.00, 'd28200214@gmail.com', 'GIAnkOEvYuzyErcY1txI0pxUCPiTgs4d', 0, 'ru', NULL, '', 0),
(70, 'karTash', 'standart', '935c99f98fa77517b51aa82b23d467fa', 0.00, '13kar1ash13@gmail.com', 'msGfPKBRUEAHOs5rrS953YOPykjF1Voa', 0, 'ru', NULL, '', 0),
(71, 'LEGEND', 'standart', 'f22bc20d415628f4d0fb772e5eac8e03', 0.00, 'umar01kadyrov@gmail.com', '5ia1pBUyiAdrSlzgVXsj9yyJMN1NOxCB', 0, 'ru', NULL, '', 0),
(72, 'Nikita_Mordovin', 'standart', '5d60b5642ccbd971bfcdf3a4c9ab9690', 0.00, 'n074445113@gmail.com', 'Gr7lZPUR7SloPCmdmRR121MtDi5Pck37', 0, 'ru', NULL, '', 0),
(73, 'Thekomilov', 'standart', 'de84fdd5a9058f00d682e1896a9f00cc', 0.00, 'aslbekkamilov776@gmail.com', 'hfCFDlV4JsfVkyXhkr3dReEPjxklvNkM', 0, 'ru', NULL, '', 0),
(74, 'lolaxeuoy', 'standart', 'b1ef741bee14a29acbe5686f59b62569', 0.00, 'emirbek.kaliev@gmail.com', 'IfFZHiTOSSszo0pH2O0JtM85MHPaYyvE', 0, 'ru', NULL, '', 0),
(75, 'sarsenbaiutebaev', 'standart', '26469cfd0088a6a578e1f2f743a09170', 0.00, 'sarsenbaiutebaev@gmail.com', 'Au8G5zcIOXS82OidXRE0fnOYXfRMoKt8', 0, 'ru', NULL, '', 0),
(76, 'KingKong', 'standart', '76abaec72adef1fddbaa565d35eb954e', 0.00, 'thedmitryone@mail.ru', 'fcA71fsKLh1tBzmKR7tONVzOZMk49pg9', 0, 'ru', NULL, '', 0),
(77, 'Kostya2011', 'standart', '204b5003e97662ca4258ab593ec0360b', 0.00, 'Sindeevkostya99@gmail.com', 'OXkh8nN2AMg1Nf8VudvBMelLSl1BUrUt', 0, 'ru', NULL, '', 0),
(78, 'gtudi', 'standart', '14135e7e73c07240519156bd4da2ef0a', 0.00, 't0931023@gmail.com', 'y9tCU9Uzo1ciTzGxCTOmZKzoeNllM2Z5', 0, 'ru', NULL, '', 0),
(79, 'MrSayrexYT', 'standart', '99ee96ca19884914ae4b3957d6c60a7f', 0.00, 'sdfsdfdsdfsfsdf6@gmail.com', 'gcBt7jE4MM4lrvRS2x2fPPdeKJzZJ9kK', 0, 'ru', NULL, '', 0),
(80, 'Mod@icl', 'standart', '173fd1a5d3f514202061c44f7b68da17', 0.00, 'elvira.lvk@gmail.com', 'veRhci48U63dT3i018vMaVl76L2DG3yT', 0, 'ru', NULL, '', 0),
(81, 'Saphire', 'standart', '29bd4083d5ff28ce80756f685f603bde', 0.00, 'an.fedorischev@yandex.ru', 'Bo59R8Cx2N2SI8ygpB8LEgjdPUZYuXnr', 0, 'ru', NULL, '', 0),
(82, 'Serzh', 'standart', '302250e7923483b50d6ee85312d7c563', 4.00, 'skorikoffsergei@yandex.ru', 'JdXMblLp4sAS17OVOKvGgeRGNmlT2KO1', 0, 'ru', NULL, '', 0),
(83, 'Walera', 'standart', '117b1d68907fc1ab220fe1135ca29971', 0.00, 'kriperdziper72@gmail.com', '6aFhJU1VrHgVGtVA0O6ZJgXlm61i3Xi5', 0, 'ru', NULL, '', 0),
(84, 'vendetta0025', 'standart', 'f3d006fc5e280b636db2760253599d28', 0.50, 'd.ryadskij@gmail.com', 'HiPKclC1HnytPpjB52t8LcMEb82FSFAL', 0, 'ru', NULL, '', 0),
(85, 'Ipo', 'standart', '850518d9180ae406ecf4b0c47fad63ef', 0.00, 'ilyas.bakytbek@icloud.com', 'bURGf5SzCYjNOZUsVVSxs9IKgnm9UsZX', 0, 'ru', NULL, '', 0),
(86, 'Dima-1234', 'standart', '60ba89aec26092a84aadd80f3a647a96', 0.00, 'artemtarasov@gmail.com', 'uSJ4LkBVIk1janrmG66NLhMst8NDktYy', 0, 'ru', NULL, '', 0),
(87, 'annvgatfff', 'standart', '9070bb9fe7bf5b55fc30d29a001991e2', 0.00, 'annettepay15@gmail.com', 'ZkF5YftU7S5RHjUyuSZfhfZvntFZV70K', 0, 'ru', NULL, '', 0),
(88, 'Xyila228', 'standart', '56dd5f63797f5867bf25359f9a878f48', 0.00, 'ar1305121@gmail.con', '3uupHo2DoKvb4IStAj4tteNBGnp8E7KR', 0, 'ru', NULL, '', 0),
(89, 'How', 'standart', 'c8a8cd3a74910166f38c7cbf8f009d71', 0.00, 'sultanbulekbaev853@gmail.com', '41gYNMiMmzlD650brVP72ARNJD12NL3L', 0, 'ru', NULL, '', 0),
(90, 'Arvi', 'standart', '40587bff0e72b6fdbba30c40c95e148a', 0.00, 'ratiolover993@gmail.com', 'EbKuRcXJl67iDXRhuDND9OUyUlHlKgvm', 0, 'ru', NULL, '', 0),
(91, 'Qwrttoeodo', 'standart', '1238faeb92d35e7255f73700a5c29db4', 0.00, 'sokolskijruslan3@gmail.com', 'fRVZzBafI8XjsBpbOPGlLZcdCEaZMABI', 0, 'ru', NULL, '', 0),
(92, 'sn1ch', 'standart', '525d4c5ebd2d10ae473203ce360ff999', 0.00, 'vasasha2000@gmail.com', 'kSydyNVGGymaT6p40SLJ04HzF3geRe7f', 0, 'ru', NULL, '', 0),
(93, '9923347602', 'standart', '070febfcf74afdfc938fc146173d2d86', 0.00, 'kuznetsova.ksyusha.25@mail.ru', '8pmenlkt2SieBMugcLdAAH8y4e5hUEXc', 0, 'ru', NULL, '', 0),
(94, 'Ghorki', 'standart', 'a855fdfcad93b8e8e743365d911568df', 0.00, 'vovavysokos011@gmail.com', 'uXAoglpziSysthjyAbo6BAXulpiuDbP2', 0, 'ru', NULL, '', 0),
(95, 'Zukova2007', 'standart', 'da96a897c66d9ba58ec1c5017eee69ac', 0.00, 'Zukova2007@yandex.ru', '6THDBh4bAauevXG2jKIdFPh9N30gnnDv', 0, 'ru', NULL, '', 0),
(96, 'dariii', 'standart', '0ee44e2f18eb7762130f8fca1c51c790', 0.00, 'dosmanova132@gmail.com', 'cRSHbJjKoEdXHc16HAEsDpmo2I95HhRa', 0, 'ru', NULL, '', 0),
(97, 'antonrockstar', 'standart', 'e24560170d5b2066f7883a069b4da699', 0.00, 'olegseverseverniy@yandex.ru', 'oJYhUGXBKL42ut73bf60VHirKuVVu1iK', 0, 'ru', NULL, '', 0),
(98, 'MaryBliss', 'standart', '1906aac41995ab6cceeb67d1113c6553', 0.00, 'mariaartemenko2303@gmail.com', '2pGGAcRRpEbcvoNVFpc3Dkv5iogslFPJ', 0, 'ru', NULL, '', 0),
(99, 'kiww1q', 'standart', '528d81fc280bfd3a1036af03db541068', 0.00, 'nastyastars2014@gmail.com', 'A3beHhRJ9jZ1jaeFh9ktlHjhAFr0o9Hi', 0, 'ru', NULL, '', 0),
(100, 'necrofilebychi', 'standart', '5bcd77e6170f94e1c883d4f0ce053992', 44.41, 'kzmetroroyal@gmail.com', 'CKmbH4JZ7SGVY7ulYdUMOAIpitObtnxt', 0, 'ru', NULL, '', 0),
(101, 'Kaspian1993', 'standart', 'c28c0ef8b64d502c2084b446936a7050', 0.00, 'kaspian02051993@icloud.com', '1NkIj8G3dJfLfUlLecoXPmvUjrd9pkTg', 0, 'ru', NULL, '', 0),
(102, 'Sava', 'standart', '3596a188647f0b082b4ae3a1c2f9b017', 0.00, 'saveliy.chudoyakov@mail.ru', 'jlC0ZcUv5S0dcZGG6j4ltRPfz2PuOKsj', 0, 'ru', NULL, '', 0),
(103, '23072009', 'standart', '60850572e5cc1eec6d18b2dce9ffe596', 0.00, 'ilasovasidrat433@gmail.com', 'VYMlYkTVb3KYbCllgXh5MARlE1Ggmiok', 0, 'ru', NULL, '', 0),
(104, 'Smbvxx', 'standart', '6b10e09ee787597fbe3594df64213680', 0.00, 'yerzhansambayev@gmail.com', 'vF9nHs8At4aLFPDuuAUXDNgbs4O0cd1G', 0, 'ru', NULL, '', 0),
(105, 'karenskiy23', 'standart', '5c285c58ae034085e13108d0727d2ea3', 0.00, 'linalelolina@gmail.com', 'nc2JUEIJ7RZC07UCcxt1NlZEbHU52be7', 0, 'ru', NULL, '', 0),
(106, 'DARLEND', 'standart', 'd5a46c7f02304ab78d58ddae0d6f7a63', 0.00, 'morkovpro100@gmail.com', 's1LxRe99Z8g8bcrPGHbeHDJ8NdrcM1Jn', 0, 'ru', NULL, '', 0),
(107, 'Eksace', 'standart', 'ee297749d2f4c37e5f6a1e4b2ce9b45e', 12.25, 'vadim333707@icloud.com', 'usd4aAhtk2SeBCAiGX4n9k6PpPXRRfoy', 0, 'ru', NULL, '', 0),
(108, 'Diodem', 'standart', '18d9c968f81e3fa769fa6d8da1d16a6d', 48.57, 'pheonix.zaripov2023@gmail.com', 'KGsbGfI4dF6ASem7pep99avl5JbvGp7t', 0, 'ru', NULL, '', 0),
(109, 'mania', 'standart', '752c3db0ff230d4642b8d662d8a51da0', 81.43, 'maniaueban@gmail.com', 'JTTXRUloYAdMzbFAiGkocKxENp1omoGF', 0, 'ru', NULL, '@Midnight13377', 0),
(110, '575665', 'standart', '46babec337259a6f33dd4d3b063de493', 0.00, 's18915378@gmail.com', '4uiMxZXNTRoGyRVBpK7E1u4oIGMuvisn', 0, 'ru', NULL, '', 0),
(111, 'german', 'standart', '4d7a7af6d9ea249a133b3f3a3f750515', 46.39, 'germantutukin@gmail.com', 'xCidO0PoFzxAzfxXO74NxtIoGRVb62Ta', 0, 'ru', NULL, '', 0),
(112, 'VADIM', 'standart', '79650c110c8d015f00a597885664c40f', 0.00, 'vados020676@gmail.com', 'rkn6H9yFfM3USX96N43HTXpk1BJ0h6K3', 0, 'ru', NULL, '', 0),
(113, 'pipka888', 'standart', '1da4492539eff241451fa7b8f2ef42aa', 0.00, 'kitlame7@gmail.com', 've1kni0CX0MrnIBayhMRhPHBvdhVAPVt', 0, 'ru', NULL, '', 0),
(114, 'loksel12345', 'standart', '5ecb1ba5655d958341227f31d1f70ef5', 0.30, 'v18577578@gmail.com', '2vUmJiRc9cUUpg1BtgEvgrxc4P28iHK6', 0, 'ru', NULL, '', 0),
(115, 'AntonV17', 'standart', '00266378c7365ed3bac1d0760465f7c7', 0.00, 'antonvalerev103@gmail.com', 'an2g7USOTB2oBIV0IlVRNy9ZGcgZ4fee', 0, 'ru', '7755760251', '', 0),
(116, 'baldy', 'standart', 'ff9a2a020f1fb7209fc57183d8e7f006', 0.00, 'dima.k0llden@bk.ru', 'PDpcNJHIfo13NZaHRNXU2M3eHZ9xNzgN', 0, 'ru', NULL, '', 0),
(117, 'karsar_qq', 'standart', 'ae4c32cdb34b11dce562045c87944edc', 0.00, 's3763730@icloud.com', '7M9Um5TXjmpfX1oCySNxHphd5BHSn4vI', 0, 'ru', NULL, '', 0),
(118, 'saha199672', 'standart', 'e7a4fe6ef22dca5f6c5d555c67cfc964', 0.00, 'p23472851@gmail.com', 'dFV3pOiH83304fuMKm6t8Ieh3sThp5R6', 0, 'ru', NULL, '', 0),
(119, 'Kcu07062014', 'standart', 'cbaf7247fd7b31174494a0d23a021902', 0.00, 'xiuhahorkina@yandex.ru', 'V5HTTkyobEAsCX1FUTMZstGID99pMYUJ', 0, 'ru', NULL, 'Baxon52', 0),
(120, 'martin.khutov', 'standart', 'f2afbe6fc3a5655610956eeee7d8bca9', 130.69, 'martin.khutov@mail.ru', 'Ki6ZMseO0m8htPdKLllGv6ONdMmc4TZZ', 0, 'ru', NULL, '', 0),
(121, 'Mari', 'standart', '653d99861e704ac0e3672c805280acf3', 0.00, 'marinockaes@mail.ru', 'GAJb2kvc5sdh3rNVjXTZkYNCPfuMoFU7', 0, 'ru', NULL, '', 0),
(122, 'Legit0ffcial', 'standart', '704acf9c507dc8ec0db786eedc4ce46d', 0.00, 'kirillasihmin75@gmail.com', 'kXvetuPnyUP0NC8pgSTH8Vh5xltPOyZS', 0, 'ru', NULL, '', 0),
(123, 'altego', 'standart', '7e86037a32af256490a0466c38192ac0', 123.61, 'alterego7888@yandex.ru', 'SebuM3jVuIvJY4lIxNxttIp5OrXOREpl', 0, 'ru', NULL, '', 0),
(124, 'gnoy', 'standart', 'cf47aad5c4696221d1422d45e3d68393', 0.00, 'edasda@gmail.com', 'dDSPT5S11T3JtCHafMnB3kIC1Yb04jy9', 0, 'ru', NULL, '', 0),
(125, 'mr.Crabs', 'standart', '19cbc903c251cd239862dab03d7cd3c9', 1.55, 'rstor8852@gmail.com', 'c30bNgZIluHAlC0Kh7aC7RPXMvaizU3D', 0, 'ru', NULL, '', 0),
(126, 'Gladgehabirvsnid', 'standart', 'e807f1fcf82d132f9bb018ca6738a19f', 0.00, 'glasa5914@gmail.com', '6rYmIYOTF4Z2F8SX6DSlMAf2ua9M4KVu', 0, 'ru', NULL, '', 0),
(127, 'galandesz', 'standart', 'e9bd51978c4f3cf9796691e20c5a3570', 0.00, 'bebravictima@gmail.com', '9mbsG2vNXHjzhJIJY1sRxblF4Ls9lrZR', 0, 'ru', NULL, '@vinokcaesars', 0),
(128, 'atomik', 'standart', 'eb7fa23d066420b18830028c50656c62', 0.00, 'tupicyn32@gmail.com', '3lKprHHEKdT2jEbxLTyNHNy46mRdE63e', 0, 'ru', NULL, 'coltanridge', 0),
(129, 'Kollores', 'standart', 'a50a2df7c39d036295d9134d0e9d5271', 0.00, 'mark.semnov.05@bk.ru', 'enr25Gf4X3sksUT0O9g3RYxTIS9jvn8A', 0, 'ru', NULL, '', 0),
(130, 'lera.', 'standart', '3688b37ce93a7cae6ebf4df035db6fbb', 0.00, 'lera.krsk@gmail.com', '9m83H4AU10KSTerAZHvFDHrmRhANxyd0', 0, 'ru', NULL, '', 0),
(131, 'w143ssd21ssf', 'standart', 'd165a862cb93a3ce3ccad44f6cb95cd9', 0.00, 'dzhshjs6466@gmail.com', 'JY9gU0fpluzacj4K4pUK6OtTDzuKk3Is', 0, 'ru', NULL, '', 0),
(132, 'test_user_smm', 'standart', 'f96db0219b039631e019994b7f2cad6b', 0.00, 'test@example.com', 'tfEvvKElsOuifyZ9vtcKaR7xPa07LNvB', 0, 'ru', NULL, '', 0),
(133, 'SofiMira34', 'standart', '554c64e98b881f3eefaf36ff07cd677a', 0.00, 'Sofiakalina891@gmail.com', 'FzR2ju4g4v5BMxihmACUhFleGrF57fdS', 0, 'ru', NULL, 'Z8ReP7qXvH2mVYw', 0),
(134, 'Dexweb', 'standart', '09a00e56cb5abfd3a30f51edb79cc327', 0.00, 'dexwebcode@gmail.com', 'YeX1dJv4s0zUBrPxZtxbTtk6sc0Ky59A', 0, 'ru', NULL, '', 0),
(135, 'Matay15158', 'standart', 'e3ed5e228f7425a575c84e6fdefa66e3', 0.00, 'sitdikov.matvey1604@gmail.com', 'eHBVcBE1CjEyzfFney33broDcuE6CKpO', 0, 'ru', NULL, '', 0),
(136, 'spl44shh', 'standart', 'efff4dda9311fd9d38f24e6cc0492e87', 0.00, 'puhovvlad43@gmail.com', 'MbAmcOEF1c6Ojvjx6jRRj3Rz3dMZ6hIs', 0, 'ru', NULL, '', 0),
(137, 'babaklava332', 'standart', '3c822e7b7ee549f3c293bf84e8779015', 0.00, 'dp.deniska@mail.ru', 'Sc5IPTPGxU6ti9MIDYGxtn6S7PFOFjer', 0, 'ru', NULL, '', 0),
(138, 'Lika', 'standart', '6918316aaca0a1bed48eadfef0d4d0f5', 0.00, 'akapushak@mail.ru', 'fH60K5xUAlF7XKMaIaLP99LnnaHMf3JY', 0, 'ru', NULL, '', 0),
(139, 'BUSTMT', 'standart', 'dc32050270778bb5746ce9d85b03da6f', 0.00, 'nikitasuprime@yandex.ru', 'PHaClmueH9tb9m0jxUEOCub9bVg9SPBT', 0, 'ru', NULL, '', 0),
(140, '89041325194', 'standart', '390c095495d5420768b42d9325001aef', 0.00, 'antoxaskowal892@gmail.com', 'HCF33HYIvV2kF42F7S9YE9VJfRSoogL2', 0, 'ru', NULL, '', 0),
(141, 'mart132', 'standart', '4aa1f1f9fb78e7a5b40a41545c90a282', 0.00, 'merll3293@gmail.com', '4GIJ4kekzSeH95sSHhgUbYiApIrMAA5X', 0, 'ru', NULL, '', 0),
(142, '89880357383', 'standart', 'f9c467ce8935e681de42c97fe24c21c5', 0.84, 'kristina-ryabinina@internet.ru', 'EKcy4yPyoMsHhKkPZ1bo68JsloO8ytXl', 0, 'ru', '8075476009', '', 0),
(143, 'NanoAdam', 'standart', '757c54395781ee937b3023aff029bad4', 0.00, 'alinaadamets@yandex.ru', '81ovB40nMHOkeMH11nN7n8diEleJl0tH', 0, 'ru', NULL, '', 0),
(144, 'fraukrauze', 'standart', 'dad0870020093aec842ef883ef02bdca', 0.00, 'geogrovdzonatan@gmail.com', '1grHEhkuvdag63L35AoRYyl5YKfsIog6', 0, 'ru', NULL, '', 0),
(145, '353874919196', 'standart', '9b2aa3b692379c5786785ad050878e4b', 0.00, 'mxhitman007@gmail.com', 'O01SAuUglAfPorXvS3IPXTmHcpms78Fj', 0, 'ru', NULL, '@izoterick', 0),
(146, 'Miraje20', 'standart', 'be14a9ae158af2f8d7167837700e2758', 0.00, 'Auer.sander@gmail.com', '6m5z6p3TvUS1b6VYiUZOD4VeCXY4rCsy', 0, 'ru', NULL, '', 0),
(147, 'stepanchik', 'standart', 'b4ad9ea58bb31b54da8dc3afb89028b1', 0.00, 'karpovstepan001@gmail.com', '6j7DkB9DJiJdnpTxeacESSpNEuP2Vnj5', 0, 'ru', NULL, '', 0);

--
-- Индексы сохранённых таблиц
--

--
-- Индексы таблицы `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD KEY `email` (`mail`),
  ADD KEY `token` (`token`);

--
-- AUTO_INCREMENT для сохранённых таблиц
--

--
-- AUTO_INCREMENT для таблицы `users`
--
ALTER TABLE `users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT,AUTO_INCREMENT=148;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
