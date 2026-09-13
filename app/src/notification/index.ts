import { appConfig } from '../config/appConfig';
import { NotificationService } from './notificationService';

export const notification = new NotificationService(appConfig.notification);
export const notifications = notification;

export * from './notificationService';
export * from './types';
