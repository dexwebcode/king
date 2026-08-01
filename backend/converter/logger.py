
# db_converter/converter/logger.py

import os
import logging
from datetime import datetime

class LoggerManager:
    """ Класс для управления логами """

    def __init__(self, log_dir="db_converter/logs"):
        """ Инициализация класса """
        self.log_dir = log_dir
        self.logger = None

    def setup_logging(self):
        """ Настройка окружения логгера, создание папок и файлов логов """
        # Создаем директорию для логов, если её нет
        if not os.path.exists(self.log_dir):
            os.makedirs(self.log_dir)
            print(f"Создана директория для логов: {os.path.abspath(self.log_dir)}")

        # Формируем пути к файлам
        info_path = os.path.join(self.log_dir, "info.log")
        error_path = os.path.join(self.log_dir, "error.log")

        # Инициализируем логгер, если он еще не создан
        if self.logger is None:
            self.logger = logging.getLogger("db_converter")
            self.logger.setLevel(logging.DEBUG) # Логгер должен ловить всё, чтобы фильтровать могли handlers

            # Чтобы избежать дублирования записей при повторных вызовах setup_logging
            if self.logger.handlers:
                # Очищаем старые обработчики, если нужно (опционально)
                # self.logger.handlers.clear()
                return self.logger

            # 1. Форматтер
            formatter = logging.Formatter(
                '%(asctime)s | %(levelname)-8s | %(message)s',
                datefmt='%Y-%m-%d %H:%M:%S'
            )

            # 2. Handler для INFO (и выше, кроме ERROR/CRITICAL или можно оставить всё INFO+)
            # logging.INFO включает INFO, WARNING, ERROR, CRITICAL
            info_handler = logging.FileHandler(info_path)
            info_handler.setLevel(logging.INFO)
            info_handler.setFormatter(formatter)
            self.logger.addHandler(info_handler)

            # 3. Handler для ERROR (и CRITICAL)
            error_handler = logging.FileHandler(error_path)
            error_handler.setLevel(logging.ERROR)
            error_handler.setFormatter(formatter)
            self.logger.addHandler(error_handler)

            # Дополнительно: вывод в консоль (опционально)
            console_handler = logging.StreamHandler()
            console_handler.setLevel(logging.WARNING)
            console_handler.setFormatter(formatter)
            self.logger.addHandler(console_handler)

        return self.logger

# Глобальный экземпляр или функция для получения
def get_logger():
    """ Вспомогательная функция для получения логгера """
    manager = LoggerManager()
    return manager.setup_logging()
logger = get_logger()
# if __name__ == '__main__':
#     # Пример использования при запуске скрипта
#     logger = get_logger()
#     logger.info("Это информационное сообщение")
#     logger.warning("Это предупреждение")
#     logger.error("Это ошибка")
#     logger.debug("Это отладочное сообщение (не попадет в файлы, т.к. уровень DEBUG)")