package tj.msu.schedule.live

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Мостик в JS. Нужен ровно для одного: сказать нативной части «пересчитай
 * прямо сейчас» — когда пользователь включил функцию или когда приложение
 * обновило расписание. Само расписание передавать не нужно: нативная часть
 * читает его из AsyncStorage.
 */
class LiveLessonModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("LiveLesson")

        AsyncFunction("refresh") {
            appContext.reactContext?.let { LiveLesson.refresh(it) }
        }

        AsyncFunction("clear") {
            appContext.reactContext?.let { LiveLesson.clear(it) }
        }
    }
}
