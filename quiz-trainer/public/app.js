const startQuizBtn = document.getElementById("startQuizBtn");
const allQuestionsBtn = document.getElementById("allQuestionsBtn");
const questionCountInput = document.getElementById("questionCountInput");
const restartBtn = document.getElementById("restartBtn");
const questionText = document.getElementById("questionText");
const answersForm = document.getElementById("answersForm");
const submitBtn = document.getElementById("submitBtn");
const feedbackText = document.getElementById("feedbackText");
const progressText = document.getElementById("progressText");
const scoreText = document.getElementById("scoreText");
const sessionStatsText = document.getElementById("sessionStatsText");
const globalStatsText = document.getElementById("globalStatsText");
const resetStatsBtn = document.getElementById("resetStatsBtn");

let state = resetState();

startQuizBtn.addEventListener("click", () => startQuiz());
allQuestionsBtn.addEventListener("click", () => startAllQuestionsQuiz());
restartBtn.addEventListener("click", () => {
  state = resetState();
  renderIdle();
});
resetStatsBtn.addEventListener("click", resetStats);
submitBtn.addEventListener("click", submitAnswer);
questionCountInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    startQuiz();
  }
});

renderIdle();
loadGlobalStats();

function resetState() {
  return {
    requestedCount: 0,
    quizLength: 0,
    pool: [],
    currentQuestion: null,
    askedCount: 0,
    correct: 0,
    wrong: 0,
    finished: false
  };
}

function startQuiz() {
  if (!Array.isArray(window.QUESTIONS) || window.QUESTIONS.length === 0) {
    alert("Список вопросов пуст. Добавьте вопросы в public/questions.js");
    return;
  }

  const requestedLength = Number(questionCountInput.value);
  if (!Number.isInteger(requestedLength) || requestedLength <= 0) {
    alert("Введите корректное количество вопросов (целое число больше нуля)");
    return;
  }

  const quizLength = Math.min(requestedLength, window.QUESTIONS.length);

  state = {
    requestedCount: requestedLength,
    quizLength,
    pool: shuffle([...window.QUESTIONS]).slice(0, quizLength),
    currentQuestion: null,
    askedCount: 0,
    correct: 0,
    wrong: 0,
    finished: false
  };

  feedbackText.textContent = "";
  nextQuestion();
}

function startAllQuestionsQuiz() {
  if (!Array.isArray(window.QUESTIONS) || window.QUESTIONS.length === 0) {
    alert("Список вопросов пуст. Добавьте вопросы в public/questions.js");
    return;
  }
  questionCountInput.value = String(window.QUESTIONS.length);
  startQuiz();
}

function nextQuestion() {
  if (state.askedCount >= state.quizLength) {
    finishQuiz();
    return;
  }

  state.currentQuestion = state.pool[state.askedCount];
  const isMultiple = isMultipleQuestion(state.currentQuestion);
  questionText.textContent = state.currentQuestion.question;
  answersForm.innerHTML = "";

  state.currentQuestion.options.forEach((option, index) => {
    const wrapper = document.createElement("label");
    wrapper.className = "answer-option";

    const input = document.createElement("input");
    input.type = isMultiple ? "checkbox" : "radio";
    input.name = "answer";
    input.value = String(index);

    wrapper.appendChild(input);
    wrapper.append(` ${option}`);
    answersForm.appendChild(wrapper);
  });

  submitBtn.disabled = false;
  feedbackText.textContent = isMultiple
    ? "Можно выбрать несколько вариантов"
    : "Выберите один вариант";
  feedbackText.style.color = "#374151";
  updateScoreboard();
}

function submitAnswer(event) {
  event.preventDefault();
  if (!state.currentQuestion || state.finished) return;

  const selected = [...answersForm.querySelectorAll("input[name='answer']:checked")];
  if (selected.length === 0) {
    feedbackText.textContent = "Выберите хотя бы один вариант ответа";
    feedbackText.style.color = "#b45309";
    return;
  }

  const selectedIndices = selected.map((item) => Number(item.value)).sort((a, b) => a - b);
  const correctIndices = getCorrectIndices(state.currentQuestion);
  const isCorrect = areSameIndices(selectedIndices, correctIndices);
  markAnswerHighlights(selectedIndices, correctIndices);
  toggleAnswerInputs(true);

  if (isCorrect) {
    state.correct += 1;
    feedbackText.textContent = "Верно";
    feedbackText.style.color = "#047857";
  } else {
    state.wrong += 1;
    feedbackText.textContent = "Ошибка";
    feedbackText.style.color = "#b91c1c";
  }

  state.askedCount += 1;
  updateScoreboard();

  setTimeout(() => {
    feedbackText.textContent = "";
    nextQuestion();
  }, 1200);
}

function isMultipleQuestion(question) {
  const indices = getCorrectIndices(question);
  return question.multiple === true || indices.length > 1;
}

function getCorrectIndices(question) {
  if (Array.isArray(question.correctIndices)) {
    return [...question.correctIndices].map(Number).sort((a, b) => a - b);
  }

  if (Number.isInteger(question.correctIndex)) {
    return [question.correctIndex];
  }

  return [];
}

function areSameIndices(left, right) {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

function markAnswerHighlights(selectedIndices, correctIndices) {
  const selectedSet = new Set(selectedIndices);
  const correctSet = new Set(correctIndices);
  const inputs = [...answersForm.querySelectorAll("input[name='answer']")];

  inputs.forEach((input) => {
    const optionIndex = Number(input.value);
    const wrapper = input.closest(".answer-option");
    if (!wrapper) return;

    wrapper.classList.remove("is-correct", "is-wrong", "is-missed");

    if (correctSet.has(optionIndex)) {
      wrapper.classList.add("is-correct");
      return;
    }

    if (selectedSet.has(optionIndex) && !correctSet.has(optionIndex)) {
      wrapper.classList.add("is-wrong");
    }
  });

  correctIndices.forEach((correctIndex) => {
    if (!selectedSet.has(correctIndex)) {
      const missedInput = answersForm.querySelector(`input[name='answer'][value='${correctIndex}']`);
      const missedWrapper = missedInput?.closest(".answer-option");
      if (missedWrapper) {
        missedWrapper.classList.add("is-missed");
      }
    }
  });
}

function toggleAnswerInputs(disabled) {
  const inputs = answersForm.querySelectorAll("input[name='answer']");
  inputs.forEach((input) => {
    input.disabled = disabled;
  });
}

async function finishQuiz() {
  state.finished = true;
  submitBtn.disabled = true;
  questionText.textContent = "Тест завершен";
  answersForm.innerHTML = "";
  const percent = Math.round((state.correct / state.quizLength) * 100);
  const isPassed = percent >= 75;
  const passText = isPassed ? "Тест сдан" : "Тест не сдан";
  feedbackText.textContent =
    `Итог: верно ${state.correct}, ошибок ${state.wrong}. ` +
    `Результат: ${percent}%. ${passText}.`;
  feedbackText.style.color = "#111827";

  await saveSessionStats({
    requestedCount: state.requestedCount,
    totalQuestions: state.quizLength,
    correct: state.correct,
    wrong: state.wrong
  });
}

function updateScoreboard() {
  progressText.textContent = `Прогресс: ${state.askedCount}/${state.quizLength}`;
  scoreText.textContent = `Верно: ${state.correct} | Ошибки: ${state.wrong}`;
}

function renderIdle() {
  questionText.textContent = "Введите количество вопросов и нажмите \"Начать\"";
  answersForm.innerHTML = "";
  submitBtn.disabled = true;
  progressText.textContent = "Прогресс: 0/0";
  scoreText.textContent = "Верно: 0 | Ошибки: 0";
  feedbackText.textContent = "";
  loadGlobalStats();
}

function shuffle(items) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

async function saveSessionStats(payload) {
  const summary = loadSummaryFromCookie();
  const percentCorrect = payload.totalQuestions > 0
    ? Math.round((payload.correct / payload.totalQuestions) * 100)
    : 0;

  summary.totalSessions += 1;
  summary.totalQuestions += payload.totalQuestions;
  summary.totalCorrect += payload.correct;
  summary.totalWrong += payload.wrong;
  summary.lastSession = {
    totalQuestions: payload.totalQuestions,
    correct: payload.correct,
    wrong: payload.wrong,
    percentCorrect
  };
  summary.sessionsHistory.unshift({
    date: new Date().toISOString(),
    totalQuestions: payload.totalQuestions,
    correct: payload.correct,
    wrong: payload.wrong,
    percentCorrect
  });
  summary.sessionsHistory = summary.sessionsHistory.slice(0, 30);
  persistSummaryToCookie(summary);
  renderGlobalStats(summary);
}

async function loadGlobalStats() {
  const summary = loadSummaryFromCookie();
  renderGlobalStats(summary);
}

function renderGlobalStats(summary) {
  if (summary.sessionsHistory.length > 0) {
    const historyLines = summary.sessionsHistory.map((session) => {
      const dateLabel = new Date(session.date).toLocaleString("ru-RU");
      const passText = session.percentCorrect >= 75 ? "тест сдан" : "тест не сдан";
      return `${dateLabel}: вопросов ${session.totalQuestions}; верно ${session.correct}; неверно ${session.wrong}; процент верных ${session.percentCorrect}%; ${passText}`;
    });
    sessionStatsText.innerHTML = `Сессии по датам:<br>${historyLines.join("<br>")}`;
  } else {
    sessionStatsText.textContent = "Сессия: нет данных";
  }

  const totalPercent = summary.totalQuestions > 0
    ? Math.round((summary.totalCorrect / summary.totalQuestions) * 100)
    : 0;
  globalStatsText.textContent =
    `Общая: сессий ${summary.totalSessions}; ` +
    `вопросов ${summary.totalQuestions}; ` +
    `верно ${summary.totalCorrect}; ` +
    `неверно ${summary.totalWrong}; ` +
    `процент верных ${totalPercent}%`;
}

function defaultSummary() {
  return {
    totalSessions: 0,
    totalQuestions: 0,
    totalCorrect: 0,
    totalWrong: 0,
    lastSession: null,
    sessionsHistory: []
  };
}

function loadSummaryFromCookie() {
  const raw = getCookieValue("quizStats");
  if (!raw) return defaultSummary();

  try {
    const parsed = JSON.parse(raw);
    if (
      Number.isInteger(parsed.totalSessions) &&
      Number.isInteger(parsed.totalQuestions) &&
      Number.isInteger(parsed.totalCorrect) &&
      Number.isInteger(parsed.totalWrong)
    ) {
      const lastSession = parsed.lastSession;
      const hasValidLastSession =
        lastSession === null ||
        (
          typeof lastSession === "object" &&
          lastSession !== null &&
          Number.isInteger(lastSession.totalQuestions) &&
          Number.isInteger(lastSession.correct) &&
          Number.isInteger(lastSession.wrong) &&
          Number.isInteger(lastSession.percentCorrect)
        );
      const sessionsHistory = Array.isArray(parsed.sessionsHistory) ? parsed.sessionsHistory : [];
      const hasValidSessionsHistory = sessionsHistory.every(
        (session) =>
          session &&
          typeof session === "object" &&
          typeof session.date === "string" &&
          Number.isInteger(session.totalQuestions) &&
          Number.isInteger(session.correct) &&
          Number.isInteger(session.wrong) &&
          Number.isInteger(session.percentCorrect)
      );
      if (!hasValidLastSession) {
        return defaultSummary();
      }
      if (!hasValidSessionsHistory) {
        return defaultSummary();
      }
      parsed.sessionsHistory = sessionsHistory;
      return parsed;
    }
  } catch (error) {
    return defaultSummary();
  }

  return defaultSummary();
}

function persistSummaryToCookie(summary) {
  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1);
  const value = encodeURIComponent(JSON.stringify(summary));
  document.cookie = `quizStats=${value}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`;
}

function resetStats() {
  document.cookie = "quizStats=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax";
  renderGlobalStats(defaultSummary());
}

function getCookieValue(name) {
  const prefix = `${name}=`;
  const parts = document.cookie.split(";").map((part) => part.trim());
  for (const part of parts) {
    if (part.startsWith(prefix)) {
      return decodeURIComponent(part.slice(prefix.length));
    }
  }
  return null;
}
