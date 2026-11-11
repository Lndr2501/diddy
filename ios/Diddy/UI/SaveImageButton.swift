import Photos
import SwiftUI

struct SaveImageButton: View {
    let image: UIImage
    @State private var saving = false
    @State private var message: String?
    var body: some View {
        Button {
            saving = true
            Task { @MainActor in
                defer { saving = false }
                let status = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
                guard status == .authorized || status == .limited else {
                    message = "Allow Diddy to add photos in Settings to save this image."
                    return
                }
                do {
                    try await PHPhotoLibrary.shared().performChanges {
                        PHAssetChangeRequest.creationRequestForAsset(from: image)
                    }
                    message = "Saved to Photos."
                } catch { message = error.localizedDescription }
            }
        } label: {
            Image(systemName: "square.and.arrow.down").font(.headline).frame(width: 44, height: 44)
        }
        .disabled(saving)
        .accessibilityLabel("Save to Photos")
        .alert("Save image", isPresented: Binding(get: { message != nil }, set: { if !$0 { message = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(message ?? "") }
    }
}
