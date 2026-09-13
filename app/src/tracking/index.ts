import { appConfig } from '../config/appConfig';
import { TrackingService } from './trackingService';

export const tracking = new TrackingService(appConfig.tracking);
