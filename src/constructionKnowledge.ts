export const constructionSources = [
  {
    id: "film",
    title: "ТЕХНОНИКОЛЬ: бетонная подготовка и разделительный слой",
    url: "https://www.tn.ru/journal/kak-smontirovat-zamenu-betonnoy-podgotovki-pod-fundament/",
    scope:
      "Плёнка под подготовкой удерживает воду и цементное молочко; это не замена опалубки.",
  },
  {
    id: "concrete",
    title: "ТЕХНОНИКОЛЬ: оборудование, армирование, укладка и уход",
    url: "https://www.tn.ru/upload/iblock/2d3/zuha570glkkagz0avdcbev90v23c2a3n/2024_Instruktsiya_Vozvedenie-lentochnykh-fundamentov-s-ispolzovaniem-opalubki_web.pdf",
    scope:
      "Страницы 6–7, 14–17. Общие операции; система несъёмной опалубки из инструкции не переносится в наш проект.",
  },
  {
    id: "compaction",
    title: "Wacker Neuson: виброплиты для уплотнения основания",
    url: "https://www.wackerneuson.com/ru/produkcija/vibroplity",
    scope:
      "Тип оборудования. Число проходов, толщина слоёв и контроль плотности определяются технологией работ.",
  },
  {
    id: "release",
    title: "MC-Bauchemie: разделительные средства для опалубки",
    url: "https://www.mc-bauchemie.ru/produkty/smazki/",
    scope:
      "Разделительный состав для контакта формы с бетоном. Он не заменяет плёнку основания или уход за поверхностью.",
  },
] as const;
export type InstallationOptions = {
  baseFilm: boolean;
  curingCover: boolean;
  vibration: "surface" | "internal";
};
export const defaultInstallationOptions = (
  prep: boolean,
): InstallationOptions => ({
  baseFilm: false,
  curingCover: true,
  vibration: prep ? "surface" : "internal",
});
export const toolNames: Record<string, string[]> = {
  layout: ["Нивелир с рейкой", "Рулетка и шнур"],
  base: ["Лопата", "Щётка", "Контроль отметок"],
  film: ["Рулон разделительной плёнки", "Нож", "Лента по технологии"],
  boards: ["Доски / щиты", "Стойки и подкосы (схема)", "Шуруповёрт"],
  seal: ["Герметизация стыков", "Кисть / распылитель состава"],
  reinforce: [
    "Фиксаторы защитного слоя (схема)",
    "Вязальная проволока",
    "Вязальный крючок",
  ],
  check: ["Рулетка", "Нивелир", "Осмотр перед бетонированием"],
  pour: ["Шланг подачи смеси (пример)", "Совковая лопата"],
  vibrate: ["Оборудование уплотнения по ППР"],
  level: ["Правило", "Гладилка"],
  care: ["Укрывной материал (вариант)", "Контроль ухода"],
  wait: ["Контроль температуры и прочности"],
  strip: ["Шуруповёрт / гвоздодёр", "Последовательный демонтаж"],
  spread: ["Средство подачи материала по ППР", "Лопата"],
  compact: ["Виброплита (пример)", "Контроль плотности"],
  place: ["Монтажные приспособления по ППР"],
  tie: ["Вязальный крючок", "Проволока"],
  ready: ["Контроль готовой части"],
};
