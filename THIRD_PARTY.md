# Кадр — сторонние исходники

Все репозитории ниже скачаны в `vendor/`, зафиксированы на конкретном коммите и сохранили свои лицензии. Мы не выдаём этот код за свой.

| Проект | Коммит | Лицензия | Что используем |
|---|---|---|---|
| [HyperFrames](https://github.com/heygen-com/hyperframes) | `4276039576d4bf7345f57f545723c8125eaed5a7` | Apache 2.0 | HTML→MP4 deterministic engine, catalog motion/title/transition blocks, CLI reference. Desk-top renderer phase. |
| [Opus Motion Library](https://github.com/GovinduSasanka/opus-motion-library) | `7bde15aa904671fb0a1a06c2d88e7012dbab2069` | MIT | Parameterised motion primitives, 9:16 formats, transitions and style ids. Select a small subset for the browser renderer. |
| [Motionity](https://github.com/JoshuaRileyDev/motionity) | `d546e0f76a63b369038f852a835777796a266cb9` | MIT | UX reference: keyframes, masking, filters, layer inspector. Not copied as a runtime. |
| [OpenVideo](https://github.com/clawnify/OpenVideo) | `a82180eedccd6a215a1eae89b2cec81f2f4caa8c` | MIT | EDL idea: plain JSON edit decision list, timeline/overlay model, agent-readable project. Schema inspiration, not a runtime copy. |

| [EasyReels](https://github.com/valedol190387/EasyReels) | `e2ed34855cb58c36bead3e15efa42511a821da5e` | MIT | Готовый графический набор для talking-head, правила чистки дублей, face-aware placement, rattracker по словам. Источник идей для `board-face`. |
| [Herk Edit Kit](https://github.com/nateherkai/herk-edit-kit) | `10511e5af86fc47756ea89803b397422e2d89284` | проверьте LICENSE в `vendor/herk-edit-kit` | 406 motion-карточек, editing playbook, short-form workflow. Используем как каталог-референс. |
| [Product Launch Motion](https://github.com/AbubakrChan/product-launch-motion) | `edbfb105382f21507bad895d8b5f6e0faa67487c` | MIT | morph одного элемента, Springs, music-first тайминг. Источник для `product-launch`. |
| [Animate](https://github.com/cth9191/animate) | `7e5eb56feb2dd573f890e1b7b34748af43d58263` | MIT | Style-as-plugin, story grammar, style gallery, seeded randomness. Референс архитектуры стилей. |
| [Motion](https://github.com/motiondivision/motion) | `6390e6d2ddde40128258aaa0499587505f008f1e` | проверьте LICENSE в `vendor/motion` | Движок анимации, reference для timed values и easing. |
| [Remotion](https://github.com/remotion-dev/remotion) | `1c5dc595aa1fe53b152dcf1289ce0d0338e5c0a3` | Remotion License (source-available) | Референс render-as-code. Код не копируем в браузерный бандл. |

## Что адаптировано в `templates.js` и `frame.js`

- ghost-editor: 7 preset-стилей и 11 recipes превратились в реальные системы EDL (субтитры + сцена + движение + look).
- EasyReels: hook, chips, CTA и face-aware зоны — приёмы `easy-hook`, `easy-chips`, `easy-cta`, `board-face`.
- Herk Edit Kit: graph paper и glass popout — `herk-graph`, `herk-glass`.
- Product Launch Motion: один морфящийся элемент — `launch-morph`.
- Animate: riso и cut paper — `animate-riso`, `animate-cut`.
- HyperFrames: EDL → seekable HTML через `hyper-adapter.js`; `npx hyperframes lint` проходит без ошибок.

Все превью шаблонов рисуются тем же `renderFrame`, что и экспорт, и не являются скопированными картинками из чужих gallery.

## Правила интеграции

1. Не тащим целый large framework в браузерный бандл.
2. Берём только отобранные motion-блоки; для каждого сохраняем источник и лицензию.
3. Каждый перенесённый блок получает обёртку с JSON-пропсами и детерминированный тест.
4. `vendor/` не попадает в итоговый `bundle.js` целиком — только явно отобранные части.

## Локальные правила

`ghost-editor` используется как источник правил монтажа (дубли, approval sheet, QA). Его код не встраивается; переносится логика с тестами.
