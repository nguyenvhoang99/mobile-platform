#import <AVFoundation/AVFoundation.h>
#import <CoreLocation/CoreLocation.h>
#import <LocalAuthentication/LocalAuthentication.h>
#import <React/RCTBridgeModule.h>
#import <ReactCodegen/MiniAppPlatformSpec/MiniAppPlatformSpec.h>
#import <Speech/Speech.h>

// DeviceAccess TurboModule. Method selectors come from the generated
// `NativeDeviceAccessSpec` protocol (itself generated from
// `src/native/specs/NativeDeviceAccess.ts`). Do not redeclare selectors here;
// change the spec instead. Bodies are unchanged from the legacy module.
@interface DeviceAccessModule : NSObject <NativeDeviceAccessSpec, CLLocationManagerDelegate>
@property(nonatomic, strong) CLLocationManager *locationManager;
@property(nonatomic, copy) RCTPromiseResolveBlock locationResolve;
@property(nonatomic, strong) AVAudioEngine *audioEngine;
@property(nonatomic, strong) SFSpeechRecognizer *speechRecognizer;
@property(nonatomic, strong) SFSpeechAudioBufferRecognitionRequest *speechRequest;
@property(nonatomic, strong) SFSpeechRecognitionTask *speechTask;
@property(nonatomic, copy) RCTPromiseResolveBlock voiceResolve;
@end

@implementation DeviceAccessModule

RCT_EXPORT_MODULE(DeviceAccess)

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeDeviceAccessSpecJSI>(params);
}

- (NSDictionary *)resultWithStatus:(NSString *)status message:(NSString *)message
{
  return @{ @"status" : status, @"message" : message };
}

- (void)getNetworkStatus:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject
{
  // iOS does not grant Wi-Fi or cellular access through a runtime prompt. The
  // host still owns egress policy; this is only a connectivity affordance.
  NSMutableDictionary *result = [[self resultWithStatus:@"available" message:@"Network access is managed by the host."] mutableCopy];
  result[@"networkType"] = @"unknown";
  resolve(result);
}

- (void)authenticate:(NSString *)reason
             resolve:(RCTPromiseResolveBlock)resolve
              reject:(RCTPromiseRejectBlock)reject
{
  LAContext *context = [LAContext new];
  NSError *error = nil;
  if (![context canEvaluatePolicy:LAPolicyDeviceOwnerAuthenticationWithBiometrics error:&error]) {
    resolve([self resultWithStatus:@"unavailable" message:@"Face ID or Touch ID is not available on this device."]);
    return;
  }

  [context evaluatePolicy:LAPolicyDeviceOwnerAuthenticationWithBiometrics
          localizedReason:reason
                    reply:^(BOOL success, NSError *evaluationError) {
    dispatch_async(dispatch_get_main_queue(), ^{
      if (success) {
        // This confirmation remains in the host. A mini-app integration must
        // use a server-bound assertion over a host-minted challenge, never a
        // boolean authentication result.
        resolve([self resultWithStatus:@"authenticated" message:@"Identity confirmed for the host."]);
      } else if (evaluationError.code == LAErrorUserCancel || evaluationError.code == LAErrorUserFallback || evaluationError.code == LAErrorSystemCancel) {
        resolve([self resultWithStatus:@"cancelled" message:@"Sign-in was cancelled."]);
      } else {
        resolve([self resultWithStatus:@"denied" message:@"Identity could not be confirmed."]);
      }
    });
  }];
}

- (void)requestWeatherLocation:(RCTPromiseResolveBlock)resolve
                        reject:(RCTPromiseRejectBlock)reject
{
  // Guard against a second concurrent request — resolve the previous one rather than leaking.
  if (self.locationResolve != nil) {
    RCTPromiseResolveBlock previous = self.locationResolve;
    self.locationResolve = nil;
    previous([self resultWithStatus:@"error" message:@"Location request was superseded."]);
  }
  self.locationResolve = resolve;
  self.locationManager = [CLLocationManager new];
  self.locationManager.delegate = self;

  CLAuthorizationStatus status = self.locationManager.authorizationStatus;
  if (status == kCLAuthorizationStatusAuthorizedAlways || status == kCLAuthorizationStatusAuthorizedWhenInUse) {
    [self completeLocationWithStatus:@"granted" message:@"Approximate location is available for weather."];
    return;
  }
  if (status == kCLAuthorizationStatusNotDetermined) {
    [self.locationManager requestWhenInUseAuthorization];
    // Hard deadline: if the user never responds (dismissed, Info.plist missing, or system
    // never calls the delegate) the JS promise would hang forever and the app shows
    // "Đang xác định khu vực…" forever. Resolve after 4 s so the JS layer can fall back
    // to vn-fallback / manual picker. This also applies to Android via JS timeout.
    __weak DeviceAccessModule *weakSelf = self;
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(4 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
      if (weakSelf.locationResolve != nil) {
        [weakSelf completeLocationWithStatus:@"denied" message:@"Location request timed out."];
      }
    });
    return;
  }
  [self completeLocationWithStatus:@"denied" message:@"Location was not granted."];
}

- (void)locationManagerDidChangeAuthorization:(CLLocationManager *)manager
{
  [self resolveLocationAuthorization];
}

// iOS 13 and earlier calls this instead of locationManagerDidChangeAuthorization:
- (void)locationManager:(CLLocationManager *)manager didChangeAuthorizationStatus:(CLAuthorizationStatus)status
{
  [self resolveLocationAuthorization];
}

- (void)locationManager:(CLLocationManager *)manager didFailWithError:(NSError *)error
{
  [self completeLocationWithStatus:@"denied" message:@"Location could not be determined."];
}

- (void)resolveLocationAuthorization
{
  // locationManager may be nil if we already timed out and cleaned up.
  if (self.locationManager == nil) {
    return;
  }
  CLAuthorizationStatus status = self.locationManager.authorizationStatus;
  if (status == kCLAuthorizationStatusNotDetermined) {
    return;
  }

  if (status == kCLAuthorizationStatusAuthorizedAlways || status == kCLAuthorizationStatusAuthorizedWhenInUse) {
    [self completeLocationWithStatus:@"granted" message:@"Approximate location is available for weather."];
  } else {
    [self completeLocationWithStatus:@"denied" message:@"Location was not granted."];
  }
}

- (void)completeLocationWithStatus:(NSString *)status message:(NSString *)message
{
  if (self.locationResolve != nil) {
    self.locationResolve([self resultWithStatus:status message:message]);
  }
  self.locationResolve = nil;
  if (self.locationManager != nil) {
    self.locationManager.delegate = nil;
    self.locationManager = nil;
  }
}

- (void)startVoiceCommand:(RCTPromiseResolveBlock)resolve
                   reject:(RCTPromiseRejectBlock)reject
{
  if (self.voiceResolve != nil) {
    resolve([self resultWithStatus:@"error" message:@"A voice command is already in progress."]);
    return;
  }

  [SFSpeechRecognizer requestAuthorization:^(SFSpeechRecognizerAuthorizationStatus status) {
    if (status != SFSpeechRecognizerAuthorizationStatusAuthorized) {
      dispatch_async(dispatch_get_main_queue(), ^{
        resolve([self resultWithStatus:@"denied" message:@"Speech recognition was not granted."]);
      });
      return;
    }

    [[AVAudioSession sharedInstance] requestRecordPermission:^(BOOL granted) {
      dispatch_async(dispatch_get_main_queue(), ^{
        if (!granted) {
          resolve([self resultWithStatus:@"denied" message:@"Microphone access was not granted."]);
          return;
        }
        [self beginVoiceRecognitionWithResolve:resolve];
      });
    }];
  }];
}

- (void)beginVoiceRecognitionWithResolve:(RCTPromiseResolveBlock)resolve
{
  self.speechRecognizer = [[SFSpeechRecognizer alloc] initWithLocale:[NSLocale currentLocale]];
  if (!self.speechRecognizer.available) {
    resolve([self resultWithStatus:@"unavailable" message:@"Speech recognition is unavailable right now."]);
    return;
  }

  NSError *error = nil;
  AVAudioSession *session = [AVAudioSession sharedInstance];
  [session setCategory:AVAudioSessionCategoryRecord mode:AVAudioSessionModeMeasurement options:0 error:&error];
  [session setActive:YES withOptions:AVAudioSessionSetActiveOptionNotifyOthersOnDeactivation error:&error];
  if (error != nil) {
    resolve([self resultWithStatus:@"error" message:@"Voice command could not start."]);
    return;
  }

  self.voiceResolve = resolve;
  self.audioEngine = [AVAudioEngine new];
  self.speechRequest = [SFSpeechAudioBufferRecognitionRequest new];
  self.speechRequest.shouldReportPartialResults = NO;
  AVAudioInputNode *input = self.audioEngine.inputNode;
  AVAudioFormat *format = [input outputFormatForBus:0];
  __weak DeviceAccessModule *weakSelf = self;
  [input installTapOnBus:0 bufferSize:1024 format:format block:^(AVAudioPCMBuffer *buffer, AVAudioTime *when) {
    [weakSelf.speechRequest appendAudioPCMBuffer:buffer];
  }];

  self.speechTask = [self.speechRecognizer recognitionTaskWithRequest:self.speechRequest resultHandler:^(SFSpeechRecognitionResult *result, NSError *recognitionError) {
    if (result != nil && result.isFinal) {
      [weakSelf completeVoiceWithStatus:@"recognized" message:@"Voice command was recognized." transcript:result.bestTranscription.formattedString];
    } else if (recognitionError != nil) {
      [weakSelf completeVoiceWithStatus:@"error" message:@"Voice command could not be recognized." transcript:nil];
    }
  }];

  [self.audioEngine prepare];
  [self.audioEngine startAndReturnError:&error];
  if (error != nil) {
    [self completeVoiceWithStatus:@"error" message:@"Voice command could not start." transcript:nil];
    return;
  }

  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(12 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
    if (weakSelf.voiceResolve != nil) {
      [weakSelf completeVoiceWithStatus:@"error" message:@"No voice command was recognized." transcript:nil];
    }
  });
}

- (void)completeVoiceWithStatus:(NSString *)status message:(NSString *)message transcript:(NSString *)transcript
{
  if (self.voiceResolve == nil) {
    return;
  }

  RCTPromiseResolveBlock resolve = self.voiceResolve;
  self.voiceResolve = nil;
  AVAudioInputNode *input = self.audioEngine.inputNode;
  [input removeTapOnBus:0];
  [self.audioEngine stop];
  [self.speechRequest endAudio];
  [self.speechTask cancel];
  self.audioEngine = nil;
  self.speechRequest = nil;
  self.speechTask = nil;
  self.speechRecognizer = nil;

  NSMutableDictionary *result = [[self resultWithStatus:status message:message] mutableCopy];
  if (transcript.length > 0) {
    result[@"transcript"] = transcript;
  }
  resolve(result);
}

@end
