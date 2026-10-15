#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>
#import <ReactCodegen/MiniAppPlatformSpec/MiniAppPlatformSpec.h>

// OnDeviceLlm TurboModule (pilot skeleton). Method selectors come from the
// generated `NativeOnDeviceLlmSpec` protocol (itself generated from
// `src/native/specs/NativeOnDeviceLlm.ts`). Do not redeclare selectors here;
// change the spec instead.
//
// Pilot status: bodies report `unavailable`. The device milestone wires
// FoundationModels (SystemLanguageModel availability, LanguageModelSession
// with @Generable bill schema, prewarm, streaming) behind the host image
// picker here. No iOS 26 API is referenced so this file compiles on the
// current toolchain; availability is probed at runtime only.
// See docs/features/ai-extract-bill.md.
@interface OnDeviceLlmModule : NSObject <NativeOnDeviceLlmSpec>
@end

@implementation OnDeviceLlmModule

RCT_EXPORT_MODULE(OnDeviceLlm)

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeOnDeviceLlmSpecJSI>(params);
}

- (NSDictionary *)resultWithStatus:(NSString *)status message:(NSString *)message
{
  return @{ @"status" : status, @"message" : message };
}

- (void)getAvailability:(RCTPromiseResolveBlock)resolve
                 reject:(RCTPromiseRejectBlock)reject
{
  // Runtime probe placeholder: FoundationModels ships with the OS that supports
  // Apple Intelligence. The device milestone replaces this with a real
  // availability mapping (eligible / disabled / downloading / available).
  // The class lookup intentionally references no link-time symbol, so N-2
  // runtimes simply report unavailable.
  (void)NSClassFromString(@"FMSystemLanguageModel");
  resolve([self resultWithStatus:@"unavailable"
                         message:@"On-device bill extraction is not implemented in this build."]);
}

- (void)extractBill:(NSString *)requestJson
            resolve:(RCTPromiseResolveBlock)resolve
             reject:(RCTPromiseRejectBlock)reject
{
  // Pilot: no picker, no inference yet. Resolve (never reject — the JS facade
  // maps this closed status) so callers always terminate.
  (void)requestJson;
  resolve([self resultWithStatus:@"unavailable"
                         message:@"On-device bill extraction is not implemented in this build."]);
}

- (void)cancelBill:(NSString *)sessionId
           resolve:(RCTPromiseResolveBlock)resolve
            reject:(RCTPromiseRejectBlock)reject
{
  // Idempotent no-op until sessions exist.
  (void)sessionId;
  resolve(nil);
}

@end
