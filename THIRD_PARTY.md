# Кадр — сторонние исходники

Все репозитории ниже скачаны в `vendor/`, зафиксированы на конкретном коммите и сохранили свои лицензии. Мы не выдаём этот код за свой.

| Проект | Коммит | Лицензия | Что используем |
|---|---|---|---|
| [HyperFrames](https://github.com/heygen-com/hyperframes) | `4276039576d4bf7345f57f545723c8125eaed5a7` | Apache 2.0 | HTML→MP4 deterministic engine, catalog motion/title/transition blocks, CLI reference. Desk-top renderer phase. |
| [Opus Motion Library](https://github.com/GovinduSasanka/opus-motion-library) | `7bde15aa904671fb0a1a06c2d88e7012dbab2069` | MIT | Parameterised motion primitives, 9:16 formats, transitions and style ids. Select a small subset for the browser renderer. |
| [Motionity](https://github.com/JoshuaRileyDev/motionity) | `d546e0f76a63b369038f852a835777796a266cb9` | MIT | UX reference: keyframes, masking, filters, layer inspector. Not copied as a runtime. |
| [OpenVideo](https://github.com/clawnify/OpenVideo) | `a82180eedccd6a215a1eae89b2cec81f2f4caa8c` | MIT | EDL idea: plain JSON edit decision list, timeline/overlay model, agent-readable project. Schema inspiration, not a runtime copy. |

## Правила интеграции

1. Не тащим целый large framework в браузерный бандл.
2. Берём только отобранные motion-блоки; для каждого сохраняем источник и лицензию.
3. Каждый перенесённый блок получает обёртку с JSON-пропсами и детерминированный тест.
4. `vendor/` не попадает в итоговый `bundle.js` целиком — только явно отобранные части.

## Локальные правила

`ghost-editor` используется как источник правил монтажа (дубли, approval sheet, QA). Его код не встраивается; переносится логика с тестами.
