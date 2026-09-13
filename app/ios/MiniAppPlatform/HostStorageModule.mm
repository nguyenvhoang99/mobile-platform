#import <React/RCTBridgeModule.h>
#import <ReactCodegen/MiniAppPlatformSpec/MiniAppPlatformSpec.h>

// HostStorage TurboModule. Method selectors come from the generated
// `NativeHostStorageSpec` protocol (itself generated from
// `src/native/specs/NativeHostStorage.ts`). Do not redeclare selectors here;
// change the spec instead. Bodies are unchanged from the legacy module.
@interface HostStorageModule : NSObject <NativeHostStorageSpec>
@property(nonatomic, strong) dispatch_queue_t storageQueue;
@end

@implementation HostStorageModule

RCT_EXPORT_MODULE(HostStorage)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (instancetype)init
{
  self = [super init];
  if (self) {
    _storageQueue = dispatch_queue_create("com.miniappplatform.host-storage", DISPATCH_QUEUE_SERIAL);
  }
  return self;
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeHostStorageSpecJSI>(params);
}

- (NSString *)trackingFilePath
{
  NSArray<NSURL *> *directories = [[NSFileManager defaultManager]
      URLsForDirectory:NSApplicationSupportDirectory
             inDomains:NSUserDomainMask];
  NSURL *directory = directories.firstObject;
  [[NSFileManager defaultManager] createDirectoryAtURL:directory
                           withIntermediateDirectories:YES
                                            attributes:nil
                                                 error:nil];
  return [[directory URLByAppendingPathComponent:@"tracking-events.jsonl"] path];
}

- (NSString *)notificationsFilePath
{
  NSArray<NSURL *> *directories = [[NSFileManager defaultManager]
      URLsForDirectory:NSApplicationSupportDirectory
             inDomains:NSUserDomainMask];
  NSURL *directory = directories.firstObject;
  [[NSFileManager defaultManager] createDirectoryAtURL:directory
                           withIntermediateDirectories:YES
                                            attributes:nil
                                                 error:nil];
  return [[directory URLByAppendingPathComponent:@"notification-inbox.json"] path];
}

- (NSString *)cardDatasetFilePath
{
  NSArray<NSURL *> *directories = [[NSFileManager defaultManager]
      URLsForDirectory:NSApplicationSupportDirectory
             inDomains:NSUserDomainMask];
  NSURL *directory = directories.firstObject;
  [[NSFileManager defaultManager] createDirectoryAtURL:directory
                           withIntermediateDirectories:YES
                                            attributes:nil
                                                 error:nil];
  return [[directory URLByAppendingPathComponent:@"card-dataset.json"] path];
}

- (void)loadDockSelection:(RCTPromiseResolveBlock)resolve
                   reject:(RCTPromiseRejectBlock)reject
{
  resolve([[NSUserDefaults standardUserDefaults] stringForKey:@"dock_selection"]);
}

- (void)saveDockSelection:(NSString *)selection
                  resolve:(RCTPromiseResolveBlock)resolve
                   reject:(RCTPromiseRejectBlock)reject
{
  [[NSUserDefaults standardUserDefaults] setObject:selection forKey:@"dock_selection"];
  resolve(nil);
}

- (void)loadHomePreferences:(RCTPromiseResolveBlock)resolve
                     reject:(RCTPromiseRejectBlock)reject
{
  resolve([[NSUserDefaults standardUserDefaults] stringForKey:@"home_preferences"]);
}

- (void)saveHomePreferences:(NSString *)preferences
                    resolve:(RCTPromiseResolveBlock)resolve
                     reject:(RCTPromiseRejectBlock)reject
{
  [[NSUserDefaults standardUserDefaults] setObject:preferences forKey:@"home_preferences"];
  resolve(nil);
}

- (void)loadTrackingEvents:(RCTPromiseResolveBlock)resolve
                    reject:(RCTPromiseRejectBlock)reject
{
  dispatch_async(self.storageQueue, ^{
    NSString *contents = [NSString stringWithContentsOfFile:[self trackingFilePath]
                                                    encoding:NSUTF8StringEncoding
                                                       error:nil];
    resolve(contents ?: @"");
  });
}

- (void)appendTrackingEvent:(NSString *)event
                    resolve:(RCTPromiseResolveBlock)resolve
                     reject:(RCTPromiseRejectBlock)reject
{
  dispatch_async(self.storageQueue, ^{
    NSString *path = [self trackingFilePath];
    if (![[NSFileManager defaultManager] fileExistsAtPath:path]) {
      [[NSFileManager defaultManager] createFileAtPath:path contents:nil attributes:nil];
    }
    NSFileHandle *handle = [NSFileHandle fileHandleForWritingAtPath:path];
    if (handle == nil) {
      reject(@"HOST_STORAGE_APPEND_FAILED", @"Could not open the tracking queue.", nil);
      return;
    }
    @try {
      [handle seekToEndOfFile];
      NSString *line = [event stringByAppendingString:@"\n"];
      [handle writeData:[line dataUsingEncoding:NSUTF8StringEncoding]];
      [handle closeFile];
      resolve(nil);
    } @catch (NSException *exception) {
      [handle closeFile];
      reject(@"HOST_STORAGE_APPEND_FAILED", @"Could not persist the tracking event.", nil);
    }
  });
}

- (void)replaceTrackingEvents:(NSString *)events
                      resolve:(RCTPromiseResolveBlock)resolve
                       reject:(RCTPromiseRejectBlock)reject
{
  dispatch_async(self.storageQueue, ^{
    NSString *contents = events.length == 0 ? @"" : [events stringByAppendingString:@"\n"];
    NSError *error = nil;
    BOOL written = [contents writeToFile:[self trackingFilePath]
                              atomically:YES
                                encoding:NSUTF8StringEncoding
                                   error:&error];
    if (!written) {
      reject(@"HOST_STORAGE_REPLACE_FAILED", @"Could not replace the tracking queue.", error);
      return;
    }
    resolve(nil);
  });
}

- (void)getOrCreateAnonymousId:(NSString *)scope
                       resolve:(RCTPromiseResolveBlock)resolve
                        reject:(RCTPromiseRejectBlock)reject
{
  NSUserDefaults *defaults = [NSUserDefaults standardUserDefaults];
  NSString *key = [@"tracking_anonymous_id." stringByAppendingString:scope];
  NSString *existing = [defaults stringForKey:key];
  if (existing != nil) {
    resolve(existing);
    return;
  }
  NSString *created = [[NSUUID UUID] UUIDString];
  [defaults setObject:created forKey:key];
  resolve(created);
}

- (void)loadNotifications:(RCTPromiseResolveBlock)resolve
                   reject:(RCTPromiseRejectBlock)reject
{
  dispatch_async(self.storageQueue, ^{
    NSString *contents = [NSString stringWithContentsOfFile:[self notificationsFilePath]
                                                    encoding:NSUTF8StringEncoding
                                                       error:nil];
    resolve(contents ?: @"[]");
  });
}

- (void)saveNotifications:(NSString *)notifications
                  resolve:(RCTPromiseResolveBlock)resolve
                   reject:(RCTPromiseRejectBlock)reject
{
  dispatch_async(self.storageQueue, ^{
    NSError *error = nil;
    BOOL written = [notifications writeToFile:[self notificationsFilePath]
                                   atomically:YES
                                     encoding:NSUTF8StringEncoding
                                        error:&error];
    if (!written) {
      reject(@"HOST_STORAGE_NOTIFICATIONS_FAILED", @"Could not persist the notification inbox.", error);
      return;
    }
    resolve(nil);
  });
}

- (void)loadCardDataset:(RCTPromiseResolveBlock)resolve
                 reject:(RCTPromiseRejectBlock)reject
{
  dispatch_async(self.storageQueue, ^{
    NSString *contents = [NSString stringWithContentsOfFile:[self cardDatasetFilePath]
                                                    encoding:NSUTF8StringEncoding
                                                       error:nil];
    resolve(contents ?: @"");
  });
}

- (void)saveCardDataset:(NSString *)json
                resolve:(RCTPromiseResolveBlock)resolve
                 reject:(RCTPromiseRejectBlock)reject
{
  dispatch_async(self.storageQueue, ^{
    NSError *error = nil;
    BOOL written = [json writeToFile:[self cardDatasetFilePath]
                          atomically:YES
                            encoding:NSUTF8StringEncoding
                               error:&error];
    if (!written) {
      reject(@"HOST_STORAGE_CARD_DATASET_FAILED", @"Could not persist the card dataset.", error);
      return;
    }
    resolve(nil);
  });
}

@end
