import AppKit

final class MainViewController: NSViewController {
    override func loadView() {
        view = SurfaceView(color: .windowBackgroundColor)
        view.appearance = NSAppearance(named: .aqua)

        let sidebar = SidebarView(items: [
            ("Journal", "square.and.pencil"),
            ("Overview", "chart.xyaxis.line"),
            ("Notebook", "folder"),
            ("Playbooks", "bookmark"),
        ])
        sidebar.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(sidebar)

        let workspace = WorkspaceViewController()
        addChild(workspace)
        workspace.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(workspace.view)
        sidebar.onSelect = { [weak workspace] index in workspace?.showSection(index) }
        workspace.onNoteAdded = { [weak sidebar] in sidebar?.select(index: 2) }

        NSLayoutConstraint.activate([
            sidebar.topAnchor.constraint(equalTo: view.topAnchor, constant: 38),
            sidebar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            sidebar.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            workspace.view.topAnchor.constraint(equalTo: sidebar.topAnchor),
            workspace.view.leadingAnchor.constraint(equalTo: sidebar.trailingAnchor),
            workspace.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            workspace.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
    }
}
