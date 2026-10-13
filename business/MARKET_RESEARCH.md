# Исследование рынков (цикл 1, 13.10.2026)

Источники проверены 13.10.2026 веб-поиском. «Подтверждено» — совпадают ≥2 источника; «один источник» — помечено. Официальные первичные страницы госорганов напрямую не открывались, даты — по палатам, Big4, профильным СМИ.

## A. Электронные счета (e-invoicing) 2025–2027

| Рынок | Мандат | Что нужно МСП | Решения/цены | Вывод |
|---|---|---|---|---|
| Германия | с 01.01.2025 все B2B обязаны **принимать** XRechnung/ZUGFeRD; выставлять: 2027 (оборот >800 тыс. €), 2028 все ([IHK Köln](https://www.ihk.de/koeln/hauptnavigation/recht-steuern/recht/e-rechnungen-5943094), [Grant Thornton](https://www.grantthornton.de/themen/2026/e-rechnungspflicht-2027-die-wichtigsten-fragen-und-antworten-zur-e-rechnung/)) | читать XML, переносить в таблицу/учёт | просмотр одного файла бесплатен: [clean-invoice](https://www.clean-invoice.com/tools/e-rechnung-viewer) (тоже локально), papierkram, b2brouter, norman, ELSTER, KoSIT; Rechnungswandler Pro «от 2,99 €» (один источник, Capterra) | просмотр — товар; пробел — **пакет 50–500 XML → Excel/CSV/DATEV офлайн** |
| Польша | KSeF: 01.02.2026 крупные, 01.04.2026 остальные, 01.01.2027 микро (льготный период без штрафов до 2027) ([jpk.info.pl](https://jpk.info.pl/faktury/e-faktura-ustrukturyzowana-ksef/harmonogram/)) | реестр счетов в Excel, PDF-визуализация | госприложение бесплатно; Fakturowo экспорт XML/PDF в ZIP, **без Excel** | пробел: FA(3) XML → Excel-реестр для biur rachunkowych |
| Бельгия | Peppol B2B с 01.01.2026, штрафы с 01.04.2026 ([BDO](https://www.bdo.be/en-gb/insights/news-alerts/2025/mandatory-e-invoicing-in-2026-in-belgium-three-month-tolerance-period)) | отправка только через access point | — | только просмотр/конвертация UBL |
| Франция | приём с 01.09.2026, выставление МСП с 01.09.2027 через PA (101 платформа) ([economie.gouv.fr](https://economie.gouv.fr/actualites/facturation-electronique-la-liste-des-101-premieres-plateformes-agreees-est-disponible)) | — | много бесплатных PA | узко |
| Мексика CFDI | давний мандат | XML→Excel/PDF | много бесплатных и дешёвых (El Conta и др.) | спрос большой, цены низкие |
| Малайзия, Саудовская Аравия, ОАЭ, Индия | — | нужна сертификация, ASP/EGS или госпортал | — | не подходит |

Риск по всем: сертификация нужна только для **отправки**; чтение и конвертация свободны, но бесплатных просмотрщиков много.
