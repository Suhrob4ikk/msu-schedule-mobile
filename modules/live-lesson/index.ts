import { requireOptionalNativeModule } from 'expo-modules-core';

interface LiveLessonNativeModule {
  /** Пересобрать уведомление по текущему времени и переставить будильник. */
  refresh(): Promise<void>;
  /** Снять уведомление и будильник. */
  clear(): Promise<void>;
}

// requireOptionalNativeModule, а не requireNativeModule: модуль только для
// Android, и в Expo Go его нет вовсе. Отсутствие не должно ронять приложение —
// обёртка в src/liveLesson.ts просто ничего не делает.
export default requireOptionalNativeModule<LiveLessonNativeModule>('LiveLesson');
