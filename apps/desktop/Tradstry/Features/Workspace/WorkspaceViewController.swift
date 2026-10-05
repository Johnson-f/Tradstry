import AppKit

final class WorkspaceViewController: NSViewController {
    private let heading = NSTextField(labelWithString: "Journal")
    private let rows = NSStackView()
    private let scrollView = NSScrollView()
    private let document = SurfaceView(color: .clear)
    private var section = 0
    private var notes: [WorkspaceCard] = []
    private var compact: Bool?
    var onNoteAdded: (() -> Void)?

    override func loadView() {
        view = NSView()
        heading.font = .systemFont(ofSize: 12, weight: .medium)
        heading.textColor = .secondaryLabelColor
        heading.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(heading)

        let preview = NSTextField(labelWithString: "SAMPLE WORKSPACE")
        preview.font = .monospacedSystemFont(ofSize: 9, weight: .regular)
        preview.textColor = .tertiaryLabelColor
        preview.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(preview)

        scrollView.drawsBackground = false
        scrollView.hasVerticalScroller = true
        scrollView.scrollerStyle = .overlay
        scrollView.autohidesScrollers = true
        scrollView.translatesAutoresizingMaskIntoConstraints = false
        document.translatesAutoresizingMaskIntoConstraints = false
        scrollView.documentView = document
        view.addSubview(scrollView)

        rows.orientation = .vertical
        rows.alignment = .leading
        rows.spacing = 12
        rows.translatesAutoresizingMaskIntoConstraints = false
        document.addSubview(rows)

        let composer = NoteComposerView(frame: .zero)
        composer.translatesAutoresizingMaskIntoConstraints = false
        composer.onSubmit = { [weak self] category, text in
            guard let self else { return }
            notes.insert(.init(eyebrow: "SESSION NOTE · \(category.uppercased())", title: category,
                               detail: text, style: .note), at: 0)
            showSection(2)
            onNoteAdded?()
            scrollView.contentView.scroll(to: .zero)
            scrollView.reflectScrolledClipView(scrollView.contentView)
        }
        view.addSubview(composer)

        let composerWidth = composer.widthAnchor.constraint(equalToConstant: 460)
        composerWidth.priority = .defaultHigh
        NSLayoutConstraint.activate([
            heading.topAnchor.constraint(equalTo: view.topAnchor, constant: 17),
            heading.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 8),
            preview.centerYAnchor.constraint(equalTo: heading.centerYAnchor),
            preview.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -22),
            scrollView.topAnchor.constraint(equalTo: view.topAnchor, constant: 48),
            scrollView.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 8),
            scrollView.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -12),
            scrollView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            document.topAnchor.constraint(equalTo: scrollView.contentView.topAnchor),
            document.leadingAnchor.constraint(equalTo: scrollView.contentView.leadingAnchor),
            document.widthAnchor.constraint(equalTo: scrollView.contentView.widthAnchor),
            rows.topAnchor.constraint(equalTo: document.topAnchor),
            rows.leadingAnchor.constraint(equalTo: document.leadingAnchor),
            rows.trailingAnchor.constraint(equalTo: document.trailingAnchor, constant: -8),
            rows.bottomAnchor.constraint(equalTo: document.bottomAnchor, constant: -136),
            composer.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            composer.bottomAnchor.constraint(equalTo: view.bottomAnchor, constant: -22),
            composer.widthAnchor.constraint(lessThanOrEqualTo: view.widthAnchor, constant: -48),
            composerWidth,
        ])
    }

    override func viewDidLayout() {
        super.viewDidLayout()
        let isCompact = view.bounds.width < 700
        if compact != isCompact {
            compact = isCompact
            rebuildCards()
        }
    }

    func showSection(_ index: Int) {
        loadViewIfNeeded()
        section = index
        heading.stringValue = ["Journal", "Overview", "Notebook", "Playbooks"][index]
        rebuildCards()
    }

    private func rebuildCards() {
        for row in rows.arrangedSubviews {
            rows.removeArrangedSubview(row)
            row.removeFromSuperview()
        }
        let cards: [WorkspaceCard]
        switch section {
        case 1: cards = [WorkspaceCard.samples[1], WorkspaceCard.samples[0]]
        case 2: cards = notes + [WorkspaceCard.samples[3]]
        case 3: cards = [WorkspaceCard.samples[2]]
        default: cards = WorkspaceCard.samples
        }
        let columns = compact == true ? 1 : 2
        for start in stride(from: 0, to: cards.count, by: columns) {
            let row = NSStackView()
            row.orientation = .horizontal
            row.spacing = 12
            row.distribution = .fillEqually
            for index in start..<min(start + columns, cards.count) {
                row.addArrangedSubview(WorkspaceCardView(card: cards[index]))
            }
            if columns == 2 && row.arrangedSubviews.count == 1 {
                row.addArrangedSubview(NSView())
            }
            rows.addArrangedSubview(row)
            NSLayoutConstraint.activate([
                row.widthAnchor.constraint(equalTo: rows.widthAnchor),
                row.heightAnchor.constraint(equalToConstant: 350),
            ])
        }
    }
}
