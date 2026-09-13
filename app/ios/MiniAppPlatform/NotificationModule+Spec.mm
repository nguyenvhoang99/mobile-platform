#import <UIKit/UIKit.h>
#import <UserNotifications/UserNotifications.h>
#import <EventKit/EventKit.h>
#import <EventKitUI/EventKitUI.h>

#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import <ReactCodegen/MiniAppPlatformSpec/MiniAppPlatformSpec.h>

#import <React_RCTAppDelegate/RCTDefaultReactNativeFactoryDelegate.h>

#import "MiniAppPlatform-Swift.h"

// Binds the Swift `NotificationModule` to the generated
// `NativeNotificationSpec` protocol (itself generated from
// `src/native/specs/NativeNotification.ts`). The Swift implementation keeps
// the exact selectors the protocol requires; this category only adds JSI
// dispatch. Do not redeclare methods here; change the spec instead.
@interface NotificationModule (Spec) <NativeNotificationSpec>
@end

@implementation NotificationModule (Spec)

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeNotificationSpecJSI>(params);
}

@end
