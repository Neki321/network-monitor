import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type Language = "UA" | "EN";

const getInitialLanguage = (): Language => {
  const browserLang =
    (typeof navigator !== "undefined" && (navigator.language || navigator.languages?.[0])) || "en";
  return browserLang.toLowerCase().startsWith("uk") ? "UA" : "EN";
};

const translations = {
  UA: {
    title: "Моніторинг мережі",
    nodes: "Вузли",
    stats: "Статистика",
    alerts: "Попередження",
    noNodes: "Немає підключених вузлів",
    online: "Онлайн",
    offline: "Офлайн",
    cpu: "Процесор",
    ram: "Памʼять",
    disk: "Диск",
    connected: "WebSocket Підключено",
    disconnected: "WebSocket Відключено",
    lastUpdate: "Останнє оновлення",
    uptime: "Час роботи",
    noAlerts: "Немає попереджень",
    time: "Час",
    node: "Вузол",
    type: "Тип",
    value: "Значення",
    avgCpu: "Сер. Процесор",
    maxCpu: "Макс. Процесор",
    avgRam: "Сер. Памʼять",
    maxRam: "Макс. Памʼять",
    viewCards: "Картки",
    viewTable: "Таблиця",
    nodesOnline: "Вузлів онлайн",
    login: "Логін",
    username: "Логін",
    password: "Пароль",
    guest: "Спостерігач",
    logout: "Вийти",
    admin: "Адмін",
    readOnly: "Лише перегляд",
    close: "Закрити",
    waiting: "Очікування перших метрик...",
    loginBtn: "Вхід",
    guestBtn: "Увійти як спостерігач",
    invalidCredentials: "Невірний логін або пароль",
    logoutBtn: "Вийти",
    adminBadge: "Адмін",
    guestBadge: "Спостерігач",
    guestPcName: "Ім'я вашого ПК",
    guestPcHint:
      "Дізнатись своє ім'я ПК: відкрийте термінал і введіть команду hostname",
    guestPcRequired: "Введіть ім'я ПК (як у hostname)",
    minShort: "мін",
    maxShort: "макс",
    gpu: "GPU",
    temp: "Темп",
    renameNode: "Нова назва вузла",
  },
  EN: {
    title: "Network monitor",
    nodes: "Nodes",
    stats: "Statistics",
    alerts: "Warnings",
    noNodes: "No nodes connected yet",
    online: "Online",
    offline: "Offline",
    cpu: "CPU",
    ram: "RAM",
    disk: "Disk",
    connected: "WebSocket Connected",
    disconnected: "WebSocket Disconnected",
    lastUpdate: "Last update",
    uptime: "Uptime",
    noAlerts: "No warnings",
    time: "Time",
    node: "Node",
    type: "Type",
    value: "Value",
    avgCpu: "Avg CPU",
    maxCpu: "Max CPU",
    avgRam: "Avg RAM",
    maxRam: "Max RAM",
    viewCards: "Cards",
    viewTable: "Table",
    nodesOnline: "Nodes online",
    login: "Login",
    username: "Login",
    password: "Password",
    guest: "Viewer",
    logout: "Logout",
    admin: "Admin",
    readOnly: "Read only",
    close: "Close",
    waiting: "Waiting for first metrics...",
    loginBtn: "Sign in",
    guestBtn: "Continue as viewer",
    invalidCredentials: "Invalid credentials",
    logoutBtn: "Logout",
    adminBadge: "Admin",
    guestBadge: "Viewer",
    guestPcName: "Your PC name",
    guestPcHint: "To find your PC name: open a terminal and run hostname",
    guestPcRequired: "Enter your PC name (as shown by hostname)",
    minShort: "min",
    maxShort: "max",
    gpu: "GPU",
    temp: "Temp",
    renameNode: "New node display name",
  },
} as const;

type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (typeof translations)[Language];
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(getInitialLanguage);

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      t: translations[language],
    }),
    [language]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  return context;
}
