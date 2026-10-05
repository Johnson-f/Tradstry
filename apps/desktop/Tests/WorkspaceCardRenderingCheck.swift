import AppKit

// Run from apps/desktop:
// swiftc Tradstry/Features/Workspace/WorkspaceCardView.swift Tests/WorkspaceCardRenderingCheck.swift -o build/card-render-check
// build/card-render-check
// Render the actual card views without opening windows or using computer controls.
@main
struct CardRenderCheck {
    @MainActor static func main() {
        _ = NSApplication.shared
        let cards = WorkspaceCard.samples + [
            WorkspaceCard(eyebrow: "SESSION NOTE", title: "Reflection", detail: "A sample note.", style: .note)
        ]
        for appearance in [NSAppearance.Name.aqua, .darkAqua] {
            for width: CGFloat in [240, 320, 560] {
                for card in cards {
                    let view = WorkspaceCardView(card: card)
                    view.frame = NSRect(x: 0, y: 0, width: width, height: 350)
                    view.appearance = NSAppearance(named: appearance)
                    for _ in 0..<1000 {
                        autoreleasepool {
                            view.needsLayout = true
                            view.layoutSubtreeIfNeeded()
                            guard let bitmap = view.bitmapImageRepForCachingDisplay(in: view.bounds) else {
                                fatalError("Could not create a card render target")
                            }
                            view.effectiveAppearance.performAsCurrentDrawingAppearance {
                                view.cacheDisplay(in: view.bounds, to: bitmap)
                            }
                        }
                    }
                }
            }
        }
        print("PASS: 30,000 complete card renders across five card styles, three widths, and both appearances")
    }
}
