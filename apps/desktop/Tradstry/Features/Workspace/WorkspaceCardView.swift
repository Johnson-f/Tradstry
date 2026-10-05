import AppKit

struct WorkspaceCard {
    enum Style { case journal, chart, playbook, notebook, note }

    let eyebrow: String
    let title: String
    let detail: String
    let style: Style

    static let samples: [WorkspaceCard] = [
        .init(eyebrow: "THE TRADING JOURNAL", title: "Every trade.\nA clearer picture.",
              detail: "A place for your trades, your decisions,\nand everything you learn along the way.", style: .journal),
        .init(eyebrow: "FIND YOUR RHYTHM", title: "See the bigger\npicture.",
              detail: "Make room for perspective.", style: .chart),
        .init(eyebrow: "YOUR PLAYBOOK", title: "Good trades start\nwith a plan.",
              detail: "Define your setup. Know your risk.\nGive every decision a reason.", style: .playbook),
        .init(eyebrow: "NOTES TO YOUR FUTURE SELF", title: "Keep what\nyou learn.",
              detail: "Small observations. Better decisions.", style: .notebook),
    ]
}

final class WorkspaceCardView: NSView {
    private let card: WorkspaceCard
    private let eyebrowLabel: NSTextField
    private let titleLabel: NSTextField
    private let detailLabel: NSTextField
    private let footerLabel = NSTextField(labelWithString: "TRADSTRY   /   SAMPLE")
    private let numberLabel = NSTextField(labelWithString: "01")
    private let chartLabel = NSTextField(labelWithString: "ILLUSTRATIVE CHART")
    private var textLayoutWidth: CGFloat?

    init(card: WorkspaceCard) {
        self.card = card
        eyebrowLabel = NSTextField(labelWithString: card.eyebrow)
        titleLabel = NSTextField(wrappingLabelWithString: card.title)
        detailLabel = NSTextField(wrappingLabelWithString: card.detail)
        super.init(frame: .zero)
        wantsLayer = true
        layer?.cornerRadius = 12
        layer?.masksToBounds = true
        let light = card.style == .journal || card.style == .playbook || card.style == .note
        let ink = light ? NSColor(calibratedWhite: 0.1, alpha: 1) : .white
        eyebrowLabel.font = .monospacedSystemFont(ofSize: 9, weight: .medium)
        eyebrowLabel.textColor = ink.withAlphaComponent(0.55)
        titleLabel.textColor = ink
        detailLabel.font = .systemFont(ofSize: 13)
        detailLabel.textColor = ink.withAlphaComponent(0.65)
        footerLabel.font = .monospacedSystemFont(ofSize: 8, weight: .medium)
        footerLabel.textColor = ink.withAlphaComponent(0.45)
        footerLabel.isHidden = card.style == .chart || card.style == .note
        numberLabel.font = .systemFont(ofSize: 52, weight: .semibold)
        numberLabel.textColor = ink
        numberLabel.isHidden = card.style != .playbook
        chartLabel.font = .monospacedSystemFont(ofSize: 8, weight: .regular)
        chartLabel.textColor = .white.withAlphaComponent(0.35)
        chartLabel.isHidden = card.style != .chart

        // Keep text in native controls; drawing temporary attributed strings during
        // redraws triggers a CoreText exception on the current macOS runtime.
        for label in [eyebrowLabel, titleLabel, detailLabel, footerLabel, numberLabel, chartLabel] {
            addSubview(label)
        }
    }

    required init?(coder: NSCoder) {
        fatalError("WorkspaceCardView must be created programmatically")
    }

    override var isFlipped: Bool { true }

    override func layout() {
        super.layout()
        let inset: CGFloat = bounds.width < 340 ? 24 : 34
        let width = bounds.width - inset * 2
        eyebrowLabel.frame = NSRect(x: inset, y: 30, width: width, height: 16)
        titleLabel.frame = NSRect(x: inset, y: 70, width: width, height: 104)
        if textLayoutWidth != bounds.width {
            textLayoutWidth = bounds.width
            let fontSize: CGFloat = bounds.width < 340 ? 30 : 38
            titleLabel.font = card.style == .chart || card.style == .note
                ? NSFont.systemFont(ofSize: fontSize - 3, weight: .medium)
                : NSFont(name: "Georgia", size: fontSize) ?? .systemFont(ofSize: fontSize)
        }
        detailLabel.frame = NSRect(
            x: inset, y: card.style == .chart ? 302 : 188,
            width: card.style == .playbook ? max(width - 78, 140) : width,
            height: card.style == .note ? 136 : 74
        )
        footerLabel.frame = NSRect(x: inset, y: bounds.height - 35, width: width, height: 15)
        numberLabel.frame = NSRect(x: bounds.width - 103, y: 221, width: 90, height: 64)
        chartLabel.frame = NSRect(x: inset, y: 281, width: width, height: 12)
    }

    override func draw(_ dirtyRect: NSRect) {
        let background: NSColor
        switch card.style {
        case .journal, .note: background = NSColor(red: 0.95, green: 0.93, blue: 0.88, alpha: 1)
        case .chart: background = NSColor(red: 0.035, green: 0.06, blue: 0.075, alpha: 1)
        case .playbook: background = NSColor(red: 0.92, green: 0.89, blue: 0.85, alpha: 1)
        case .notebook: background = NSColor(red: 0.035, green: 0.25, blue: 0.87, alpha: 1)
        }
        background.setFill()
        bounds.fill()

        if card.style == .chart || card.style == .notebook {
            let grid = NSBezierPath()
            for x in stride(from: CGFloat(0), through: bounds.width, by: 32) {
                grid.move(to: NSPoint(x: x, y: 0))
                grid.line(to: NSPoint(x: x, y: bounds.height))
            }
            for y in stride(from: CGFloat(0), through: bounds.height, by: 32) {
                grid.move(to: NSPoint(x: 0, y: y))
                grid.line(to: NSPoint(x: bounds.width, y: y))
            }
            NSColor.white.withAlphaComponent(0.045).setStroke()
            grid.lineWidth = 0.5
            grid.stroke()
        }

        if card.style == .chart {
            let inset: CGFloat = bounds.width < 340 ? 24 : 34
            drawChart(in: NSRect(x: inset, y: 188, width: bounds.width - inset * 2, height: 92))
        } else if card.style == .playbook {
            let accent = NSRect(x: bounds.width - 126, y: 209, width: 152, height: 170)
            NSColor(red: 1, green: 0.72, blue: 0.12, alpha: 1).setFill()
            NSBezierPath(roundedRect: accent, xRadius: 8, yRadius: 8).fill()
        }
    }

    private func drawChart(in rect: NSRect) {
        let values: [CGFloat] = [0.73, 0.63, 0.69, 0.48, 0.57, 0.45, 0.51, 0.32, 0.39, 0.16, 0.23, 0.09]
        let path = NSBezierPath()
        for (index, value) in values.enumerated() {
            let point = NSPoint(x: rect.minX + CGFloat(index) / CGFloat(values.count - 1) * rect.width,
                                y: rect.minY + value * rect.height)
            if index == 0 { path.move(to: point) } else { path.line(to: point) }
        }
        NSColor(red: 0.56, green: 0.79, blue: 1, alpha: 1).setStroke()
        path.lineWidth = 2.5
        path.lineJoinStyle = .round
        path.stroke()
    }
}
