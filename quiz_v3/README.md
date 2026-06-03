# Quiz Trainer

Приложение-тренажер тестов на `HTML + JS` с сохранением статистики в файл.

## Что умеет

- пользователь сам задает количество вопросов для сессии
- вопросы не повторяются в рамках одного прохождения
- показывает варианты ответов, считает верные/ошибки
- есть отдельный режим "Генерируемые", где новые вопросы создает Gemini API
- API-ключ Gemini и модель выбираются прямо в веб-интерфейсе
- в режиме Gemini можно задать вероятность появления каверзных вопросов (в процентах)
- в режиме "Генерируемые" при ошибке показывается объяснение и правильный ответ
- сохраняет статистику в `cookies` браузера (локально на устройстве)

## Как запустить

1. Установите Node.js (если не установлен).
2. Откройте приложение и вставьте `Gemini API Key` в поле интерфейса.
3. В выпадающем списке выберите модель (`gemini-2.5-flash`).

Альтернатива (если удобнее через переменные окружения): можно не вводить ключ в интерфейсе и задать его в PowerShell:

```powershell
$env:GEMINI_API_KEY="ваш_ключ"
```

4. В папке проекта выполните:

```bash
npm start
```

5. Откройте в браузере:

`http://localhost:3000`

Опционально можно задать модель через переменную:

```powershell
$env:GEMINI_MODEL="gemini-2.5-flash"
```

## Запуск на удаленной VPS (без Docker, через npm)

### 1) Подготовка сервера (Ubuntu)

```bash
sudo apt update
sudo apt install -y nodejs npm git
node -v
npm -v
```

### 2) Клонирование и установка

```bash
sudo mkdir -p /opt/quiz-trainer
sudo chown -R $USER:$USER /opt/quiz-trainer
git clone <ВАШ_REPO_URL> /opt/quiz-trainer
cd /opt/quiz-trainer
npm install
```

### 3) Конфигурация `.env`

```bash
cp .env.example .env
nano .env
```

Минимум заполните:

- `GEMINI_API_KEY=...`
- `GEMINI_MODEL=gemini-2.5-flash`
- `PORT=3000`

### 4) Проверка ручного запуска

```bash
cd /opt/quiz-trainer
npm start
```

Проверьте в другом окне:

```bash
curl http://127.0.0.1:3000
```

### 5) Автозапуск через systemd

В проекте есть шаблон: `deploy/quiz-trainer.service`.

Скопируйте и включите сервис:

```bash
sudo cp /opt/quiz-trainer/deploy/quiz-trainer.service /etc/systemd/system/quiz-trainer.service
sudo systemctl daemon-reload
sudo systemctl enable quiz-trainer
sudo systemctl start quiz-trainer
sudo systemctl status quiz-trainer
```

Логи:

```bash
sudo journalctl -u quiz-trainer -f
```

### 6) Рекомендация для продакшна

Поставьте Nginx как reverse proxy на 80/443 и проксируйте на `127.0.0.1:3000`.
Так вы получите нормальный HTTPS и стабильный доступ к API с фронта.

## Где добавить вопросы

Отредактируйте файл `public/questions.js` и замените массив `window.QUESTIONS`.
Файл не отдается напрямую в браузер, вопросы загружаются через серверный API.

Формат одного вопроса:

```js
{
  id: 1,
  question: "Текст вопроса",
  options: ["A", "B", "C", "D"],
  // Один правильный ответ:
  correctIndex: 2
}
```

Формат вопроса с несколькими правильными ответами:

```js
{
  id: 2,
  question: "Выберите все языки программирования",
  options: ["JavaScript", "HTML", "Python", "CSS"],
  correctIndices: [0, 2],
  multiple: true // необязательно, если correctIndices содержит > 1 варианта
}
```
