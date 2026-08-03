import ExpoModulesCore
import ImageIO
import UIKit
import Vision

internal final class OcrImageUnreadableException: Exception {
  override var code: String { "OCR_IMAGE_UNREADABLE" }
  override var reason: String { "The selected image could not be read." }
}

internal final class OcrRecognitionFailedException: Exception {
  override var code: String { "OCR_RECOGNITION_FAILED" }
  override var reason: String { "Text recognition failed." }
}

public final class ConvoOcrModule: Module {
  private func visionOrientation(_ value: UIImage.Orientation) -> CGImagePropertyOrientation {
    switch value {
    case .up: return .up
    case .down: return .down
    case .left: return .left
    case .right: return .right
    case .upMirrored: return .upMirrored
    case .downMirrored: return .downMirrored
    case .leftMirrored: return .leftMirrored
    case .rightMirrored: return .rightMirrored
    @unknown default: return .up
    }
  }

  public func definition() -> ModuleDefinition {
    Name("ConvoOcr")

    AsyncFunction("recognizeText") { (uri: String) async throws -> String in
      guard let url = URL(string: uri), url.isFileURL,
            let image = UIImage(contentsOfFile: url.path), let cgImage = image.cgImage else {
        throw OcrImageUnreadableException()
      }

      let request = VNRecognizeTextRequest()
      request.recognitionLevel = .accurate
      request.usesLanguageCorrection = true
      do {
        try VNImageRequestHandler(
          cgImage: cgImage,
          orientation: visionOrientation(image.imageOrientation)
        ).perform([request])
      } catch {
        throw OcrRecognitionFailedException()
      }

      return (request.results ?? [])
        .sorted { $0.boundingBox.maxY > $1.boundingBox.maxY }
        .compactMap { $0.topCandidates(1).first?.string }
        .joined(separator: "\n")
    }
  }
}
