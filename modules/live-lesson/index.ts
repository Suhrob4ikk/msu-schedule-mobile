import { requireOptionalNativeModule } from 'expo-modules-core';

interface LiveLessonNativeModule {
  /** Пересобрать уведомление по текущему времени и переставить будильник. */
  refresh(): Promise<void>;
  /** Снять уведомление и будильник. */
  clear(): Promise<void>;
  /**
   * Разбудить виджет на рабочем столе прямо сейчас, не дожидаясь его
   * собственного будильника или системного updatePeriodMillis — оба MIUI
   * умеет замораживать на часы. Вызывать при каждой записи свежего
   * расписания (см. src/widgetData.ts).
   */
  refreshWidget(): Promise<void>;
}

// requireOptionalNativeModule, а не requireNativeModule: модуль только для
// Android, и в Expo Go его нет вовсе. Отсутствие не должно ронять приложение —
// обёртка в src/liveLesson.ts просто ничего не делает.
export default requireOptionalNativeModule<LiveLessonNativeModule>('LiveLesson');
