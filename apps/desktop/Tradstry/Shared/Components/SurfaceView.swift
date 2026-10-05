import AppKit

final class SurfaceView: NSView {
    var fillColor: NSColor {
        didSet { needsDisplay = true }
    }

    init(color: NSColor, cornerRadius: CGFloat = 0) {
        fillColor = color
        super.init(frame: .zero)
        wantsLayer = true
        layer?.cornerRadius = cornerRadius
        layer?.masksToBounds = true
    }

    required init?(coder: NSCoder) {
        fatalError("SurfaceView must be created programmatically")
    }

    override var isFlipped: Bool { true }
    override var wantsUpdateLayer: Bool { true }

    override func updateLayer() {
        layer?.backgroundColor = fillColor.cgColor
    }
}
