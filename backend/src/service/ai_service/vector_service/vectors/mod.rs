// Vectors module - handles vectorization for different data types
pub mod chat;
pub mod notebook;
pub mod playbook;

// Re-export commonly used types
pub use chat::ChatVectorization;
pub use notebook::NotebookVectorization;
pub use playbook::PlaybookVectorization;
