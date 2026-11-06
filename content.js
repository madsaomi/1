// Данные сайта. Публикуются из админки (PLAN-044); при ручной правке затем запустить node build.mjs.
window.schoolContent = {
  "site": {
    "url": "https://1-production-8f16.up.railway.app",
    "city": "Нукус",
    "demoMode": true
  },
  "stats": [
    {
      "value": "2016",
      "label": "год основания"
    },
    {
      "value": "5 000+",
      "label": "выпускников"
    },
    {
      "value": "3",
      "label": "филиала в Нукусе"
    },
    {
      "value": "25",
      "label": "преподавателей"
    }
  ],
  "courses": [
    {
      "name": "General English",
      "category": "languages",
      "description": "Английский для начинающих и продолжающих. 5 уровней; длительность зависит от начальной подготовки.",
      "skills": [
        "12 занятий в месяц · 3 раза в неделю",
        "Каждый урок — 1,5 часа",
        "Книги, материалы и Supporter включены"
      ],
      "price": 590000,
      "specialPrice": 500000,
      "target": "#prices",
      "id": "general-english"
    },
    {
      "name": "General English",
      "subtitle": "на каракалпакском",
      "category": "languages",
      "description": "Программа General English с объяснениями на каракалпакском языке.",
      "skills": [
        "5 уровней · 12 занятий в месяц",
        "Книги и печатные материалы включены",
        "Supporter — второй преподаватель"
      ],
      "price": 540000,
      "specialPrice": 450000,
      "target": "#prices",
      "id": "general-english-kaa"
    },
    {
      "name": "Kids English",
      "category": "kids",
      "description": "Английский для детей с занятиями по возрасту в игровой и интерактивной форме.",
      "skills": [
        "Возраст и расписание — у администратора",
        "Supporter — второй преподаватель"
      ],
      "price": 690000,
      "specialPrice": 585000,
      "target": "#prices",
      "id": "kids-english"
    },
    {
      "name": "Математика",
      "category": "subjects",
      "description": "Математика: разбор тем, логические задачи и практика решения задач повышенной сложности.",
      "skills": [
        "Классы и расписание — у администратора",
        "Supporter — второй преподаватель"
      ],
      "price": 540000,
      "specialPrice": 450000,
      "target": "#prices",
      "id": "math"
    },
    {
      "name": "Немецкий язык",
      "category": "languages",
      "description": "Курс немецкого языка от A1 до B2: грамматика, лексика и разговорные тренинги.",
      "skills": [
        "Уровень и расписание — у администратора",
        "Supporter — второй преподаватель"
      ],
      "price": 400000,
      "target": "#prices",
      "id": "german"
    },
    {
      "name": "IELTS",
      "category": "exam",
      "description": "Подготовка к IELTS: задания по Listening, Reading, Writing и Speaking.",
      "skills": [
        "Listening, Reading, Writing и Speaking",
        "Формат занятий и пробных тестов уточняется перед записью"
      ],
      "price": 800000,
      "target": "#ielts",
      "id": "ielts"
    },
    {
      "name": "SAT",
      "category": "exam",
      "description": "Подготовка по английскому и математике к SAT. Продолжительность курса — 4–5 месяцев.",
      "skills": [
        "Reading & Writing + Math",
        "Входной тест по двум предметам",
        "Регистрация на экзамен оплачивается отдельно",
        "Supporter — второй преподаватель"
      ],
      "price": 800000,
      "target": "#sat",
      "id": "sat"
    }
  ],
  "teachers": [
    {
      "name": "Азиз Каримов",
      "role": "General English · IELTS",
      "qualification": "IELTS 8.5",
      "experience": "6 лет опыта"
    },
    {
      "name": "Дилноза Юсупова",
      "role": "Kids English",
      "qualification": "CELTA",
      "experience": "5 лет опыта"
    },
    {
      "name": "Айгуль Бекмуратова",
      "role": "Немецкий язык",
      "qualification": "Goethe B2",
      "experience": "4 года опыта"
    },
    {
      "name": "Рустем Жумабаев",
      "role": "Математика · SAT",
      "qualification": "SAT Math 780",
      "experience": "7 лет опыта"
    }
  ],
  "results": [
    {
      "score": "8.0",
      "exam": "IELTS",
      "level": "C1",
      "quote": "За четыре месяца Writing вырос с 6.0 до 7.5: каждое эссе разбирали с преподавателем.",
      "student": "Малика Т.",
      "course": "IELTS, 4 месяца"
    },
    {
      "score": "7.5",
      "exam": "IELTS",
      "level": "C1",
      "quote": "Speaking Club помог перестать бояться говорить. На экзамене было спокойно.",
      "student": "Бекзод А.",
      "course": "General English и IELTS, 6 месяцев"
    },
    {
      "score": "1450",
      "exam": "SAT",
      "level": "из 1600",
      "quote": "Math подтянул с Supporter, Reading — на пробных тестах каждую неделю.",
      "student": "Нурлан К.",
      "course": "SAT, 5 месяцев"
    }
  ],
  "contacts": {
    "verified": true,
    "phones": [
      "+998913036001",
      "+998994576001"
    ],
    "telegrams": [
      "https://t.me/stanford_nukus",
      "https://t.me/Nukus_Stanford"
    ],
    "hrTelegram": "https://t.me/hrstanfordlc",
    "instagram": "https://www.instagram.com/stanford_nukus/",
    "locations": [
      {
        "id": "saraeva",
        "name": "Филиал на Сараева",
        "address": "Нукус, улица Николая Сараева, 34",
        "coordinates": [
          59.60799,
          42.467377
        ],
        "googleEmbed": "https://www.google.com/maps/embed?pb=!1m14!1m8!1m3!1d367.8931185094819!2d59.6077895!3d42.4672058!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x41dd9b357e563339%3A0xb60b76a96ee467!2sStanford%20Language%20Center!5e0!3m2!1sen!2s!4v1793096720465!5m2!1sen!2s",
        "maps": [
          {
            "provider": "google",
            "url": "https://maps.app.goo.gl/BDncqNjjgFkNAMUFA"
          },
          {
            "provider": "yandex",
            "url": "https://yandex.uz/maps/-/CXbaBL5l"
          }
        ]
      },
      {
        "id": "abdirova",
        "name": "Филиал на Абдирова",
        "address": "Нукус, улица Чарджоу Абдирова, 44А",
        "coordinates": [
          59.62766,
          42.455094
        ],
        "googleEmbed": "https://www.google.com/maps/embed?pb=!1m17!1m12!1m3!1d2943.71432776504!2d59.625085076114246!3d42.45509397118431!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m2!1m1!2zNDLCsDI3JzE4LjMiTiA1OcKwMzcnMzkuNiJF!5e0!3m2!1sen!2s!4v1793096816414!5m2!1sen!2s",
        "maps": [
          {
            "provider": "yandex",
            "url": "https://yandex.uz/maps/-/CXbaBC64"
          }
        ]
      },
      {
        "id": "youth-center",
        "name": "Филиал «Жазлар ораый»",
        "address": "Нукус, Центр молодёжи",
        "coordinates": [
          59.604319,
          42.4576377
        ],
        "googleEmbed": "https://www.google.com/maps/embed?pb=!1m14!1m8!1m3!1d735.9002264880083!2d59.6037444!3d42.4575069!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x41dd9bfa1b8a33fd%3A0x5ee2e3a48c877e81!2sJaslar%20oray%C4%B1!5e0!3m2!1sen!2s!4v1793096759095!5m2!1sen!2s",
        "maps": [
          {
            "provider": "google",
            "url": "https://maps.app.goo.gl/gpwS4FxMVecFB4T4A"
          }
        ]
      }
    ]
  }
};
