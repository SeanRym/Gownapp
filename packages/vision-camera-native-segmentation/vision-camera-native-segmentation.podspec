require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "vision-camera-native-segmentation"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.license      = "MIT"
  s.authors      = "gownapp"
  s.homepage     = "https://github.com"
  s.platforms    = { :ios => "15.0" }
  s.source       = { :path => "." }
  s.source_files = "ios/**/*.{h,m,mm}"
  s.frameworks   = "Vision", "CoreImage", "UIKit"

  # This package uses VisionCamera frame-processor APIs and worklets;
  # depending on the root pod alone is not enough for iOS builds.
  s.dependency   "React"
  s.dependency   "React-Core"
  s.dependency   "VisionCamera/FrameProcessors"
  s.dependency   "react-native-worklets-core"
end
