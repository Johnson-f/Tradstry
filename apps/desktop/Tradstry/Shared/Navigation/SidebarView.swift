import AppKit

final class SidebarView: NSView {
    var onSelect: ((Int) -> Void)?
    private var buttons: [IconButton] = []

    init(items: [(title: String, symbol: String)]) {
        super.init(frame: .zero)

        let mark = NSImageView()
        mark.image = NSImage(systemSymbolName: "chart.xyaxis.line", accessibilityDescription: "Tradstry")
        mark.contentTintColor = .labelColor
        mark.symbolConfiguration = .init(pointSize: 21, weight: .semibold)
        mark.translatesAutoresizingMaskIntoConstraints = false
        addSubview(mark)

        let navigation = NSStackView()
        navigation.orientation = .vertical
        navigation.spacing = 10
        navigation.translatesAutoresizingMaskIntoConstraints = false
        addSubview(navigation)

        for (index, item) in items.enumerated() {
            let button = IconButton(
                symbol: item.symbol, label: item.title,
                target: self, action: #selector(selectItem(_:))
            )
            button.tag = index
            buttons.append(button)
            navigation.addArrangedSubview(button)
        }

        let profile = IconButton(
            symbol: "person.crop.circle", label: "Workspace information",
            target: self, action: #selector(showWorkspaceInfo(_:))
        )
        profile.contentTintColor = .systemPink
        addSubview(profile)

        NSLayoutConstraint.activate([
            widthAnchor.constraint(equalToConstant: 64),
            mark.centerXAnchor.constraint(equalTo: centerXAnchor),
            mark.topAnchor.constraint(equalTo: topAnchor, constant: 12),
            mark.widthAnchor.constraint(equalToConstant: 26),
            mark.heightAnchor.constraint(equalToConstant: 26),
            navigation.centerXAnchor.constraint(equalTo: centerXAnchor),
            navigation.centerYAnchor.constraint(equalTo: centerYAnchor),
            navigation.topAnchor.constraint(greaterThanOrEqualTo: mark.bottomAnchor, constant: 28),
            profile.centerXAnchor.constraint(equalTo: centerXAnchor),
            profile.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -14),
        ])
        select(index: 0)
    }

    required init?(coder: NSCoder) {
        fatalError("SidebarView must be created programmatically")
    }

    func select(index: Int) {
        for button in buttons {
            button.setSelected(button.tag == index)
        }
    }

    @objc private func selectItem(_ sender: NSButton) {
        select(index: sender.tag)
        onSelect?(sender.tag)
    }

    @objc private func showWorkspaceInfo(_ sender: NSButton) {
        let menu = NSMenu()
        menu.addItem(withTitle: "Tradstry", action: nil, keyEquivalent: "")
        menu.addItem(withTitle: "Local workspace preview", action: nil, keyEquivalent: "")
        menu.popUp(positioning: nil, at: NSPoint(x: bounds.maxX, y: sender.frame.midY), in: self)
    }
}
