# Разработка

Node.js 24 LTS, npm, Git; локально проверено на Windows с Node 24.19.0. Python не нужен.

```powershell
npm.cmd ci
npm.cmd run dev
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
npx.cmd playwright install chromium
npm.cmd run e2e
```

Vite слушает 127.0.0.1. Playwright сам поднимает сервер на 5173; не запускайте другой проект на этом порту. Chromium со SwiftShader, один worker. Скриншоты и отчёты в test-results / playwright-report игнорируются Git. Скриншоты осматриваются вручную, сравнения эталонных пикселей нет. WebGL-тест выбирает реальную поверхность и создаёт расстояние.

Сборка в dist: `npm run build`. Просмотр: `npx vite preview --host 127.0.0.1`. Форматирование: `npx prettier --write src e2e *.ts *.js *.json`.

Unit проверяют объёмы и площади независимых аналитических тел, пересечения/полости/проёмы, неизменность данных после смещения, параметризацию, CSV/JSON/DXF. E2E покрывают сценарии интерфейса, файлы, WebGL и адаптивность. Новое геометрическое ядро также проверять независимыми эталонами.

Lockfile обязателен, установка — npm ci. Перед выпуском npm audit. Для @typescript-eslint/typescript-estree задан override minimatch ^11.0.1 из-за advisory GHSA-g3hv-75wg-m249 в штатном диапазоне линтера. Lint проверен с override; пересмотреть его при обновлении typescript-eslint.

GitHub Actions: typecheck, lint, unit, build, Chromium E2E. Облачный статус отделять от локального; см. PROJECT_STATE. Не менять биллинг/лимиты и не использовать платные API.

Крупные изменения — отдельная ветка от main, ясные коммиты (`feat:`, `fix:`, `test:`, `docs:`), регулярный push только в приватный csnicallyou/buildscope. Без force push и уничтожения чужих изменений. После этапов обновлять PROJECT_STATE и HANDOFF.


## Реконструкция КЖ1.5

`npm run export:projects` воспроизводит четыре JSON v2 и CSV геометрии/источника в output/projects. После изменений генератора перегенерировать, проверить diff и коммитить результаты вместе с кодом. esbuild является прямой dev-зависимостью скрипта.

Данные: src/kzh.ts, src/data/kzh-layout.json, kzh-schedules.ts, details.ts. Локальный PDF и все промежуточные растры/тексты только в drawings/ (gitignore). Опциональная регенерация векторной раскладки: PyMuPDF и scripts/extract_kzh_layout.py --pdf LOCAL_PATH --out src/data/kzh-layout.json. Не требуется для обычного запуска. Не считать этот скрипт универсальным восстановлением 3D.

Сейчас unit/E2E проверяют также ФБС/ФЛ по независимым количествам, вырезы Фм2 и плит, варианты отметок, сохранение v2, 152 M24, каталог деталей, согласованность меша с объёмом и фактическую видимость арматуры в Canvas. E2E реальной сборки и исходного демо разделены параметром ?demo=1.
