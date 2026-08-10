type ApiError = {
  detail?: string;
};

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

const USER_MESSAGES: Record<string, string> = {
  "Room not found": "Комната не найдена. Проверьте ссылку или код.",
  "Room is not accepting participants":
    "Сейчас к этой комнате нельзя присоединиться.",
  "Username is already taken in this room":
    "Это имя уже занято в комнате. Выберите другое.",
  "Participant token is required":
    "Сессия участника не найдена. Откройте ссылку-приглашение ещё раз.",
  "Invalid participant token":
    "Сессия участника больше недоступна. Войдите в комнату снова.",
  "Organizer token is required": "Сессия ведущего не найдена.",
  "Invalid organizer token": "Сессия ведущего больше недоступна.",
  "Active participant not found": "Игрок уже покинул комнату.",
  "Game is not configured": "Ведущий ещё не выбрал квиз.",
  "Select a quiz template before starting the room": "Сначала выберите квиз.",
  "Room can only be started from lobby":
    "Игру можно начать только из комнаты ожидания.",
  "Game can only be configured in lobby":
    "Новый квиз можно выбрать только до начала игры.",
  "Game room is not active": "Игра ещё не началась или уже завершена.",
  "This game phase transition is not allowed":
    "Сейчас нельзя перейти к следующему этапу.",
  "There are no more questions in this quiz": "В квизе больше нет вопросов.",
  "Current question is not available in this game phase":
    "Вопрос пока недоступен.",
  "Answer stats are not available in this game phase":
    "Статистика ответов пока недоступна.",
  "Answer reveal is not available in this game phase":
    "Правильный ответ пока не показывается.",
  "Leaderboard is not available in this game phase":
    "Результаты появятся после завершения вопроса.",
  "Answers are not accepted in this game phase": "Приём ответов уже завершён.",
  "Question deadline has expired": "Время на ответ закончилось.",
  "Selected option does not belong to the current question":
    "Этот вариант ответа больше недоступен.",
  "Answer has already been submitted for this question":
    "Ваш ответ уже принят.",
  "Published quiz template not found": "Выбранный квиз недоступен.",
  "Quiz template with this title already exists":
    "Квиз с таким названием уже существует.",
};

function getUserMessage(detail: string | null, status: number): string {
  if (detail && USER_MESSAGES[detail]) {
    return USER_MESSAGES[detail];
  }

  if (status === 401) {
    return "Сессия больше недоступна. Откройте ссылку ещё раз.";
  }

  if (status === 403) {
    return "У вас нет доступа к этому действию.";
  }

  if (status === 404) {
    return "Запрошенная страница или комната не найдена.";
  }

  if (status === 409) {
    return "Это действие сейчас недоступно.";
  }

  if (status >= 500) {
    return "На сервере произошла ошибка. Попробуйте ещё раз.";
  }

  return "Не удалось выполнить действие. Попробуйте ещё раз.";
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        ...options.headers,
        "Content-Type": "application/json",
      },
    });
  } catch {
    throw new Error(
      "Не удалось связаться с сервером. Проверьте подключение к интернету.",
    );
  }

  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const detail =
      typeof data === "object" &&
      data !== null &&
      "detail" in data &&
      typeof (data as ApiError).detail === "string"
        ? ((data as ApiError).detail ?? null)
        : null;
    throw new Error(getUserMessage(detail, response.status));
  }

  return data as T;
}
