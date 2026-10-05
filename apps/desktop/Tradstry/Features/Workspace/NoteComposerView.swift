import AppKit

final class NoteComposerView: NSVisualEffectView, NSTextFieldDelegate {
    var onSubmit: ((String, String) -> Void)?
    private let input = NSTextField()
    private let categoryLabel = NSTextField(labelWithString: "Reflection")
    private var submitButton: IconButton!

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        material = .popover
        blendingMode = .withinWindow
        state = .active
        wantsLayer = true
        layer?.cornerRadius = 16
        layer?.borderWidth = 1
        layer?.borderColor = NSColor.black.withAlphaComponent(0.10).cgColor
        layer?.masksToBounds = true

        input.placeholderString = "A thought, a lesson, a trade idea…"
        input.font = .systemFont(ofSize: 14)
        input.isBordered = false
        input.drawsBackground = false
        input.focusRingType = .none
        input.delegate = self
        input.target = self
        input.action = #selector(submit)
        input.setAccessibilityLabel("New session note")
        input.translatesAutoresizingMaskIntoConstraints = false
        addSubview(input)

        let category = IconButton(symbol: "plus", label: "Choose note type", target: self, action: #selector(chooseCategory(_:)))
        addSubview(category)
        submitButton = IconButton(symbol: "arrow.turn.down.left", label: "Add session note", target: self, action: #selector(submit))
        submitButton.isEnabled = false
        addSubview(submitButton)

        categoryLabel.font = .systemFont(ofSize: 11)
        categoryLabel.textColor = .secondaryLabelColor
        categoryLabel.translatesAutoresizingMaskIntoConstraints = false
        addSubview(categoryLabel)
        let scope = NSTextField(labelWithString: "This session only")
        scope.font = .systemFont(ofSize: 10)
        scope.textColor = .tertiaryLabelColor
        scope.translatesAutoresizingMaskIntoConstraints = false
        addSubview(scope)

        NSLayoutConstraint.activate([
            input.topAnchor.constraint(equalTo: topAnchor, constant: 17),
            input.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 17),
            input.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -17),
            category.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 7),
            category.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -7),
            categoryLabel.leadingAnchor.constraint(equalTo: category.trailingAnchor, constant: 2),
            categoryLabel.centerYAnchor.constraint(equalTo: category.centerYAnchor),
            submitButton.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -7),
            submitButton.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -7),
            scope.trailingAnchor.constraint(equalTo: submitButton.leadingAnchor, constant: -8),
            scope.centerYAnchor.constraint(equalTo: submitButton.centerYAnchor),
            heightAnchor.constraint(equalToConstant: 96),
        ])
    }

    required init?(coder: NSCoder) {
        fatalError("NoteComposerView must be created programmatically")
    }

    func controlTextDidChange(_ obj: Notification) {
        submitButton.isEnabled = !input.stringValue.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    @objc private func submit() {
        let text = input.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        onSubmit?(categoryLabel.stringValue, text)
        input.stringValue = ""
        submitButton.isEnabled = false
    }

    @objc private func chooseCategory(_ sender: NSButton) {
        let menu = NSMenu()
        for title in ["Reflection", "Trade idea", "Question"] {
            let item = menu.addItem(withTitle: title, action: #selector(setCategory(_:)), keyEquivalent: "")
            item.target = self
            item.state = title == categoryLabel.stringValue ? .on : .off
        }
        menu.popUp(positioning: nil, at: NSPoint(x: sender.frame.minX, y: sender.frame.maxY), in: self)
    }

    @objc private func setCategory(_ sender: NSMenuItem) {
        categoryLabel.stringValue = sender.title
        window?.makeFirstResponder(input)
    }
}
