#import <React/RCTBridgeModule.h>
#import <Vision/Vision.h>
#import <UIKit/UIKit.h>

@interface MoveNetNativeModule : NSObject <RCTBridgeModule>
@end

@implementation MoveNetNativeModule

RCT_EXPORT_MODULE(MoveNetNativeModule)

RCT_EXPORT_METHOD(initializeModel:(NSString *)modelPath
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  resolve(@YES);
}

static CGImagePropertyOrientation VisionOrientation(UIImageOrientation orientation) {
  switch (orientation) {
    case UIImageOrientationUp: return kCGImagePropertyOrientationUp;
    case UIImageOrientationDown: return kCGImagePropertyOrientationDown;
    case UIImageOrientationLeft: return kCGImagePropertyOrientationLeft;
    case UIImageOrientationRight: return kCGImagePropertyOrientationRight;
    case UIImageOrientationUpMirrored: return kCGImagePropertyOrientationUpMirrored;
    case UIImageOrientationDownMirrored: return kCGImagePropertyOrientationDownMirrored;
    case UIImageOrientationLeftMirrored: return kCGImagePropertyOrientationLeftMirrored;
    case UIImageOrientationRightMirrored: return kCGImagePropertyOrientationRightMirrored;
  }
  return kCGImagePropertyOrientationUp;
}

static NSDictionary *PointDictionary(VNRecognizedPointsObservation *observation,
                                      VNHumanBodyPoseObservationJointName jointName) {
  NSError *error = nil;
  VNRecognizedPoint *point = [observation recognizedPointForJointName:jointName error:&error];
  if (error != nil || point == nil || point.confidence <= 0.05) return nil;
  return @{
    @"x": @(point.location.x),
    @"y": @(1.0 - point.location.y),
    @"score": @(point.confidence)
  };
}

RCT_EXPORT_METHOD(getLandmarksFromBitmap:(NSString *)imagePath
                  imageWidth:(nonnull NSNumber *)imageWidth
                  imageHeight:(nonnull NSNumber *)imageHeight
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSString *path = [imagePath hasPrefix:@"file://"] ? [imagePath substringFromIndex:7] : imagePath;
  UIImage *image = [UIImage imageWithContentsOfFile:path];
  if (image == nil || image.CGImage == nil) {
    reject(@"IMAGE_NOT_FOUND", @"Unable to load camera snapshot.", nil);
    return;
  }

  VNDetectHumanBodyPoseRequest *request = [[VNDetectHumanBodyPoseRequest alloc] init];
  VNImageRequestHandler *handler = [[VNImageRequestHandler alloc]
      initWithCGImage:image.CGImage
      orientation:VisionOrientation(image.imageOrientation)
      options:@{}];
  NSError *error = nil;
  [handler performRequests:@[request] error:&error];
  if (error != nil) {
    reject(@"LANDMARKS_ERROR", error.localizedDescription, error);
    return;
  }

  VNRecognizedPointsObservation *observation = request.results.firstObject;
  if (observation == nil) {
    reject(@"LANDMARKS_ERROR", @"Vision found no body pose.", nil);
    return;
  }

  NSDictionary *jointMap = @{
    @"nose": [NSValue valueWithPointer:VNHumanBodyPoseObservationJointNameNose],
    @"leftEye": [NSValue valueWithPointer:VNHumanBodyPoseObservationJointNameLeftEye],
    @"rightEye": [NSValue valueWithPointer:VNHumanBodyPoseObservationJointNameRightEye],
    @"leftEar": [NSValue valueWithPointer:VNHumanBodyPoseObservationJointNameLeftEar],
    @"rightEar": [NSValue valueWithPointer:VNHumanBodyPoseObservationJointNameRightEar],
    @"leftShoulder": [NSValue valueWithPointer:VNHumanBodyPoseObservationJointNameLeftShoulder],
    @"rightShoulder": [NSValue valueWithPointer:VNHumanBodyPoseObservationJointNameRightShoulder],
    @"leftElbow": [NSValue valueWithPointer:VNHumanBodyPoseObservationJointNameLeftElbow],
    @"rightElbow": [NSValue valueWithPointer:VNHumanBodyPoseObservationJointNameRightElbow],
    @"leftWrist": [NSValue valueWithPointer:VNHumanBodyPoseObservationJointNameLeftWrist],
    @"rightWrist": [NSValue valueWithPointer:VNHumanBodyPoseObservationJointNameRightWrist],
    @"leftHip": [NSValue valueWithPointer:VNHumanBodyPoseObservationJointNameLeftHip],
    @"rightHip": [NSValue valueWithPointer:VNHumanBodyPoseObservationJointNameRightHip],
    @"leftKnee": [NSValue valueWithPointer:VNHumanBodyPoseObservationJointNameLeftKnee],
    @"rightKnee": [NSValue valueWithPointer:VNHumanBodyPoseObservationJointNameRightKnee],
    @"leftAnkle": [NSValue valueWithPointer:VNHumanBodyPoseObservationJointNameLeftAnkle],
    @"rightAnkle": [NSValue valueWithPointer:VNHumanBodyPoseObservationJointNameRightAnkle]
  };

  NSMutableDictionary *landmarks = [NSMutableDictionary dictionary];
  [jointMap enumerateKeysAndObjectsUsingBlock:^(NSString *name, NSValue *jointValue, BOOL *stop) {
    VNHumanBodyPoseObservationJointName jointName = (VNHumanBodyPoseObservationJointName)[jointValue pointerValue];
    NSDictionary *point = PointDictionary(observation, jointName);
    if (point != nil) landmarks[name] = point;
  }];

  if (landmarks[@"leftShoulder"] == nil || landmarks[@"rightShoulder"] == nil) {
    reject(@"LANDMARKS_ERROR", @"Vision found insufficient body landmarks.", nil);
    return;
  }

  resolve(@{
    @"success": @YES,
    @"landmarks": landmarks,
    @"keypoints": landmarks,
    @"imageWidth": imageWidth,
    @"imageHeight": imageHeight,
    @"model": @"apple-vision-body-pose"
  });
}

@end
