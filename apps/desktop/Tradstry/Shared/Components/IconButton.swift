import AppKit

final class IconButton: NSButton {
    init(symbol: String, label: String, target: AnyObject?, action: Selector?) {
        super.init(frame: .zero)
        image = NSImage(systemSymbolName: symbol, accessibilityDescription: label)
        imagePosition = .imageOnly
        symbolConfiguration = .init(pointSize: 17, weight: .regular)
        isBordered = false
        bezelStyle = .regularSquare
        contentTintColor = .secondaryLabelColor
        toolTip = label
        setAccessibilityLabel(label)
        self.target = target
        self.action = action
        translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            widthAnchor.constraint(equalToConstant: 36),
            heightAnchor.constraint(equalToConstant: 36),
        ])
    }

    required init?(coder: NSCoder) {
        fatalError("IconButton must be created programmatically")
    }

    func setSelected(_ selected: Bool) {
        state = selected ? .on : .off
        contentTintColor = selected ? .labelColor : .secondaryLabelColor
        wantsLayer = true
        layer?.cornerRadius = 10
        layer?.backgroundColor = selected
            ? NSColor.black.withAlphaComponent(0.06).cgColor : NSColor.clear.cgColor
        setAccessibilityValue(selected ? "Selected" : "")
    }
}
